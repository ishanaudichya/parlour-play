/* Chain Reaction — orbs on a grid, criticality, and the cascade.
   Perfect information: the board is public, so player views and spectator
   views are identical apart from `youId`. Nothing here is secret. */

/** Per-turn deadline: expiry places an orb on a random legal cell. */
export const TURN_MS = 45_000;
export const LOG_CAP = 60;
/** How many cascade waves are recorded for the client to replay. A longer
    chain is still resolved in full — the client just snaps to the end. */
export const WAVES_RECORDED = 40;
/** Hard ceiling on cascade waves resolved for one move. Unreachable in
    practice: a cascade that never settles has already handed every orb to
    the mover, which ends the game and stops the loop first. */
export const WAVES_HARD_CAP = 2_000;
/** Eight luminous hues, by seat. Indexes match `ChainPlayer.seat`. */
export const ORB_COLORS = 8;

export type ChainPhase = "play" | "over";

export type ChainMove = { type: "place"; col: number; row: number };

/**
 * One cell. `n` orbs owned by seat `owner`; an empty cell is `{ n: 0,
 * owner: null }` and a cell with orbs ALWAYS has an owner.
 */
export interface ChainCell {
  n: number;
  owner: number | null;
}

/** Row-major flat board: `board[row * cols + col]`. Row 0 is the TOP. */
export type ChainBoard = ChainCell[];

/** Cell indexes that burst together in one cascade wave. */
export type Wave = number[];

export interface ChainPlayer {
  id: string;
  name: string;
  /** stable index within THIS game; also picks the orb colour */
  seat: number;
  /** still holds orbs (or hasn't had a first turn yet) */
  alive: boolean;
  /** has taken at least one turn — you can't be knocked out before that */
  moved: boolean;
  /** walked out of the party mid-game */
  left: boolean;
}

export type ChainLogKind = "start" | "place" | "eliminated" | "win" | "timeout" | "left";

export interface ChainLogEntry {
  i: number;
  ts: number;
  kind: ChainLogKind;
  /** player display name, denormalized for rendering */
  actor?: string;
  /** player id */
  player?: string;
  seat?: number;
  col?: number;
  row?: number;
  /** place only — how many cascade waves the move set off */
  waves?: number;
  /** place only — how many cells burst in total */
  bursts?: number;
  /** eliminated only — who knocked them out */
  by?: string;
}

export interface LastMove {
  col: number;
  row: number;
  by: string;
  seat: number;
  /** move number, 1-based — identifies this move for the replay */
  n: number;
  /** the cascade, wave by wave, capped at WAVES_RECORDED */
  waves: Wave[];
  /** total waves actually resolved (≥ waves.length) */
  totalWaves: number;
  /** total cells burst across the whole cascade */
  bursts: number;
}

export interface ChainState {
  phase: ChainPhase;
  cols: number;
  rows: number;
  /** board[row * cols + col]; row 0 is the top */
  board: ChainBoard;
  /** in seat order */
  players: ChainPlayer[];
  /** id of the player to place; "" once the game is over */
  turn: string;
  /** epoch ms the current turn expires; null when there is no turn */
  deadline: number | null;
  winner: string | null;
  winBy: "last_standing" | "forfeit" | null;
  lastMove: LastMove | null;
  /** orbs placed so far */
  moves: number;
  /** identifies this deal, so the UI can reset per-game animation state */
  startedAt: number;
  log: ChainLogEntry[];
  logSeq: number;
  updatedAt: number;
}

/* ---------------- client-facing view ---------------- */

export interface ChainViewPlayer {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  moved: boolean;
  left: boolean;
  /** orbs currently on the board in their colour */
  orbs: number;
  /** cells currently held */
  cells: number;
}

/**
 * The public view. Chain Reaction hides nothing, so spectators receive
 * exactly what the players receive — only `youId` differs.
 */
export interface ChainView {
  phase: ChainPhase;
  cols: number;
  rows: number;
  board: ChainBoard;
  players: ChainViewPlayer[];
  /** the viewer — may be a spectator who is not in `players` */
  youId: string;
  turn: string | null;
  deadline: number | null;
  winner: string | null;
  winBy: "last_standing" | "forfeit" | null;
  lastMove: LastMove | null;
  moves: number;
  startedAt: number;
  log: ChainLogEntry[];
  now: number;
}
