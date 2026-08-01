/* Four in a Row (Connect Four) — a 7×6 duel of gravity and geometry.
   Perfect information: the board is public, so player views and spectator
   views are identical apart from `youId`. Nothing here is secret. */

/** Columns, left to right. */
export const COLS = 7;
/** Rows per column. */
export const ROWS = 6;
/** Every cell on the board — a full board with no line is a draw. */
export const CELLS = COLS * ROWS;
/** Per-turn deadline: expiry drops a disc in a random open column. */
export const TURN_MS = 45_000;
export const LOG_CAP = 60;

export type Disc = "red" | "yellow";
export type Cell = Disc | null;

/**
 * The board, COLUMN-MAJOR: `board[col][row]`, `col` 0..6 left→right and
 * `row` 0..5 BOTTOM→TOP (row 0 sits on the floor). Gravity therefore means
 * "the lowest index with a null in that column". The UI flips rows when it
 * paints, the engine never does.
 */
export type Board = Cell[][];

export interface Coord {
  col: number;
  row: number;
}

export type C4Phase = "play" | "over";

export type Connect4Move = { type: "drop"; col: number };

export interface C4Player {
  id: string;
  name: string;
  /** stable index within the game: seat 0 plays red, seat 1 plays yellow */
  seat: number;
  color: Disc;
  /** they walked out of the party mid-game */
  left: boolean;
}

export type C4LogKind = "start" | "drop" | "win" | "draw" | "timeout" | "left";

export interface C4LogEntry {
  i: number;
  ts: number;
  kind: C4LogKind;
  /** player display name, denormalized for rendering */
  actor?: string;
  /** player id */
  player?: string;
  color?: Disc;
  col?: number;
  row?: number;
  /** win only — the four (or more) connected cells */
  line?: Coord[];
}

export interface Connect4State {
  phase: C4Phase;
  /** board[col][row]; row 0 is the bottom */
  board: Board;
  /** exactly two, in seat order */
  players: C4Player[];
  /** id of the player to drop; "" once the game is over */
  turn: string;
  /** epoch ms the current turn expires; null when there is no turn */
  deadline: number | null;
  winner: string | null;
  winBy: "connect" | "forfeit" | null;
  /** board filled with no line — game over, but nobody won */
  draw: boolean;
  /** the winning run, ascending by column then row; null until someone wins */
  winningLine: Coord[] | null;
  /** most recent disc, for the drop animation. `n` is the move number (1-based) */
  lastDrop: { col: number; row: number; by: string; color: Disc; n: number } | null;
  /** discs placed so far */
  moves: number;
  /** identifies this deal, so the UI can reset per-game animation state */
  startedAt: number;
  log: C4LogEntry[];
  logSeq: number;
  updatedAt: number;
}

/* ---------------- client-facing view ---------------- */

export interface C4ViewPlayer {
  id: string;
  name: string;
  seat: number;
  color: Disc;
  discsPlaced: number;
  left: boolean;
}

/**
 * The public view. Connect Four hides nothing, so spectators receive exactly
 * what the players receive — only `youId` differs.
 */
export interface Connect4View {
  phase: C4Phase;
  /** board[col][row], row 0 = bottom — same orientation as the state */
  board: Board;
  players: C4ViewPlayer[];
  /** the viewer — may be a spectator who is not in `players` */
  youId: string;
  turn: string | null;
  deadline: number | null;
  winner: string | null;
  winBy: "connect" | "forfeit" | null;
  draw: boolean;
  winningLine: Coord[] | null;
  lastDrop: { col: number; row: number; by: string; color: Disc; n: number } | null;
  moves: number;
  startedAt: number;
  log: C4LogEntry[];
  now: number;
}
