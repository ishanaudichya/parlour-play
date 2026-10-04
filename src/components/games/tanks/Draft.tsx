"use client";

/* The draft — its own screen, before the battlefield appears. A pool of
   weapons is laid out; the tanks take turns, snake order, claiming one at a
   time until every arsenal is full. */

import { AnimatePresence, motion } from "framer-motion";
import { ARSENAL, PICK_MS, type TanksView } from "@/lib/games/tanks/types";
import { WEAPONS, type WeaponId } from "@/lib/games/tanks/weapons";
import { stencil } from "./font";
import { WeaponIcon } from "./icons";
import { LINE, SURFACE, SURFACE_2, TANK, TEXT, TEXT_2, TEXT_3 } from "./palette";

function Card({ id, canPick, onPick }: { id: WeaponId; canPick: boolean; onPick: (w: WeaponId) => void }) {
  const m = WEAPONS[id];
  return (
    <motion.button
      layout
      type="button"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ duration: 0.2 }}
      disabled={!canPick}
      onClick={() => onPick(id)}
      className={`flex min-w-0 flex-col items-start gap-2 rounded-xl p-2.5 text-left transition-colors sm:flex-row sm:gap-3 sm:p-3 ${canPick ? "hover:bg-white/[0.05]" : "cursor-default"}`}
      style={{ background: SURFACE_2, border: `1px solid ${LINE}` }}
    >
      <WeaponIcon id={id} size={34} />
      <span className="min-w-0 w-full flex-1">
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="truncate text-[13px] font-semibold" style={{ color: TEXT }}>
            {m.name}
          </span>
          <span className="flex shrink-0 gap-[3px]" title={`Punch ${m.punch}/5`}>
            {Array.from({ length: 5 }, (_, k) => (
              <span key={k} className="h-1.5 w-1.5 rounded-full" style={{ background: k < m.punch ? m.hue : "rgba(255,255,255,0.12)" }} />
            ))}
          </span>
        </span>
        <span className="mt-1 line-clamp-3 block text-[11px] leading-snug sm:mt-0.5 sm:text-[11.5px]" style={{ color: TEXT_2 }}>
          {m.blurb}
        </span>
      </span>
    </motion.button>
  );
}

export function DraftScreen({ v, youId, canPick, onPick, nowEst }: { v: TanksView; youId: string; canPick: boolean; onPick: (w: WeaponId) => void; nowEst: number }) {
  const n = v.players.length;
  const k = ARSENAL[n] ?? 6;
  const picker = v.players.find((p) => p.id === v.turn) ?? null;
  const round = Math.min(k, Math.floor(v.draftIdx / n) + 1);
  const left = v.deadline ? Math.max(0, v.deadline - nowEst) : 0;
  const frac = Math.min(1, left / PICK_MS);
  const accent = picker ? TANK[picker.color].base : TEXT;

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-10 pt-4 sm:px-5">
      <div className="text-center">
        <div className="text-[11px] font-medium uppercase tracking-[0.2em]" style={{ color: TEXT_3 }}>
          Round {round} of {k}
        </div>
        <h2 className={`${stencil.className} mt-1 text-[26px] sm:text-[30px]`} style={{ color: TEXT }}>
          Draft your arsenal
        </h2>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${v.draftIdx}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="mt-1 text-[14px] font-semibold" style={{ color: canPick ? accent : TEXT_2 }}>
            {canPick ? "Your pick" : picker ? `${picker.name} is picking…` : "…"}
          </motion.div>
        </AnimatePresence>
        <div className="mx-auto mt-2 h-[3px] w-40 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: accent, transition: "width 200ms linear" }} />
        </div>
      </div>

      {/* each player's rack */}
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {v.players.map((p) => {
          const P = TANK[p.color];
          const active = p.id === v.turn;
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: SURFACE, border: `1px solid ${active ? P.base : LINE}`, opacity: p.left ? 0.45 : 1, transition: "border-color 200ms" }}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: P.base }} />
              <span className="w-14 shrink-0 truncate text-[13px] font-semibold sm:w-20" style={{ color: TEXT }}>
                {p.id === youId ? "You" : p.name}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {p.drafted.map((w) => (
                  <motion.span key={w} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 26 }} title={WEAPONS[w].name}>
                    <WeaponIcon id={w} size={20} />
                  </motion.span>
                ))}
                {Array.from({ length: Math.max(0, k - p.drafted.length) }, (_, i) => (
                  <span key={`e${i}`} className="h-5 w-5 rounded-full" style={{ border: `1px dashed ${LINE}` }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {v.pool.map((id) => (
            <Card key={id} id={id} canPick={canPick} onPick={onPick} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
