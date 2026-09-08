import { MoveError, type GameModule, type GamePlayer } from "@/lib/games/types";
import { colorsFor, onTrack, SAFE_INDEXES, trackIndex } from "./board";
import {
  HOME_POS,
  LOG_CAP,
  MAX_SIXES,
  TOKENS,
  TURN_MS,
  type LudoBonus,
  type LudoCapture,
  type LudoLogEntry,
  type LudoLogKind,
  type LudoMove,
  type LudoPlayer,
  type LudoState,
  type LudoView,
} from "./types";

export type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

/* ---------------- rules helpers (shared with UI + fuzz) ---------------- */

/** Where a token at `pos` lands with `die`, or -1 if it cannot move. */
export function destination(pos: number, die: number): number {
  if (pos === HOME_POS) return -1;
  if (pos < 0) return die === 6 ? 0 : -1;
  const to = pos + die;
  return to <= HOME_POS ? to : -1; // exact count into home
}

export const canMove = (pos: number, die: number) => destination(pos, die) >= 0;

/** Token indexes of `p` that may move with `die`. */
export function movableTokens(p: LudoPlayer, die: number): number[] {
  const out: number[] = [];
  p.tokens.forEach((pos, i) => canMove(pos, die) && out.push(i));
  return out;
}

/**
 * Opponent tokens sitting on the shared square that `p` would land on at
 * relative position `to` — nothing on a safe square, nothing off the loop.
 */
export function victimsAt(s: LudoState, p: LudoPlayer, to: number): LudoCapture[] {
  if (!onTrack(to)) return [];
  const abs = trackIndex(p.color, to);
  if (SAFE_INDEXES.has(abs)) return [];
  const out: LudoCapture[] = [];
  for (const q of s.players) {
    if (q.seat === p.seat || q.left) continue;
    q.tokens.forEach((pos, t) => {
      if (onTrack(pos) && trackIndex(q.color, pos) === abs) out.push({ seat: q.seat, token: t, from: pos });
    });
  }
  return out;
}

/* ---------------- internals ---------------- */

const player = (s: LudoState, id: string) => s.players.find((p) => p.id === id);

const active = (s: LudoState) => s.players.filter((p) => !p.left);

function nextActive(s: LudoState, seat: number): LudoPlayer {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const q = s.players[(seat + k) % n];
    if (!q.left) return q;
  }
  return s.players[seat];
}

