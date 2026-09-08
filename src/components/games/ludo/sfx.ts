/* Ludo sound bank — wood, bone and lacquer. A die rattling in a cupped hand
   and clacking onto the board, a soft wooden tick for every hop, a rising
   pop when a token leaves the yard, a whoosh-and-thud for a capture, a
   small chime for a token home, a warm fanfare for the win, a descending
   "oh no" for three sixes and a flat pair for a dead roll.

   Everything is scheduled against the same timeline the board replays, so
   each tick lands with its hop rather than with the network packet. */

import { guarded, makeBank, noise, tone } from "@/lib/client/synthCore";
import { HOME_POS, type LudoView } from "@/lib/games/ludo/types";
import { CAPTURE_GAP_MS, HOP_MS, OUT_MS, ROLL_MS } from "./paint";

export type LudoSfxName = "tick" | "yourTurn" | "thud";

export const ludoSfx = makeBank<LudoSfxName>({
  /** hovering a token */
  tick() {
    tone({ f: 1250, type: "sine", dur: 0.016, g: 0.024, attack: 0.001 });
  },
  /** your move */
  yourTurn() {
    tone({ f: 880, type: "sine", dur: 0.09, g: 0.055 });
    tone({ f: 1318.5, type: "sine", at: 0.075, dur: 0.24, g: 0.045 });
  },
  /** clock ran out, or somebody walked */
  thud() {
    tone({ f: 100, f2: 50, type: "sine", dur: 0.3, g: 0.16 });
    noise({ dur: 0.14, g: 0.05, filter: { type: "lowpass", f: 500, f2: 110 } });
  },
});

/* ---------------- timed voices (seconds) ---------------- */

function rattle(at: number) {
  for (let i = 0; i < 6; i++) {
    const t = at + i * 0.075 + (i % 2) * 0.012;
    noise({ at: t, dur: 0.035, g: 0.045, filter: { type: "bandpass", f: 1900 + i * 120, q: 1.6 } });
    tone({ f: 1500 + i * 130, f2: 900, type: "square", at: t + 0.006, dur: 0.018, g: 0.016, attack: 0.001 });
  }
}

function clack(at: number) {
  tone({ f: 1100, f2: 320, type: "triangle", at, dur: 0.08, g: 0.1, attack: 0.001 });
  noise({ at, dur: 0.05, g: 0.06, filter: { type: "lowpass", f: 2600, f2: 900 } });
  tone({ f: 190, f2: 120, type: "sine", at: at + 0.005, dur: 0.2, g: 0.09 });
}

function hop(at: number, k: number) {
  const f = 620 + k * 14;
  tone({ f, f2: f * 0.8, type: "triangle", at, dur: 0.055, g: 0.055, attack: 0.001 });
  noise({ at, dur: 0.018, g: 0.018, filter: { type: "highpass", f: 2800 } });
}

function out(at: number) {
  tone({ f: 520, f2: 820, type: "triangle", at, dur: 0.16, g: 0.07 });
  tone({ f: 1040, type: "sine", at: at + 0.1, dur: 0.12, g: 0.04 });
}

function capture(at: number) {
  noise({ at, dur: 0.32, g: 0.06, filter: { type: "bandpass", f: 2400, f2: 260, q: 0.9 } });
  tone({ f: 740, f2: 160, type: "sawtooth", at, dur: 0.3, g: 0.035 });
  tone({ f: 120, f2: 60, type: "sine", at: at + 0.3, dur: 0.28, g: 0.14 });
  noise({ at: at + 0.3, dur: 0.08, g: 0.05, filter: { type: "lowpass", f: 600 } });
}

function home(at: number) {
  [783.99, 987.77, 1174.66].forEach((f, i) => tone({ f, type: "sine", at: at + i * 0.07, dur: 0.3, g: 0.05 }));
  tone({ f: 391.99, type: "triangle", at, dur: 0.4, g: 0.04 });
}

function win(at: number) {
  [261.63, 329.63, 392, 523.25].forEach((f, i) => tone({ f, type: "triangle", at: at + i * 0.09, dur: 0.5, g: 0.06 }));
  [659.25, 783.99, 1046.5].forEach((f, i) => tone({ f, type: "sine", at: at + 0.4 + i * 0.09, dur: 0.6, g: 0.045 }));
  tone({ f: 130.81, type: "sine", at, dur: 1.2, g: 0.09 });
}

function sixes(at: number) {
  [523.25, 466.16, 392].forEach((f, i) => tone({ f, f2: f * 0.97, type: "triangle", at: at + i * 0.13, dur: 0.24, g: 0.06 }));
}

function dead(at: number) {
  tone({ f: 233.08, type: "triangle", at, dur: 0.18, g: 0.05 });
  tone({ f: 220, type: "triangle", at: at + 0.16, dur: 0.3, g: 0.045 });
}

/**
 * Play everything that happened between two views, in time with the board's
 * replay. Returns the ms at which that replay finishes (0 if nothing moved),
 * so the caller can hold the game-over card until the last token lands.
 */
export function playLudoDiff(prev: LudoView | null, next: LudoView, youId: string): number {
  if (!prev) return 0;
  const restarted = next.startedAt !== prev.startedAt;
  const lastSeen = restarted || prev.log.length === 0 ? 0 : prev.log[prev.log.length - 1].i;
  const fresh = next.log.filter((l) => l.i > lastSeen);

  const newRoll = next.lastRoll && (restarted || !prev.lastRoll || prev.lastRoll.n !== next.lastRoll.n) ? next.lastRoll : null;
  const newMove = next.lastMove && (restarted || !prev.lastMove || prev.lastMove.n !== next.lastMove.n) ? next.lastMove : null;

  let t = 0; // ms
  guarded(() => {
    if (newRoll) {
      rattle(0);
      clack((ROLL_MS - 40) / 1000);
      t = ROLL_MS;
    }
    if (newMove) {
      if (newMove.from < 0) {
        out(t / 1000);
        t += OUT_MS;
      } else {
        const steps = newMove.to - newMove.from;
        for (let k = 0; k < steps; k++) hop((t + k * HOP_MS) / 1000, k);
        t += steps * HOP_MS;
      }
      if (newMove.to === HOME_POS) home(t / 1000);
      if (newMove.captured.length) {
        capture((t + CAPTURE_GAP_MS) / 1000);
        t += CAPTURE_GAP_MS + 520;
      }
    }
    for (const l of fresh) {
      switch (l.kind) {
        case "three_sixes":
          sixes((t + 80) / 1000);
          break;
        case "no_move":
          dead((t + 60) / 1000);
          break;
        case "win":
          if (next.winBy === "forfeit") ludoSfx("thud");
          else win((t + 200) / 1000);
          break;
      }
    }
  });

  if (fresh.some((l) => l.kind === "timeout" || l.kind === "left")) ludoSfx("thud");

  const becameYourTurn =
    next.phase !== "over" && next.turn === youId && (prev.turn !== youId || prev.phase === "over" || restarted);
  if (becameYourTurn) {
    window.setTimeout(() => {
      ludoSfx("yourTurn");
      try {
        navigator.vibrate?.(40);
      } catch {}
    }, t);
  }
  return t;
}
