/* STACCS sound bank — toy blocks and an 8-bit console. A crisp plastic tok
   when a cube lands, a paper swish for a draw, a zap for an attack, a rising
   whoosh when a wild turns the STACC, a "1-up" for an ace, a two-note
   "uh-oh", a buzzer for a catch and a chiptune fanfare for the win. */

import { makeBank, noise, tone } from "@/lib/client/synthCore";

export type StaccsSfx = "place" | "select" | "draw" | "attack" | "wild" | "ace" | "zero" | "give" | "uhoh" | "catch" | "yourTurn" | "win" | "lose" | "nope";

export const staccsSfx = makeBank<StaccsSfx>({
  place() {
    tone({ f: 1400, f2: 700, type: "triangle", dur: 0.05, g: 0.09, attack: 0.001 });
    tone({ f: 220, f2: 160, type: "sine", dur: 0.12, g: 0.1 });
    noise({ dur: 0.03, g: 0.05, filter: { type: "bandpass", f: 3200, q: 2 } });
  },
  select() {
    tone({ f: 1900, type: "square", dur: 0.02, g: 0.025 });
  },
  draw() {
    noise({ dur: 0.14, g: 0.06, filter: { type: "bandpass", f: 1600, f2: 4200, q: 0.9 } });
    tone({ f: 660, f2: 880, type: "triangle", at: 0.05, dur: 0.07, g: 0.03 });
  },
  attack() {
    tone({ f: 880, f2: 220, type: "square", dur: 0.18, g: 0.05 });
    tone({ f: 1320, f2: 330, type: "square", at: 0.06, dur: 0.16, g: 0.035 });
  },
  wild() {
    tone({ f: 220, f2: 1760, type: "sawtooth", dur: 0.42, g: 0.04 });
    noise({ dur: 0.4, g: 0.04, filter: { type: "bandpass", f: 600, f2: 5000, q: 1 } });
  },
  ace() {
    [659.25, 783.99, 1318.5, 1046.5, 1174.66, 1567.98].forEach((f, i) => tone({ f, type: "square", at: i * 0.055, dur: 0.07, g: 0.035 }));
  },
  zero() {
    tone({ f: 990, f2: 495, type: "triangle", dur: 0.14, g: 0.05 });
    tone({ f: 495, f2: 990, type: "triangle", at: 0.12, dur: 0.14, g: 0.05 });
  },
  give() {
    tone({ f: 523.25, f2: 392, type: "triangle", dur: 0.16, g: 0.05 });
  },
  uhoh() {
    tone({ f: 587.33, type: "square", dur: 0.16, g: 0.05 });
    tone({ f: 440, type: "square", at: 0.18, dur: 0.26, g: 0.05 });
  },
  catch() {
    tone({ f: 140, type: "sawtooth", dur: 0.35, g: 0.07 });
    tone({ f: 147, type: "square", dur: 0.35, g: 0.03 });
  },
  yourTurn() {
    tone({ f: 1046.5, type: "square", dur: 0.06, g: 0.03 });
    tone({ f: 1567.98, type: "square", at: 0.07, dur: 0.1, g: 0.03 });
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ f, type: "square", at: i * 0.1, dur: 0.14, g: 0.045 }));
    [783.99, 1046.5, 1318.5].forEach((f, i) => tone({ f, type: "triangle", at: 0.46 + i * 0.1, dur: 0.4, g: 0.05 }));
  },
  lose() {
    [392, 349.23, 311.13, 261.63].forEach((f, i) => tone({ f, type: "triangle", at: i * 0.14, dur: 0.22, g: 0.05 }));
  },
  nope() {
    tone({ f: 200, type: "square", dur: 0.09, g: 0.04 });
  },
});
