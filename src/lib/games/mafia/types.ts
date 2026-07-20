export const ROLE_REVEAL_MS = 15_000;
export const NIGHT_MS = 45_000;
export const DAWN_MS = 7_000;
export const DISCUSSION_MS = 90_000;
export const VOTE_MS = 45_000;
export const RUNOFF_MS = 30_000;
export const LOG_CAP = 100;

export type MafiaRole = "mafia" | "detective" | "doctor" | "villager";
export type MafiaTeam = "mafia" | "town";
export type MafiaPhase =
  | "role_reveal"
  | "night"
  | "dawn"
  | "discussion"
  | "vote"
  | "runoff"
  | "over";

export interface MafiaPlayer {
  id: string;
  name: string;
  seat: number;
  role: MafiaRole;
  alive: boolean;
  left: boolean;
  eliminatedDay: number | null;
}

export interface Investigation {
  day: number;
  targetId: string;
  isMafia: boolean;
}

export interface NightSummary {
  day: number;
  killedId: string | null;
  noDeath: boolean;
}

export type MafiaLogKind =
  | "start"
  | "night"
  | "dawn"
  | "no_death"
  | "discussion"
  | "vote"
  | "runoff"
  | "eliminated"
  | "left"
  | "win";

export interface MafiaLogEntry {
  i: number;
  ts: number;
  kind: MafiaLogKind;
  actor?: string;
  target?: string;
  role?: MafiaRole;
  team?: MafiaTeam;
  detail?: string;
}

export interface MafiaState {
  players: MafiaPlayer[];
  phase: MafiaPhase;
  day: number;
  deadline: number | null;
  ready: string[];
  mafiaVotes: Record<string, string>;
  doctorTarget: string | null;
  detectiveTarget: string | null;
  lastProtectedId: string | null;
  investigations: Record<string, Investigation[]>;
  votes: Record<string, string | null>;
  runoffTargets: string[];
  nightSummary: NightSummary | null;
  lastElimination: string | null;
  winner: MafiaTeam | null;
  winnerIds: string[];
  log: MafiaLogEntry[];
  logSeq: number;
  updatedAt: number;
}

export type MafiaMove =
  | { type: "ready" }
  | { type: "night_target"; target: string }
  | { type: "vote"; target: string | null };

export interface MafiaViewPlayer {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  left: boolean;
  revealedRole?: MafiaRole;
}

export interface MafiaView {
  phase: MafiaPhase;
  day: number;
  deadline: number | null;
  youId: string;
  players: MafiaViewPlayer[];
  yourRole?: MafiaRole;
  mafiaIds: string[];
  mafiaVotes: Record<string, string>;
  yourNightTarget?: string;
  unavailableNightTarget?: string;
  investigationHistory: Investigation[];
  votedIds: string[];
  yourVote?: string | null;
  runoffTargets: string[];
  nightSummary: NightSummary | null;
  lastElimination: string | null;
  winner: MafiaTeam | null;
  winnerIds: string[];
  log: MafiaLogEntry[];
  now: number;
}
