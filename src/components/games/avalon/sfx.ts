/* Avalon sound bank — moonlit Camelot: low horns, token clinks, parchment
   slides, grail chimes and a cracked bell for a Fail. Built on the shared
   synth core; triggered by log diffing (prev-view pattern). */

import { makeBank, noise, tone } from "@/lib/client/synthCore";
import type { AvalonView } from "@/lib/games/avalon/types";

export type AvalonSfxName =
  | "horn"
  | "clink"
  | "swell"
  | "parchment"
  | "crack"
  | "grail"
  | "heartbeat"
  | "dagger"
  | "toll"
  | "chime"
  | "triumph"
  | "drone";

export const avalonSfx = makeBank<AvalonSfxName>({
  /** low horn — a new round, the crown passes */
  horn() {
    tone({ f: 98, type: "sawtooth", dur: 0.75, g: 0.045, attack: 0.12 });
    tone({ f: 147, type: "sawtooth", at: 0.06, dur: 0.65, g: 0.035, attack: 0.1 });
    tone({ f: 49, type: "sine", dur: 0.9, g: 0.12 });
  },
  /** a vote token knocks the table */
  clink() {
    tone({ f: 2350, type: "square", dur: 0.025, g: 0.045 });
    tone({ f: 1175, type: "triangle", at: 0.02, dur: 0.09, g: 0.06 });
  },
  /** every seat flips its token at once */
  swell() {
    tone({ f: 392, type: "sine", dur: 0.4, g: 0.05, attack: 0.05 });
    tone({ f: 494, type: "sine", at: 0.09, dur: 0.4, g: 0.05, attack: 0.04 });
    tone({ f: 587.3, type: "sine", at: 0.18, dur: 0.5, g: 0.05, attack: 0.04 });
    noise({ at: 0.05, dur: 0.5, g: 0.02, filter: { type: "highpass", f: 5200 } });
  },
  /** a scroll or quest card slides across parchment */
  parchment() {
    noise({ dur: 0.26, g: 0.07, filter: { type: "bandpass", f: 800, f2: 2400, q: 0.6 } });
  },
  /** cracked-bell sting — a quest fails */
  crack() {
    noise({ dur: 0.14, g: 0.13, filter: { type: "highpass", f: 2400 } });
    tone({ f: 233, f2: 78, type: "square", at: 0.02, dur: 0.55, g: 0.06 });
    tone({ f: 466, f2: 440, type: "sine", at: 0.06, dur: 0.8, g: 0.05 });
    tone({ f: 62, f2: 30, type: "sine", dur: 0.8, g: 0.2 });
  },
  /** grail chime — a quest succeeds */
  grail() {
    tone({ f: 1046.5, type: "triangle", dur: 0.4, g: 0.055 });
    tone({ f: 1568, type: "triangle", at: 0.12, dur: 0.5, g: 0.045 });
    tone({ f: 2093, type: "sine", at: 0.26, dur: 0.7, g: 0.035 });
  },
  /** slow double thump while the Assassin decides */
  heartbeat() {
    tone({ f: 58, f2: 40, type: "sine", dur: 0.14, g: 0.24 });
    tone({ f: 52, f2: 36, type: "sine", at: 0.24, dur: 0.18, g: 0.16 });
  },
  /** the dagger falls */
  dagger() {
    noise({ dur: 0.1, g: 0.13, filter: { type: "highpass", f: 3200 } });
    tone({ f: 190, f2: 46, type: "sine", at: 0.03, dur: 0.32, g: 0.22 });
    noise({ at: 0.05, dur: 0.25, g: 0.08, filter: { type: "lowpass", f: 700, f2: 90 } });
  },
  /** a distant bell — timeouts, a leaver, a refusal */
  toll() {
    tone({ f: 329.6, type: "sine", dur: 0.6, g: 0.06 });
    tone({ f: 659.3, type: "sine", at: 0.01, dur: 0.35, g: 0.025 });
  },
  /** you must act */
  chime() {
    tone({ f: 1318.5, type: "sine", dur: 0.14, g: 0.06 });
    tone({ f: 1760, type: "sine", at: 0.11, dur: 0.2, g: 0.05 });
  },
  /** triumphant horns */
  triumph() {
    [392, 523.3, 659.3, 784].forEach((f, i) =>
      tone({ f, type: "sawtooth", at: i * 0.12, dur: 0.36, g: 0.045 })
    );
    tone({ f: 98, type: "sine", dur: 1.4, g: 0.1 });
    tone({ f: 1568, type: "triangle", at: 0.55, dur: 0.6, g: 0.05 });
  },
  /** dark descending drone */
  drone() {
    tone({ f: 196, f2: 147, type: "sawtooth", dur: 0.9, g: 0.045 });
    tone({ f: 147, f2: 110, type: "sawtooth", at: 0.5, dur: 1.1, g: 0.045 });
    tone({ f: 49, f2: 27, type: "sine", dur: 1.9, g: 0.18 });
  },
});

/** Does this viewer owe the table an action right now? */
export function mustAct(view: AvalonView, youId: string): boolean {
  const seated = view.players.some((p) => p.id === youId);
  if (!seated || view.phase === "over") return false;
  if (view.phase === "team") return view.leaderId === youId;
  if (view.phase === "vote") return !view.votedIds.includes(youId);
  if (view.phase === "quest")
    return view.team.includes(youId) && !view.questSubmittedIds.includes(youId);
  if (view.phase === "assassination") return view.yourRole === "assassin";
  return false;
}

/** Play sounds for everything that happened between two views. */
export function playAvalonDiff(prev: AvalonView | null, next: AvalonView, youId: string) {
  if (!prev) return;
  const lastSeen = prev.log.length ? prev.log[prev.log.length - 1].i : 0;
  const fresh = next.log.filter((l) => l.i > lastSeen);
  const seated = next.players.some((p) => p.id === youId);

  const played = new Set<AvalonSfxName>();
  const play = (n: AvalonSfxName) => {
    if (played.has(n)) return;
    avalonSfx(n);
    played.add(n);
  };

  for (const l of fresh) {
    switch (l.kind) {
      case "round":
        play("horn");
        break;
      case "propose":
        play("parchment");
        break;
      case "vote":
        play("swell");
        if (l.detail === "rejected") play("toll");
        break;
      case "quest": {
        // cards slide to the center now; the sting lands when the flips do
        play("parchment");
        const flips = 500 + (l.successes ?? 0) * 500 + (l.detail === "fail" ? 850 : 300);
        setTimeout(() => avalonSfx(l.detail === "success" ? "grail" : "crack"), flips);
        break;
      }
      case "dagger":
        play("heartbeat");
        break;
      case "shot":
        play("dagger");
        break;
      case "timeout":
      case "left":
        play("toll");
        break;
      case "win": {
        const youWon = next.winnerIds.includes(youId);
        play(youWon || (!seated && next.winner === "good") ? "triumph" : "drone");
        break;
      }
    }
  }

  if (mustAct(next, youId) && !mustAct(prev, youId)) {
    play("chime");
    try {
      navigator.vibrate?.(40);
    } catch {}
  }
}
