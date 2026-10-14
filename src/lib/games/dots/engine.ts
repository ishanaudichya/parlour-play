import { MoveError, type GameModule, type GamePlayer } from "@/lib/games/types";
import {
  DEFAULT_H,
  DEFAULT_W,
  LINE_MS,
  LOG_CAP,
  MAX_SIDE,
  MIN_SIDE,
  SETUP_MS,
  type DotsLogEntry,
  type DotsLogKind,
  type DotsMove,
  type DotsPlayer,
  type DotsState,
  type DotsView,
  type Orient,
} from "./types";

export type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

/* ---------------- geometry (shared with UI + fuzz) ---------------- */

export interface Grid {
  w: number;
  h: number;
  hLines: number[];
  vLines: number[];
}

/** Is (o, r, c) a line on a w×h page? */
export function validLine(g: { w: number; h: number }, o: Orient, r: number, c: number): boolean {
  if (!Number.isInteger(r) || !Number.isInteger(c)) return false;
  return o === "h" ? r >= 0 && r <= g.h && c >= 0 && c < g.w : r >= 0 && r < g.h && c >= 0 && c <= g.w;
}

export const lineAt = (g: Grid, o: Orient, r: number, c: number) => (o === "h" ? g.hLines[r * g.w + c] : g.vLines[r * (g.w + 1) + c]);

function setLine(g: Grid, o: Orient, r: number, c: number, seat: number) {
  if (o === "h") g.hLines[r * g.w + c] = seat;
  else g.vLines[r * (g.w + 1) + c] = seat;
}

/** How many of box (r, c)'s four sides are drawn. */
export function sidesDrawn(g: Grid, r: number, c: number): number {
  return (
    (lineAt(g, "h", r, c) >= 0 ? 1 : 0) +
    (lineAt(g, "h", r + 1, c) >= 0 ? 1 : 0) +
    (lineAt(g, "v", r, c) >= 0 ? 1 : 0) +
    (lineAt(g, "v", r, c + 1) >= 0 ? 1 : 0)
  );
}

/** The (one or two) boxes a line borders, as [r, c]. */
export function boxesBeside(g: { w: number; h: number }, o: Orient, r: number, c: number): [number, number][] {
  const out: [number, number][] = [];
  if (o === "h") {
    if (r > 0) out.push([r - 1, c]);
    if (r < g.h) out.push([r, c]);
  } else {
    if (c > 0) out.push([r, c - 1]);
    if (c < g.w) out.push([r, c]);
  }
  return out;
}

/** Every undrawn line. */
export function openLines(g: Grid): [Orient, number, number][] {
  const out: [Orient, number, number][] = [];
  for (let r = 0; r <= g.h; r++) for (let c = 0; c < g.w; c++) if (lineAt(g, "h", r, c) < 0) out.push(["h", r, c]);
  for (let r = 0; r < g.h; r++) for (let c = 0; c <= g.w; c++) if (lineAt(g, "v", r, c) < 0) out.push(["v", r, c]);
  return out;
}

export const totalLines = (w: number, h: number) => (h + 1) * w + h * (w + 1);

/* ---------------- internals ---------------- */

const player = (s: DotsState, id: string) => s.players.find((p) => p.id === id);
const active = (s: DotsState) => s.players.filter((p) => !p.left);

function log(s: DotsState, kind: DotsLogKind, e: Partial<DotsLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

const who = (p: DotsPlayer) => ({ actor: p.name, seat: p.seat });

function nextActive(s: DotsState, seat: number): DotsPlayer {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const q = s.players[(seat + k) % n];
    if (!q.left) return q;
  }
  return s.players[seat];
}

/** A fresh, blank page of the current size. */
function blank(s: DotsState) {
  s.hLines = Array((s.h + 1) * s.w).fill(-1);
  s.vLines = Array(s.h * (s.w + 1)).fill(-1);
  s.boxes = Array(s.w * s.h).fill(-1);
}

function finish(s: DotsState) {
  s.phase = "over";
  s.turn = "";
  s.deadline = null;
  const live = active(s).sort((a, b) => b.score - a.score);
  if (live.length === 0) return;
  if (live.length > 1 && live[0].score === live[1].score) {
    s.winner = null;
    s.winBy = null;
    log(s, "draw", { n: live[0].score });
    return;
  }
  s.winner = live[0].id;
  s.winBy = "boxes";
  log(s, "win", { ...who(live[0]), n: live[0].score });
}

