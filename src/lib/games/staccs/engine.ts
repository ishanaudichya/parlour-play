import { MoveError, type GameModule, type GamePlayer } from "@/lib/games/types";
import { BOUNDS_ONE, BOUNDS_TWO, checkPlacement, coverage, isNumber, legalSpots, openRotations, type Bounds } from "./geometry";
import {
  CATCH_PENALTY,
  LOG_CAP,
  TURN_MS,
  type BoardCard,
  type Card,
  type Rank,
  type StaccsLogEntry,
  type StaccsLogKind,
  type StaccsMove,
  type StaccsPlayer,
  type StaccsState,
  type StaccsView,
  type Suit,
} from "./types";

export type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

export const SUITS: Suit[] = ["S", "H", "C", "D"];
export const RANKS: Rank[] = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A", "W"];

export function buildDeck(decks: 1 | 2): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (const suit of SUITS) for (const rank of RANKS) out.push({ id: `${d}${suit}${rank}`, suit, rank });
  return out;
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const boundsFor = (decks: 1 | 2): Bounds => (decks === 2 ? BOUNDS_TWO : BOUNDS_ONE);

/* ---------------- helpers ---------------- */

const byId = (s: StaccsState, id: string) => s.players.find((p) => p.id === id);
const active = (s: StaccsState) => s.players.filter((p) => !p.left);

function log(s: StaccsState, kind: StaccsLogKind, e: Partial<StaccsLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

const who = (p: StaccsPlayer) => ({ actor: p.name, seat: p.seat });

function nextActive(s: StaccsState, seat: number): StaccsPlayer {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const q = s.players[(((seat + k * s.order) % n) + n) % n];
    if (!q.left) return q;
  }
  return s.players[seat];
}

const numbersOn = (s: StaccsState) => [...new Set(s.board.filter((b) => isNumber(b.card)).map((b) => b.card.rank as number))];

/** Deal up to n cards from the pile to p. Returns how many arrived. */
function deal(s: StaccsState, p: StaccsPlayer, n: number): number {
  let k = 0;
  while (k < n && s.draw.length) {
    p.hand.push(s.draw.pop()!);
    k++;
  }
  if (p.hand.length !== 1) {
    p.called = false;
    p.catchable = false;
  }
  return k;
}

/** Legal spots for card `c` for the player to move. */
export function spotsFor(s: StaccsState, c: Card) {
  const spots = legalSpots(s.board, c, boundsFor(s.decks), s.lockFrom, s.blockedTop);
  if (c.rank !== "W") return spots;
  // a wild needs somewhere to turn
  return spots.filter((sp) => openRotations(s.board, sp.v, s.dir, boundsFor(s.decks)).length > 0);
}

/** Could `p` play `c` right now (ignoring turn order)? */
export function playable(s: StaccsState, p: StaccsPlayer, c: Card): boolean {
  if (c.rank === "W" && p.hand.length === 1) return false;
  if (s.combo !== null && c.rank !== s.combo) return false;
  return spotsFor(s, c).length > 0;
}

function finish(s: StaccsState, winner: StaccsPlayer | null, by: "out" | "forfeit" | "fewest") {
  s.phase = "over";
  s.turn = "";
  s.deadline = null;
  s.pending = null;
  s.combo = null;
  s.winner = winner?.id ?? null;
  s.winBy = winner ? by : null;
  for (const p of s.players) p.catchable = false;
  if (winner) log(s, "win", { ...who(winner), n: by === "fewest" ? winner.hand.length : 0 });
  else log(s, "stalemate");
}

/** The whole table is stuck: no cards to draw and nobody can play. Fewest cards wins. */
function stalemate(s: StaccsState) {
  const live = active(s).sort((a, b) => a.hand.length - b.hand.length);
  if (live.length > 1 && live[0].hand.length === live[1].hand.length) finish(s, null, "fewest");
  else finish(s, live[0], "fewest");
}

/** Begin `p`'s turn. */
function startTurn(s: StaccsState, p: StaccsPlayer, blockedTop: number | null) {
  s.turn = p.id;
  s.phase = "play";
  s.combo = null;
  s.pendingBlock = null;
  s.blockedTop = blockedTop;
  s.turnNumbers = numbersOn(s);
  s.deadline = s.updatedAt + TURN_MS;
  p.catchable = false; // the window to catch them closes as their turn begins
}

