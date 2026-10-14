"use client";

/* The notebook page. One SVG: blue quad ruling with the dots on its
   intersections, every drawn line in its player's ink with a faint hand-drawn
   bow, claimed boxes hatched in that ink and initialled. On your turn, every
   undrawn line has a generous invisible target; hover one and it shows in
   dashed ink, tap it and the pen draws it. */

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { LastLine, Orient } from "@/lib/games/dots/types";
import { hand } from "./font";
import { inkOf, MARGIN, PENCIL, RULE, RULE_MAJOR } from "./palette";

const U = 10; // dot spacing
const M = 7; // margin around the dots

/** Deterministic little wobble per line, so the page looks hand-drawn. */
function bow(o: Orient, r: number, c: number): number {
  let h = (Math.imul(r + 31, 0x27d4eb2d) ^ Math.imul(c + 17, 0x165667b1) ^ (o === "h" ? 0x5bd1e995 : 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return (((h >>> 8) % 1000) / 1000 - 0.5) * 0.9;
}

function linePath(o: Orient, r: number, c: number): string {
  const x1 = c * U;
  const y1 = r * U;
  const x2 = o === "h" ? x1 + U : x1;
  const y2 = o === "h" ? y1 : y1 + U;
  const b = bow(o, r, c);
  const mx = (x1 + x2) / 2 + (o === "v" ? b : 0);
  const my = (y1 + y2) / 2 + (o === "h" ? b : 0);
  return `M${x1} ${y1}Q${mx.toFixed(2)} ${my.toFixed(2)} ${x2} ${y2}`;
}

export interface PageProps {
  w: number;
  h: number;
  hLines: number[];
  vLines: number[];
  boxes: number[];
  /** initials by seat */
  initials: string[];
  last: LastLine | null;
  /** your seat, when you may draw */
  drawAs: number | null;
  onLine?: (o: Orient, r: number, c: number) => void;
}

export function Page({ w, h, hLines, vLines, boxes, initials, last, drawAs, onLine }: PageProps) {
  const [hover, setHover] = useState<string | null>(null);
  // bigger pages are drawn smaller, so their dots and ink get a touch bolder
  const dense = Math.max(0, Math.max(w, h) - 5);
  const dotR = 0.95 + dense * 0.045;
  const inkW = 1.15 + dense * 0.05;
  const vb = `${-M} ${-M} ${w * U + 2 * M} ${h * U + 2 * M}`;

  const ruling = useMemo(() => {
    const minor: string[] = [];
    const major: string[] = [];
    for (let x = -M + ((M % (U / 2)) || 0); x <= w * U + M; x += U / 2) {
      const onDot = Math.abs(x / U - Math.round(x / U)) < 1e-6;
      (onDot ? major : minor).push(`M${x} ${-M}V${h * U + M}`);
    }
    for (let y = -M + ((M % (U / 2)) || 0); y <= h * U + M; y += U / 2) {
      const onDot = Math.abs(y / U - Math.round(y / U)) < 1e-6;
      (onDot ? major : minor).push(`M${-M} ${y}H${w * U + M}`);
    }
    return { minor: minor.join(""), major: major.join("") };
  }, [w, h]);

  const lines: { o: Orient; r: number; c: number; seat: number }[] = [];
  for (let r = 0; r <= h; r++) for (let c = 0; c < w; c++) lines.push({ o: "h", r, c, seat: hLines[r * w + c] ?? -1 });
  for (let r = 0; r < h; r++) for (let c = 0; c <= w; c++) lines.push({ o: "v", r, c, seat: vLines[r * (w + 1) + c] ?? -1 });

  const isLast = (o: Orient, r: number, c: number) => !!last && last.o === o && last.r === r && last.c === c;
  const seats = [...new Set(boxes.filter((b) => b >= 0))];

  return (
    <svg viewBox={vb} className="block h-full w-full touch-manipulation select-none" aria-label="Dots and Boxes page">
      <defs>
        {seats.map((s) => (
          <pattern key={s} id={`dots-hatch-${s}`} width={1.6} height={1.6} patternUnits="userSpaceOnUse" patternTransform={`rotate(${s % 2 ? -45 : 45})`}>
            <line x1={0} y1={0} x2={0} y2={1.6} stroke={inkOf(s)} strokeWidth={0.5} />
          </pattern>
        ))}
      </defs>

      {/* ruling */}
      <path d={ruling.minor} stroke={RULE} strokeWidth={0.12} />
      <path d={ruling.major} stroke={RULE_MAJOR} strokeWidth={0.16} />
      <path d={`M${-M + 3} ${-M}V${h * U + M}`} stroke={MARGIN} strokeWidth={0.22} />

      {/* claimed boxes */}
      {boxes.map((b, i) => {
        if (b < 0) return null;
        const r = Math.floor(i / w);
        const c = i % w;
        const fresh = !!last && last.boxes.includes(i);
        const tilt = (bow("h", r, c) * 14).toFixed(1);
        return (
          <motion.g
            key={`b${i}-${b}`}
            initial={fresh ? { opacity: 0, scale: 0.6 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: fresh ? 0.22 : 0, type: "spring", stiffness: 420, damping: 20 }}
            style={{ transformOrigin: `${c * U + U / 2}px ${r * U + U / 2}px`, transformBox: "view-box" }}
          >
            <rect x={c * U + 0.9} y={r * U + 0.9} width={U - 1.8} height={U - 1.8} fill={`url(#dots-hatch-${b})`} opacity={0.55} />
            <text
              x={c * U + U / 2}
              y={r * U + U / 2 + 2.1}
              textAnchor="middle"
              fontSize={5.6}
              fontWeight={700}
              fill={inkOf(b)}
              className={hand.className}
              transform={`rotate(${tilt} ${c * U + U / 2} ${r * U + U / 2})`}
            >
              {initials[b] ?? "?"}
            </text>
          </motion.g>
        );
      })}

      {/* drawn lines */}
      {lines
        .filter((l) => l.seat >= 0)
        .map((l) => {
          const fresh = isLast(l.o, l.r, l.c);
          return (
            <motion.path
              key={`${l.o}${l.r}-${l.c}`}
              d={linePath(l.o, l.r, l.c)}
              fill="none"
              stroke={inkOf(l.seat)}
              strokeWidth={inkW}
              strokeLinecap="round"
              initial={fresh ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            />
          );
        })}

      {/* dots, drawn over the line ends */}
      {Array.from({ length: (h + 1) * (w + 1) }, (_, i) => {
        const r = Math.floor(i / (w + 1));
        const c = i % (w + 1);
        return <circle key={`d${i}`} cx={c * U} cy={r * U} r={dotR} fill={PENCIL} />;
      })}

      {/* your pen: hover preview and the targets */}
      {drawAs !== null && (
        <g>
          <AnimatePresence>
            {hover && (() => {
              const [o, rs, cs] = hover.split(":");
              return (
                <motion.path
                  key={hover}
                  d={linePath(o as Orient, Number(rs), Number(cs))}
                  fill="none"
                  stroke={inkOf(drawAs)}
                  strokeWidth={inkW * 0.9}
                  strokeLinecap="round"
                  strokeDasharray="1.4 1.2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.75 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.08 }}
                  style={{ pointerEvents: "none" }}
                />
              );
            })()}
          </AnimatePresence>
          {lines
            .filter((l) => l.seat < 0)
            .map((l) => {
              const key = `${l.o}:${l.r}:${l.c}`;
              const x = l.c * U;
              const y = l.r * U;
              // a diamond between the two dots: never ambiguous with the neighbours
              const pts =
                l.o === "h"
                  ? `${x + 1.2},${y} ${x + U / 2},${y - U / 2 + 0.6} ${x + U - 1.2},${y} ${x + U / 2},${y + U / 2 - 0.6}`
                  : `${x},${y + 1.2} ${x + U / 2 - 0.6},${y + U / 2} ${x},${y + U - 1.2} ${x - U / 2 + 0.6},${y + U / 2}`;
              return (
                <polygon
                  key={key}
                  points={pts}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHover(key)}
                  onPointerLeave={() => setHover((h0) => (h0 === key ? null : h0))}
                  onClick={() => {
                    setHover(null);
                    onLine?.(l.o, l.r, l.c);
                  }}
                />
              );
            })}
        </g>
      )}
    </svg>
  );
}

/** The page's aspect (width / height), margins included. */
export const pageAspect = (w: number, h: number) => (w * U + 2 * M) / (h * U + 2 * M);
