/* Battleship sound bank — sonar ops room: pings, fire whooshes, depth thumps
   and a two-tone klaxon. Built on the shared synth core; triggered by log
   diffing (the same prev-view pattern as the other games). */

import { makeBank, noise, tone } from "@/lib/client/synthCore";
import type { BattleshipView } from "@/lib/games/battleship/types";

export type BSSfxName =
  | "ping"
  | "fire"
  | "splash"
  | "hit"
  | "sunk"
  | "place"
  | "ready"
  | "alarm"
  | "victory"
  | "defeat";

export const bsSfx = makeBank<BSSfxName>({
  /** sonar ping with a faint echo — "your turn" */
  ping() {
    tone({ f: 1240, f2: 1060, type: "sine", dur: 0.5, g: 0.07, attack: 0.003 });
    tone({ f: 1240, f2: 1020, type: "sine", at: 0.45, dur: 0.7, g: 0.022 });
  },
  /** deck gun whoosh */
  fire() {
    noise({ dur: 0.26, g: 0.13, filter: { type: "bandpass", f: 2800, f2: 380, q: 0.9 } });
    tone({ f: 150, f2: 55, type: "sine", dur: 0.2, g: 0.15 });
  },
  /** the shell finds only water */
  splash() {
    noise({ at: 0.02, dur: 0.42, g: 0.1, filter: { type: "lowpass", f: 1500, f2: 260 } });
    tone({ f: 310, f2: 85, type: "sine", at: 0.03, dur: 0.3, g: 0.055 });
  },
  /** explosion thump */
  hit() {
    tone({ f: 92, f2: 32, type: "sine", dur: 0.6, g: 0.3 });
    noise({ dur: 0.3, g: 0.17, filter: { type: "lowpass", f: 900, f2: 110 } });
    noise({ at: 0.015, dur: 0.09, g: 0.09, filter: { type: "highpass", f: 2500 } });
  },
  /** deep rumble + two-tone klaxon — a ship goes under */
  sunk() {
    tone({ f: 68, f2: 24, type: "sine", dur: 1.15, g: 0.33 });
    noise({ dur: 0.75, g: 0.19, filter: { type: "lowpass", f: 480, f2: 55 } });
    tone({ f: 420, type: "square", at: 0.3, dur: 0.16, g: 0.04 });
    tone({ f: 296, type: "square", at: 0.5, dur: 0.16, g: 0.04 });
    tone({ f: 420, type: "square", at: 0.7, dur: 0.16, g: 0.035 });
    tone({ f: 296, type: "square", at: 0.9, dur: 0.22, g: 0.03 });
  },
  /** a hull snaps onto the grid */
  place() {
    tone({ f: 2100, type: "square", dur: 0.028, g: 0.05 });
    tone({ f: 680, type: "triangle", at: 0.02, dur: 0.055, g: 0.06 });
  },
  /** fleet locked in */
  ready() {
    tone({ f: 880, type: "sine", dur: 0.09, g: 0.07 });
    tone({ f: 1318.5, type: "sine", at: 0.08, dur: 0.16, g: 0.06 });
  },
  /** brief warning blip — timeouts, someone leaving */
  alarm() {
    tone({ f: 340, type: "square", dur: 0.12, g: 0.04 });
    tone({ f: 248, type: "square", at: 0.14, dur: 0.15, g: 0.04 });
  },
  /** victory horn over a long low swell */
  victory() {
    [392, 523.3, 659.3, 784].forEach((f, i) =>
      tone({ f, type: "sawtooth", at: i * 0.12, dur: 0.34, g: 0.05 })
    );
    tone({ f: 98, type: "sine", dur: 1.3, g: 0.12 });
    tone({ f: 1046.5, type: "triangle", at: 0.52, dur: 0.55, g: 0.06 });
  },
  /** descending drone — your fleet is on the seabed */
  defeat() {
    tone({ f: 220, f2: 178, type: "sawtooth", dur: 0.8, g: 0.05 });
    tone({ f: 165, f2: 128, type: "sawtooth", at: 0.5, dur: 1.0, g: 0.05 });
    tone({ f: 55, f2: 28, type: "sine", dur: 1.7, g: 0.2 });
  },
});

/** Play sounds for everything that happened between two views. */
export function playBattleshipDiff(
  prev: BattleshipView | null,
  next: BattleshipView,
  youId: string
) {
  if (!prev) return;
  const lastSeen = prev.log.length ? prev.log[prev.log.length - 1].i : 0;
  const fresh = next.log.filter((l) => l.i > lastSeen);
  const isPlayer = next.players.some((p) => p.id === youId);
  const myName = next.players.find((p) => p.id === youId)?.name;

  const played = new Set<BSSfxName>();
  const play = (n: BSSfxName) => {
    if (played.has(n)) return;
    bsSfx(n);
    played.add(n);
  };

  for (const l of fresh) {
    switch (l.kind) {
      case "shot":
        if (l.hit) {
          play("hit");
        } else {
          if (l.actor === myName) play("fire");
          play("splash");
        }
        break;
      case "sunk":
        play("sunk");
        break;
      case "place_ready":
        play("ready");
        break;
      case "battle_start":
        play("ping");
        break;
      case "timeout":
      case "left":
        play("alarm");
        break;
      case "win":
        play(!isPlayer || next.winner === youId ? "victory" : "defeat");
        break;
    }
  }

  // your own placements arrive silently in the view — click on fleet changes
  if (
    next.phase === "placement" &&
    prev.yourFleet &&
    next.yourFleet &&
    JSON.stringify(prev.yourFleet) !== JSON.stringify(next.yourFleet)
  ) {
    play("place");
  }

  const becameMyTurn =
    next.phase === "battle" &&
    next.turn === youId &&
    (prev.turn !== youId || prev.phase !== "battle");
  if (becameMyTurn) {
    play("ping");
    try {
      navigator.vibrate?.(50);
    } catch {}
  }
}
