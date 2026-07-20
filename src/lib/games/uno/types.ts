/* UNO — types shared by engine, fuzz test and UI. */

export const UNO_COLORS = ["red", "yellow", "green", "blue"] as const;
export type UnoColor = (typeof UNO_COLORS)[number];

export type UnoSymbol =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4";

export interface UnoCard {
  id: string;
  /** null for wild / wild_draw4 */
  color: UnoColor | null;
  symbol: UnoSymbol;
}

/** Per-turn deadline before the engine auto-plays a safe move. */
export const UNO_TURN_MS = 45_000;
export const UNO_LOG_CAP = 80;
export const UNO_HAND_SIZE = 7;
export const UNO_MIN_PLAYERS = 2;
export const UNO_MAX_PLAYERS = 8;

export type UnoLogKind =
  | "play"
  | "draw"
  | "pass"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4"
  | "uno"
  | "catch"
  | "win"
  | "timeout"
  | "leave";

export interface UnoLogEntry {
  i: number;
  ts: number;
  kind: UnoLogKind;
  /** player names, for the ticker */
  actor?: string;
  target?: string;
  color?: UnoColor;
  symbol?: UnoSymbol;
  /** cards drawn (draw / draw2 / wild4 / catch) */
  n?: number;
}

export interface UnoPlayerState {
  id: string;
  name: string;
  seat: number;
  hand: UnoCard[];
  /** played down to 1 card without declaring UNO; open to a catch */
  catchable: boolean;
  /** forfeited (left the party) — seat stays, turn skips them forever */
  left: boolean;
}

export interface UnoState {
  phase: "play" | "over";
  players: UnoPlayerState[];
  /** last element = top of the pile */
  deck: UnoCard[];
  /** last element = top of the pile */
  discard: UnoCard[];
  activeColor: UnoColor;
  direction: 1 | -1;
  /** player id whose turn it is */
  turn: string;
  /** turn player already drew this turn */
  hasDrawn: boolean;
  /** the card drawn this turn (only playable card while set) */
  drawnCardId: string | null;
  /** turn expiry timestamp (ms) */
  deadline: number;
  winner: string | null;
  log: UnoLogEntry[];
  logSeq: number;
}

export type UnoMove =
  | { type: "play"; cardId: string; chooseColor?: UnoColor; declareUno?: boolean }
  | { type: "draw" }
  | { type: "pass" }
  | { type: "catch"; target: string }
  | { type: "callUno" };

/* ---------------- client view ---------------- */

export interface UnoViewPlayer {
  id: string;
  name: string;
  seat: number;
  cardCount: number;
  catchable: boolean;
  left: boolean;
}

export interface UnoView {
  phase: "play" | "over";
  youId: string;
  players: UnoViewPlayer[];
  /** your cards; null for spectators */
  hand: UnoCard[] | null;
  deckCount: number;
  discardTop: UnoCard;
  /** up to the last 3 discards (public), oldest first — for the visual stack */
  discardTail: UnoCard[];
  discardCount: number;
  activeColor: UnoColor;
  direction: 1 | -1;
  turn: string;
  deadline: number;
  hasDrawn: boolean;
  /** only exposed to the turn player themself */
  drawnCardId: string | null;
  winner: string | null;
  log: UnoLogEntry[];
  /** server clock at redaction, for countdown skew */
  now: number;
}
