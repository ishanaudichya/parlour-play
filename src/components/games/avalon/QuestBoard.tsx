"use client";

/* The quest board: five stone medallions sized by team-size, a grail seal for
   success, a cracked crimson seal for failure, a "II" badge on the two-fail
   quest, and the five-token rejection track (fifth slot skull-marked). */

import { AnimatePresence, motion } from "framer-motion";
import { Icons } from "@/components/ui";
import type { AvalonQuest } from "@/lib/games/avalon/types";
import { uncial } from "./font";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function GrailSeal() {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
      <circle cx="20" cy="20" r="19" fill="#274d74" stroke="#8fb8de" strokeWidth="1.6" />
      <circle cx="20" cy="20" r="15.5" fill="none" stroke="#cfe4f7" strokeWidth="0.6" opacity="0.6" />
      <path d="M13 12 C13 20 16 23 20 23.8 C24 23 27 20 27 12 Z" fill="#cfe4f7" stroke="#8fb8de" strokeWidth="0.8" />
      <path d="M12.4 12 H27.6" stroke="#dfe8f2" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M20 23.8 V28" stroke="#8fb8de" strokeWidth="1.6" />
      <path d="M15 30 Q20 27 25 30 L25 31.6 H15 Z" fill="#cfe4f7" stroke="#8fb8de" strokeWidth="0.6" />
    </svg>
  );
}

function CrackedSeal() {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
      <circle cx="20" cy="20" r="19" fill="#571c28" stroke="#a1273a" strokeWidth="1.6" />
      <circle cx="20" cy="20" r="15.5" fill="none" stroke="#e0556d" strokeWidth="0.6" opacity="0.5" />
      <path
        d="M20 4 L18 13 L23 17 L16 22 L22 27 L18 36"
        fill="none"
        stroke="#e0556d"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 12 L14 16 M31 27 L26 24" stroke="#e0556d" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function Medallion({ quest, index, current, over }: { quest: AvalonQuest; index: number; current: number; over: boolean }) {
  const active = !over && index + 1 === current && quest.outcome === "pending";
  const dia = 46 + quest.size * 5;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative grid place-items-center rounded-full transition-shadow duration-500"
        style={{
          width: dia,
          height: dia,
          background: "radial-gradient(circle at 34% 28%, #2c3d59, #10192c 72%)",
          border: `2px solid ${active ? "#8fb8de" : "#3c4f6b"}`,
          boxShadow: active ? "0 0 22px rgba(143,184,222,.3), inset 0 0 14px rgba(0,0,0,.6)" : "inset 0 0 14px rgba(0,0,0,.6)",
        }}
        aria-label={`Quest ${index + 1}: party of ${quest.size}${quest.failsRequired === 2 ? ", two fails required" : ""}${
          quest.outcome !== "pending" ? `, ${quest.outcome}` : ""
        }`}
      >
        <span className={`${uncial.className} text-[#cfe4f7]`} style={{ fontSize: dia * 0.38 }}>
          {quest.size}
        </span>
        {quest.failsRequired === 2 ? (
          <span
            className={`${uncial.className} absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-[#d6c389]/70 bg-[#1a2438] text-[9px] text-[#d6c389]`}
            title="This quest fails only on two Fail cards"
          >
            II
          </span>
        ) : null}
        <AnimatePresence>
          {quest.outcome !== "pending" ? (
            <motion.div
              className="absolute inset-[-3px]"
              initial={{ scale: 1.7, opacity: 0, y: -12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE }}
            >
              {quest.outcome === "success" ? <GrailSeal /> : <CrackedSeal />}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="h-3 text-[8px] uppercase tracking-[0.14em] text-[#5f7189] tabular-nums">
        {quest.outcome === "fail"
          ? `${quest.fails} fail${quest.fails === 1 ? "" : "s"}`
          : quest.outcome === "success" && quest.fails > 0
            ? `${quest.fails} fail`
            : ""}
      </div>
    </div>
  );
}

export function QuestBoard({
  quests,
  current,
  rejects,
  over,
}: {
  quests: AvalonQuest[];
  current: number;
  rejects: number;
  over: boolean;
}) {
  return (
    <section
      className="relative border border-[#3c4f6b]/50 bg-[#0d1526]/70 px-3 pb-2.5 pt-3"
      aria-label="Quest board"
    >
      <div className="flex items-end justify-center gap-2.5 sm:gap-4">
        {quests.map((q, i) => (
          <Medallion key={i} quest={q} index={i} current={current} over={over} />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-center gap-2">
        <span className="text-[8px] uppercase tracking-[0.22em] text-[#5f7189]">Refusals</span>
        <div className="flex items-center gap-1.5" aria-label={`${rejects} of 5 rejections`}>
          {[0, 1, 2, 3, 4].map((i) => {
            const filled = i < rejects;
            return (
              <span
                key={i}
                className="grid h-[18px] w-[18px] place-items-center rounded-full border transition-colors duration-300"
                style={{
                  borderColor: filled ? "#e0556d" : "#3c4f6b",
                  background: filled ? "radial-gradient(circle at 35% 30%, #7e2231, #3a1020)" : "rgba(13,21,38,.8)",
                  boxShadow: filled ? "0 0 10px rgba(224,85,109,.35)" : "none",
                }}
              >
                {i === 4 ? (
                  <Icons.skull size={10} className={filled ? "text-[#e0556d]" : "text-[#3c4f6b]"} />
                ) : filled ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#e0556d]" />
                ) : null}
              </span>
            );
          })}
        </div>
        <span className="text-[8px] uppercase tracking-[0.22em] text-[#5f7189] tabular-nums">{rejects}/5</span>
      </div>
    </section>
  );
}
