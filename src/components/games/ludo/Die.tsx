"use client";

/* The die — an ivory cube on a suede tray in a brass ring. When it's your
   roll the tray glows and the whole thing is a button; while a roll is in
   flight it tumbles and flashes faces before it settles. */

import { motion } from "framer-motion";
import { rozha } from "./font";
import { BRASS, BRASS_LIGHT, CREAM, MUTED, ROLL_MS } from "./paint";

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.24], [0.73, 0.24], [0.27, 0.5], [0.73, 0.5], [0.27, 0.76], [0.73, 0.76]],
};

export function DieFace({ value, size = 72 }: { value: number | null; size?: number }) {
  const S = 100;
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width={size} height={size} aria-label={value ? `die showing ${value}` : "die"}>
      <defs>
        <linearGradient id="ludo-die-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fffaf0" />
          <stop offset="55%" stopColor="#f1e6cf" />
          <stop offset="100%" stopColor="#d9c9a6" />
        </linearGradient>
      </defs>
      {/* the cube's thickness peeking out below */}
      <rect x={8} y={12} width={S - 16} height={S - 16} rx={18} fill="#a08a5e" />
      <rect x={6} y={6} width={S - 12} height={S - 12} rx={18} fill="url(#ludo-die-face)" stroke="#bba77e" strokeWidth={1.5} />
      <rect x={10} y={10} width={S - 20} height={S - 20} rx={15} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1.2} />
      {value
        ? PIPS[value].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x * S} cy={y * S + 1.2} r={8.6} fill="#000" opacity={0.18} />
              <circle cx={x * S} cy={y * S} r={8.2} fill="#231a12" />
              <circle cx={x * S - 2.4} cy={y * S - 2.6} r={2.4} fill="#fff" opacity={0.35} />
            </g>
          ))
        : null}
    </svg>
  );
}

export function DieTray({
  value,
  rolling,
  canRoll,
  onRoll,
  accent,
  caption,
}: {
  value: number | null;
  rolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
  /** the colour of whoever the die belongs to right now */
  accent: string;
  caption: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        type="button"
        disabled={!canRoll}
        onClick={onRoll}
        aria-label={canRoll ? "Roll the die" : "Die"}
        className="relative flex h-[132px] w-[132px] items-center justify-center rounded-full outline-none"
        style={{
          background: "radial-gradient(circle at 50% 40%, #3a2820 0%, #24170f 60%, #1b110b 100%)",
          boxShadow: `inset 0 6px 16px rgba(0,0,0,0.65), 0 0 0 3px ${BRASS}, 0 0 0 5px ${BRASS_LIGHT}33, 0 12px 30px rgba(0,0,0,0.55)${
            canRoll ? `, 0 0 34px ${accent}88` : ""
          }`,
          cursor: canRoll ? "pointer" : "default",
          transition: "box-shadow 400ms ease",
        }}
        whileTap={canRoll ? { scale: 0.95 } : undefined}
      >
        {canRoll && (
          <motion.span
            className="pointer-events-none absolute inset-[-7px] rounded-full"
            style={{ border: `2px solid ${accent}` }}
            animate={{ opacity: [0.25, 0.9, 0.25], scale: [1, 1.05, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <motion.div
          animate={
            rolling
              ? { rotate: [0, 150, 290, 360], scale: [1, 1.25, 0.94, 1], y: [0, -26, 6, 0] }
              : { rotate: 0, scale: 1, y: 0 }
          }
          transition={rolling ? { duration: ROLL_MS / 1000, ease: "easeOut", times: [0, 0.35, 0.78, 1] } : { duration: 0.2 }}
          style={{ filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.55))" }}
        >
          <DieFace value={value} size={76} />
        </motion.div>
      </motion.button>
      <div className="text-center">
        <div className={`${rozha.className} text-[15px] leading-none`} style={{ color: canRoll ? CREAM : MUTED }}>
          {caption}
        </div>
      </div>
    </div>
  );
}
