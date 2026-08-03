/* The Resistance: Avalon — types shared by the engine, the fuzz harness and
   the UI. State is JSON-serializable; secrets live only in `players[].role`
   and the pending `votes` / `questCards` maps, which `redact` never leaks. */

export const PROPOSE_MS = 90_000;
export const VOTE_MS = 45_000;
export const QUEST_MS = 45_000;
export const DAGGER_MS = 90_000;
export const LOG_CAP = 120;

/** Quest team sizes by player count (quests 1..5). */
export const TEAM_SIZES: Record<number, readonly [number, number, number, number, number]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
};

/** Minions of Mordred per player count. */
export const EVIL_COUNTS: Record<number, number> = { 5: 2, 6: 2, 7: 3, 8: 3 };

export type AvalonRole = "merlin" | "percival" | "servant" | "assassin" | "morgana" | "minion";
export type AvalonFaction = "good" | "evil";
export type AvalonPhase = "team" | "vote" | "quest" | "assassination" | "over";
export type AvalonWinBy = "quests" | "rejects" | "assassination" | "forfeit";

export interface AvalonPlayer {
  id: string;
  name: string;
  seat: number;
  role: AvalonRole;
  left: boolean;
}

export interface AvalonQuest {
  size: number;
  /** 2 only on quest 4 at 7–8 players. */
  failsRequired: 1 | 2;
  outcome: "pending" | "success" | "fail";
  /** Revealed shuffled counts — never who played what. */
  successes: number;
  fails: number;
  /** The approved team that ran it (public once run). */
  team: string[];
}

/** A completed proposal: the full vote record is public after reveal. */
export interface AvalonProposal {
  quest: number;
  /** 1..5 on the rejection track. */
  attempt: number;
  leaderId: string;
  team: string[];
  votes: Record<string, boolean>;
  approved: boolean;
}

export type AvalonLogKind =
  | "start"
  | "round"
  | "propose"
  | "vote"
  | "quest"
  | "dagger"
  | "shot"
  | "timeout"
  | "left"
  | "win";

export interface AvalonLogEntry {
  i: number;
  ts: number;
  kind: AvalonLogKind;
  actor?: string;
  target?: string;
  quest?: number;
  approves?: number;
  refusals?: number;
  successes?: number;
  fails?: number;
  detail?: string;
}

export interface AvalonState {
  players: AvalonPlayer[];
  phase: AvalonPhase;
  /** Current quest, 1..5. */
  quest: number;
  /** Consecutive rejections in the current quest round, 0..4 (5 ends it). */
  rejects: number;
  leaderIdx: number;
  deadline: number | null;
  /** Proposed (vote phase) or approved (quest phase) team. */
  team: string[];
  /** Pending secret ballots for the current proposal. */
  votes: Record<string, boolean>;
  /** Pending secret quest cards, keyed by team member. */
  questCards: Record<string, boolean>;
  quests: AvalonQuest[];
  /** Completed proposals — public record. */
  proposals: AvalonProposal[];
  assassinId: string;
  assassinTarget: string | null;
  winner: AvalonFaction | null;
  winnerIds: string[];
  winBy: AvalonWinBy | null;
  log: AvalonLogEntry[];
  logSeq: number;
  updatedAt: number;
}

export type AvalonMove =
  | { type: "propose"; team: string[] }
  | { type: "vote"; approve: boolean }
  | { type: "quest"; success: boolean }
  | { type: "assassinate"; target: string };

/* ---------------- redacted view ---------------- */

export interface AvalonViewPlayer {
  id: string;
  name: string;
  seat: number;
  left: boolean;
}

/** Secret knowledge dealt at init — present only for entitled viewers. */
export interface AvalonKnowledge {
  /** Merlin and every evil player: the full evil roster (ids, seat order). */
  evilIds?: string[];
  /** Percival: {Merlin, Morgana} as an unlabeled pair (seat order). */
  merlinCandidates?: string[];
}

export interface AvalonRevealEntry {
  id: string;
  role: AvalonRole;
  faction: AvalonFaction;
}

export interface AvalonView {
  phase: AvalonPhase;
  youId: string;
  now: number;
  deadline: number | null;
  players: AvalonViewPlayer[];
  quest: number;
  quests: AvalonQuest[];
  rejects: number;
  leaderId: string;
  team: string[];
  votedIds: string[];
  yourVote?: boolean;
  questSubmittedIds: string[];
  yourQuestCard?: boolean;
  proposals: AvalonProposal[];
  yourRole?: AvalonRole;
  yourFaction?: AvalonFaction;
  knowledge?: AvalonKnowledge;
  /** Public only once the game is over. */
  assassinTarget: string | null;
  winner: AvalonFaction | null;
  winnerIds: string[];
  winBy: AvalonWinBy | null;
  /** Full role table, non-null only once the game is over. */
  reveal: AvalonRevealEntry[] | null;
  log: AvalonLogEntry[];
}
