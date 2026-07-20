import { coupModule } from "./coup/engine";
import { mafiaModule } from "./mafia";
import { monodealModule } from "./monodeal";
import { teenpattiModule } from "./teenpatti";
import { unoModule } from "./uno";
import type { GameModule, GameType } from "./types";

/* Server-side registry of playable game engines. */

export const REGISTRY: Partial<Record<GameType, GameModule>> = {
  coup: coupModule as GameModule,
  uno: unoModule as GameModule,
  monodeal: monodealModule as GameModule,
  teenpatti: teenpattiModule as GameModule,
  mafia: mafiaModule as GameModule,
};

/** Display metadata, safe for client import (no engine code). */
export const GAME_META: Record<
  GameType,
  { title: string; tagline: string; min: number; max: number; accent: string }
> = {
  coup: { title: "Coup", tagline: "Bluff, deceive, eliminate", min: 2, max: 6, accent: "#c69f58" },
  uno: { title: "UNO", tagline: "Match, stack & shout", min: 2, max: 8, accent: "#ef5350" },
  monodeal: { title: "Monopoly Deal", tagline: "Charge rent, break deals", min: 2, max: 5, accent: "#1d7a53" },
  teenpatti: { title: "Teen Patti", tagline: "Blind bets & bold bluffs", min: 2, max: 8, accent: "#0d8a5f" },
  mafia: { title: "Mafia", tagline: "Trust no one after dark", min: 6, max: 8, accent: "#c75164" },
};
