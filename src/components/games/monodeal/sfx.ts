/* Monopoly Deal sound bank — paper, cash registers, rubber stamps.
   Built on the shared synth core; every entry is mute-aware and safe. */

import { makeBank, noise, tone } from "@/lib/client/synthCore";

export type MdSfxName =
  | "draw"
  | "bank"
  | "stamp"
  | "jsn"
  | "alarm"
  | "rent"
  | "pay"
  | "steal"
  | "slide"
  | "discard"
  | "turn"
  | "win"
  | "defeat";

function coin(at: number, pitch = 1) {
  tone({ f: 2200 * pitch, type: "triangle", at, dur: 0.08, g: 0.09 });
  tone({ f: 2794 * pitch, type: "sine", at: at + 0.025, dur: 0.13, g: 0.06 });
  tone({ f: 5588 * pitch, type: "sine", at: at + 0.025, dur: 0.04, g: 0.02 });
}

export const mdSfx = makeBank<MdSfxName>({
  /** paper shuffle for draws */
  draw() {
    noise({ dur: 0.13, g: 0.09, filter: { type: "bandpass", f: 1200, f2: 3800, q: 1.1 } });
    noise({ at: 0.09, dur: 0.1, g: 0.06, filter: { type: "highpass", f: 2100 } });
  },
  /** cash-register cha-ching for banking */
  bank() {
    noise({ dur: 0.05, g: 0.05, filter: { type: "highpass", f: 4200 } });
    tone({ f: 2489, type: "square", dur: 0.045, g: 0.035 });
    tone({ f: 3322, type: "triangle", at: 0.06, dur: 0.24, g: 0.09 });
    tone({ f: 4186, type: "sine", at: 0.09, dur: 0.3, g: 0.05 });
  },
  /** rubber-stamp thunk for actions and deeds */
  stamp() {
    tone({ f: 150, f2: 52, type: "sine", dur: 0.16, g: 0.24 });
    noise({ dur: 0.05, g: 0.1, filter: { type: "lowpass", f: 900 } });
  },
  /** the big JUST SAY NO stamp */
  jsn() {
    noise({ dur: 0.045, g: 0.14, filter: { type: "lowpass", f: 1400 } });
    tone({ f: 112, f2: 40, type: "sine", at: 0.015, dur: 0.32, g: 0.32 });
    tone({ f: 336, type: "triangle", at: 0.03, dur: 0.12, g: 0.06 });
  },
  /** two-tone alarm for Deal Breaker */
  alarm() {
    tone({ f: 622, type: "square", dur: 0.15, g: 0.05 });
    tone({ f: 466, type: "square", at: 0.16, dur: 0.15, g: 0.05 });
    tone({ f: 622, type: "square", at: 0.32, dur: 0.15, g: 0.05 });
    tone({ f: 466, type: "square", at: 0.48, dur: 0.24, g: 0.05 });
    tone({ f: 82, f2: 48, type: "sawtooth", dur: 0.65, g: 0.07 });
  },
  /** coin cascade for rent collection */
  rent() {
    coin(0, 1.12);
    coin(0.08, 1);
    coin(0.17, 0.9);
    coin(0.27, 0.82);
  },
  pay() {
    coin(0, 0.95);
    coin(0.09, 1.06);
  },
  steal() {
    noise({ dur: 0.2, g: 0.06, filter: { type: "bandpass", f: 900, f2: 2800, q: 1.6 } });
    tone({ f: 520, f2: 980, type: "sine", dur: 0.16, g: 0.04 });
  },
  /** a building slides off a broken set */
  slide() {
    noise({ dur: 0.18, g: 0.05, filter: { type: "bandpass", f: 1600, f2: 480, q: 1.2 } });
  },
  discard() {
    noise({ dur: 0.12, g: 0.07, filter: { type: "bandpass", f: 800, f2: 2400, q: 1 } });
  },
  /** your-turn chime */
  turn() {
    tone({ f: 880, type: "sine", dur: 0.1, g: 0.08 });
    tone({ f: 1319, type: "sine", at: 0.09, dur: 0.2, g: 0.07 });
  },
  /** register bell + fanfare */
  win() {
    tone({ f: 3322, type: "triangle", dur: 0.35, g: 0.08 });
    tone({ f: 4186, type: "sine", at: 0.02, dur: 0.4, g: 0.04 });
    const seq = [523.3, 659.3, 784, 1046.5];
    seq.forEach((f, i) => tone({ f, type: "triangle", at: 0.22 + i * 0.1, dur: 0.3, g: 0.08 }));
    tone({ f: 130.8, type: "sine", dur: 0.9, g: 0.09 });
  },
  defeat() {
    tone({ f: 261.6, type: "triangle", dur: 0.3, g: 0.07 });
    tone({ f: 220, type: "triangle", at: 0.26, dur: 0.3, g: 0.07 });
    tone({ f: 174.6, type: "triangle", at: 0.52, dur: 0.5, g: 0.07 });
    tone({ f: 65, f2: 46, type: "sine", at: 0.5, dur: 0.6, g: 0.12 });
  },
});
