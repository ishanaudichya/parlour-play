/* Dots and Boxes sound bank — a pen and a notebook. A short scratch for each
   line, a bright tick for every box closed, a page turn when the page opens,
   and a little flourish for the win. */

import { makeBank, noise, tone } from "@/lib/client/synthCore";

export type DotsSfx = "scratch" | "box" | "page" | "yourTurn" | "tick" | "win" | "draw" | "nope";

export const dotsSfx = makeBank<DotsSfx>({
  scratch() {
    noise({ dur: 0.09, g: 0.07, filter: { type: "bandpass", f: 3200, f2: 1800, q: 1.4 } });
    noise({ at: 0.02, dur: 0.06, g: 0.03, filter: { type: "highpass", f: 5000 } });
  },
  box() {
    tone({ f: 1318.5, type: "triangle", dur: 0.12, g: 0.05 });
    tone({ f: 1975.5, type: "sine", at: 0.06, dur: 0.18, g: 0.04 });
  },
  page() {
    noise({ dur: 0.35, g: 0.06, filter: { type: "bandpass", f: 900, f2: 3500, q: 0.7 } });
  },
  yourTurn() {
    tone({ f: 880, type: "sine", dur: 0.08, g: 0.04 });
    tone({ f: 1174.66, type: "sine", at: 0.08, dur: 0.14, g: 0.035 });
  },
  tick() {
    tone({ f: 1800, type: "square", dur: 0.015, g: 0.02 });
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ f, type: "triangle", at: i * 0.09, dur: 0.3, g: 0.05 }));
    tone({ f: 1318.5, type: "sine", at: 0.4, dur: 0.5, g: 0.04 });
  },
  draw() {
    tone({ f: 523.25, type: "triangle", dur: 0.25, g: 0.05 });
    tone({ f: 523.25, type: "triangle", at: 0.28, dur: 0.35, g: 0.05 });
  },
  nope() {
    tone({ f: 200, type: "square", dur: 0.08, g: 0.03 });
  },
});
