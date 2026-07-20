/* Monopoly Deal — types, constants and card metadata.
   State is JSON-serializable (it round-trips through Redis). */

export const MONODEAL_MIN_PLAYERS = 2;
export const MONODEAL_MAX_PLAYERS = 5;

export const PLAYS_PER_TURN = 3;
export const HAND_LIMIT = 7;
/** Just Say No response window. */
export const JSN_MS = 25_000;
/** Payment window. */
export const PAY_MS = 35_000;
/** Whole-turn deadline (reset after each resolved action window). */
export const TURN_MS = 75_000;
/** End-of-turn discard window. */
export const DISCARD_MS = 25_000;
/** Hard cap: after this many full rounds the richest table wins. */
export const ROUND_CAP = 60;
export const LOG_CAP = 100;
export const DECK_SIZE = 106;

/* ---------------- colors ---------------- */

export type MonoColor =
  | "brown"
  | "light_blue"
  | "magenta"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "dark_blue"
  | "railroad"
  | "utility";

export const COLORS: readonly MonoColor[] = [
  "brown",
  "light_blue",
  "magenta",
  "orange",
  "red",
  "yellow",
  "green",
  "dark_blue",
  "railroad",
  "utility",
];

export interface ColorMeta {
  label: string;
  /** header-bar color on deed cards */
  hex: string;
  /** text color on that header */
  ink: string;
  setSize: number;
  /** rent by number of properties held (1-indexed by count) */
  rent: readonly number[];
  /** money value of every property card of this color */
  value: number;
  /** houses/hotels allowed (not on railroads or utilities) */
  buildable: boolean;
}

export const COLOR_META: Record<MonoColor, ColorMeta> = {
  brown: { label: "Brown", hex: "#8a5a3b", ink: "#fdf8ec", setSize: 2, rent: [1, 2], value: 1, buildable: true },
  light_blue: { label: "Light Blue", hex: "#9fd5e8", ink: "#16303a", setSize: 3, rent: [1, 2, 3], value: 1, buildable: true },
  magenta: { label: "Magenta", hex: "#c33e8d", ink: "#fdf8ec", setSize: 3, rent: [1, 2, 4], value: 2, buildable: true },
  orange: { label: "Orange", hex: "#e0862c", ink: "#2f1c07", setSize: 3, rent: [1, 3, 5], value: 2, buildable: true },
  red: { label: "Red", hex: "#c13a34", ink: "#fdf8ec", setSize: 3, rent: [2, 3, 6], value: 3, buildable: true },
  yellow: { label: "Yellow", hex: "#e2c23e", ink: "#33290a", setSize: 3, rent: [2, 4, 6], value: 3, buildable: true },
  green: { label: "Green", hex: "#1d7a53", ink: "#fdf8ec", setSize: 3, rent: [2, 4, 7], value: 4, buildable: true },
  dark_blue: { label: "Dark Blue", hex: "#2a4a86", ink: "#fdf8ec", setSize: 2, rent: [3, 8], value: 4, buildable: true },
  railroad: { label: "Railroad", hex: "#37332c", ink: "#fdf8ec", setSize: 4, rent: [1, 2, 3, 4], value: 2, buildable: false },
  utility: { label: "Utility", hex: "#7f9c8f", ink: "#16241d", setSize: 2, rent: [1, 2], value: 2, buildable: false },
};

/* ---------------- actions ---------------- */

export type MonoActionKind =
  | "deal_breaker"
  | "just_say_no"
  | "pass_go"
  | "forced_deal"
  | "sly_deal"
  | "debt_collector"
  | "birthday"
  | "house"
  | "hotel"
  | "double_rent";

export interface ActionMeta {
  label: string;
  value: number;
  blurb: string;
}

export const ACTION_META: Record<MonoActionKind, ActionMeta> = {
  deal_breaker: { label: "Deal Breaker", value: 5, blurb: "Steal a completed set, buildings included" },
  just_say_no: { label: "Just Say No", value: 4, blurb: "Cancel an action played against you" },
  pass_go: { label: "Pass Go", value: 1, blurb: "Draw two extra cards" },
  forced_deal: { label: "Forced Deal", value: 3, blurb: "Swap one of your properties with any player's" },
  sly_deal: { label: "Sly Deal", value: 3, blurb: "Steal a property that isn't in a full set" },
  debt_collector: { label: "Debt Collector", value: 3, blurb: "One player owes you $5M" },
  birthday: { label: "It's My Birthday", value: 2, blurb: "Every player owes you $2M" },
  house: { label: "House", value: 3, blurb: "+$3M rent on a completed set" },
  hotel: { label: "Hotel", value: 4, blurb: "+$4M rent on a set with a house" },
  double_rent: { label: "Double The Rent", value: 1, blurb: "Play with a rent card to double it" },
};

/* ---------------- cards ---------------- */

export type MonoCard =
  | { id: string; kind: "money"; value: number }
  | { id: string; kind: "property"; value: number; color: MonoColor; name: string }
  /** dual-color wildcard, or the all-color wild (colors = all 10, value 0 — cannot pay) */
  | { id: string; kind: "wild"; value: number; colors: MonoColor[] }
  | { id: string; kind: "action"; value: number; action: MonoActionKind }
  /** dual rent (colors = the pair, all opponents) or wild rent (wild = true, one target, any owned color) */
  | { id: string; kind: "rent"; value: number; colors: MonoColor[]; wild: boolean };

