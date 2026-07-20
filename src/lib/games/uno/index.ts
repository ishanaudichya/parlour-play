import type { GameModule } from "../types";
import { applyMove, forfeit, init, redact, result, tick } from "./engine";
import { UNO_MAX_PLAYERS, UNO_MIN_PLAYERS, type UnoMove, type UnoState, type UnoView } from "./types";

export const unoModule: GameModule<UnoState, UnoView, UnoMove> = {
  type: "uno",
  minPlayers: UNO_MIN_PLAYERS,
  maxPlayers: UNO_MAX_PLAYERS,
  init,
  applyMove,
  tick,
  redact,
  result,
  forfeit,
};

export * from "./types";
export {
  activePlayers,
  buildDeck,
  isNumberSymbol,
  isPlayable,
  nextPlayer,
  playableCards,
  topDiscard,
} from "./engine";
