import { MoveError, type GameModule, type GamePlayer } from "@/lib/games/types";
import {
  LASTCALL_MS,
  LOG_CAP,
  MAX_PLAY,
  TURN_MS,
  type BluffLogEntry,
  type BluffLogKind,
  type BluffMove,
  type BluffPlayer,
  type BluffState,
  type BluffView,
  type Card,
  type Rank,
  type Suit,
} from "./types";

export type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

/* ---------------- the pack (shared with UI + fuzz) ---------------- */

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function fullPack(): Card[] {
  const out: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) out.push({ id: `${r}${s}`, r, s });
  return out;
}

/** A to K, and within a rank ♠ ♥ ♦ ♣. */
export const byRank = (a: Card, b: Card) => a.r - b.r || SUITS.indexOf(a.s) - SUITS.indexOf(b.s);

const RANK_NAME = ["", "Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King"];
const RANK_PLURAL = ["", "Aces", "Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings"];
const COUNT_WORD = ["no", "one", "two", "three", "four"];

/** "Ace", "Queen" … */
export const rankName = (r: Rank) => RANK_NAME[r] ?? "?";
/** "three Kings", "one Ace" — how a claim is said out loud. */
export const claimWords = (n: number, r: Rank) => `${COUNT_WORD[n] ?? n} ${n === 1 ? RANK_NAME[r] : RANK_PLURAL[r]}`;
/** "A", "10", "K" — the corner index. */
export const rankLabel = (r: Rank) => (r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r));

/* ---------------- internals ---------------- */

const player = (s: BluffState, id: string) => s.players.find((p) => p.id === id);
const active = (s: BluffState) => s.players.filter((p) => !p.left);

function log(s: BluffState, kind: BluffLogKind, e: Partial<BluffLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

/** The next player round from `seat` who is still in this round. */
function nextEligible(s: BluffState, seat: number): BluffPlayer | null {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const q = s.players[(seat + k) % n];
    if (!q.left && !q.passed) return q;
  }
  return null;
}

/** `seat` itself if they're still at the table, else the next who is. */
function atOrAfter(s: BluffState, seat: number): BluffPlayer {
  const n = s.players.length;
  for (let k = 0; k < n; k++) {
    const q = s.players[(seat + k) % n];
    if (!q.left) return q;
  }
  return s.players[seat];
}

const pileSize = (s: BluffState) => s.pile.reduce((a, p) => a + p.cards.length, 0);

/** A new round, led by `leader`; the pile has already gone wherever it goes. */
function newRound(s: BluffState, leader: BluffPlayer) {
  s.pile = [];
  s.rank = null;
  for (const p of s.players) p.passed = false;
  s.phase = "play";
  s.believed = [];
  s.turn = leader.id;
  s.deadline = s.updatedAt + TURN_MS;
}

function finish(s: BluffState, winner: BluffPlayer | null, by: "empty" | "forfeit") {
  s.phase = "over";
  s.turn = "";
  s.deadline = null;
  s.believed = [];
  for (const p of s.players) p.passed = false;
  s.winner = winner?.id ?? null;
  s.winBy = winner ? by : null;
  if (winner) log(s, "win", { seat: winner.seat });
}

/** Everyone but the last to play has passed: the pile is set aside unseen
    and the last to play leads. Otherwise the turn moves on from `from`. */
function settle(s: BluffState, from: number) {
  const last = s.pile.at(-1);
  if (!last) {
    // nobody has led yet: the lead passes along
    s.turn = atOrAfter(s, from).id;
    s.deadline = s.updatedAt + TURN_MS;
    return;
  }
  const owner = s.players[last.seat];
  const waiting = active(s).filter((p) => p !== owner && !p.passed);
  if (waiting.length === 0) {
    const n = pileSize(s);
    s.burned += n;
    log(s, "burn", { seat: owner.seat, n });
    newRound(s, atOrAfter(s, owner.seat));
    return;
  }
  s.turn = (nextEligible(s, from) ?? waiting[0]).id;
  s.deadline = s.updatedAt + TURN_MS;
}

