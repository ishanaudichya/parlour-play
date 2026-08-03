/* Secret Hitler sound bank — a 1930s ministry: letterpress thunks, typewriter
   ticks, paper shuffles, a gavel, rubber stamps, a rising drone as the
   fascist track fills, and one gunshot. Built on the shared synth core;
   triggered by log diffing (prev-view pattern). */

import { guarded, makeBank, noise, tone } from "@/lib/client/synthCore";
import type { SecretHitlerView } from "@/lib/games/secrethitler/types";

export type SHSfxName =
  | "thunk"
  | "tick"
  | "paper"
  | "gavel"
  | "stamp"
  | "toll"
  | "klaxon"
  | "drum"
  | "gunshot"
  | "chime"
  | "triumph"
  | "dark";

export const shSfx = makeBank<SHSfxName>({
  /** a policy tile slams into its socket — letterpress plate */
  thunk() {
    tone({ f: 82, f2: 44, type: "sine", dur: 0.16, g: 0.3 });
    noise({ dur: 0.05, g: 0.1, filter: { type: "lowpass", f: 1400, f2: 300 } });
    tone({ f: 210, f2: 120, type: "triangle", at: 0.015, dur: 0.09, g: 0.07 });
  },
  /** typewriter tick — headers, the record */
  tick() {
    noise({ dur: 0.016, g: 0.09, filter: { type: "highpass", f: 3800 } });
    tone({ f: 1450, type: "square", at: 0.004, dur: 0.02, g: 0.03 });
  },
  /** papers shuffle — deck, dossiers, handovers */
  paper() {
    noise({ dur: 0.22, g: 0.06, filter: { type: "bandpass", f: 900, f2: 2600, q: 0.7 } });
    noise({ at: 0.16, dur: 0.14, g: 0.04, filter: { type: "bandpass", f: 1600, q: 0.9 } });
  },
  /** the gavel falls — an election is decided */
  gavel() {
    noise({ dur: 0.03, g: 0.12, filter: { type: "highpass", f: 2200 } });
    tone({ f: 300, f2: 150, type: "triangle", dur: 0.12, g: 0.18 });
    tone({ f: 95, f2: 60, type: "sine", at: 0.01, dur: 0.22, g: 0.2 });
  },
  /** a rubber stamp hits paper */
  stamp() {
    noise({ dur: 0.04, g: 0.09, filter: { type: "bandpass", f: 700, q: 1.4 } });
    tone({ f: 130, f2: 70, type: "sine", at: 0.01, dur: 0.11, g: 0.2 });
  },
  /** a distant bell — timeouts, refusals, a leaver */
  toll() {
    tone({ f: 293.7, type: "sine", dur: 0.55, g: 0.06 });
    tone({ f: 587.3, type: "sine", at: 0.01, dur: 0.3, g: 0.025 });
  },
  /** the mob riots — chaos policy */
  klaxon() {
    tone({ f: 233, type: "square", dur: 0.22, g: 0.05 });
    tone({ f: 175, type: "square", at: 0.26, dur: 0.3, g: 0.055 });
    tone({ f: 58, f2: 36, type: "sine", dur: 0.7, g: 0.2 });
    noise({ at: 0.05, dur: 0.4, g: 0.03, filter: { type: "highpass", f: 4000 } });
  },
  /** a snare-less drum roll beat — a ministry order is issued */
  drum() {
    tone({ f: 73, f2: 55, type: "sine", dur: 0.18, g: 0.24 });
    tone({ f: 73, f2: 50, type: "sine", at: 0.24, dur: 0.26, g: 0.18 });
    noise({ at: 0.02, dur: 0.1, g: 0.03, filter: { type: "lowpass", f: 900 } });
  },
  /** the execution order is carried out */
  gunshot() {
    noise({ dur: 0.05, g: 0.3, filter: { type: "highpass", f: 1500 } });
    noise({ at: 0.015, dur: 0.3, g: 0.14, filter: { type: "lowpass", f: 900, f2: 120 } });
    tone({ f: 150, f2: 34, type: "sine", at: 0.01, dur: 0.42, g: 0.3 });
  },
  /** you must act */
  chime() {
    tone({ f: 1244.5, type: "sine", dur: 0.13, g: 0.06 });
    tone({ f: 1661.2, type: "sine", at: 0.1, dur: 0.2, g: 0.05 });
  },
  /** liberty's brass */
  triumph() {
    [349.2, 440, 523.3, 698.5].forEach((f, i) =>
      tone({ f, type: "sawtooth", at: i * 0.12, dur: 0.34, g: 0.045 })
    );
    tone({ f: 87.3, type: "sine", dur: 1.3, g: 0.11 });
    tone({ f: 1396.9, type: "triangle", at: 0.52, dur: 0.6, g: 0.05 });
  },
  /** the republic falls */
  dark() {
    tone({ f: 185, f2: 139, type: "sawtooth", dur: 0.9, g: 0.05 });
    tone({ f: 139, f2: 104, type: "sawtooth", at: 0.45, dur: 1.1, g: 0.05 });
    tone({ f: 46, f2: 26, type: "sine", dur: 1.9, g: 0.2 });
  },
});

