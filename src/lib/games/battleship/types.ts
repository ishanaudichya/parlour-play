/* Battleship — a naval duel on a 10×10 grid. Types, constants, and the
   client-facing (redacted) view shapes. The whole game is a secret-keeping
   exercise: ship positions must NEVER leave the server unless hit-revealed
   (sunk) or owned by the viewer. */

export type ShipId = "carrier" | "battleship" | "cruiser" | "submarine" | "destroyer";
export type Dir = "h" | "v";
export type BSPhase = "placement" | "battle" | "over";

export interface ShipSpec {
  id: ShipId;
  name: string;
  len: number;
}

/** The classic fleet — 17 cells total. Ships may touch, never overlap. */
export const SHIPS: ShipSpec[] = [
  { id: "carrier", name: "Carrier", len: 5 },
  { id: "battleship", name: "Battleship", len: 4 },
  { id: "cruiser", name: "Cruiser", len: 3 },
  { id: "submarine", name: "Submarine", len: 3 },
  { id: "destroyer", name: "Destroyer", len: 2 },
];

export const SHIP_LEN: Record<ShipId, number> = {
  carrier: 5,
  battleship: 4,
  cruiser: 3,
  submarine: 3,
  destroyer: 2,
};

export const SHIP_NAME: Record<ShipId, string> = {
  carrier: "Carrier",
  battleship: "Battleship",
  cruiser: "Cruiser",
  submarine: "Submarine",
  destroyer: "Destroyer",
};

export const GRID = 10;
export const FLEET_CELLS = 17;
/** Placement deadline — laggards get their fleet auto-scattered and readied. */
export const PLACE_MS = 90_000;
/** Per-shot deadline — expiry fires ONE random shot for the dawdler. */
export const TURN_MS = 45_000;
export const LOG_CAP = 80;

export interface Placement {
  x: number;
  y: number;
  dir: Dir;
}

/** One fired shot. Shots are public knowledge the moment they are fired. */
export interface Shot {
  x: number;
  y: number;
  hit: boolean;
}

export interface BSPlayer {
  id: string;
  name: string;
  seat: number;
  ready: boolean;
  left: boolean;
  /** this player's own ship placements — SECRET */
  fleet: Partial<Record<ShipId, Placement>>;
  /** shots this player has fired at the opponent, in firing order */
  shots: Shot[];
}

export type BattleshipMove =
  | { type: "place"; shipId: ShipId; x: number; y: number; dir: Dir }
  | { type: "randomize" }
  | { type: "ready" }
  | { type: "shoot"; x: number; y: number };

export type BSLogKind =
  | "place_ready"
  | "battle_start"
  | "shot"
  | "sunk"
  | "win"
  | "timeout"
  | "left";

export interface BSLogEntry {
  i: number;
  ts: number;
  kind: BSLogKind;
  /** player name, denormalized for rendering */
  actor?: string;
  /** shot coordinates — shots are public, this reveals nothing extra */
  x?: number;
  y?: number;
  hit?: boolean;
  /** sunk ship display name */
  ship?: string;
}

export interface BattleshipState {
  phase: BSPhase;
  /** exactly two, in seat order */
  players: BSPlayer[];
  /** battle: id of the player to shoot; "" during placement */
  turn: string;
  placeDeadline?: number;
  turnDeadline?: number;
  winner: string | null;
  winBy: "sink" | "forfeit" | null;
  lastShot: { by: string; x: number; y: number; hit: boolean; sunk?: ShipId } | null;
  log: BSLogEntry[];
  logSeq: number;
  updatedAt: number;
}

/* ---------------- client-facing (redacted) shapes ---------------- */

export interface BSViewPlayer {
  id: string;
  name: string;
  seat: number;
  ready: boolean;
  left: boolean;
  /** count of this player's ships still afloat — a count, never positions */
  shipsRemaining: number;
  shotsFired: number;
  hitsLanded: number;
}

/** A fully-sunk ship, revealed to everyone (every cell already hit). */
export interface SunkShipView {
  ship: ShipId;
  name: string;
  len: number;
  x: number;
  y: number;
  dir: Dir;
}

/** Public knowledge about one player's ocean grid. */
export interface BSBoardView {
  /** owner of this board */
  playerId: string;
  /** shots fired AT this board by the opponent */
  shots: Shot[];
  /** ships on this board that are fully sunk — the only revealed hulls */
  sunk: SunkShipView[];
}

/** One of YOUR OWN ships (only ever describes the viewer's fleet). */
export interface YourShipView {
  ship: ShipId;
  name: string;
  len: number;
  placed: boolean;
  x?: number;
  y?: number;
  dir?: Dir;
  /** per-cell hit flags along the hull, bow to stern */
  hits: boolean[];
  sunk: boolean;
}

export interface BattleshipView {
  phase: BSPhase;
  players: BSViewPlayer[];
  /** battle only — whose gun it is */
  turn: string | null;
  placeDeadline?: number;
  turnDeadline?: number;
  winner: string | null;
  winBy: "sink" | "forfeit" | null;
  /** public shot-maps + sunk reveals for BOTH boards, seat order */
  boards: BSBoardView[];
  /** your own fleet with full layout — null for spectators */
  yourFleet: YourShipView[] | null;
  youReady: boolean;
  /** most recent shot, for animations (public) */
  lastShot: { by: string; x: number; y: number; hit: boolean; sunk?: string } | null;
  log: BSLogEntry[];
  now: number;
}
