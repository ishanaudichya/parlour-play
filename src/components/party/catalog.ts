/* The Parlour's programme: how each game is billed on the landing lineup and
   in the lobby. Display-only; player limits come from GAME_META. */

import type { GameType } from "@/lib/games/types";
import type { BillRow } from "./stage";

export type Shelf = "roles" | "cards" | "board" | "quick";

export const SHELVES: { key: Shelf; label: string }[] = [
  { key: "roles", label: "Bluff & betray" },
  { key: "cards", label: "Card tables" },
  { key: "board", label: "Boards & battles" },
  { key: "quick", label: "Quick ones" },
];

export interface Billing {
  /** one or two sentences: what you actually do */
  pitch: string;
  /** a typical game, in minutes */
  minutes: number;
  shelves: Shelf[];
  /** the lineup prints some names with a shorter stage name */
  stage?: string;
}

export const BILLING: Record<GameType, Billing> = {
  coup: {
    pitch: "Claim any character's power — the Duke's tax, the Assassin's knife — and dare anyone to call your bluff. Last influence standing wins.",
    minutes: 15,
    shelves: ["roles", "cards", "quick"],
  },
  uno: {
    pitch: "Match the colour or the number, stack the draw-twos, and remember to shout when you're down to one.",
    minutes: 20,
    shelves: ["cards"],
  },
  monodeal: {
    pitch: "Bank money, charge rent and steal the deals you need. First to three full property sets wins.",
    minutes: 20,
    shelves: ["cards"],
  },
  teenpatti: {
    pitch: "Three cards each and a pot in the middle. Bet blind or look and play seen — then bluff the table into folding.",
    minutes: 15,
    shelves: ["cards", "roles"],
  },
  mafia: {
    pitch: "By night the mafia picks a victim and the doctor guesses who to save. By day the town argues, then votes someone out.",
    minutes: 25,
    shelves: ["roles"],
  },
  battleship: {
    pitch: "Hide five ships on your grid, then trade shots in the dark until one fleet is on the sea floor.",
    minutes: 15,
    shelves: ["board"],
  },
  connect4: {
    pitch: "Drop discs into the rack, block their threats, and line up four — across, down or diagonal.",
    minutes: 5,
    shelves: ["board", "quick"],
  },
  avalon: {
    pitch: "Arthur's loyal servants run quests while hidden minions sabotage them. Merlin knows everything — so the Assassin hunts him.",
    minutes: 30,
    shelves: ["roles"],
  },
  secrethitler: {
    pitch: "Liberals against fascists in a parliament of liars. Pass policies, investigate cabinets, and stop Hitler becoming chancellor.",
    minutes: 30,
    shelves: ["roles"],
  },
  chainreaction: {
    pitch: "Load orbs into cells until they burst, converting every neighbour in the blast. One cascade can flip the whole board.",
    minutes: 10,
    shelves: ["board", "quick"],
  },
  ludo: {
    pitch: "Roll, race your four tokens round the board and home — and send anyone you land on back to their yard.",
    minutes: 25,
    shelves: ["board"],
  },
  tanks: {
    pitch: "Draft an arsenal from Pocket Tanks' original thirty, then lob it across a ridge that crumbles as you go. Most damage wins.",
    minutes: 15,
    shelves: ["board"],
  },
  staccs: {
    pitch: "Build one shared 3D stack of hexagonal cards: suits on top, numbers on the sides. First to empty their hand wins.",
    minutes: 15,
    shelves: ["cards"],
  },
  dots: {
    pitch: "Take turns drawing lines between dots. Close a box and it's yours — and you draw again. Pick any page size.",
    minutes: 10,
    shelves: ["board", "quick"],
    stage: "Dots & Boxes",
  },
};

/** The order games appear in the lobby. */
export const GAME_ORDER: GameType[] = [
  "coup",
  "secrethitler",
  "avalon",
  "mafia",
  "uno",
  "monodeal",
  "teenpatti",
  "staccs",
  "tanks",
  "battleship",
  "ludo",
  "chainreaction",
  "connect4",
  "dots",
];

/** The landing lineup, printed like a festival bill: each row is set to the
    full width, so short rows print big. Headliners first. */
export const LINEUP: BillRow[] = [
  ["coup", "uno", "avalon"],
  "with",
  ["secrethitler", "mafia"],
  ["monodeal", "teenpatti", "ludo"],
  "and, in the back room",
  ["tanks", "battleship", "staccs"],
  ["connect4", "chainreaction", "dots"],
];

/** Narrow screens get shorter rows. */
export const LINEUP_NARROW: BillRow[] = [
  ["coup", "uno"],
  ["avalon", "mafia"],
  ["secrethitler"],
  "with",
  ["monodeal", "ludo"],
  ["teenpatti", "staccs"],
  ["tanks", "battleship"],
  ["connect4", "dots"],
  ["chainreaction"],
];
