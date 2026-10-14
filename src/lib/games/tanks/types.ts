/* Pocket Tanks — artillery on a destructible ridge, with Pocket Tanks' own
   original 30 weapons. Each player drafts an arsenal from a shared pool (or
   lets it be dealt at random), then the tanks take turns firing one weapon
   apiece; every point of damage you deal is a point on your score. No wind,
   no fall damage — as in Pocket Tanks. When the last weapon has flown, the
   highest score wins (a tie is a draw).

   Perfect information: terrain, arsenals and scores are public, so player and
   spectator views are identical apart from `youId`. */

import type { WeaponId } from "./weapons";

/** Per-shot deadline (aiming + firing). Expiry fires whatever is loaded. */
export const TURN_MS = 45_000;
/** Per-pick deadline during the draft. Expiry picks for you. */
export const PICK_MS = 20_000;
export const LOG_CAP = 50;
/** Drives per tank per game (Pocket Tanks' four moves). */
export const MOVES = 4;
/** Weapons per arsenal, by table size. */
export const ARSENAL: Record<number, number> = { 2: 10, 3: 7, 4: 6 };
/** Extra weapons in the draft pool, so the last picks still choose. */
export const POOL_SPARE = 4;

export type TankColor = "red" | "blue" | "lime" | "gold";
export type Biome = "mesa" | "tundra" | "ashlands" | "lunar";

export type TanksPhase = "draft" | "aim" | "over";

export type TanksMove =
  /** "random" lets the table choose for you */
  | { type: "pick"; weapon: WeaponId | "random" }
  /** stop choosing: every remaining pick of yours is made at random, instantly */
  | { type: "autodraft" }
  | { type: "aim"; angle: number; power: number; weapon?: WeaponId }
  | { type: "drive"; dir: -1 | 1 }
  | { type: "fire"; angle: number; power: number; weapon: WeaponId };

export interface TanksPlayer {
  id: string;
  name: string;
  /** stable index within THIS game; turn order */
  seat: number;
  color: TankColor;
  /** tank position: x along the ridge, y = height of the ground it rests on */
  x: number;
  y: number;
  /** degrees, a full circle: 0 = right, 90 = up, 180 = left, 270 = straight down */
  angle: number;
  /** 0..100 */
  power: number;
  /** weapon currently loaded (one of `arsenal`), shown to everyone */
  loaded: WeaponId | null;
  /** weapons not yet fired, in draft order */
  arsenal: WeaponId[];
  /** every weapon drafted, in draft order (for the end card) */
  drafted: WeaponId[];
  moves: number;
  score: number;
  /** damage dealt to others / taken from anyone */
  dealt: number;
  taken: number;
  /** the single shot that scored the most */
  best: { weapon: WeaponId; pts: number } | null;
  /** asked for the rest of their picks to be random */
  autoDraft: boolean;
  /** walked out of the party mid-game — their tank is gone */
  left: boolean;
}

/* ---------------- the shot record (server resolves, client replays) ---------------- */

/** Terrain edits, applied in order by both the server and the replay. */
export type TerrainOp =
  | { k: "carve"; x: number; y: number; r: number }
  | { k: "dirt"; x: number; y: number; r: number }
  | { k: "bump"; x: number; r: number; h: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; r: number }
  | { k: "quake"; x: number; r: number; amp: number; seed: number };

/** How an explosion looks. Pocket Tanks' explosions are colour-cycling rings;
    the palette is what changes from weapon to weapon. */
export type FxStyle = "fire" | "big" | "small" | "ice" | "zap" | "napalm" | "dirt" | "web" | "pop" | "spark" | "sniper";

export type TrackStyle =
  | "bullet"
  | "warhead"
  | "tracer"
  | "ice"
  | "flame"
  | "clod"
  | "dig"
  | "missile"
  | "round";

export interface Track {
  s: TrackStyle;
  /** first tick */
  t0: number;
  /** last tick */
  t1: number;
  /** sample interval in ticks */
  k: number;
  /** colour of the bullet, when the style doesn't fix it */
  c?: string;
  /** x,y pairs (y up, rounded), one per `k` ticks from t0, plus the final position */
  p: number[];
}

