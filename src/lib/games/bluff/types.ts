/* Bluff — the Indian way of playing Cheat (pagat.com's "Bluff", West Bengal).
   The whole 52-card pack is dealt out. A round starts when its leader plays
   one to four cards face down and names a rank ("three Kings"); everyone
   after them must play more of that same rank — or pass, and sit the rest of
   the round out. The count is public, the cards are not: lying is the game.

   Anyone may call "Bluff!" on the latest play. Its cards are turned up: a lie
   and the liar takes the whole pile, the truth and the caller does; whoever
   won the call leads a new round. If everyone else passes, the pile is set
   aside unseen and the last player to play leads. Empty your hand and survive
   the last call on it, and you win. */

/** Seconds on the clock for a turn; a leader who runs out leads for real, a follower passes. */
export const TURN_MS = 40_000;
/** How long the table has to call bluff on someone's last cards. */
export const LASTCALL_MS = 9_000;
/** A play is one to four cards — there are only four of any rank. */
export const MAX_PLAY = 4;
export const LOG_CAP = 60;

export type Suit = "S" | "H" | "D" | "C";
/** 1 = Ace … 11 = Jack, 12 = Queen, 13 = King */
export type Rank = number;

export interface Card {
  /** rank + suit, e.g. "13S"; unique in the pack */
  id: string;
  r: Rank;
  s: Suit;
}

export type BluffPhase = "play" | "lastcall" | "over";

export type BluffMove =
  /** lay cards face down; `rank` names it when you lead a round, and must be omitted or match after */
  | { type: "play"; cards: string[]; rank?: Rank }
  /** sit out the rest of the round (you can still call bluff) */
  | { type: "pass" }
  /** call bluff on play number `at` — refused if it's no longer the latest */
  | { type: "call"; at: number }
  /** last call: you believe them */
  | { type: "believe" };

export interface BluffPlayer {
  id: string;
  name: string;
  /** stable index within the game: turn order and paint colour */
  seat: number;
  hand: Card[];
  /** passed this round: no more plays until the next one */
  passed: boolean;
  left: boolean;
}

export interface Play {
  /** play number in the game, 1-based: what a call names */
  seq: number;
  seat: number;
  cards: Card[];
}

/** The latest call, turned face up for the table. */
export interface Reveal {
  /** the play that was called */
  seq: number;
  /** seat that called / seat that played */
  by: number;
  of: number;
  rank: Rank;
  cards: Card[];
  honest: boolean;
  /** seat that took the pile, and how many cards that was */
  taker: number;
  n: number;
}

export type BluffLogKind = "lead" | "play" | "pass" | "burn" | "call" | "lastcall" | "timeout" | "left" | "win";

export interface BluffLogEntry {
  i: number;
  ts: number;
  kind: BluffLogKind;
  seat?: number;
  /** a second seat: who was called on */
  other?: number;
  n?: number;
  rank?: Rank;
  honest?: boolean;
}

export interface BluffState {
  phase: BluffPhase;
  players: BluffPlayer[];
  /** the round's rank; null when the player on turn is leading a new round */
  rank: Rank | null;
  /** this round's plays, oldest first — the pile */
  pile: Play[];
  /** cards set aside unseen: rounds everyone passed on, and hands of players who left */
  burned: number;
  /** play: whose turn; lastcall: the player down to no cards */
  turn: string;
  deadline: number | null;
  /** last call: who has let it go */
  believed: string[];
  plays: number;
  reveal: Reveal | null;
  winner: string | null;
  winBy: "empty" | "forfeit" | null;
  startedAt: number;
  log: BluffLogEntry[];
  logSeq: number;
  updatedAt: number;
}

export interface BluffViewPlayer {
  id: string;
  name: string;
  seat: number;
  count: number;
  passed: boolean;
  left: boolean;
}

export interface BluffViewPlay {
  seq: number;
  seat: number;
  n: number;
  /** only on your own plays — you know what you put down */
  cards?: Card[];
}

export interface BluffView {
  phase: BluffPhase;
  players: BluffViewPlayer[];
  /** your hand, A to K; empty for a spectator */
  hand: Card[];
  rank: Rank | null;
  pile: BluffViewPlay[];
  pileCount: number;
  burned: number;
  turn: string;
  deadline: number | null;
  believed: string[];
  plays: number;
  reveal: Reveal | null;
  winner: string | null;
  winBy: "empty" | "forfeit" | null;
  startedAt: number;
  log: BluffLogEntry[];
  youId: string;
  now: number;
}
