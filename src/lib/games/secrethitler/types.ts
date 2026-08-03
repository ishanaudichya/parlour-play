/* Secret Hitler — types shared by the engine, the fuzz harness and the UI.
   State is JSON-serializable; secrets live only in `players[].role`, the two
   legislative hands, the deck/discard contents, the pending `votes` map and
   `investigations[].party` — none of which `redact` ever leaks. */

export const NOMINATE_MS = 60_000;
export const VOTE_MS = 45_000;
export const PRESIDENT_MS = 60_000;
export const CHANCELLOR_MS = 60_000;
export const VETO_MS = 45_000;
export const PEEK_MS = 45_000;
export const POWER_MS = 60_000;
export const LOG_CAP = 140;
export const VIEW_LOG = 90;

export const LIBERAL_POLICIES = 6;
export const FASCIST_POLICIES = 11;
export const LIBERAL_SLOTS = 5;
export const FASCIST_SLOTS = 6;
/** The Chancellor may move to veto once this many fascist policies stand. */
export const VETO_UNLOCK = 5;
/** An elected Hitler chancellor wins once this many fascist policies stand. */
export const HITLER_ZONE = 3;

/** Non-Hitler fascists per player count (Hitler is always dealt on top). */
export const FASCIST_COUNTS: Record<number, number> = { 5: 1, 6: 1, 7: 2, 8: 2 };

export type SHParty = "liberal" | "fascist";
export type SHRole = "liberal" | "fascist" | "hitler";
export type SHPower = "peek" | "investigate" | "special" | "execute";

/** Presidential power printed under each fascist slot (index = slot - 1). */
export const POWER_TRACK: Record<number, readonly (SHPower | null)[]> = {
  5: [null, null, "peek", "execute", "execute", null],
  6: [null, null, "peek", "execute", "execute", null],
  7: [null, "investigate", "special", "execute", "execute", null],
  8: [null, "investigate", "special", "execute", "execute", null],
};

export type SHPhase =
  | "nomination"
  | "election"
  | "legislative_president"
  | "legislative_chancellor"
  | "veto_consent"
  | "power_peek"
  | "power_investigate"
  | "power_special"
  | "power_execute"
  | "over";

export type SHWinBy = "policies" | "hitler_chancellor" | "hitler_executed" | "forfeit";

export interface SHPlayerState {
  id: string;
  name: string;
  seat: number;
  role: SHRole;
  alive: boolean;
  left: boolean;
}

/** A resolved election — the full ballot record is public. */
export interface SHElection {
  presidentId: string;
  chancellorId: string;
  votes: Record<string, boolean>;
  ja: number;
  nein: number;
  passed: boolean;
  /** This candidacy came from a Special Election power. */
  special: boolean;
}

/** Result is the investigating president's secret; the pairing is public. */
export interface SHInvestigation {
  presidentId: string;
  targetId: string;
  party: SHParty;
}

export type SHLogKind =
  | "start"
  | "round"
  | "nominate"
  | "ballots"
  | "enact"
  | "chaos"
  | "power"
  | "peeked"
  | "investigate"
  | "special"
  | "execute"
  | "veto"
  | "veto_agree"
  | "veto_refuse"
  | "shuffle"
  | "cards"
  | "timeout"
  | "left"
  | "win";

export interface SHLogEntry {
  i: number;
  ts: number;
  kind: SHLogKind;
  actor?: string;
  target?: string;
  detail?: string;
  ja?: number;
  nein?: number;
}

export interface SHState {
  players: SHPlayerState[];
  phase: SHPhase;
  deadline: number | null;
  /** deck[0] is the top of the draw pile. */
  deck: SHParty[];
  discard: SHParty[];
  liberalTrack: number;
  fascistTrack: number;
  /** Failed-election tracker, 0..2 — the third failure fires chaos at once. */
  tracker: number;
  presidentIdx: number;
  /** Chancellor-nominee during an election. */
  nomineeId: string | null;
  /** The elected chancellor of the sitting government. */
  chancellorId: string | null;
  /** Pending secret ballots for the current election. */
  votes: Record<string, boolean>;
  elections: SHElection[];
  lastPresidentId: string | null;
  lastChancellorId: string | null;
  presidentHand: SHParty[] | null;
  chancellorHand: SHParty[] | null;
  /** The president refused a veto this session — the chancellor must enact. */
  vetoRefused: boolean;
  /** Seat the rotation resumes after once a Special Election round ends. */
  specialFromIdx: number | null;
  investigations: SHInvestigation[];
  winner: SHParty | null;
  winnerIds: string[];
  winBy: SHWinBy | null;
  log: SHLogEntry[];
  logSeq: number;
  updatedAt: number;
}

export type SecretHitlerMove =
  | { type: "nominate"; target: string }
  | { type: "vote"; ja: boolean }
  | { type: "discard"; index: number }
  | { type: "enact"; index: number }
  | { type: "veto" }
  | { type: "veto_consent"; agree: boolean }
  | { type: "peek_done" }
  | { type: "investigate"; target: string }
  | { type: "special_election"; target: string }
  | { type: "execute"; target: string };

/* ---------------- redacted view ---------------- */

export interface SHViewPlayer {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  left: boolean;
}

/** Secret knowledge dealt at init — present only for entitled viewers:
    every non-Hitler fascist, and Hitler too at 5–6 players. */
export interface SHKnowledge {
  /** All fascist-party members (Hitler included), seat order. */
  fascistIds: string[];
  hitlerId: string;
}

export interface SHRevealEntry {
  id: string;
  role: SHRole;
  party: SHParty;
}

export interface SecretHitlerView {
  phase: SHPhase;
  youId: string;
  now: number;
  deadline: number | null;
  players: SHViewPlayer[];
  aliveCount: number;
  liberalTrack: number;
  fascistTrack: number;
  tracker: number;
  deckCount: number;
  discardCount: number;
  powers: (SHPower | null)[];
  presidentId: string;
  nomineeId: string | null;
  chancellorId: string | null;
  lastPresidentId: string | null;
  lastChancellorId: string | null;
  /** Nomination phase only: who the president may lawfully nominate. */
  eligibleIds: string[];
  votedIds: string[];
  elections: SHElection[];
  /** Public record of who investigated whom — never the result. */
  investigated: { presidentId: string; targetId: string }[];
  vetoUnlocked: boolean;
  vetoRefused: boolean;
  specialRound: boolean;
  winner: SHParty | null;
  winnerIds: string[];
  winBy: SHWinBy | null;
  /** Full role table, non-null only once the game is over. */
  reveal: SHRevealEntry[] | null;
  log: SHLogEntry[];
  /* -------- private, entitlement-gated fields (always last) -------- */
  yourRole?: SHRole;
  yourParty?: SHParty;
  knowledge?: SHKnowledge;
  yourVote?: boolean;
  presidentHand?: SHParty[];
  chancellorHand?: SHParty[];
  peek?: SHParty[];
  yourInvestigations?: { targetId: string; party: SHParty }[];
}
