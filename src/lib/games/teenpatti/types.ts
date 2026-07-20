/* Teen Patti — types & constants.
   One module instance = one SESSION of many hands: everyone starts with
   START_CHIPS, antes BOOT per hand, and the session ends when only one player
   can still post the boot — or after HAND_CAP hands (richest player wins). */

export const BOOT = 2;
export const START_CHIPS = 200;
export const HAND_CAP = 50;
export const TURN_MS = 40_000;
export const HAND_OVER_MS = 8_000;
export const LOG_CAP = 80;

/* ---------------- cards ---------------- */

export type Suit = "S" | "H" | "D" | "C";
/** 2..14 — ace is 14 (aces high; A-2-3 is handled specially in ranking). */
export type CardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  r: CardRank;
  s: Suit;
}

/* ---------------- state ---------------- */

export type TPPhase = "playing" | "hand_over" | "session_over";

export type TPLogKind =
  | "boot"
  | "deal"
  | "see"
  | "blind_bet"
  | "chaal"
  | "raise"
  | "fold"
  | "show"
  | "showdown"
  | "win_hand"
  | "allin"
  | "bust"
  | "next_hand"
  | "timeout"
  | "leave"
  | "session_over";

export interface TPLogEntry {
  i: number;
  ts: number;
  kind: TPLogKind;
  actor?: string;
  target?: string;
  amount?: number;
  hand?: number;
  detail?: string;
}

export interface TPPlayer {
  id: string;
  name: string;
  seat: number;
  chips: number;
  /** 3 cards while in a hand, [] otherwise */
  cards: Card[];
  /** posted boot for the current hand */
  inHand: boolean;
  folded: boolean;
  /** false = playing blind */
  seen: boolean;
  allIn: boolean;
  /** total chips this player has put into the current hand (incl. boot) */
  betThisHand: number;
  /** cannot post the boot — out of the session, keeps leftover chips */
  busted: boolean;
  /** left the party mid-game — permanently out, chips left the table */
  left: boolean;
}

export interface RevealedHand {
  id: string;
  name: string;
  cards: Card[];
  label: string;
}

export interface HandSummary {
  handNo: number;
  winnerId: string;
  winnerName: string;
  amount: number;
  /** fold = everyone else folded (unrevealed); show = head-to-head show; showdown = all-in showdown */
  reason: "fold" | "show" | "showdown";
  revealed: RevealedHand[];
}

export interface TeenPattiState {
  players: TPPlayer[];
  phase: TPPhase;
  /** 1-based; 0 before the first deal */
  handNo: number;
  /** seat index of the dealer button (players array is seat-ordered) */
  dealerSeat: number;
  pot: number;
  /** current blind stake (a seen player's chaal is 2x this) */
  stake: number;
  /** player id on turn, null outside "playing" */
  turn: string | null;
  /** turn deadline while playing; next-deal deadline during hand_over */
  deadline: number | null;
  lastHand: HandSummary | null;
  winnerId: string | null;
  /** chips carried away by players who left — chips + pot + departedChips
      always equals START_CHIPS × player count */
  departedChips: number;
  log: TPLogEntry[];
  logSeq: number;
  updatedAt: number;
}

/* ---------------- moves ---------------- */

export type TeenPattiMove =
  | { type: "see" }
  | { type: "bet"; raise?: boolean }
  | { type: "fold" }
  | { type: "show" };

/* ---------------- per-viewer view ---------------- */

export interface TPViewPlayer {
  id: string;
  name: string;
  seat: number;
  chips: number;
  inHand: boolean;
  folded: boolean;
  seen: boolean;
  allIn: boolean;
  betThisHand: number;
  busted: boolean;
  left: boolean;
}

export interface TeenPattiView {
  phase: TPPhase;
  handNo: number;
  handCap: number;
  boot: number;
  dealerId: string | null;
  pot: number;
  stake: number;
  turn: string | null;
  deadline: number | null;
  players: TPViewPlayer[];
  /** your own 3 cards — ONLY once you've seen them (blind players get null) */
  yourCards: Card[] | null;
  lastHand: HandSummary | null;
  winnerId: string | null;
  log: TPLogEntry[];
  now: number;
}
