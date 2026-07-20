/* Coup's sound bank, built on the shared synth core. */

import { makeBank, noise, tone } from "./synthCore";

export {
  getMutedServerSnapshot,
  getMutedSnapshot,
  isMuted,
  primeSound,
  setMuted,
  subscribeMuted,
} from "./synthCore";

export type SfxName =
  | "click"
  | "coin"
  | "coins"
  | "deal"
  | "flip"
  | "whoosh"
  | "dagger"
  | "challenge"
  | "block"
  | "thud"
  | "lose"
  | "eliminated"
  | "turn"
  | "join"
  | "start"
  | "win"
  | "defeat";

function coinAt(at: number, pitch = 1) {
  tone({ f: 2093 * pitch, type: "triangle", at, dur: 0.09, g: 0.1 });
  tone({ f: 2637 * pitch, type: "sine", at: at + 0.03, dur: 0.14, g: 0.07 });
  tone({ f: 5274 * pitch, type: "sine", at: at + 0.03, dur: 0.05, g: 0.02 });
}

export const sfx = makeBank<SfxName>({
  click() {
    tone({ f: 1900, type: "square", dur: 0.022, g: 0.05 });
  },
  coin() {
    coinAt(0);
  },
  coins() {
    coinAt(0);
    coinAt(0.085, 0.94);
    coinAt(0.17, 1.06);
  },
  deal() {
    noise({ dur: 0.16, g: 0.09, filter: { type: "bandpass", f: 900, f2: 3200, q: 1.2 } });
  },
  flip() {
    noise({ dur: 0.07, g: 0.08, filter: { type: "highpass", f: 1400 } });
    tone({ f: 620, type: "triangle", at: 0.05, dur: 0.05, g: 0.05 });
  },
  whoosh() {
    noise({ dur: 0.22, g: 0.05, filter: { type: "bandpass", f: 500, f2: 1800, q: 1.4 } });
  },
  dagger() {
    noise({ dur: 0.28, g: 0.09, filter: { type: "bandpass", f: 2400, f2: 7200, q: 3 } });
    tone({ f: 3800, f2: 5200, type: "sine", dur: 0.16, g: 0.03 });
  },
  challenge() {
    tone({ f: 155.6, type: "sawtooth", dur: 0.5, g: 0.1 });
    tone({ f: 164.8, type: "sawtooth", dur: 0.5, g: 0.1 });
    tone({ f: 311, type: "sawtooth", at: 0.02, dur: 0.4, g: 0.05 });
    noise({ dur: 0.08, g: 0.1, filter: { type: "highpass", f: 900 } });
  },
  block() {
    tone({ f: 523, type: "triangle", dur: 0.18, g: 0.12 });
    tone({ f: 741, type: "sine", dur: 0.22, g: 0.08 });
    noise({ dur: 0.05, g: 0.09, filter: { type: "highpass", f: 2000 } });
  },
  thud() {
    tone({ f: 110, f2: 38, type: "sine", dur: 0.42, g: 0.32 });
    noise({ dur: 0.12, g: 0.12, filter: { type: "lowpass", f: 400 } });
  },
  lose() {
    tone({ f: 329.6, type: "triangle", dur: 0.14, g: 0.1 });
    tone({ f: 261.6, type: "triangle", at: 0.13, dur: 0.14, g: 0.1 });
    tone({ f: 196, type: "triangle", at: 0.26, dur: 0.22, g: 0.1 });
  },
  eliminated() {
    tone({ f: 220, type: "triangle", dur: 0.2, g: 0.12 });
    tone({ f: 174.6, type: "triangle", at: 0.18, dur: 0.2, g: 0.12 });
    tone({ f: 130.8, type: "triangle", at: 0.36, dur: 0.4, g: 0.12 });
    tone({ f: 65, f2: 40, type: "sine", at: 0.36, dur: 0.5, g: 0.18 });
  },
  turn() {
    tone({ f: 784, type: "sine", dur: 0.12, g: 0.09 });
    tone({ f: 1175, type: "sine", at: 0.1, dur: 0.2, g: 0.08 });
  },
  join() {
    tone({ f: 659, type: "sine", dur: 0.1, g: 0.07 });
    tone({ f: 880, type: "sine", at: 0.08, dur: 0.14, g: 0.06 });
  },
  start() {
    noise({ dur: 0.18, g: 0.08, filter: { type: "bandpass", f: 900, f2: 3000, q: 1 } });
    tone({ f: 150, f2: 55, type: "sine", at: 0.05, dur: 0.3, g: 0.25 });
    tone({ f: 392, type: "triangle", at: 0.2, dur: 0.15, g: 0.08 });
    tone({ f: 523, type: "triangle", at: 0.32, dur: 0.25, g: 0.08 });
  },
  win() {
    const seq = [523.3, 659.3, 784, 1046.5, 1318.5];
    seq.forEach((f, i) => tone({ f, type: "triangle", at: i * 0.09, dur: 0.28, g: 0.09 }));
    tone({ f: 2093, type: "sine", at: 0.45, dur: 0.5, g: 0.04 });
    tone({ f: 130.8, type: "sine", at: 0, dur: 0.8, g: 0.1 });
  },
  defeat() {
    tone({ f: 246.9, type: "sawtooth", dur: 0.5, g: 0.05 });
    tone({ f: 233.1, type: "sawtooth", at: 0.4, dur: 0.9, g: 0.05 });
    tone({ f: 61.7, f2: 45, type: "sine", at: 0.4, dur: 0.9, g: 0.15 });
  },
});