/** Draw a line for `p`. Returns the boxes it closed. Assumes it is legal. */
function draw(s: DotsState, p: DotsPlayer, o: Orient, r: number, c: number): number[] {
  setLine(s, o, r, c, p.seat);
  s.moves += 1;
  const closed: number[] = [];
  for (const [br, bc] of boxesBeside(s, o, r, c)) {
    if (sidesDrawn(s, br, bc) === 4 && s.boxes[br * s.w + bc] < 0) {
      s.boxes[br * s.w + bc] = p.seat;
      closed.push(br * s.w + bc);
    }
  }
  p.score += closed.length;
  s.last = { seq: s.moves, seat: p.seat, o, r, c, boxes: closed };
  if (closed.length) log(s, "box", { ...who(p), n: closed.length });

  if (s.moves >= totalLines(s.w, s.h)) {
    finish(s);
    return closed;
  }
  // close a box and you go again
  const next = closed.length ? p : nextActive(s, p.seat);
  s.turn = next.id;
  s.deadline = s.updatedAt + LINE_MS;
  return closed;
}

function startPlay(s: DotsState, rng: Rng) {
  blank(s);
  s.phase = "play";
  const live = active(s);
  const first = live[Math.floor(rng() * live.length)];
  s.turn = first.id;
  s.deadline = s.updatedAt + LINE_MS;
  log(s, "start", { ...who(first), w: s.w, h: s.h });
}

/**
 * The line a dawdler gets: close a box if one is there for the taking;
 * otherwise a line that hands nothing over; otherwise the line that gives
 * away the fewest boxes.
 */
export function autoLine(g: Grid, rng: Rng): [Orient, number, number] {
  const lines = openLines(g);
  const gains = (o: Orient, r: number, c: number) => boxesBeside(g, o, r, c).filter(([br, bc]) => sidesDrawn(g, br, bc) === 3).length;
  const scoring = lines.filter(([o, r, c]) => gains(o, r, c) > 0);
  if (scoring.length) return scoring[Math.floor(rng() * scoring.length)];
  const safe = lines.filter(([o, r, c]) => boxesBeside(g, o, r, c).every(([br, bc]) => sidesDrawn(g, br, bc) < 2));
  if (safe.length) return safe[Math.floor(rng() * safe.length)];
  // every line gives something away: give away the least
  let best = lines[0];
  let bestCost = Infinity;
  for (const ln of lines) {
    const sim: Grid = { w: g.w, h: g.h, hLines: g.hLines.slice(), vLines: g.vLines.slice() };
    setLine(sim, ln[0], ln[1], ln[2], 0);
    let cost = 0;
    for (;;) {
      const take = openLines(sim).find(([o, r, c]) => boxesBeside(sim, o, r, c).some(([br, bc]) => sidesDrawn(sim, br, bc) === 3));
      if (!take) break;
      cost += boxesBeside(sim, take[0], take[1], take[2]).filter(([br, bc]) => sidesDrawn(sim, br, bc) === 3).length;
      setLine(sim, take[0], take[1], take[2], 0);
    }
    if (cost < bestCost || (cost === bestCost && rng() < 0.3)) {
      bestCost = cost;
      best = ln;
    }
  }
  return best;
}

/* ---------------- lifecycle ---------------- */

export function initDots(players: GamePlayer[], now: number): DotsState {
  const seated: DotsPlayer[] = players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, score: 0, left: false }));
  const s: DotsState = {
    phase: "setup",
    players: seated,
    w: DEFAULT_W,
    h: DEFAULT_H,
    hLines: [],
    vLines: [],
    boxes: [],
    // the first seat is the party host, who sets the page up
    turn: seated[0].id,
    deadline: now + SETUP_MS,
    moves: 0,
    last: null,
    winner: null,
    winBy: null,
    startedAt: now,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  blank(s);
  log(s, "setup", { ...who(seated[0]), w: s.w, h: s.h });
  return s;
}

