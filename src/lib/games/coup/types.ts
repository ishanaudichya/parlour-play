export type Character = "duke" | "assassin" | "captain" | "ambassador" | "contessa";

export const CHARACTERS: Character[] = ["duke", "assassin", "captain", "ambassador", "contessa"];

export type ActionType =
  | "income"
  | "foreign_aid"
  | "coup"
  | "tax"
  | "assassinate"
  | "steal"
  | "exchange";

/** Character claimed when performing each claimed action. */
export const ACTION_CLAIM: Partial<Record<ActionType, Character>> = {
  tax: "duke",
  assassinate: "assassin",
  steal: "captain",
  exchange: "ambassador",
};

/** Characters that can block each blockable action. */
export const ACTION_BLOCKERS: Partial<Record<ActionType, Character[]>> = {
  foreign_aid: ["duke"],
  steal: ["captain", "ambassador"],
  assassinate: ["contessa"],
};

export interface CardT {
  id: string;
  ch: Character;
  revealed: boolean;
}

export interface CoupPlayer {
  id: string;
  name: string;
  seat: number;
  coins: number;
  cards: CardT[];
}

export type Phase = "play" | "over";

export type Stage =
  | "action_window" // claimed action declared; others may challenge
  | "block_window" // blockable action stands; eligible blockers may block
  | "block_challenge_window" // block declared; others may challenge the block
  | "exchange"; // actor choosing which cards to keep

export interface Block {
  blocker: string;
  claim: Character;
}

export interface Pending {
  type: ActionType;
  actor: string;
  target?: string;
  claim?: Character;
  stage: Stage;
  /** player ids who have passed in the current window */
  passed: string[];
  block?: Block;
  exchangeDrawn?: CardT[];
  /** epoch ms after which remaining responders auto-pass */
  deadline?: number;
}

/** What happens once the pending influence loss has been chosen. */
export type Resume =
  | "proceed" // actor defended a challenge — continue the action from its window
  | "cancel" // actor was caught bluffing — action fizzles, turn ends
  | "blocked" // block stood (its challenger lost) — action fizzles, turn ends
  | "resolve" // blocker was caught bluffing — action resolves now
  | "end"; // simple hit (coup / assassinate landed) — turn ends

export interface LoseTask {
  player: string;
  resume: Resume;
}

export type LogKind =
  | "start"
  | "income"
  | "foreign_aid"
  | "tax"
  | "coup"
  | "assassinate"
  | "steal"
  | "exchange"
  | "exchange_done"
  | "block"
  | "challenge"
  | "challenge_failed" // claimant proved the card; challenger pays
  | "challenge_success" // claimant was bluffing
  | "action_blocked"
  | "lose_influence"
  | "eliminated"
  | "left"
  | "consolation"
  | "timeout"
  | "steal_resolved"
  | "foreign_aid_resolved"
  | "tax_resolved"
  | "assassinate_hit"
  | "win";

export interface LogEntry {
  i: number;
  ts: number;
  kind: LogKind;
  actor?: string; // player name (denormalized for easy rendering)
  target?: string;
  ch?: Character;
  n?: number;
}

export interface CoupState {
  phase: Phase;
  players: CoupPlayer[];
  deck: Character[];
  turnPlayer: string;
  pending: Pending | null;
  lose: LoseTask | null;
  winner: string | null;
  /** deadline for the current REQUIRED act (choose / surrender / exchange) */
  actDeadline?: number;
  log: LogEntry[];
  logSeq: number;
  cardSeq: number;
  updatedAt: number;
}

export const RESPONSE_MS = 30_000;
/** time to pick an action on your turn before auto-income (auto-coup at 10+) */
export const CHOOSE_MS = 60_000;
/** time to pick a card to surrender / finish an exchange */
export const ACT_MS = 45_000;
/** nobody may hold more than this (house rule) */
export const COIN_CAP = 10;
export const LOG_CAP = 100;

// ---------- client-facing (redacted) shapes ----------

export interface ClientCard {
  id: string;
  ch?: Character; // present when yours or revealed
  revealed: boolean;
}

export interface ClientPlayer {
  id: string;
  name: string;
  seat: number;
  coins: number;
  alive: boolean;
  cards: ClientCard[];
}

export interface ClientPending {
  type: ActionType;
  actor: string;
  target?: string;
  claim?: Character;
  stage: Stage;
  passed: string[];
  block?: Block;
  deadline?: number;
  /** only sent to the exchanging actor */
  exchangeDrawn?: ClientCard[];
}

export interface CoupView {
  phase: Phase;
  youId: string;
  players: ClientPlayer[];
  deckCount: number;
  turn: string;
  pending: ClientPending | null;
  lose: { player: string } | null;
  /** deadline for the current required act (choose / surrender / exchange) */
  actDeadline?: number;
  winner: string | null;
  log: LogEntry[];
  now: number; // server clock, for countdown skew correction
}