export type ShotEvent =
  | { t: number; k: "op"; op: TerrainOp }
  | { t: number; k: "boom"; x: number; y: number; r: number; fx: FxStyle }
  | { t: number; k: "dmg"; seat: number; n: number; x: number; y: number }
  | { t: number; k: "tank"; seat: number; x: number; y: number; how: "fall" | "push" | "rise" | "toss"; d: number }
  /** a straight line of energy or silk from (x1,y1) to (x2,y2) */
  | { t: number; k: "beam"; x1: number; y1: number; x2: number; y2: number; fx: "zap" | "web"; d: number }
  /** a Tracer bullet came down here: change your angle by `label` to land here */
  | { t: number; k: "mark"; x: number; y: number; label: string; seat: number }
  | { t: number; k: "muzzle"; seat: number }
  | { t: number; k: "bounce"; x: number; y: number };

export interface ShotRecord {
  tracks: Track[];
  /** sorted by `t` */
  events: ShotEvent[];
  /** ticks until everything has settled */
  dur: number;
}

export interface LastShot {
  /** beat number (drives and shots share the sequence) */
  beat: number;
  seat: number;
  weapon: string;
  angle: number;
  power: number;
  wind: number;
  /** the world just before the trigger was pulled — the replay starts here */
  pre: { ground: number[]; tanks: { seat: number; x: number; y: number }[]; scores: number[] };
  rec: ShotRecord;
  /** points the shooter netted with this shot */
  pts: number;
}

export interface LastDrive {
  beat: number;
  seat: number;
  from: number;
  to: number;
}

export type TanksLogKind = "start" | "draft_done" | "pick" | "fire" | "score" | "self" | "drive" | "timeout" | "left" | "win" | "draw";

export interface TanksLogEntry {
  i: number;
  ts: number;
  kind: TanksLogKind;
  actor?: string;
  player?: string;
  seat?: number;
  weapon?: string;
  n?: number;
  victim?: string;
}

export interface TanksState {
  phase: TanksPhase;
  players: TanksPlayer[];
  biome: Biome;
  /** gravity multiplier (the moon is gentler) */
  gravity: number;
  wind: number;
  /** ground height per column (see terrain.ts) */
  ground: number[];
  /** draft: the weapons still on the table */
  pool: WeaponId[];
  /** draft: seat order of every pick, snake-style */
  draftOrder: number[];
  draftIdx: number;
  /** id of the player who must act (pick or fire); "" when over */
  turn: string;
  deadline: number | null;
  shots: number;
  totalShots: number;
  beat: number;
  lastShot: LastShot | null;
  lastDrive: LastDrive | null;
  winner: string | null;
  winBy: "score" | "forfeit" | null;
  /** identifies this game, so the UI can reset per-game state */
  startedAt: number;
  /** seed for cosmetic, deterministic scenery (far hills, clouds) */
  scenery: number;
  log: TanksLogEntry[];
  logSeq: number;
  updatedAt: number;
}

/* ---------------- client-facing view ---------------- */

/** Other players' power and loaded weapon are hidden until they fire; the
    barrel angle stays public because everyone can see the barrel. */
export type TanksViewPlayer = Omit<TanksPlayer, never>;

export interface TanksView {
  phase: TanksPhase;
  players: TanksViewPlayer[];
  youId: string;
  biome: Biome;
  gravity: number;
  wind: number;
  ground: number[];
  pool: WeaponId[];
  draftOrder: number[];
  draftIdx: number;
  turn: string | null;
  deadline: number | null;
  shots: number;
  totalShots: number;
  beat: number;
  lastShot: LastShot | null;
  lastDrive: LastDrive | null;
  winner: string | null;
  winBy: "score" | "forfeit" | null;
  startedAt: number;
  scenery: number;
  log: TanksLogEntry[];
  now: number;
}