/** End the current turn and hand it on. */
function endTurn(s: StaccsState, from: StaccsPlayer, blockNext: number | null = null) {
  if (s.phase === "over") return;
  if (s.draw.length === 0 && s.stuck >= active(s).length) return stalemate(s);
  startTurn(s, nextActive(s, from.seat), blockNext);
}

/** The current player takes the J/K cards aimed at them. */
function takePending(s: StaccsState, p: StaccsPlayer) {
  if (!s.pending) return;
  const got = deal(s, p, s.pending.n);
  log(s, "take", { ...who(p), n: got });
  s.pending = null;
}

/* ---------------- moves ---------------- */

function doPlay(s: StaccsState, p: StaccsPlayer, move: Extract<StaccsMove, { type: "play" }>) {
  if (s.phase !== "play") err("Not now.");
  const place = move.place;
  if (!place || !Array.isArray(place.v) || place.v.length !== 2 || !place.v.every(Number.isInteger)) err("Bad placement.");
  const hi = p.hand.findIndex((c) => c.id === place.cardId);
  if (hi < 0) err("That card isn't in your hand.");
  const card = p.hand[hi];
  if (s.combo !== null && card.rank !== s.combo) err(`You're laying ${s.combo}s — play another ${s.combo} or finish.`);
  if (card.rank === "W") {
    if (p.hand.length === 1) err("You can't go out on a wild — draw instead.");
    if (!Number.isInteger(place.rot) || place.rot! < 0 || place.rot! > 5) err("Pick a direction for the wild.");
    if (place.rot === s.dir) err("A wild must turn the STACC in a new direction.");
    if (!openRotations(s.board, place.v, s.dir, boundsFor(s.decks)).includes(place.rot!)) err("That way is blocked — turn the wild another way.");
    if (!place.called || !SUITS.includes(place.called)) err("Call a suit.");
  }
  const counter = s.pending !== null && card.rank === s.pending.rank;
  const queenCounter = s.queenChain > 0 && card.rank === "Q" && s.combo === null;

  const cov = coverage(s.board);
  const check = checkPlacement(s.board, cov, card, place.v, boundsFor(s.decks), s.lockFrom, s.blockedTop);
  if (!check.ok) err(check.why ?? "That card doesn't fit there.");

  // an attack you don't counter lands first; then you carry on
  if (s.pending && !counter) takePending(s, p);
  const incomingQueen = s.queenChain;
  s.queenChain = 0;

  p.hand.splice(p.hand.findIndex((c) => c.id === card.id), 1);
  const bc: BoardCard = { card, v: [place.v[0], place.v[1]], rot: card.rank === "W" ? place.rot! : s.dir, by: p.seat };
  if (card.rank === "W") bc.called = place.called;
  s.board.push(bc);
  const idx = s.board.length - 1;
  s.seq += 1;
  s.lastPlay = { seq: s.seq, by: p.seat, idx };
  s.stuck = 0;
  log(s, "play", { ...who(p), card });

  // UH OH
  if (p.hand.length === 1) {
    if (move.declare || p.called) {
      p.called = true;
      p.catchable = false;
      if (move.declare) log(s, "uhoh", who(p));
    } else p.catchable = true;
  }
  if (p.hand.length === 0) return finish(s, p, "out");

  let blockNext: number | null = null;
  switch (card.rank) {
    case "W":
      s.lockFrom = idx;
      s.dir = place.rot!;
      log(s, "wild", { ...who(p), suit: place.called });
      return endTurn(s, p);
    case "J":
    case "K": {
      const add = card.rank === "J" ? 1 : 2;
      const n = counter ? s.pending!.n + add : add;
      s.pending = { rank: card.rank, n, from: p.seat };
      log(s, counter ? "counter" : "attack", { ...who(p), target: nextActive(s, p.seat).name, n, card });
      return endTurn(s, p);
    }
    case "Q": {
      s.give = Math.min(p.hand.length, queenCounter ? incomingQueen + 1 : 1);
      if (queenCounter) log(s, "counter", { ...who(p), n: s.give, card });
      if (s.give === 0) return endTurn(s, p);
      s.phase = "give";
      s.deadline = s.updatedAt + TURN_MS;
      return;
    }
    case "A":
      log(s, "ace", who(p));
      startTurn(s, p, null); // straight back to you
      return;
    case 0:
      blockNext = idx;
      if (active(s).length >= 3) s.order = s.order === 1 ? -1 : 1;
      log(s, "zero", { ...who(p), n: active(s).length >= 3 ? 1 : 0 });
      break;
  }

  // numbers already on the STACC may be laid in multiples
  const rank = card.rank as number;
  if (s.turnNumbers.includes(rank)) {
    s.combo = rank;
    if (p.hand.some((c) => c.rank === rank && spotsFor(s, c).length > 0)) {
      s.pendingBlock = blockNext ?? s.pendingBlock;
      s.deadline = s.updatedAt + TURN_MS;
      return;
    }
  }
  endTurn(s, p, blockNext ?? s.pendingBlock);
}

