/* Ludo — four yards, a 52-square loop, and a die that decides everything.
   Perfect information: the board is public, so player views and spectator
   views are identical apart from `youId`. Nothing here is secret. */

/** Per-action deadline (a roll OR a token choice): expiry plays for you. */
export const TURN_MS = 30_000;
export const LOG_CAP = 60;
/** Tokens per player. */
export const TOKENS = 4;
/** Squares in the shared loop. */
export const TRACK_LEN = 52;
/** A token's last shared square before it turns into its home column. */
export const LAST_TRACK = 50;
/** Squares in the home column (positions 51..55). */
export const HOME_STRETCH = 5;
/** The position that means "home". Exact count required. */
export const HOME_POS = LAST_TRACK + HOME_STRETCH + 1; // 56
/** Rolling three sixes in a row forfeits the turn. */
export const MAX_SIXES = 3;

export type LudoColor = "red" | "blue" | "yellow" | "green";

export type LudoPhase = "roll" | "move" | "over";

export type LudoMove = { type: "roll" } | { type: "move"; token: number };

export interface LudoPlayer {
  id: string;
  name: string;
  /** stable index within THIS game; turn order */
  seat: number;
  color: LudoColor;
  /**
   * One entry per token: -1 in the yard, 0..50 on the shared loop (relative
   * to this colour's start square), 51..55 in the home column, 56 home.
   */
  tokens: number[];
  /** walked out of the party mid-game — their tokens were swept off */
  left: boolean;
}

export type LudoBonus = "six" | "capture" | "home";

export interface LudoCapture {
  seat: number;
  token: number;
  /** the relative position the victim was sitting on */
  from: number;
}

export interface LastRoll {
  by: string;
  seat: number;
  value: number;
  /** roll number, 1-based — identifies this roll for the die tumble */
  n: number;
}

export interface LastMove {
  by: string;
  seat: number;
  token: number;
  from: number;
  to: number;
  /** die value that produced this move */
  die: number;
  captured: LudoCapture[];
  /** why the mover keeps the turn, if they do */
  bonus: LudoBonus | null;
  /** move number, 1-based — identifies this move for the hop replay */
  n: number;
  /** the roll this move answered — the client waits for that die to settle */
  rollN: number;
}

export type LudoLogKind =
  | "start"
  | "roll"
  | "move"
  | "capture"
  | "home"
  | "three_sixes"
  | "no_move"
  | "timeout"
  | "left"
  | "win";

export interface LudoLogEntry {
  i: number;
  ts: number;
  kind: LudoLogKind;
  /** player display name, denormalized for rendering */
  actor?: string;
  /** player id */
  player?: string;
  seat?: number;
  color?: LudoColor;
  /** roll / move — the die */
  value?: number;
  token?: number;
  from?: number;
  to?: number;
  /** capture — the victim */
  victim?: string;
  victimSeat?: number;
}

export interface LudoState {
  phase: LudoPhase;
  players: LudoPlayer[];
  /** id of the player whose turn it is; "" once the game is over */
  turn: string;
  /** epoch ms the current action expires; null when there is nothing to do */
  deadline: number | null;
  /** the roll awaiting a token choice (phase "move"), else null */
  die: number | null;
  /** consecutive sixes this turn */
  sixes: number;
  /** token indexes that may move with `die` (phase "move"), else empty */
  movable: number[];
  rolls: number;
  moves: number;
  lastRoll: LastRoll | null;
  lastMove: LastMove | null;
  winner: string | null;
  winBy: "home" | "forfeit" | null;
  /** identifies this deal, so the UI can reset per-game animation state */
  startedAt: number;
  log: LudoLogEntry[];
  logSeq: number;
  updatedAt: number;
}

/* ---------------- client-facing view ---------------- */

export interface LudoViewPlayer {
  id: string;
  name: string;
  seat: number;
  color: LudoColor;
  tokens: number[];
  /** tokens that have reached home */
  home: number;
  /** tokens still in the yard */
  inYard: number;
  left: boolean;
}

/**
 * The public view. Ludo hides nothing, so spectators receive exactly what
 * the players receive — only `youId` differs.
 */
export interface LudoView {
  phase: LudoPhase;
  players: LudoViewPlayer[];
  /** the viewer — may be a spectator who is not in `players` */
  youId: string;
  turn: string | null;
  deadline: number | null;
  die: number | null;
  sixes: number;
  movable: number[];
  rolls: number;
  moves: number;
  lastRoll: LastRoll | null;
  lastMove: LastMove | null;
  winner: string | null;
  winBy: "home" | "forfeit" | null;
  startedAt: number;
  log: LudoLogEntry[];
  now: number;
}