function play(s: BluffState, p: BluffPlayer, ids: string[], rank: Rank) {
  const cards = ids.map((id) => p.hand.find((c) => c.id === id)!);
  p.hand = p.hand.filter((c) => !ids.includes(c.id));
  const leading = s.rank === null;
  s.rank = rank;
  s.plays += 1;
  s.pile.push({ seq: s.plays, seat: p.seat, cards });
  log(s, leading ? "lead" : "play", { seat: p.seat, n: cards.length, rank });
  if (p.hand.length === 0) {
    // down to nothing: the table gets one last chance to call it
    s.phase = "lastcall";
    s.turn = p.id;
    s.believed = [];
    s.deadline = s.updatedAt + LASTCALL_MS;
    log(s, "lastcall", { seat: p.seat });
    return;
  }
  settle(s, p.seat);
}

/** Turn the latest play face up: the liar or the caller takes the pile. */
function call(s: BluffState, caller: BluffPlayer) {
  const last = s.pile.at(-1)!;
  const owner = s.players[last.seat];
  const rank = s.rank!;
  const honest = last.cards.every((c) => c.r === rank);
  const taker = honest ? caller : owner;
  const all = s.pile.flatMap((pl) => pl.cards);
  taker.hand = [...taker.hand, ...all].sort(byRank);
  s.pile = [];
  s.rank = null;
  s.reveal = { seq: last.seq, by: caller.seat, of: owner.seat, rank, cards: last.cards.map((c) => ({ ...c })), honest, taker: taker.seat, n: all.length };
  log(s, "call", { seat: caller.seat, other: owner.seat, honest, n: all.length, rank });
  if (s.phase === "lastcall" && honest) return finish(s, owner, "empty");
  // whoever won the call leads
  newRound(s, honest ? owner : caller);
}

/** The best honest lead for someone who let the clock run out: their biggest set. */
function autoLead(p: BluffPlayer, rng: Rng): { ids: string[]; rank: Rank } {
  const groups = new Map<Rank, Card[]>();
  for (const c of p.hand) groups.set(c.r, [...(groups.get(c.r) ?? []), c]);
  const most = Math.max(...[...groups.values()].map((g) => g.length));
  const best = [...groups.entries()].filter(([, g]) => g.length === most);
  const [rank, cards] = best[Math.floor(rng() * best.length)];
  return { ids: cards.slice(0, MAX_PLAY).map((c) => c.id), rank };
}

/* ---------------- lifecycle ---------------- */

export function initBluff(players: GamePlayer[], now: number, rng: Rng): BluffState {
  const pack = fullPack();
  for (let i = pack.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pack[i], pack[j]] = [pack[j], pack[i]];
  }
  const seated: BluffPlayer[] = players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, hand: [], passed: false, left: false }));
  // the deal starts with the first leader, round the table, every card out
  const first = Math.floor(rng() * seated.length);
  pack.forEach((c, i) => seated[(first + i) % seated.length].hand.push(c));
  for (const p of seated) p.hand.sort(byRank);
  return {
    phase: "play",
    players: seated,
    rank: null,
    pile: [],
    burned: 0,
    turn: seated[first].id,
    deadline: now + TURN_MS,
    believed: [],
    plays: 0,
    reveal: null,
    winner: null,
    winBy: null,
    startedAt: now,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
}

export function applyBluffMove(s: BluffState, playerId: string, move: BluffMove, now: number, rng: Rng): void {
  const p = player(s, playerId) ?? (err("You are not in this game.") as never);
  if (s.phase === "over") err("The game is over.");
  if (!move || typeof move !== "object") err("Unknown move.");
  if (p.left) err("You left this game.");
  void rng;

  if (move.type === "call") {
    const last = s.pile.at(-1);
    if (!last || move.at !== last.seq) err("Too late — that's not the latest play.");
    if (last!.seat === p.seat) err("You can't call your own bluff.");
    if (s.players[last!.seat].left) err("They've left the table.");
    s.updatedAt = now;
    return call(s, p);
  }

  if (s.phase === "lastcall") {
    if (move.type !== "believe") err("Call bluff, or let it go.");
    if (s.turn === p.id) err("Everyone else is deciding.");
    s.updatedAt = now;
    if (!s.believed.includes(p.id)) s.believed.push(p.id);
    const claimant = player(s, s.turn)!;
    if (active(s).every((q) => q === claimant || s.believed.includes(q.id))) finish(s, claimant, "empty");
    return;
  }

  if (move.type === "believe") err("There's no last call on.");
  if (s.turn !== p.id) err("It's not your turn.");

  if (move.type === "pass") {
    if (s.rank === null) err("You're leading — put something down.");
    s.updatedAt = now;
    p.passed = true;
    log(s, "pass", { seat: p.seat });
    return settle(s, p.seat);
  }

  if (move.type !== "play") err("Unknown move.");
  const { cards, rank } = move as Extract<BluffMove, { type: "play" }>;
  if (p.passed) err("You passed this round.");
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > MAX_PLAY) err(`Play one to ${MAX_PLAY} cards.`);
  if (new Set(cards).size !== cards.length || !cards.every((id) => typeof id === "string" && p.hand.some((c) => c.id === id))) err("Those aren't your cards.");
  let named: Rank;
  if (s.rank === null) {
    if (!Number.isInteger(rank) || rank! < 1 || rank! > 13) err("Name a rank for the round.");
    named = rank!;
  } else {
    if (rank !== undefined && rank !== s.rank) err(`This round is ${rankName(s.rank)}s.`);
    named = s.rank;
  }
  s.updatedAt = now;
  play(s, p, cards, named);
}

