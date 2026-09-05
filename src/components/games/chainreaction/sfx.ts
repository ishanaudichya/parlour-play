/* Chain Reaction sound bank — glass and gas. A soft glass tap when an orb is
   set down (brighter the fuller the cell), a hollow pop for every wave of
   the cascade climbing in pitch as the chain runs, a falling glass triad
   when someone is knocked out, a wide bloom for the win, a chime when the
   turn is yours and a dull thud when the clock or a quitter decides things.

   Cascade pops are scheduled against the same timeline the board replays,
   so each pop lands with its wave rather than with the network packet. */

import { guarded, makeBank, noise, tone } from "@/lib/client/synthCore";
import type { ChainView } from "@/lib/games/chainreaction/types";
import { cascadeTimeline } from "./palette";

export type ChainSfxName =
  | "place1"
  | "place2"
  | "place3"
  | "tick"
  | "knockout"
  | "win"
  | "yourTurn"
  | "thud";

/** Glass tap — pitched by how many orbs now sit in the cell. */
function tap(n: number) {
  const f = 520 + n * 140;
  tone({ f: f * 2.01, f2: f * 1.6, type: "sine", dur: 0.06, g: 0.05, attack: 0.001 });
  tone({ f, f2: f * 0.94, type: "triangle", at: 0.003, dur: 0.16, g: 0.09 });
  noise({ dur: 0.03, g: 0.03, filter: { type: "highpass", f: 3200 } });
}

/** One wave of bursts at `at` seconds. More cells → a thicker pop. */
function pop(at: number, wave: number, cells: number) {
  const f = 190 * Math.pow(1.06, Math.min(wave, 18));
  const g = Math.min(0.2, 0.09 + cells * 0.012);
  tone({ f: f * 3.2, f2: f * 1.1, type: "sine", at, dur: 0.09, g: g * 0.55, attack: 0.001 });
  tone({ f, f2: f * 0.55, type: "sine", at: at + 0.005, dur: 0.22, g });
  noise({ at, dur: 0.06 + Math.min(cells, 12) * 0.004, g: 0.04 + Math.min(cells, 12) * 0.004, filter: { type: "bandpass", f: 1400 + wave * 60, f2: 500, q: 1.1 } });
}

export const chainSfx = makeBank<ChainSfxName>({
  place1: () => tap(1),
  place2: () => tap(2),
  place3: () => tap(3),

  /** cursor sliding to a new cell */
  tick() {
    tone({ f: 1320, type: "sine", dur: 0.016, g: 0.024, attack: 0.001 });
  },

  /** someone's last orb just changed colour — three glass notes falling */
  knockout() {
    [740, 587.3, 440].forEach((f, i) =>
      tone({ f, f2: f * 0.985, type: "triangle", at: i * 0.11, dur: 0.3, g: 0.06 })
    );
    tone({ f: 110, f2: 70, type: "sine", at: 0.05, dur: 0.6, g: 0.08 });
  },

  /** last one standing — a wide bloom */
  win() {
    [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) =>
      tone({ f, type: "triangle", at: i * 0.07, dur: 0.5, g: 0.06 })
    );
    tone({ f: 1046.5, type: "sine", at: 0.4, dur: 0.9, g: 0.045 });
    tone({ f: 65.4, type: "sine", at: 0.05, dur: 1.1, g: 0.1 });
    noise({ at: 0.35, dur: 0.5, g: 0.02, filter: { type: "highpass", f: 5000 } });
  },

  /** your move */
  yourTurn() {
    tone({ f: 987.8, type: "sine", dur: 0.09, g: 0.055 });
    tone({ f: 1480, type: "sine", at: 0.075, dur: 0.24, g: 0.045 });
  },

  /** clock ran out, or somebody walked */
  thud() {
    tone({ f: 96, f2: 48, type: "sine", dur: 0.3, g: 0.16 });
    noise({ dur: 0.14, g: 0.05, filter: { type: "lowpass", f: 480, f2: 110 } });
  },
});

/** Schedule the pops for a recorded cascade, in step with the board replay.
    Mute-aware and exception-safe, like the bank. */
export function playCascade(waves: number[][]) {
  if (waves.length === 0) return;
  const tl = cascadeTimeline(waves.length);
  guarded(() => waves.forEach((w, k) => pop(tl.starts[k] / 1000, k, w.length)));
}

/**
 * Play everything that happened between two views. Returns the ms after
 * which the board has finished replaying the newest cascade (0 if none), so
 * callers can hold knockout / win effects until the last orb has landed.
 */
export function playChainDiff(prev: ChainView | null, next: ChainView, youId: string): number {
  if (!prev) return 0;
  const restarted = next.startedAt !== prev.startedAt;
  const lastSeen = restarted || prev.log.length === 0 ? 0 : prev.log[prev.log.length - 1].i;
  const fresh = next.log.filter((l) => l.i > lastSeen);

  const newMove =
    next.lastMove && (restarted || !prev.lastMove || prev.lastMove.n !== next.lastMove.n) ? next.lastMove : null;
  const cascadeEnd = newMove && newMove.waves.length ? cascadeTimeline(newMove.waves.length).end : 0;

  const played = new Set<string>();
  const once = (key: string, fn: () => void) => {
    if (played.has(key)) return;
    played.add(key);
    fn();
  };

  for (const l of fresh) {
    switch (l.kind) {
      case "place": {
        if (!newMove) break;
        const cell = next.board[newMove.row * next.cols + newMove.col];
        // the cell may have emptied itself in the cascade — the tap is for the orb going in
        const count = newMove.waves.length ? 1 : Math.max(1, Math.min(3, cell.n));
        once("place", () => chainSfx(`place${count}` as ChainSfxName));
        if (newMove.waves.length) once("cascade", () => playCascade(newMove.waves));
        break;
      }
      case "timeout":
      case "left":
        once("thud", () => chainSfx("thud"));
        break;
      case "eliminated":
        once("knockout", () => window.setTimeout(() => chainSfx("knockout"), cascadeEnd + 40));
        break;
      case "win":
        once("win", () =>
          window.setTimeout(() => chainSfx(next.winBy === "forfeit" ? "thud" : "win"), cascadeEnd + 120)
        );
        break;
    }
  }

  const becameYourTurn =
    next.phase === "play" &&
    next.turn === youId &&
    (prev.turn !== youId || prev.phase !== "play" || restarted);
  if (becameYourTurn) {
    window.setTimeout(() => {
      chainSfx("yourTurn");
      try {
        navigator.vibrate?.(40);
      } catch {}
    }, cascadeEnd);
  }

  return cascadeEnd;
}
