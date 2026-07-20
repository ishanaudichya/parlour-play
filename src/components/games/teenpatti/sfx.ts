/* Teen Patti sound bank — midnight casino: chip clacks, card slides, a tense
   show sting. Built on the shared synth core; triggered by log diffing. */

import { makeBank, noise, tone } from "@/lib/client/synthCore";
import type { TeenPattiView, TPLogKind } from "@/lib/games/teenpatti/types";

export type TPSfxName =
  | "chip"
  | "chips"
  | "deal"
  | "flip"
  | "fold"
  | "show"
  | "allin"
  | "cascade"
  | "bust"
  | "turn"
  | "win"
  | "defeat";

/** One clay-chip clack. */
function clack(at: number, pitch = 1) {
  noise({ at, dur: 0.028, g: 0.1, filter: { type: "bandpass", f: 3300 * pitch, q: 7 } });
  tone({ f: 2400 * pitch, type: "triangle", at: at + 0.005, dur: 0.035, g: 0.055 });
}

export const tpSfx = makeBank<TPSfxName>({
  chip() {
    clack(0);
    clack(0.055, 0.92);
  },
  chips() {
    clack(0);
    clack(0.045, 1.07);
    clack(0.095, 0.9);
    clack(0.15, 1.14);
  },
  deal() {
    noise({ dur: 0.13, g: 0.09, filter: { type: "bandpass", f: 1100, f2: 3600, q: 1.3 } });
    noise({ at: 0.1, dur: 0.11, g: 0.07, filter: { type: "bandpass", f: 900, f2: 3000, q: 1.3 } });
    noise({ at: 0.2, dur: 0.1, g: 0.05, filter: { type: "bandpass", f: 800, f2: 2600, q: 1.3 } });
  },
  flip() {
    noise({ dur: 0.06, g: 0.08, filter: { type: "highpass", f: 1600 } });
    tone({ f: 720, type: "triangle", at: 0.04, dur: 0.06, g: 0.05 });
  },
  fold() {
    noise({ dur: 0.24, g: 0.05, filter: { type: "bandpass", f: 1700, f2: 320, q: 1.2 } });
  },
  show() {
    // tense minor chord over a low drone
    tone({ f: 220, type: "sawtooth", dur: 0.7, g: 0.05 });
    tone({ f: 261.6, type: "sawtooth", at: 0.03, dur: 0.68, g: 0.045 });
    tone({ f: 311.1, type: "sawtooth", at: 0.06, dur: 0.65, g: 0.04 });
    tone({ f: 110, f2: 88, type: "sine", dur: 0.85, g: 0.13 });
  },
  allin() {
    tone({ f: 98, f2: 70, type: "sine", dur: 0.5, g: 0.2 });
    for (let i = 0; i < 5; i++) clack(0.03 + i * 0.05, 1 + (i % 3) * 0.09);
  },
  cascade() {
    for (let i = 0; i < 8; i++) clack(i * 0.05, 1 + (i % 4) * 0.07);
    tone({ f: 1046.5, type: "triangle", at: 0.16, dur: 0.3, g: 0.06 });
    tone({ f: 1568, type: "sine", at: 0.32, dur: 0.35, g: 0.05 });
  },
  bust() {
    tone({ f: 130, f2: 40, type: "sine", dur: 0.7, g: 0.3 });
    noise({ dur: 0.18, g: 0.1, filter: { type: "lowpass", f: 300 } });
  },
  turn() {
    tone({ f: 880, type: "sine", dur: 0.1, g: 0.07 });
    tone({ f: 1318.5, type: "sine", at: 0.09, dur: 0.18, g: 0.06 });
  },
  win() {
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone({ f, type: "triangle", at: i * 0.1, dur: 0.3, g: 0.08 }));
    for (let i = 0; i < 9; i++) clack(0.22 + i * 0.05, 1 + (i % 4) * 0.06);
    tone({ f: 130.8, type: "sine", dur: 0.8, g: 0.1 });
  },
  defeat() {
    tone({ f: 246.9, type: "sawtooth", dur: 0.5, g: 0.05 });
    tone({ f: 233.1, type: "sawtooth", at: 0.35, dur: 0.85, g: 0.05 });
    tone({ f: 58, f2: 42, type: "sine", at: 0.35, dur: 0.9, g: 0.14 });
  },
});

const LOG_SFX: Partial<Record<TPLogKind, TPSfxName>> = {
  boot: "chip",
  blind_bet: "chip",
  chaal: "chip",
  raise: "chips",
  allin: "allin",
  see: "flip",
  fold: "fold",
  timeout: "fold",
  leave: "fold",
  show: "show",
  showdown: "show",
  win_hand: "cascade",
  bust: "bust",
  next_hand: "deal",
};

/** Play sounds for everything that happened between two views (Coup's playDiff pattern). */
export function playTeenPattiDiff(prev: TeenPattiView | null, next: TeenPattiView, youId: string) {
  if (!prev) return;
  const lastSeen = prev.log.length ? prev.log[prev.log.length - 1].i : 0;
  const fresh = next.log.filter((l) => l.i > lastSeen);
  const played = new Set<TPSfxName>();
  for (const l of fresh) {
    if (l.kind === "session_over") {
      tpSfx(next.winnerId === youId ? "win" : "defeat");
      continue;
    }
    const name = LOG_SFX[l.kind];
    if (name && !played.has(name)) {
      tpSfx(name);
      played.add(name);
    }
  }
  const becameMyTurn =
    next.phase === "playing" &&
    next.turn === youId &&
    (prev.turn !== youId || prev.phase !== "playing");
  if (becameMyTurn) {
    tpSfx("turn");
    try {
      navigator.vibrate?.(60);
    } catch {}
  }
}
