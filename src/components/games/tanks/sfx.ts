/* Pocket Tanks sound bank — all synthesized, all called by the scene at the
   exact tick something happens on screen, so every boom lands with its
   fireball rather than with the network packet.

   Cannon thumps and launch whooshes, booms scaled to the blast, the hiss of
   a beam and the crack of lightning, a bomber's drone, rain on dirt, the
   whine of a saw, the howl of a twister, a tank engine for every drive. */

import { guarded, makeBank, noise, tone } from "@/lib/client/synthCore";
import type { FxStyle } from "@/lib/games/tanks/types";
import type { WeaponId } from "@/lib/games/tanks/weapons";

export type TanksUiSfx = "tick" | "knob" | "pick" | "yourTurn" | "thud" | "denied" | "load";

export const tanksSfx = makeBank<TanksUiSfx>({
  tick() {
    tone({ f: 1500, type: "square", dur: 0.012, g: 0.018, attack: 0.001 });
  },
  knob() {
    tone({ f: 2200, type: "triangle", dur: 0.014, g: 0.03, attack: 0.001 });
    noise({ dur: 0.01, g: 0.02, filter: { type: "highpass", f: 4000 } });
  },
  pick() {
    tone({ f: 330, f2: 660, type: "square", dur: 0.08, g: 0.04 });
    tone({ f: 990, type: "triangle", at: 0.07, dur: 0.12, g: 0.05 });
    noise({ at: 0.02, dur: 0.06, g: 0.04, filter: { type: "bandpass", f: 3000, q: 2 } });
  },
  load() {
    // a breech closing: clack + clunk
    noise({ dur: 0.03, g: 0.07, filter: { type: "bandpass", f: 2600, q: 3 } });
    tone({ f: 180, f2: 120, type: "square", at: 0.04, dur: 0.07, g: 0.05 });
  },
  yourTurn() {
    tone({ f: 523.25, type: "square", dur: 0.08, g: 0.035 });
    tone({ f: 659.25, type: "square", at: 0.09, dur: 0.08, g: 0.035 });
    tone({ f: 783.99, type: "square", at: 0.18, dur: 0.16, g: 0.04 });
  },
  thud() {
    tone({ f: 100, f2: 50, type: "sine", dur: 0.3, g: 0.16 });
    noise({ dur: 0.14, g: 0.05, filter: { type: "lowpass", f: 500, f2: 110 } });
  },
  denied() {
    tone({ f: 180, type: "square", dur: 0.08, g: 0.04 });
    tone({ f: 140, type: "square", at: 0.09, dur: 0.12, g: 0.04 });
  },
});

/* ---------------- the trigger ---------------- */

export function sfxFire(w: WeaponId | string) {
  guarded(() => {
    switch (w) {
      case "lance":
      case "prism":
        tone({ f: 1800, f2: 220, type: "sawtooth", dur: 0.5, g: 0.05 });
        tone({ f: 2400, f2: 600, type: "sine", dur: 0.35, g: 0.05 });
        noise({ dur: 0.4, g: 0.04, filter: { type: "highpass", f: 3000 } });
        return;
      case "seeker":
      case "fireworks":
        noise({ dur: 0.7, g: 0.08, filter: { type: "bandpass", f: 900, f2: 3000, q: 0.8 } });
        tone({ f: 220, f2: 520, type: "sawtooth", dur: 0.45, g: 0.025 });
        return;
      case "blink":
        tone({ f: 300, f2: 1600, type: "sine", dur: 0.3, g: 0.06 });
        tone({ f: 600, f2: 3200, type: "triangle", at: 0.05, dur: 0.25, g: 0.03 });
        return;
      case "mudpie":
      case "rampart":
        tone({ f: 140, f2: 70, type: "sine", dur: 0.22, g: 0.14 });
        noise({ dur: 0.1, g: 0.05, filter: { type: "lowpass", f: 700 } });
        return;
      case "gatling":
        return sfxRound();
      case "sun":
      case "howitzer":
      case "tremor":
        tone({ f: 90, f2: 34, type: "sine", dur: 0.6, g: 0.24 });
        noise({ dur: 0.35, g: 0.14, filter: { type: "lowpass", f: 1400, f2: 120 } });
        tone({ f: 260, f2: 90, type: "square", dur: 0.12, g: 0.05 });
        return;
      default:
        tone({ f: 150, f2: 48, type: "sine", dur: 0.38, g: 0.2 });
        noise({ dur: 0.22, g: 0.11, filter: { type: "lowpass", f: 2200, f2: 200 } });
        tone({ f: 420, f2: 120, type: "square", dur: 0.06, g: 0.04 });
    }
  });
}

/** one gatling round */
export function sfxRound() {
  guarded(() => {
    noise({ dur: 0.05, g: 0.09, filter: { type: "bandpass", f: 1800, q: 1.2 } });
    tone({ f: 240, f2: 90, type: "square", dur: 0.05, g: 0.05 });
  });
}

/* ---------------- impacts ---------------- */

