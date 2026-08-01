/** Contract every game module implements. The party layer is the only consumer. */

export type GameType = "coup" | "uno" | "monodeal" | "teenpatti" | "mafia" | "battleship" | "connect4";

export interface GamePlayer {
  id: string;
  name: string;
  /** stable index within THIS game (0..n-1), assigned at game start */
  seat: number;
}

/** Thrown by engines for user-facing validation failures ("not your turn", …). */
export class MoveError extends Error {}

export interface GameResult {
  winnerId: string;
  /** Team games may award the result to every member of the winning side. */
  winnerIds?: string[];
}

/**
 * A game engine. All functions must be pure apart from mutating the passed
 * state in place; randomness comes only from `rng`; time only from `now`.
 * State must be JSON-serializable (it round-trips through Redis).
 */
export interface GameModule<S = unknown, V = unknown, M = unknown> {
  type: GameType;
  minPlayers: number;
  maxPlayers: number;
  /** Deal a fresh game. Called with the party members who are playing. */
  init(players: GamePlayer[], now: number, rng: () => number): S;
  /** Apply a player's move, mutating state. Throw MoveError to reject. */
  applyMove(state: S, playerId: string, move: M, now: number, rng: () => number): void;
  /** Advance expired timers/deadlines. Return true if state changed. */
  tick(state: S, now: number, rng: () => number): boolean;
  /**
   * Per-viewer view. `viewerId` may be a spectator who is NOT in the game —
   * return the public view in that case (no hidden cards for anyone).
   */
  redact(state: S, viewerId: string, now: number): V;
  /** Non-null once the game has a WINNER. Null while running — and also for a
      drawn game, which has no winner to tally. See `isOver`. */
  result(state: S): GameResult | null;
  /**
   * Whether play has finished, win or draw. Defaults to `result() !== null`;
   * only games that can end without a winner (e.g. a drawn board) need to
   * implement it, otherwise the party would think they were still running.
   */
  isOver?(state: S): boolean;
  /**
   * Remove a player permanently (they left the party). Must leave the game in
   * a valid, progressing state: their turn is skipped forever, any pending
   * interaction waiting on them is resolved or cancelled, card/asset
   * conservation holds (their cards/assets return to deck/discard/pot per the
   * game's rules), and result() must detect a winner if only one active
   * player remains. Must be a no-op if the player is already out/absent.
   */
  forfeit(state: S, playerId: string, now: number, rng: () => number): void;
}
