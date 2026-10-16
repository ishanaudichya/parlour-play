/* The Parlour's programme: how each game is billed on the landing lineup and
   in the lobby. Display-only; player limits come from GAME_META. */

import { GAME_META } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";

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

const NAME_OF = (k: GameType) => BILLING[k].stage ?? GAME_META[k].title;

/** The lobby shelf, A to Z — no game is billed above another. */
export const GAME_ORDER: GameType[] = (Object.keys(BILLING) as GameType[]).sort((a, b) =>
  NAME_OF(a).localeCompare(NAME_OF(b))
);

/** A fresh shuffle of every game (Fisher–Yates). */
export function shuffled(rng: () => number = Math.random): GameType[] {
  const out = [...GAME_ORDER];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deal games, in order, into `rows` rows of the bill. Every row is set
    wall to wall, so a row with fewer letters prints bigger; the split is
    chosen to make the rows as even as possible, so the bill has no
    headliners — just tonight's running order. */
export function dealBill(order: GameType[], rows: number, perRow: [number, number] = [2, 3]): GameType[][] {
  const len = order.map((k) => NAME_OF(k).length + 2); // + the spark between names
  const n = order.length;
  const [lo, hi] = perRow;
  const target = len.reduce((a, b) => a + b, 0) / rows;
  // best[i][r]: cheapest way to set the first i games in r rows
  const best: number[][] = Array.from({ length: n + 1 }, () => Array(rows + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: n + 1 }, () => Array(rows + 1).fill(-1));
  best[0][0] = 0;
  for (let i = 1; i <= n; i++)
    for (let r = 1; r <= rows; r++)
      for (let k = lo; k <= hi && k <= i; k++) {
        if (best[i - k][r - 1] === Infinity) continue;
        let w = 0;
        for (let j = i - k; j < i; j++) w += len[j];
        const cost = best[i - k][r - 1] + (w - target) ** 2;
        if (cost < best[i][r]) {
          best[i][r] = cost;
          cut[i][r] = i - k;
        }
      }
  if (best[n][rows] === Infinity) return dealBill(order, rows, [1, Math.max(hi, Math.ceil(n / rows))]);
  const out: GameType[][] = [];
  for (let i = n, r = rows; r > 0; r--) {
    out.unshift(order.slice(cut[i][r], i));
    i = cut[i][r];
  }
  return out;
}
