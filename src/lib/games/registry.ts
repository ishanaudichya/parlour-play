import { avalonModule } from "./avalon";
import { battleshipModule } from "./battleship";
import { connect4Module } from "./connect4";
import { coupModule } from "./coup/engine";
import { mafiaModule } from "./mafia";
import { monodealModule } from "./monodeal";
import { secrethitlerModule } from "./secrethitler";
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
  battleship: battleshipModule as GameModule,
  connect4: connect4Module as GameModule,
  avalon: avalonModule as GameModule,
  secrethitler: secrethitlerModule as GameModule,
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
  battleship: { title: "Battleship", tagline: "Call your shots, sink their fleet", min: 2, max: 2, accent: "#3dde9b" },
  connect4: { title: "Four in a Row", tagline: "Drop, stack, connect four", min: 2, max: 2, accent: "#f5b23e" },
  avalon: { title: "Avalon", tagline: "Merlin knows. The Assassin waits.", min: 5, max: 8, accent: "#8fb8de" },
  secrethitler: { title: "Secret Hitler", tagline: "Pass policies, trust no cabinet", min: 5, max: 8, accent: "#e05a33" },
};
