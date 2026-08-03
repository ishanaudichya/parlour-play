"use client";

import type { ComponentType } from "react";
import type { GameType } from "@/lib/games/types";
import type { GameScreenProps } from "@/lib/party/types";
import { AvalonScreen } from "./avalon/AvalonScreen";
import { AvalonPoster } from "./avalon/Poster";
import { BattleshipScreen } from "./battleship/BattleshipScreen";
import { BattleshipPoster } from "./battleship/Poster";
import { Connect4Screen } from "./connect4/Connect4Screen";
import { Connect4Poster } from "./connect4/Poster";
import { CoupScreen } from "./coup/CoupScreen";
import { CoupPoster } from "./coup/Poster";
import { MafiaScreen } from "./mafia/MafiaScreen";
import { MafiaPoster } from "./mafia/Poster";
import { MonoDealScreen } from "./monodeal/MonoDealScreen";
import { MonoDealPoster } from "./monodeal/Poster";
import { SecretHitlerScreen } from "./secrethitler/SecretHitlerScreen";
import { SecretHitlerPoster } from "./secrethitler/Poster";
import { TeenPattiPoster } from "./teenpatti/Poster";
import { TeenPattiScreen } from "./teenpatti/TeenPattiScreen";
import { UnoPoster } from "./uno/Poster";
import { UnoScreen } from "./uno/UnoScreen";

/* Client-side registry: each game's screen + picker poster. */

interface GameUI {
  Screen: ComponentType<GameScreenProps<never>>;
  Poster: ComponentType;
}

const asScreen = (c: unknown) => c as ComponentType<GameScreenProps<never>>;

export const GAME_UI: Partial<Record<GameType, GameUI>> = {
  coup: { Screen: asScreen(CoupScreen), Poster: CoupPoster },
  uno: { Screen: asScreen(UnoScreen), Poster: UnoPoster },
  monodeal: { Screen: asScreen(MonoDealScreen), Poster: MonoDealPoster },
  teenpatti: { Screen: asScreen(TeenPattiScreen), Poster: TeenPattiPoster },
  mafia: { Screen: asScreen(MafiaScreen), Poster: MafiaPoster },
  battleship: { Screen: asScreen(BattleshipScreen), Poster: BattleshipPoster },
  connect4: { Screen: asScreen(Connect4Screen), Poster: Connect4Poster },
  avalon: { Screen: asScreen(AvalonScreen), Poster: AvalonPoster },
  secrethitler: { Screen: asScreen(SecretHitlerScreen), Poster: SecretHitlerPoster },
};