function doDone(s: StaccsState, p: StaccsPlayer) {
  if (s.phase !== "play" || s.combo === null) err("Nothing to finish.");
  endTurn(s, p, s.pendingBlock);
}

function doDraw(s: StaccsState, p: StaccsPlayer) {
  if (s.phase !== "play") err("Not now.");
  if (s.combo !== null) err("Finish laying your numbers first.");
  takePending(s, p);
  s.queenChain = 0;
  const got = deal(s, p, 1);
  if (got) log(s, "draw", { ...who(p), n: 1 });
  else {
    s.stuck += 1;
    log(s, "pass", who(p));
  }
  endTurn(s, p);
}

function doTake(s: StaccsState, p: StaccsPlayer) {
  if (s.phase !== "play" || !s.pending) err("Nothing to take.");
  takePending(s, p);
  s.deadline = s.updatedAt + TURN_MS;
}

function doGive(s: StaccsState, p: StaccsPlayer, ids: string[]) {
  if (s.phase !== "give") err("Not now.");
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.length !== s.give) err(`Pick ${s.give} card${s.give === 1 ? "" : "s"} to give.`);
  if (!ids.every((id) => p.hand.some((c) => c.id === id))) err("You can only give cards you hold.");
  const to = nextActive(s, p.seat);
  for (const id of ids) to.hand.push(p.hand.splice(p.hand.findIndex((c) => c.id === id), 1)[0]);
  if (to.hand.length !== 1) {
    to.called = false;
    to.catchable = false;
  }
  log(s, "give", { ...who(p), target: to.name, n: ids.length });
  if (p.hand.length === 0) {
    p.catchable = false;
    return finish(s, p, "out"); // gave away the last card: out
  }
  if (p.hand.length === 1 && !p.called) p.catchable = true;
  if (p.hand.length !== 1) p.catchable = false;
  const chain = s.give;
  s.give = 0;
  endTurn(s, p);
  s.queenChain = chain; // the next player may counter with a Queen
}

function doUhOh(s: StaccsState, p: StaccsPlayer) {
  if (p.hand.length !== 1 || p.called) err("Nothing to call.");
  p.called = true;
  p.catchable = false;
  log(s, "uhoh", who(p));
}

function doCatch(s: StaccsState, p: StaccsPlayer, target: string) {
  const t = byId(s, target) ?? (err("No such player.") as never);
  if (t.id === p.id) err("Call UH OH instead.");
  if (!t.catchable) err(`${t.name} can't be caught right now.`);
  t.catchable = false;
  const got = deal(s, t, CATCH_PENALTY);
  log(s, "catch", { ...who(p), target: t.name, n: got });
}

/* ---------------- lifecycle ---------------- */

export function initStaccs(players: GamePlayer[], now: number, rng: Rng): StaccsState {
  const n = players.length;
  const decks: 1 | 2 = n >= 6 ? 2 : 1;
  const pile = shuffle(buildDeck(decks), rng);
  const handSize = n === 5 || n >= 10 ? 5 : 7;
  const seated: StaccsPlayer[] = players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, hand: [], catchable: false, called: false, left: false }));
  for (let r = 0; r < handSize; r++) for (const p of seated) p.hand.push(pile.pop()!);
  // the first card must be a plain number, 2–10
  const skipped: Card[] = [];
  let first = pile.pop()!;
  while (!(typeof first.rank === "number" && first.rank >= 2)) {
    skipped.push(first);
    first = pile.pop()!;
  }
  if (skipped.length) {
    pile.push(...skipped);
    shuffle(pile, rng);
  }
  const s: StaccsState = {
    phase: "play",
    players: seated,
    decks,
    board: [{ card: first, v: [0, 0], rot: 0, by: -1 }],
    draw: pile,
    lockFrom: 0,
    dir: 0,
    blockedTop: null,
    turn: "",
    order: 1,
    deadline: null,
    pending: null,
    give: 0,
    queenChain: 0,
    combo: null,
    pendingBlock: null,
    turnNumbers: [],
    stuck: 0,
    seq: 0,
    lastPlay: null,
    winner: null,
    winBy: null,
    startedAt: now,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  const starter = seated[Math.floor(rng() * n)];
  startTurn(s, starter, null);
  log(s, "start", { ...who(starter), card: first });
  return s;
}