export function sfxBoom(fx: FxStyle, r: number) {
  guarded(() => {
    const big = Math.min(1, r / 110);
    switch (fx) {
      case "electric":
        noise({ dur: 0.25, g: 0.12, filter: { type: "highpass", f: 2500 } });
        tone({ f: 120, f2: 40, type: "sawtooth", dur: 0.3, g: 0.07 });
        return;
      case "spark":
        noise({ dur: 0.08, g: 0.05, filter: { type: "bandpass", f: 4200, q: 1.5 } });
        tone({ f: 1600, f2: 700, type: "triangle", dur: 0.06, g: 0.025 });
        return;
      case "pop":
        noise({ dur: 0.06, g: 0.12, filter: { type: "bandpass", f: 2400, q: 1 } });
        tone({ f: 600, f2: 200, type: "square", dur: 0.05, g: 0.05 });
        return;
      case "acid":
        noise({ dur: 0.12, g: 0.03, filter: { type: "highpass", f: 5000 } });
        return;
      case "mud":
      case "dirt":
        tone({ f: 110, f2: 50, type: "sine", dur: 0.3, g: 0.14 });
        noise({ dur: 0.25, g: 0.07, filter: { type: "lowpass", f: 900, f2: 200 } });
        return;
      case "blink":
        tone({ f: 1800, f2: 300, type: "sine", dur: 0.3, g: 0.05 });
        tone({ f: 900, f2: 2400, type: "triangle", at: 0.05, dur: 0.2, g: 0.03 });
        return;
      case "firework":
        noise({ dur: 0.05, g: 0.06, filter: { type: "bandpass", f: 3800, q: 2 } });
        return;
      case "void":
        tone({ f: 60, f2: 400, type: "sawtooth", dur: 0.18, g: 0.06 });
        tone({ f: 80, f2: 30, type: "sine", at: 0.15, dur: 0.8, g: 0.24 });
        noise({ at: 0.15, dur: 0.6, g: 0.12, filter: { type: "lowpass", f: 1200, f2: 80 } });
        return;
      case "nuke":
        tone({ f: 70, f2: 22, type: "sine", dur: 2.4, g: 0.34 });
        noise({ dur: 2.2, g: 0.22, filter: { type: "lowpass", f: 2400, f2: 60 } });
        noise({ at: 0.05, dur: 0.5, g: 0.12, filter: { type: "highpass", f: 1500 } });
        tone({ f: 46, f2: 30, type: "sine", at: 0.3, dur: 2.0, g: 0.2 });
        return;
      case "orbital":
        tone({ f: 2400, f2: 120, type: "sawtooth", dur: 0.9, g: 0.05 });
        tone({ f: 80, f2: 30, type: "sine", dur: 1.0, g: 0.26 });
        noise({ dur: 0.9, g: 0.16, filter: { type: "lowpass", f: 3000, f2: 100 } });
        return;
      default: {
        // fire / big / meteor / lava
        const f = 120 - big * 60;
        tone({ f, f2: Math.max(24, f * 0.35), type: "sine", dur: 0.45 + big * 0.9, g: 0.16 + big * 0.14 });
        noise({ dur: 0.3 + big * 0.8, g: 0.1 + big * 0.1, filter: { type: "lowpass", f: 2600 - big * 1200, f2: 90 } });
        noise({ dur: 0.08, g: 0.06, filter: { type: "highpass", f: 2000 } });
        if (fx === "lava") noise({ at: 0.1, dur: 0.4, g: 0.03, filter: { type: "highpass", f: 4000 } });
      }
    }
  });
}

export const sfxBounce = () => guarded(() => tone({ f: 900, f2: 1400, type: "triangle", dur: 0.08, g: 0.05 }));

export function sfxHit(self: boolean) {
  guarded(() => {
    if (self) {
      tone({ f: 330, f2: 220, type: "square", dur: 0.12, g: 0.03 });
    } else {
      tone({ f: 1046.5, type: "square", dur: 0.05, g: 0.025 });
      tone({ f: 1568, type: "square", at: 0.05, dur: 0.08, g: 0.025 });
    }
  });
}

export const sfxThud = () => guarded(() => {
  tone({ f: 90, f2: 45, type: "sine", dur: 0.22, g: 0.14 });
  noise({ dur: 0.1, g: 0.05, filter: { type: "lowpass", f: 600 } });
});

/* ---------------- set pieces ---------------- */

export function sfxBolt() {
  guarded(() => {
    noise({ dur: 0.06, g: 0.2, filter: { type: "highpass", f: 1800 } });
    noise({ at: 0.04, dur: 1.2, g: 0.14, filter: { type: "lowpass", f: 900, f2: 60 } });
    tone({ f: 60, f2: 30, type: "sine", at: 0.05, dur: 1.0, g: 0.16 });
  });
}