export function applyDotsMove(s: DotsState, playerId: string, move: DotsMove, now: number, rng: Rng): void {
  const p = player(s, playerId) ?? (err("You are not in this game.") as never);
  if (s.phase === "over") err("The game is over.");
  if (!move || typeof move !== "object") err("Unknown move.");
  if (p.left) err("You left this game.");

  if (s.phase === "setup") {
    if (s.turn !== p.id) err("The host is setting up the page.");
    if (move.type === "size") {
      if (!Number.isInteger(move.w) || !Number.isInteger(move.h)) err("Bad size.");
      if (move.w < MIN_SIDE || move.w > MAX_SIDE || move.h < MIN_SIDE || move.h > MAX_SIDE) err(`Pages run from ${MIN_SIDE}×${MIN_SIDE} to ${MAX_SIDE}×${MAX_SIDE} boxes.`);
      s.updatedAt = now;
      s.w = move.w;
      s.h = move.h;
      blank(s);
      return;
    }
    if (move.type === "start") {
      s.updatedAt = now;
      return startPlay(s, rng);
    }
    err("The page isn't open yet.");
  }

  if (move.type !== "line") err("Draw a line.");
  if (s.turn !== p.id) err("It's not your turn.");
  const { o, r, c } = move as Extract<DotsMove, { type: "line" }>;
  if ((o !== "h" && o !== "v") || !validLine(s, o, r, c)) err("That isn't a line on this page.");
  if (lineAt(s, o, r, c) >= 0) err("That line is already drawn.");
  s.updatedAt = now;
  draw(s, p, o, r, c);
}

/** The clock ran out: the page opens as it is, or a line is drawn for them. */
export function tickDots(s: DotsState, now: number, rng: Rng): boolean {
  if (s.phase === "over" || s.deadline === null || now < s.deadline) return false;
  const p = player(s, s.turn);
  if (!p) return false;
  s.updatedAt = now;
  if (s.phase === "setup") {
    startPlay(s, rng);
    return true;
  }
  log(s, "timeout", who(p));
  const [o, r, c] = autoLine(s, rng);
  draw(s, p, o, r, c);
  return true;
}

/** A player left the party: they're skipped from now on; their boxes stay theirs. */
export function forfeitDots(s: DotsState, playerId: string, now: number, rng: Rng): void {
  if (s.phase === "over") return;
  const p = player(s, playerId);
  if (!p || p.left) return;
  s.updatedAt = now;
  p.left = true;
  log(s, "left", who(p));
  const live = active(s);
  if (live.length <= 1) {
    if (live.length === 1) {
      s.winner = live[0].id;
      s.winBy = "forfeit";
      log(s, "win", { ...who(live[0]), n: live[0].score });
    }
    s.phase = "over";
    s.turn = "";
    s.deadline = null;
    return;
  }
  if (s.turn !== p.id) return;
  if (s.phase === "setup") {
    // the next seat takes over setting up
    s.turn = live[0].id;
    s.deadline = now + SETUP_MS;
  } else {
    s.turn = nextActive(s, p.seat).id;
    s.deadline = now + LINE_MS;
  }
  void rng;
}

export function redactDots(s: DotsState, viewerId: string, now: number): DotsView {
  return {
    phase: s.phase,
    players: s.players.map((p) => ({ ...p })),
    w: s.w,
    h: s.h,
    hLines: s.hLines.slice(),
    vLines: s.vLines.slice(),
    boxes: s.boxes.slice(),
    turn: s.phase === "over" ? "" : s.turn,
    deadline: s.deadline,
    moves: s.moves,
    last: s.last ? { ...s.last, boxes: s.last.boxes.slice() } : null,
    winner: s.winner,
    winBy: s.winBy,
    startedAt: s.startedAt,
    log: s.log.slice(-30),
    youId: viewerId,
    now,
  };
}

export const dotsModule: GameModule<DotsState, DotsView, DotsMove> = {
  type: "dots",
  minPlayers: 2,
  maxPlayers: 8,
  init: (players, now) => initDots(players, now),
  applyMove: applyDotsMove,
  tick: tickDots,
  redact: redactDots,
  /** A level score is a draw — no winner to tally. */
  result: (s) => (s.phase === "over" && s.winner ? { winnerId: s.winner } : null),
  isOver: (s) => s.phase === "over",
  forfeit: forfeitDots,
};