export const isAllColorWild = (c: MonoCard): boolean => c.kind === "wild" && c.colors.length === COLORS.length;

export function cardLabel(c: MonoCard): string {
  switch (c.kind) {
    case "money":
      return `$${c.value}M`;
    case "property":
      return c.name;
    case "wild":
      return isAllColorWild(c)
        ? "Property Wild"
        : `${COLOR_META[c.colors[0]].label} / ${COLOR_META[c.colors[1]].label} Wild`;
    case "action":
      return ACTION_META[c.action].label;
    case "rent":
      return c.wild ? "Wild Rent" : `${COLOR_META[c.colors[0]].label} / ${COLOR_META[c.colors[1]].label} Rent`;
  }
}

/* ---------------- state ---------------- */

/** A property (or wildcard) on a player's table, assigned to a color. */
export interface TableCard {
  card: MonoCard;
  color: MonoColor;
}

/** A house/hotel sitting on a completed set of `color`. */
export interface BuildingCard {
  card: MonoCard;
  color: MonoColor;
}

export interface MonoPlayer {
  id: string;
  name: string;
  seat: number;
  hand: MonoCard[];
  bank: MonoCard[];
  table: TableCard[];
  buildings: BuildingCard[];
  /** forfeited (left the party mid-game): assets discarded, turns skipped */
  left: boolean;
}

export type PendingKind = "debt_collector" | "birthday" | "sly_deal" | "forced_deal" | "deal_breaker" | "rent";

/** A resolved-in-order attack: current target is targets[0].
    stage "jsn": `jsnBy` may play Just Say No or decline (window ping-pongs
    between the current target and the actor — even jsnDepth = target's call).
    stage "pay": targets[0] owes `amount` and must submit a payment. */
export interface Pending {
  kind: PendingKind;
  actor: string;
  targets: string[];
  /** money owed per target (0 for steals/swaps) */
  amount: number;
  /** rent color, or the deal-broken set's color */
  color?: MonoColor;
  /** sly/forced: the card being taken from the target's table */
  targetCardId?: string;
  /** forced deal: the card the actor gives away */
  myCardId?: string;
  stage: "jsn" | "pay";
  jsnBy: string;
  jsnDepth: number;
  deadline: number;
}

export type MonoLogKind =
  | "start"
  | "draw"
  | "bank"
  | "property"
  | "rearrange"
  | "action"
  | "building"
  | "slide"
  | "rent"
  | "jsn"
  | "pay"
  | "steal"
  | "swap"
  | "deal_breaker"
  | "discard"
  | "timeout"
  | "forfeit"
  | "cap"
  | "win";

export interface MonoLogEntry {
  i: number;
  ts: number;
  kind: MonoLogKind;
  actor?: string;
  target?: string;
  card?: string;
  color?: MonoColor;
  amount?: number;
  n?: number;
}

export interface MonoDealState {
  players: MonoPlayer[];
  deck: MonoCard[];
  discard: MonoCard[];
  /** player id whose turn it is */
  turn: string;
  playsLeft: number;
  turnDeadline: number;
  /** turn player must discard down to HAND_LIMIT before the turn ends */
  discarding: boolean;
  discardDeadline: number | null;
  pending: Pending | null;
  turnsTaken: number;
  /** ROUND_CAP * players — at this many turns the richest table wins */
  capTurns: number;
  winner: string | null;
  /** the win came from the round cap, not three sets */
  cappedOut: boolean;
  log: MonoLogEntry[];
  logSeq: number;
  updatedAt: number;
}

/* ---------------- moves ---------------- */

export type MonoDealMove =
  | { type: "bank"; cardId: string }
  | { type: "place"; cardId: string; color?: MonoColor }
  | { type: "rearrange"; moves: { cardId: string; color: MonoColor }[] }
  | {
      type: "play_action";
      cardId: string;
      target?: string;
      targetCardId?: string;
      myCardId?: string;
      color?: MonoColor;
    }
  | { type: "play_rent"; cardId: string; color: MonoColor; target?: string; doubleIds?: string[] }
  | { type: "jsn" }
  | { type: "decline" }
  | { type: "pay"; cardIds: string[] }
  | { type: "discard"; cardIds: string[] }
  | { type: "end_turn" };

/* ---------------- client view ---------------- */

export interface MonoPlayerView {
  id: string;
  name: string;
  seat: number;
  handCount: number;
  /** present only for the viewer's own seat */
  hand?: MonoCard[];
  bank: MonoCard[];
  bankTotal: number;
  table: TableCard[];
  buildings: BuildingCard[];
  completed: MonoColor[];
  tableValue: number;
  /** forfeited — grayed out, turns skipped */
  left: boolean;
}

export interface PendingView {
  kind: PendingKind;
  actor: string;
  target: string;
  targetsLeft: number;
  stage: "jsn" | "pay";
  amount: number;
  color?: MonoColor;
  targetCardId?: string;
  myCardId?: string;
  jsnBy: string;
  jsnDepth: number;
  deadline: number;
}

export interface MonoDealView {
  youId: string;
  players: MonoPlayerView[];
  turn: string;
  playsLeft: number;
  deckCount: number;
  discardTop: MonoCard | null;
  discardCount: number;
  pending: PendingView | null;
  discarding: { player: string; deadline: number; mustDrop: number } | null;
  turnDeadline: number;
  winner: string | null;
  cappedOut: boolean;
  turnsTaken: number;
  capTurns: number;
  log: MonoLogEntry[];
  now: number;
}
