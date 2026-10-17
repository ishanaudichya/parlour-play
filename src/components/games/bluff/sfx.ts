/* Bluff sound bank — a dhaba table on the highway. Cards slapped down, the
   rustle of a pass, a two-tone truck horn for "Bluff!", a sour slide when
   someone's caught and a bright chime when they told the truth, a big
   shuffle as the pile changes hands, ghungroo bells when it's your turn. */

import { makeBank, noise, tone } from "@/lib/client/synthCore";

export type BluffSfx = "deal" | "slap" | "pass" | "horn" | "caught" | "honest" | "take" | "burn" | "yourTurn" | "lastcall" | "pick" | "win" | "lose";

export const bluffSfx = makeBank<BluffSfx>({
  deal() {
    for (let i = 0; i < 6; i++) noise({ at: i * 0.05, dur: 0.05, g: 0.05, filter: { type: "bandpass", f: 2600, q: 1.2 } });
  },
  slap() {
    noise({ dur: 0.07, g: 0.12, filter: { type: "lowpass", f: 1400 } });
    tone({ f: 140, f2: 70, type: "sine", dur: 0.09, g: 0.08 });
  },
  pass() {
    noise({ dur: 0.12, g: 0.035, filter: { type: "bandpass", f: 1800, f2: 900, q: 0.8 } });
  },
  horn() {
    // Horn OK Please: two reeds a fourth apart, a little wobble
    for (const [f, at] of [[370, 0], [494, 0.2]] as const) {
      tone({ f, type: "sawtooth", at, dur: 0.24, g: 0.05, attack: 0.01 });
      tone({ f: f * 1.006, type: "square", at, dur: 0.24, g: 0.025, attack: 0.01 });
    }
  },
  caught() {
    tone({ f: 330, f2: 165, type: "triangle", at: 0.05, dur: 0.45, g: 0.07 });
    tone({ f: 311, f2: 156, type: "sawtooth", at: 0.05, dur: 0.45, g: 0.02 });
  },
  honest() {
    [784, 988, 1319].forEach((f, i) => tone({ f, type: "triangle", at: 0.05 + i * 0.07, dur: 0.3, g: 0.045 }));
  },
  take() {
    for (let i = 0; i < 10; i++) noise({ at: i * 0.035, dur: 0.06, g: 0.045, filter: { type: "bandpass", f: 2200 + i * 80, q: 1 } });
  },
  burn() {
    noise({ dur: 0.45, g: 0.05, filter: { type: "bandpass", f: 500, f2: 3000, q: 0.6 } });
  },
  yourTurn() {
    // ghungroo: a shake of little bells
    [2637, 3136, 2794, 3520].forEach((f, i) => tone({ f, type: "sine", at: i * 0.045, dur: 0.18, g: 0.018 }));
  },
  lastcall() {
    // a tabla "dha-dha"
    for (const at of [0, 0.16]) {
      tone({ f: 190, f2: 120, type: "sine", at, dur: 0.22, g: 0.1 });
      noise({ at, dur: 0.05, g: 0.05, filter: { type: "bandpass", f: 1200, q: 2 } });
    }
  },
  pick() {
    tone({ f: 1500, type: "square", dur: 0.018, g: 0.025 });
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone({ f, type: "triangle", at: i * 0.08, dur: 0.35, g: 0.05 }));
  },
  lose() {
    [392, 349.23, 311.13].forEach((f, i) => tone({ f, type: "triangle", at: i * 0.14, dur: 0.3, g: 0.05 }));
  },
});
