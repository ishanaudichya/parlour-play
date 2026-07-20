/* UNO sound bank — neon arcade flavored, built on the shared synth core. */

import { makeBank, noise, tone } from "@/lib/client/synthCore";

export type UnoSfxName =
  | "click"
  | "pop"
  | "swish"
  | "skip"
  | "reverse"
  | "buzz"
  | "shimmer"
  | "uno"
  | "catch"
  | "turn"
  | "timeout"
  | "leave"
  | "win"
  | "defeat";

export const unoSfx = makeBank<UnoSfxName>({
  click() {
    tone({ f: 1900, type: "square", dur: 0.022, g: 0.05 });
  },
  // card lands on the pile
  pop() {
    tone({ f: 680, f2: 210, type: "triangle", dur: 0.09, g: 0.16 });
    noise({ dur: 0.045, g: 0.06, filter: { type: "highpass", f: 2400 } });
  },
  // card slides off the deck
  swish() {
    noise({ dur: 0.18, g: 0.07, filter: { type: "bandpass", f: 2600, f2: 700, q: 1.3 } });
  },
  // boop-boop
  skip() {
    tone({ f: 494, type: "square", dur: 0.07, g: 0.07 });
    tone({ f: 349, type: "square", at: 0.11, dur: 0.11, g: 0.07 });
  },
  // rising then falling zip
  reverse() {
    tone({ f: 320, f2: 990, type: "sawtooth", dur: 0.13, g: 0.05 });
    tone({ f: 990, f2: 320, type: "sawtooth", at: 0.14, dur: 0.16, g: 0.05 });
  },
  // harsh penalty buzz for +2 / +4
  buzz() {
    tone({ f: 131, type: "sawtooth", dur: 0.3, g: 0.11 });
    tone({ f: 98, type: "sawtooth", at: 0.02, dur: 0.32, g: 0.09 });
    noise({ dur: 0.14, g: 0.05, filter: { type: "lowpass", f: 620 } });
  },
  // wild color shimmer arpeggio
  shimmer() {
    [523.3, 659.3, 784, 987.8, 1174.7].forEach((f, i) =>
      tone({ f, type: "sine", at: i * 0.055, dur: 0.22, g: 0.055 })
    );
    tone({ f: 2349, type: "sine", at: 0.3, dur: 0.3, g: 0.025 });
  },
  // "UNO!" shout
  uno() {
    tone({ f: 784, type: "square", dur: 0.09, g: 0.075 });
    tone({ f: 1046.5, type: "square", at: 0.09, dur: 0.16, g: 0.075 });
    noise({ dur: 0.05, g: 0.045, filter: { type: "highpass", f: 3200 } });
  },
  // alarm chirp when someone gets caught
  catch() {
    for (let i = 0; i < 3; i++) {
      tone({ f: 1244.5, type: "square", at: i * 0.11, dur: 0.05, g: 0.065 });
      tone({ f: 932.3, type: "square", at: i * 0.11 + 0.055, dur: 0.05, g: 0.065 });
    }
  },
  // gentle chime: it's your turn
  turn() {
    tone({ f: 880, type: "sine", dur: 0.1, g: 0.07 });
    tone({ f: 1318.5, type: "sine", at: 0.09, dur: 0.18, g: 0.06 });
  },
  timeout() {
    tone({ f: 233, type: "triangle", dur: 0.16, g: 0.08 });
    tone({ f: 175, type: "triangle", at: 0.14, dur: 0.2, g: 0.08 });
  },
  // muted farewell when a player leaves the table
  leave() {
    tone({ f: 220, f2: 160, type: "triangle", dur: 0.2, g: 0.05 });
    tone({ f: 147, type: "sine", at: 0.16, dur: 0.24, g: 0.04 });
  },
  win() {
    [523.3, 587.3, 659.3, 784, 880, 1046.5].forEach((f, i) =>
      tone({ f, type: "triangle", at: i * 0.09, dur: 0.24, g: 0.09 })
    );
    tone({ f: 1568, type: "sine", at: 0.56, dur: 0.5, g: 0.045 });
    tone({ f: 130.8, type: "sine", dur: 0.9, g: 0.09 });
  },
  defeat() {
    tone({ f: 392, f2: 196, type: "triangle", dur: 0.6, g: 0.08 });
    tone({ f: 98, f2: 58, type: "sine", at: 0.2, dur: 0.7, g: 0.12 });
  },
});
