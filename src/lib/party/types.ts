import type { GameType } from "@/lib/games/types";

export const PARTY_MAX = 8;

export interface Member {
  id: string;
  secret: string;
  name: string;
  seat: number; // join order; also drives medallion color
  joinedAt: number;
}

export type PartyLogKind = "join" | "leave" | "game_start" | "game_end" | "winner";

export interface PartyLogEntry {
  i: number;
  ts: number;
  kind: PartyLogKind;
  member?: string; // name
  game?: GameType;
}

export interface ActiveGame {
  type: GameType;
  /** member ids playing this game (join-order slice at start time) */
  players: string[];
  state: unknown;
  startedAt: number;
  /** winner already recorded in tallies */
  tallied: boolean;
}

export interface PartyState {
  code: string;
  hostId: string;
  members: Member[];
  phase: "lobby" | "game";
  game: ActiveGame | null;
  /** wins per game type per member id */
  tallies: Partial<Record<GameType, Record<string, number>>>;
  log: PartyLogEntry[];
  logSeq: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

/* ---------------- client-facing ---------------- */

export interface PartyMemberView {
  id: string;
  name: string;
  seat: number;
  /** currently seated in the active game */
  inGame: boolean;
}

export interface PartyView {
  code: string;
  youId: string;
  hostId: string;
  phase: "lobby" | "game";
  members: PartyMemberView[];
  game: null | { type: GameType; players: string[]; view: unknown };
  tallies: Partial<Record<GameType, Record<string, number>>>;
  log: PartyLogEntry[];
  version: number;
  now: number;
}

export interface PartyPreview {
  code: string;
  phase: "lobby" | "game";
  memberCount: number;
  names: string[];
  game: GameType | null;
}

/* ---------------- moves ---------------- */

export type PartyMove =
  | { kind: "party"; action: "start_game"; game: GameType }
  | { kind: "party"; action: "end_game" } // host: back to lobby
  | { kind: "party"; action: "leave" }
  | { kind: "game"; move: unknown };

/* ---------------- game screen contract ---------------- */

/** Props every game's top-level screen component receives. */
export interface GameScreenProps<V = unknown> {
  view: V;
  party: PartyView;
  youId: string;
  isHost: boolean;
  /** serverNow − clientNow, for rendering countdowns against view deadlines */
  skew: number;
  /** you are watching but not seated in this game */
  spectating: boolean;
  /** dispatch a module-specific game move */
  move: (m: unknown) => void;
  /** host only: start the same game again (fresh deal) */
  playAgain: () => void;
  /** host only: end the game and return everyone to the lobby */
  exitToLobby: () => void;
}