/** The clock ran out: last calls stand; a leader leads for real; a follower passes. */
export function tickBluff(s: BluffState, now: number, rng: Rng): boolean {
  if (s.phase === "over" || s.deadline === null || now < s.deadline) return false;
  const p = player(s, s.turn);
  if (!p) return false;
  s.updatedAt = now;
  if (s.phase === "lastcall") {
    finish(s, p, "empty");
    return true;
  }
  log(s, "timeout", { seat: p.seat });
  if (s.rank === null) {
    const { ids, rank } = autoLead(p, rng);
    play(s, p, ids, rank);
  } else {
    p.passed = true;
    log(s, "pass", { seat: p.seat });
    settle(s, p.seat);
  }
  return true;
}

/** A player left the party: their hand is set aside unseen, their turn and any last call move on. */
export function forfeitBluff(s: BluffState, playerId: string, now: number, rng: Rng): void {
  void rng;
  if (s.phase === "over") return;
  const p = player(s, playerId);
  if (!p || p.left) return;
  s.updatedAt = now;
  p.left = true;
  s.burned += p.hand.length;
  p.hand = [];
  log(s, "left", { seat: p.seat });
  const live = active(s);
  if (live.length <= 1) return finish(s, live[0] ?? null, "forfeit");

  if (s.phase === "lastcall") {
    const claimant = player(s, s.turn)!;
    if (claimant === p) {
      // they walked out on their own last call: the pile goes aside, the next seat leads
      const n = pileSize(s);
      s.burned += n;
      log(s, "burn", { seat: p.seat, n });
      return newRound(s, atOrAfter(s, p.seat));
    }
    s.believed = s.believed.filter((id) => id !== p.id);
    if (live.every((q) => q === claimant || s.believed.includes(q.id))) finish(s, claimant, "empty");
    return;
  }
  // their turn moves on; a round only they were holding open ends
  if (s.turn === p.id) return settle(s, p.seat);
  const last = s.pile.at(-1);
  if (last && active(s).every((q) => q.seat === last.seat || q.passed)) settle(s, p.seat);
}

export function redactBluff(s: BluffState, viewerId: string, now: number): BluffView {
  const me = player(s, viewerId);
  return {
    phase: s.phase,
    players: s.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, count: p.hand.length, passed: p.passed, left: p.left })),
    hand: me ? me.hand.map((c) => ({ ...c })) : [],
    rank: s.rank,
    pile: s.pile.map((pl) => ({ seq: pl.seq, seat: pl.seat, n: pl.cards.length, ...(me && pl.seat === me.seat ? { cards: pl.cards.map((c) => ({ ...c })) } : {}) })),
    pileCount: pileSize(s),
    burned: s.burned,
    turn: s.phase === "over" ? "" : s.turn,
    deadline: s.deadline,
    believed: s.believed.slice(),
    plays: s.plays,
    reveal: s.reveal ? { ...s.reveal, cards: s.reveal.cards.map((c) => ({ ...c })) } : null,
    winner: s.winner,
    winBy: s.winBy,
    startedAt: s.startedAt,
    log: s.log.slice(-30),
    youId: viewerId,
    now,
  };
}

export const bluffModule: GameModule<BluffState, BluffView, BluffMove> = {
  type: "bluff",
  minPlayers: 2,
  maxPlayers: 8,
  init: initBluff,
  applyMove: applyBluffMove,
  tick: tickBluff,
  redact: redactBluff,
  result: (s) => (s.phase === "over" && s.winner ? { winnerId: s.winner } : null),
  isOver: (s) => s.phase === "over",
  forfeit: forfeitBluff,
};
