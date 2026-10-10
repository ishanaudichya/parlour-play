/* Game-picker poster for STACCS — a little isometric tower on the cobalt
   table: a column of hearts, a five stacked onto a side, a wild turning the
   STACC, all drawn with the same cubes as the game. */

import type { CSSProperties } from "react";
import { Cube } from "./Cube";
import { pixel } from "./font";

const S = Math.sqrt(3) / 2;
const at = (i: number, j: number, rot = 0) => `translate(${((i - j) * S).toFixed(3)} ${((i + j) / 2).toFixed(3)}) rotate(${rot * 60})`;

const STACK: { i: number; j: number; card: Parameters<typeof Cube>[0]["card"]; called?: "S" | "H" | "C" | "D"; rot?: number }[] = [
  { i: 0, j: 0, card: { id: "a", suit: "H", rank: 3 } },
  { i: 1, j: 0, card: { id: "b", suit: "S", rank: 3 } },
  { i: -1, j: -1, card: { id: "c", suit: "H", rank: 5 } },
  { i: 0, j: -1, card: { id: "d", suit: "C", rank: 5 } },
  { i: -2, j: -2, card: { id: "e", suit: "H", rank: "A" } },
  { i: -3, j: -3, card: { id: "f", suit: "H", rank: "W" }, called: "C", rot: 1 },
  { i: -3, j: -4, card: { id: "g", suit: "C", rank: 10 }, rot: 1 },
];

export function StaccsPoster() {
  return (
    <div
      className="relative flex h-full min-h-[190px] w-full flex-col items-center justify-end overflow-hidden rounded-lg border border-[#3d7bff]/50"
      style={{ background: "radial-gradient(90% 80% at 50% 10%, #2a57d6 0%, #13308f 60%, #0b1a4a 100%)", ["--staccs-pixel" as string]: pixel.style.fontFamily } as CSSProperties}
    >
      <svg viewBox="-3.4 -4.6 6.8 6" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
        {STACK.map((c) => (
          <g key={c.card === "back" ? "x" : c.card.id} transform={at(c.i, c.j, c.rot ?? 0)}>
            <Cube card={c.card} called={c.called} />
          </g>
        ))}
      </svg>
      <div className="relative mb-3 rounded-md px-2 text-center" style={{ background: "rgba(8,22,80,0.55)" }}>
        <div className={`${pixel.className} text-[22px] leading-none`} style={{ color: "#ffffff", textShadow: "0 3px 0 #0a1f6b" }}>
          STACCS
        </div>
      </div>
    </div>
  );
}
