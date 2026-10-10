/* STACCS — hexagonal "cube" cards stacked into one shared 3D structure.
   Matching suits stack on a TOP, matching numbers on a SIDE, matching face
   cards on a FACE; every surface a card touches must match. First to empty
   their hand wins. Rules per the official STACCS "UH OH!" mode (2–5 players,
   one deck) and "UH OH! PARTY" (6+ players, two decks).

   Hands are private; the STACC, the draw pile size and hand sizes are public. */

export const TURN_MS = 30_000;
export const LOG_CAP = 60;
/** Forgot to call UH OH and got caught. */
export const CATCH_PENALTY = 3;

export type Suit = "S" | "H" | "C" | "D";
export type Rank = 0 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | "J" | "Q" | "K" | "A" | "W";
export type Surface = "top" | "side" | "face";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

/** A card in the STACC. */
export interface BoardCard {
  card: Card;
  /** lattice vertex of its centre */
  v: [number, number];
  /** rotation in sixths of a turn; every non-wild matches the current direction */
  rot: number;
  /** wilds: the suit called */
  called?: Suit;
  /** seat that played it */
  by: number;
}

export interface Placement {
  cardId: string;
  v: [number, number];
  /** wilds only */
  rot?: number;
  called?: Suit;
}

export type StaccsMove =
  | { type: "play"; place: Placement; declare?: boolean }
  /** stop playing more cards of the same number this turn */
  | { type: "done" }
  | { type: "draw" }
  /** a J/K was played at you: take the cards (then carry on with your turn) */
  | { type: "take" }
  /** a Queen: hand these cards to the next player */
  | { type: "give"; cardIds: string[] }
  | { type: "uhoh" }
  | { type: "catch"; target: string };

export type StaccsPhase = "play" | "give" | "over";

/** An attack waiting on the current player: counter it with the same letter, or take it. */
export interface Pending {
  rank: "J" | "K";
  n: number;
  from: number;
}

export interface StaccsPlayer {
  id: string;
  name: string;
  seat: number;
  hand: Card[];
  /** dropped to one card without calling UH OH — open to a catch until their next turn */
  catchable: boolean;
  /** called UH OH at one card */
  called: boolean;
  left: boolean;
}

export interface LastPlay {
  /** monotonically increasing per placement; drives the client animation */
  seq: number;
  by: number;
  idx: number;
}

export type StaccsLogKind =
  | "start"
  | "play"
  | "draw"
  | "take"
  | "give"
  | "attack"
  | "counter"
  | "zero"
  | "ace"
  | "wild"
  | "uhoh"
  | "catch"
  | "pass"
  | "timeout"
  | "left"
  | "win"
  | "stalemate";

export interface StaccsLogEntry {
  i: number;
  ts: number;
  kind: StaccsLogKind;
  actor?: string;
  seat?: number;
  target?: string;
  card?: Card;
  n?: number;
  suit?: Suit;
}

export interface StaccsState {
  phase: StaccsPhase;
  players: StaccsPlayer[];
  decks: 1 | 2;
  board: BoardCard[];
  draw: Card[];
  /** index into board of the latest wild; cards before it are locked */
  lockFrom: number;
  /** current orientation for non-wild cards */
  dir: number;
  /** board index of a zero whose top the current player may not use */
  blockedTop: number | null;
  turn: string;
  /** +1 clockwise, −1 after an odd number of zeros (3+ players) */
  order: 1 | -1;
  deadline: number | null;
  pending: Pending | null;
  /** a Queen chain: how many cards the current giver owes, and how long the chain is */
  give: number;
  queenChain: number;
  /** playing more cards of one number this turn */
  combo: number | null;
  /** a zero laid this turn: its top is blocked for the next player */
  pendingBlock: number | null;
  /** numbers present in the STACC when the turn began (for multi-number plays) */
  turnNumbers: number[];
  /** consecutive turns that ended with nothing to draw and nothing played */
  stuck: number;
  seq: number;
  lastPlay: LastPlay | null;
  winner: string | null;
  winBy: "out" | "forfeit" | "fewest" | null;
  startedAt: number;
  log: StaccsLogEntry[];
  logSeq: number;
  updatedAt: number;
}

/* ---------------- client-facing view ---------------- */

export interface StaccsViewPlayer {
  id: string;
  name: string;
  seat: number;
  count: number;
  catchable: boolean;
  called: boolean;
  left: boolean;
}

export interface StaccsView {
  phase: StaccsPhase;
  players: StaccsViewPlayer[];
  youId: string;
  /** your hand (empty for spectators) */
  hand: Card[];
  decks: 1 | 2;
  board: BoardCard[];
  drawCount: number;
  lockFrom: number;
  dir: number;
  blockedTop: number | null;
  turn: string | null;
  order: 1 | -1;
  deadline: number | null;
  pending: Pending | null;
  give: number;
  /** a Queen was just played at you: counter with a Queen to pass on this many + 1 */
  queenChain: number;
  combo: number | null;
  turnNumbers: number[];
  seq: number;
  lastPlay: LastPlay | null;
  winner: string | null;
  winBy: "out" | "forfeit" | "fewest" | null;
  startedAt: number;
  log: StaccsLogEntry[];
  now: number;
}