export function sfxBeam(kind: "lance" | "prism" | "orbital", secs: number) {
  guarded(() => {
    if (kind === "orbital") {
      tone({ f: 1200, f2: 2400, type: "sine", dur: 0.4, g: 0.03 });
      tone({ f: 55, type: "sawtooth", at: 0.1, dur: secs, g: 0.05 });
      noise({ at: 0.1, dur: secs, g: 0.08, filter: { type: "bandpass", f: 500, q: 0.6 } });
      return;
    }
    const f = kind === "lance" ? 140 : 320;
    tone({ f, type: "sawtooth", dur: secs, g: 0.04 });
    tone({ f: f * 2.01, type: "square", dur: secs, g: 0.015 });
    noise({ dur: secs, g: 0.03, filter: { type: "highpass", f: 5000 } });
  });
}

export function sfxPlane(secs: number) {
  guarded(() => {
    for (let i = 0; i < 4; i++) tone({ f: 82 + i * 0.7, type: "sawtooth", at: (i * secs) / 4, dur: secs / 4 + 0.3, g: 0.035 });
    noise({ dur: secs, g: 0.03, filter: { type: "bandpass", f: 380, q: 0.7 } });
  });
}

export function sfxRumble(secs: number) {
  guarded(() => {
    noise({ dur: secs, g: 0.16, filter: { type: "lowpass", f: 180, f2: 60 } });
    tone({ f: 38, f2: 28, type: "sine", dur: secs, g: 0.2 });
  });
}

export function sfxWell(secs: number) {
  guarded(() => {
    tone({ f: 40, f2: 160, type: "sawtooth", dur: secs, g: 0.05 });
    tone({ f: 55, f2: 220, type: "sine", dur: secs, g: 0.08 });
    noise({ dur: secs, g: 0.05, filter: { type: "bandpass", f: 300, f2: 2400, q: 1 } });
  });
}

export function sfxGrind(secs: number) {
  guarded(() => {
    tone({ f: 640, f2: 700, type: "sawtooth", dur: secs, g: 0.025 });
    noise({ dur: secs, g: 0.05, filter: { type: "bandpass", f: 3200, q: 1.5 } });
  });
}

export function sfxWind(secs: number) {
  guarded(() => {
    noise({ dur: secs, g: 0.08, filter: { type: "bandpass", f: 300, f2: 900, q: 1.2 } });
    noise({ at: secs * 0.4, dur: secs * 0.6, g: 0.06, filter: { type: "bandpass", f: 900, f2: 250, q: 1.2 } });
  });
}

export function sfxRain(secs: number) {
  guarded(() => {
    for (let i = 0; i < 26; i++) noise({ at: (i / 26) * secs, dur: 0.03, g: 0.025, filter: { type: "highpass", f: 3500 + (i % 5) * 400 } });
  });
}

export function sfxSizzle(secs: number) {
  guarded(() => {
    noise({ dur: secs, g: 0.035, filter: { type: "highpass", f: 3000 } });
    noise({ dur: secs * 0.6, g: 0.03, filter: { type: "bandpass", f: 900, q: 0.8 } });
  });
}

export function sfxBurst(fx: "firework" | "split" | "erupt") {
  guarded(() => {
    if (fx === "firework") {
      noise({ dur: 0.12, g: 0.14, filter: { type: "bandpass", f: 1400, q: 0.8 } });
      for (let i = 0; i < 9; i++) noise({ at: 0.25 + i * 0.07 + (i % 3) * 0.02, dur: 0.03, g: 0.04, filter: { type: "highpass", f: 4000 } });
    } else if (fx === "split") {
      tone({ f: 1400, f2: 500, type: "square", dur: 0.08, g: 0.04 });
      noise({ dur: 0.06, g: 0.06, filter: { type: "bandpass", f: 2400, q: 1 } });
    } else {
      tone({ f: 70, f2: 40, type: "sine", dur: 1.4, g: 0.2 });
      noise({ dur: 1.4, g: 0.12, filter: { type: "lowpass", f: 700, f2: 120 } });
    }
  });
}

export function sfxWarp() {
  guarded(() => {
    tone({ f: 2400, f2: 200, type: "sine", dur: 0.35, g: 0.05 });
    tone({ f: 200, f2: 2400, type: "triangle", at: 0.2, dur: 0.3, g: 0.04 });
  });
}

export function sfxEngine(secs: number) {
  guarded(() => {
    tone({ f: 55, f2: 70, type: "sawtooth", dur: secs, g: 0.05 });
    tone({ f: 110, f2: 130, type: "square", dur: secs, g: 0.012 });
    noise({ dur: secs, g: 0.035, filter: { type: "lowpass", f: 400 } });
  });
}

export function sfxWin() {
  guarded(() => {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => tone({ f, type: "square", at: i * 0.12, dur: 0.22, g: 0.04 }));
    [1046.5, 783.99, 1046.5].forEach((f, i) => tone({ f, type: "triangle", at: 0.55 + i * 0.12, dur: 0.4, g: 0.05 }));
    tone({ f: 130.81, type: "triangle", dur: 1.4, g: 0.08 });
  });
}

export function sfxDraw() {
  guarded(() => {
    tone({ f: 440, type: "triangle", dur: 0.3, g: 0.05 });
    tone({ f: 440, type: "triangle", at: 0.32, dur: 0.5, g: 0.05 });
  });
}
