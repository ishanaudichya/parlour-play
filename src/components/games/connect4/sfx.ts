/* Four in a Row sound bank — chunky moulded plastic. A hollow clack when a
   disc lands (deeper the further it fell), a ghost tick as you slide across
   the columns, a bright four-note arpeggio for the connect, a flat descending
   pair for a full board, a chime when the turn comes round to you and a dull
   thud when the clock or a quitter decides things.

   The clack is delayed by exactly the disc's fall time, so the sound lands
   with the disc rather than with the network packet. */

import { makeBank, noise, tone } from "@/lib/client/synthCore";
import { ROWS, type Connect4View } from "@/lib/games/connect4/types";
import { fallSeconds } from "./geometry";

export type C4SfxName =
  | "clack0"
  | "clack1"
  | "clack2"
  | "clack3"
  | "clack4"
  | "clack5"
  | "tick"
  | "connect"
  | "draw"
  | "yourTurn"
  | "thud";

/** Hollow plastic-on-plastic knock, pitched by the row it settled into. */
function clack(row: number) {
  const at = fallSeconds(row);
  const f = 268 + row * 26; // floor = deepest, top = brightest
  tone({ f: f * 2.7, f2: f * 1.25, type: "triangle", at, dur: 0.05, g: 0.075, attack: 0.001 });
  tone({ f, f2: f * 0.6, type: "sine", at: at + 0.004, dur: 0.14, g: 0.14 });
  noise({ at, dur: 0.045, g: 0.055, filter: { type: "bandpass", f: 2000, f2: 900, q: 1.4 } });
  // the shell of the cabinet answering back
  tone({ f: f * 0.5, f2: f * 0.34, type: "sine", at: at + 0.01, dur: 0.2, g: 0.05 });
}

const WIN_AT = 0.36; // let the winning disc land first

export const c4Sfx = makeBank<C4SfxName>({
  clack0: () => clack(0),
  clack1: () => clack(1),
  clack2: () => clack(2),
  clack3: () => clack(3),
  clack4: () => clack(4),
  clack5: () => clack(5),

  /** ghost disc sliding to a new column */
  tick() {
    tone({ f: 1180, type: "sine", dur: 0.018, g: 0.028, attack: 0.001 });
  },

  /** four rising notes — one per disc in the line */
  connect() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ f, type: "triangle", at: WIN_AT + i * 0.085, dur: 0.24, g: 0.075 })
    );
    tone({ f: 1046.5, type: "sine", at: WIN_AT + 0.34, dur: 0.7, g: 0.05 });
    tone({ f: 130.8, type: "sine", at: WIN_AT, dur: 0.85, g: 0.1 });
  },

  /** board full, nobody connected — two flat steps down */
  draw() {
    tone({ f: 311.1, type: "triangle", at: WIN_AT, dur: 0.3, g: 0.07 });
    tone({ f: 233.1, type: "triangle", at: WIN_AT + 0.26, dur: 0.5, g: 0.065 });
    tone({ f: 87.3, f2: 62, type: "sine", at: WIN_AT, dur: 0.9, g: 0.09 });
  },

  /** your move */
  yourTurn() {
    tone({ f: 880, type: "sine", dur: 0.1, g: 0.06 });
    tone({ f: 1318.5, type: "sine", at: 0.08, dur: 0.24, g: 0.05 });
  },

  /** clock ran out, or somebody walked */
  thud() {
    tone({ f: 104, f2: 52, type: "sine", dur: 0.3, g: 0.16 });
    noise({ dur: 0.14, g: 0.05, filter: { type: "lowpass", f: 520, f2: 120 } });
  },
});

export const clackFor = (row: number): C4SfxName =>
  `clack${Math.max(0, Math.min(ROWS - 1, row))}` as C4SfxName;

/** Play everything that happened between two views. */
export function playConnect4Diff(
  prev: Connect4View | null,
  next: Connect4View,
  youId: string
) {
  if (!prev) return;
  // a fresh deal restarts the log numbering
  const restarted = next.startedAt !== prev.startedAt;
  const lastSeen = restarted || prev.log.length === 0 ? 0 : prev.log[prev.log.length - 1].i;
  const fresh = next.log.filter((l) => l.i > lastSeen);

  const played = new Set<C4SfxName>();
  const play = (n: C4SfxName) => {
    if (played.has(n)) return;
    c4Sfx(n);
    played.add(n);
  };

  for (const l of fresh) {
    switch (l.kind) {
      case "drop":
        if (typeof l.row === "number") play(clackFor(l.row));
        break;
      case "timeout":
      case "left":
        play("thud");
        break;
      case "win":
        // a walkover gets the dull thud, not the fanfare
        play(next.winBy === "forfeit" ? "thud" : "connect");
        break;
      case "draw":
        play("draw");
        break;
    }
  }

  const becameYourTurn =
    next.phase === "play" &&
    next.turn === youId &&
    (prev.turn !== youId || prev.phase !== "play" || restarted);
  if (becameYourTurn) {
    play("yourTurn");
    try {
      navigator.vibrate?.(40);
    } catch {}
  }
}