function log(s: LudoState, kind: LudoLogKind, e: Partial<LudoLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

const who = (p: LudoPlayer) => ({ actor: p.name, player: p.id, seat: p.seat, color: p.color });

function endGame(s: LudoState) {
  s.phase = "over";
  s.turn = "";
  s.deadline = null;
  s.die = null;
  s.movable = [];
}

function crown(s: LudoState, w: LudoPlayer, by: "home" | "forfeit") {
  s.winner = w.id;
  s.winBy = by;
  endGame(s);
  log(s, "win", who(w));
}

/** Hand the turn to the next player at the table. */
function passTurn(s: LudoState, fromSeat: number) {
  const q = nextActive(s, fromSeat);
  s.turn = q.id;
  s.phase = "roll";
  s.die = null;
  s.movable = [];
  s.sixes = 0;
  s.deadline = s.updatedAt + TURN_MS;
}

/** The same player rolls again. */
function rollAgain(s: LudoState) {
  s.phase = "roll";
  s.die = null;
  s.movable = [];
  s.deadline = s.updatedAt + TURN_MS;
}

/** Move `p`'s `token` by the die on the table. Assumes it is legal. */
function doMove(s: LudoState, p: LudoPlayer, token: number) {
  const die = s.die!;
  const from = p.tokens[token];
  const to = destination(from, die);
  const captured = victimsAt(s, p, to);
  for (const c of captured) s.players[c.seat].tokens[c.token] = -1;
  p.tokens[token] = to;
  s.moves += 1;

  const bonus: LudoBonus | null = captured.length ? "capture" : to === HOME_POS ? "home" : die === 6 ? "six" : null;
  s.lastMove = { by: p.id, seat: p.seat, token, from, to, die, captured, bonus, n: s.moves, rollN: s.rolls };
  log(s, "move", { ...who(p), value: die, token, from, to });
  for (const c of captured) {
    const q = s.players[c.seat];
    log(s, "capture", { ...who(p), token, victim: q.name, victimSeat: q.seat, from: c.from });
  }
  if (to === HOME_POS) log(s, "home", { ...who(p), token });

  if (p.tokens.every((t) => t === HOME_POS)) {
    crown(s, p, "home");
    return;
  }
  if (bonus) rollAgain(s);
  else passTurn(s, p.seat);
}

/** Roll for `p`, then either move for them (one option), wait (several), or pass (none). */
function doRoll(s: LudoState, p: LudoPlayer, rng: Rng) {
  const value = 1 + Math.floor(rng() * 6);
  s.rolls += 1;
  s.lastRoll = { by: p.id, seat: p.seat, value, n: s.rolls };
  s.sixes = value === 6 ? s.sixes + 1 : 0;
  log(s, "roll", { ...who(p), value });

  if (s.sixes >= MAX_SIXES) {
    log(s, "three_sixes", who(p));
    passTurn(s, p.seat);
    return;
  }

  const movable = movableTokens(p, value);
  if (movable.length === 0) {
    log(s, "no_move", { ...who(p), value });
    if (value === 6) rollAgain(s);
    else passTurn(s, p.seat);
    return;
  }

  s.die = value;
  s.movable = movable;
  // tokens sharing a square are interchangeable — only ask when the choice is real
  if (new Set(movable.map((t) => p.tokens[t])).size === 1) {
    doMove(s, p, movable[0]);
    return;
  }
  s.phase = "move";
  s.deadline = s.updatedAt + TURN_MS;
}

/**
 * The dawdler's choice, made for them: bring one home, take a capture, get
 * out of the yard, otherwise push the furthest-back token along.
 */
export function autoPick(s: LudoState, p: LudoPlayer, rng: Rng): number {
  const die = s.die!;
  let best = -1;
  let bestScore = -Infinity;
  for (const t of s.movable) {
    const from = p.tokens[t];
    const to = destination(from, die);
    let score = 0;
    if (to === HOME_POS) score += 1000;
    if (victimsAt(s, p, to).length) score += 500;
    if (from < 0) score += 300;
    if (onTrack(to) && SAFE_INDEXES.has(trackIndex(p.color, to))) score += 40;
    score += (HOME_POS - Math.max(from, 0)) * 0.1; // prefer the laggard
    score += rng() * 5;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/* ---------------- lifecycle ---------------- */

export function initLudo(players: GamePlayer[], now: number, rng: Rng): LudoState {
  const colors = colorsFor(players.length);
  const seated: LudoPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    color: colors[p.seat],
    tokens: Array.from({ length: TOKENS }, () => -1),
    left: false,
  }));
  const first = seated[Math.floor(rng() * seated.length)];
  const s: LudoState = {
    phase: "roll",
    players: seated,
    turn: first.id,
    deadline: now + TURN_MS,
    die: null,
    sixes: 0,
    movable: [],
    rolls: 0,
    moves: 0,
    lastRoll: null,
    lastMove: null,
    winner: null,
    winBy: null,
    startedAt: now,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  log(s, "start", who(first));
  return s;
}

export function applyLudoMove(s: LudoState, playerId: string, move: LudoMove, now: number, rng: Rng): void {
  const p = player(s, playerId) ?? (err("You are not in this game.") as never);
  if (s.phase === "over") err("The game is over.");
  if (!move || (move.type !== "roll" && move.type !== "move")) err("Unknown move.");
  if (p.left) err("You left this game.");
  if (s.turn !== p.id) err("It's not your turn.");

  if (move.type === "roll") {
    if (s.phase !== "roll") err("You've rolled — pick a token.");
    s.updatedAt = now;
    doRoll(s, p, rng);
    return;
  }
  if (s.phase !== "move") err("Roll first.");
  const t = move.token;
  if (!Number.isInteger(t) || t < 0 || t >= TOKENS) err("That isn't one of your tokens.");
  if (!s.movable.includes(t)) err("That token can't move with this roll.");
  s.updatedAt = now;
  doMove(s, p, t);
}

/** The clock ran out: roll for them, or move for them. */
export function tickLudo(s: LudoState, now: number, rng: Rng): boolean {
  if (s.phase === "over") return false;
  if (s.deadline === null || now < s.deadline) return false;

  s.updatedAt = now;
  const p = player(s, s.turn)!;
  log(s, "timeout", who(p));
  if (s.phase === "roll") doRoll(s, p, rng);
  else doMove(s, p, autoPick(s, p, rng));
  return true;
}

/** A player left the party: their tokens are swept off and play goes on.
    The last one at the table takes the win. */
export function forfeitLudo(s: LudoState, playerId: string, now: number): void {
  if (s.phase === "over") return;
  const p = player(s, playerId);
  if (!p || p.left) return;

  s.updatedAt = now;
  p.left = true;
  p.tokens = p.tokens.map(() => -1);
  log(s, "left", who(p));

  const rest = active(s);
  if (rest.length === 1) {
    crown(s, rest[0], "forfeit");
    return;
  }
  if (rest.length === 0) {
    endGame(s);
    return;
  }
  if (s.turn === p.id) passTurn(s, p.seat);
}

/* ---------------- redaction ---------------- */

/** Perfect information: everyone (players and spectators alike) sees this. */
export function redactLudo(s: LudoState, viewerId: string, now: number): LudoView {
  return {
    phase: s.phase,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      color: p.color,
      tokens: p.tokens.slice(),
      home: p.tokens.filter((t) => t === HOME_POS).length,
      inYard: p.tokens.filter((t) => t < 0).length,
      left: p.left,
    })),
    youId: viewerId,
    turn: s.phase === "over" ? null : s.turn,
    deadline: s.phase === "over" ? null : s.deadline,
    die: s.die,
    sixes: s.sixes,
    movable: s.movable.slice(),
    rolls: s.rolls,
    moves: s.moves,
    lastRoll: s.lastRoll ? { ...s.lastRoll } : null,
    lastMove: s.lastMove ? { ...s.lastMove, captured: s.lastMove.captured.map((c) => ({ ...c })) } : null,
    winner: s.winner,
    winBy: s.winBy,
    startedAt: s.startedAt,
    log: s.log.slice(-40),
    now,
  };
}

/* ---------------- module ---------------- */

export const ludoModule: GameModule<LudoState, LudoView, LudoMove> = {
  type: "ludo",
  minPlayers: 2,
  maxPlayers: 4,
  init: initLudo,
  applyMove: applyLudoMove,
  tick: tickLudo,
  redact: redactLudo,
  /** Ludo cannot be drawn: somebody always gets four tokens home first. */
  result: (s) => (s.phase === "over" && s.winner ? { winnerId: s.winner } : null),
  isOver: (s) => s.phase === "over",
  forfeit: (s, playerId, now) => forfeitLudo(s, playerId, now),
};