export function applyStaccsMove(s: StaccsState, playerId: string, move: StaccsMove, now: number): void {
  const p = byId(s, playerId) ?? (err("You are not in this game.") as never);
  if (s.phase === "over") err("The game is over.");
  if (!move || typeof move !== "object") err("Unknown move.");
  if (p.left) err("You left this game.");
  // calling and catching happen out of turn
  if (move.type === "uhoh") {
    s.updatedAt = now;
    return doUhOh(s, p);
  }
  if (move.type === "catch") {
    s.updatedAt = now;
    return doCatch(s, p, move.target);
  }
  if (s.turn !== p.id) err("It's not your turn.");
  s.updatedAt = now;
  switch (move.type) {
    case "play":
      return doPlay(s, p, move);
    case "done":
      return doDone(s, p);
    case "draw":
      return doDraw(s, p);
    case "take":
      return doTake(s, p);
    case "give":
      return doGive(s, p, move.cardIds);
    default:
      err("Unknown move.");
  }
}

/** The clock ran out: give, finish, or draw for them. */
export function tickStaccs(s: StaccsState, now: number): boolean {
  if (s.phase === "over" || s.deadline === null || now < s.deadline) return false;
  const p = byId(s, s.turn);
  if (!p) return false;
  s.updatedAt = now;
  log(s, "timeout", who(p));
  if (s.phase === "give") doGive(s, p, p.hand.slice(0, s.give).map((c) => c.id));
  else if (s.combo !== null) doDone(s, p);
  else doDraw(s, p);
  return true;
}

/** A player left: their hand goes under the pile, and play goes on. */
export function forfeitStaccs(s: StaccsState, playerId: string, now: number): void {
  if (s.phase === "over") return;
  const p = byId(s, playerId);
  if (!p || p.left) return;
  s.updatedAt = now;
  p.left = true;
  s.draw.unshift(...p.hand);
  p.hand = [];
  p.catchable = false;
  log(s, "left", who(p));
  const live = active(s);
  if (live.length === 1) return finish(s, live[0], "forfeit");
  if (live.length === 0) return finish(s, null, "fewest");
  if (s.turn === p.id) {
    s.pending = null;
    s.give = 0;
    s.queenChain = 0;
    startTurn(s, nextActive(s, p.seat), null);
  } else if (s.pending && nextActive(s, s.pending.from).id === p.id) {
    s.pending = null;
  }
}

export function redactStaccs(s: StaccsState, viewerId: string, now: number): StaccsView {
  const me = s.players.find((p) => p.id === viewerId);
  return {
    phase: s.phase,
    players: s.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, count: p.hand.length, catchable: p.catchable, called: p.called, left: p.left })),
    youId: viewerId,
    hand: me ? me.hand.map((c) => ({ ...c })) : [],
    decks: s.decks,
    board: s.board,
    drawCount: s.draw.length,
    lockFrom: s.lockFrom,
    dir: s.dir,
    blockedTop: s.blockedTop,
    turn: s.phase === "over" ? null : s.turn,
    order: s.order,
    deadline: s.deadline,
    pending: s.pending ? { ...s.pending } : null,
    give: s.give,
    queenChain: s.queenChain,
    combo: s.combo,
    turnNumbers: s.turnNumbers.slice(),
    seq: s.seq,
    lastPlay: s.lastPlay ? { ...s.lastPlay } : null,
    winner: s.winner,
    winBy: s.winBy,
    startedAt: s.startedAt,
    log: s.log.slice(-30),
    now,
  };
}

export const staccsModule: GameModule<StaccsState, StaccsView, StaccsMove> = {
  type: "staccs",
  minPlayers: 2,
  maxPlayers: 8,
  init: initStaccs,
  applyMove: (s, id, m, now) => applyStaccsMove(s, id, m, now),
  tick: (s, now) => tickStaccs(s, now),
  redact: redactStaccs,
  result: (s) => (s.phase === "over" && s.winner ? { winnerId: s.winner } : null),
  isOver: (s) => s.phase === "over",
  forfeit: (s, id, now) => forfeitStaccs(s, id, now),
};