/** Low drone that climbs a semitone ladder as the fascist track fills. */
export function fascistDrone(level: number) {
  const step = Math.max(1, Math.min(level, 6));
  const base = 55 * Math.pow(2, (step - 1) / 12);
  guarded(() => {
    tone({ f: base, type: "sawtooth", dur: 1.2, g: 0.05, attack: 0.15 });
    tone({ f: base * 1.5, type: "sawtooth", at: 0.1, dur: 1.0, g: 0.028, attack: 0.12 });
    tone({ f: base / 2, type: "sine", dur: 1.5, g: 0.16, attack: 0.1 });
  });
}

/** Does this viewer owe the republic an action right now? */
export function mustAct(view: SecretHitlerView, youId: string): boolean {
  const me = view.players.find((p) => p.id === youId);
  if (!me || !me.alive || me.left || view.phase === "over") return false;
  switch (view.phase) {
    case "nomination":
      return view.presidentId === youId;
    case "election":
      return !view.votedIds.includes(youId);
    case "legislative_president":
    case "veto_consent":
    case "power_peek":
    case "power_investigate":
    case "power_special":
    case "power_execute":
      return view.presidentId === youId;
    case "legislative_chancellor":
      return view.chancellorId === youId;
    default:
      return false;
  }
}

/** Play sounds for everything that happened between two views. */
export function playSecretHitlerDiff(prev: SecretHitlerView | null, next: SecretHitlerView, youId: string) {
  if (!prev) return;
  const lastSeen = prev.log.length ? prev.log[prev.log.length - 1].i : 0;
  const fresh = next.log.filter((l) => l.i > lastSeen);

  const played = new Set<SHSfxName>();
  const play = (n: SHSfxName) => {
    if (played.has(n)) return;
    shSfx(n);
    played.add(n);
  };

  for (const l of fresh) {
    switch (l.kind) {
      case "round":
        play("tick");
        break;
      case "nominate":
      case "special":
        play("stamp");
        break;
      case "ballots": {
        // ballots flip with a stagger; the gavel lands on the verdict
        play("paper");
        const flips = 450 + next.players.length * 60 + 350;
        setTimeout(() => shSfx("gavel"), flips);
        if (l.detail === "failed") setTimeout(() => shSfx("toll"), flips + 260);
        break;
      }
      case "cards":
      case "shuffle":
      case "peeked":
        play("paper");
        break;
      case "investigate":
        play("paper");
        play("stamp");
        break;
      case "enact":
        play("thunk");
        if (l.detail === "fascist") fascistDrone(next.fascistTrack);
        break;
      case "chaos":
        play("klaxon");
        play("thunk");
        if (l.detail === "fascist") fascistDrone(next.fascistTrack);
        break;
      case "power":
        play("drum");
        break;
      case "veto":
        play("stamp");
        play("drum");
        break;
      case "veto_agree":
        play("gavel");
        play("paper");
        break;
      case "veto_refuse":
        play("gavel");
        break;
      case "execute":
        play("gunshot");
        break;
      case "timeout":
      case "left":
        play("toll");
        break;
      case "win": {
        const youWon = next.winnerIds.includes(youId);
        const seated = next.players.some((p) => p.id === youId);
        play(youWon || (!seated && next.winner === "liberal") ? "triumph" : "dark");
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
