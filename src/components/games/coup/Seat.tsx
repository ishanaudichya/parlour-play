"use client";

import { motion } from "framer-motion";
import { CardBack, CardFace } from "./CardArt";
import { CoinCount, Medallion } from "@/components/ui";
import type { ClientPlayer, CoupView } from "@/lib/games/coup/types";

export type SeatStatus = "acting" | "deciding" | "allowed" | "blocking" | "surrendering" | "exchanging" | null;

export function seatStatus(v: CoupView, p: ClientPlayer, responders: string[]): SeatStatus {
  if (v.phase !== "play") return null;
  if (v.lose?.player === p.id) return "surrendering";
  const pend = v.pending;
  if (!pend) return null;
  if (pend.stage === "exchange" && pend.actor === p.id) return "exchanging";
  if (pend.block?.blocker === p.id) return "blocking";
  if (responders.includes(p.id)) return "deciding";
  if (pend.passed.includes(p.id)) return "allowed";
  if (pend.actor === p.id) return "acting";
  return null;
}

const STATUS_STYLE: Record<Exclude<SeatStatus, null>, { text: string; cls: string }> = {
  acting: { text: "Acting", cls: "border-gold-500/60 text-gold-300 bg-ink-900" },
  deciding: { text: "Deciding…", cls: "border-parch-500/50 text-parch-300 bg-ink-900" },
  allowed: { text: "✓ Allowed", cls: "border-gold-700/60 text-parch-500 bg-ink-900" },
  blocking: { text: "Blocking", cls: "border-blood-500/70 text-blood-300 bg-blood-900" },
  surrendering: { text: "Surrendering…", cls: "border-blood-500/70 text-blood-300 bg-blood-900" },
  exchanging: { text: "Exchanging…", cls: "border-gold-500/60 text-gold-300 bg-ink-900" },
};

export function Seat({
  p,
  isTurn,
  wins,
  status,
  targetable,
  isTargetOfPending,
  onTarget,
}: {
  p: ClientPlayer;
  isTurn: boolean;
  wins: number;
  status: SeatStatus;
  targetable: boolean;
  isTargetOfPending: boolean;
  onTarget?: () => void;
}) {
  const dead = !p.alive;
  return (
    <motion.button
      layout
      type="button"
      disabled={!targetable}
      onClick={onTarget}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative w-[124px] select-none border p-2.5 pt-3 text-left transition-colors sm:w-[142px] rounded-md
        ${dead ? "border-ink-600/60 opacity-55" : "border-gold-500/25 bg-[#141019]/70"}
        ${isTurn && !dead ? "animate-ring-pulse" : ""}
        ${targetable ? "cursor-pointer animate-target-pulse hover:bg-blood-900/40" : "cursor-default"}
      `}
    >
      {/* status chip */}
      {(status || isTargetOfPending) && !dead && (
        <span
          className={`absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-[1px] text-[9px] font-semibold uppercase tracking-[0.14em] ${
            isTargetOfPending && !status
              ? "border-blood-500/70 text-blood-300 bg-blood-900"
              : STATUS_STYLE[status!]?.cls
          }`}
        >
          {isTargetOfPending && !status ? "Targeted" : STATUS_STYLE[status!]?.text}
        </span>
      )}

      <div className="flex items-center gap-2">
        <Medallion name={p.name} seat={p.seat} size={30} dim={dead} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className={`truncate text-[13px] font-semibold ${dead ? "text-parch-500 line-through" : "text-parch-100"}`}>
              {p.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CoinCount n={p.coins} />
            {wins > 0 && (
              <span className="text-[10px] font-semibold text-gold-600" title={`${wins} win${wins > 1 ? "s" : ""}`}>
                ♛{wins}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-center gap-1.5">
        {p.cards.map((c) => (
          <div key={c.id} className="relative w-[42px] sm:w-[48px]" style={{ perspective: 300 }}>
            <motion.div
              className="relative h-full w-full"
              initial={false}
              animate={{ rotateY: c.revealed ? 180 : 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformStyle: "preserve-3d" }}
            >
              <div style={{ backfaceVisibility: "hidden" }}>
                <CardBack className="h-auto w-full" />
              </div>
              <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                {c.revealed && c.ch && (
                  <div className="relative">
                    <CardFace ch={c.ch} className="h-auto w-full opacity-55 saturate-50" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="h-[1.5px] w-[130%] -rotate-45 bg-blood-500/80" />
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        ))}
      </div>

      {dead && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 border border-blood-500/60 bg-ink-950/80 px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.22em] text-blood-400">
            Eliminated
          </span>
        </span>
      )}
    </motion.button>
  );
}
