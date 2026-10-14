"use client";

/* The final tally and the rules — both written on a torn-out notebook page. */

import { motion } from "framer-motion";
import type { DotsView } from "@/lib/games/dots/types";
import type { PartyView } from "@/lib/party/types";
import { hand } from "./font";
import { inkOf, PAPER, SWIFT } from "./palette";

const INK_TEXT = "#23262f";
const INK_SOFT = "rgba(35,38,47,0.6)";

const RULED = {
  background: `${PAPER} repeating-linear-gradient(180deg, transparent 0 27px, rgba(80,130,200,0.22) 27px 28px)`,
  boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
};

export function GameOverCard({ v, party, youId, isHost, playAgain, exitToLobby }: { v: DotsView; party: PartyView; youId: string; isHost: boolean; playAgain: () => void; exitToLobby: () => void }) {
  const winner = v.players.find((p) => p.id === v.winner) ?? null;
  const tallies = party.tallies.dots ?? {};
  const order = [...v.players].sort((a, b) => (a.left !== b.left ? (a.left ? 1 : -1) : b.score - a.score));
  const headline = !winner ? "A dead heat" : winner.id === youId ? "You win!" : `${winner.name} wins`;
  const sub = !winner ? "Level on boxes — nobody takes the page." : v.winBy === "forfeit" ? "Everyone else put their pens down." : `${winner.score} of ${v.w * v.h} boxes.`;
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, delay: 0.5 }} style={{ background: "rgba(10,8,6,0.55)", backdropFilter: "blur(3px)" }}>
      <motion.div className="w-full max-w-sm -rotate-1 rounded-md px-6 pb-6 pt-5" style={RULED} initial={{ y: 30, rotate: -4, opacity: 0 }} animate={{ y: 0, rotate: -1, opacity: 1 }} transition={{ delay: 0.6, type: "spring", stiffness: 240, damping: 22, ease: SWIFT }}>
        <h2 className={`${hand.className} text-[34px] font-bold leading-tight`} style={{ color: winner ? inkOf(winner.seat) : INK_TEXT }}>
          {headline}
        </h2>
        <p className={`${hand.className} text-[16px]`} style={{ color: INK_SOFT }}>
          {sub}
        </p>
        <div className="mt-3 space-y-1">
          {order.map((p) => (
            <div key={p.id} className={`${hand.className} flex items-baseline gap-3 text-[19px]`} style={{ color: inkOf(p.seat), opacity: p.left ? 0.5 : 1 }}>
              <span className={`min-w-0 flex-1 truncate ${p.left ? "line-through" : ""}`}>
                {p.name}
                {p.id === youId ? " (you)" : ""}
              </span>
              {(tallies[p.id] ?? 0) > 0 && <span className="text-[14px]">★{tallies[p.id]}</span>}
              <span className="font-bold tabular-nums">{p.score}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          {isHost ? (
            <>
              <button type="button" onClick={playAgain} className={`${hand.className} rounded-lg px-4 py-2 text-[17px] font-bold`} style={{ background: INK_TEXT, color: PAPER }}>
                New page
              </button>
              <button type="button" onClick={exitToLobby} className={`${hand.className} rounded-lg px-4 py-2 text-[17px]`} style={{ color: INK_TEXT, border: `1px solid rgba(35,38,47,0.3)` }}>
                Lobby
              </button>
            </>
          ) : (
            <span className={`${hand.className} text-[16px]`} style={{ color: INK_SOFT }}>
              Waiting for the host…
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function DotsRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(10,8,6,0.6)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className={`${hand.className} max-h-[86dvh] w-full max-w-md overflow-y-auto rounded-md px-6 pb-6 pt-5`} style={{ ...RULED, color: INK_TEXT }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-[28px] font-bold leading-tight">How to play</h2>
          <button type="button" onClick={onClose} aria-label="Close rules" className="text-[20px]" style={{ color: INK_SOFT }}>
            ✕
          </button>
        </div>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[17px] leading-snug">
          <li>The host sets up the page — how many boxes across and down, from 2×2 up to 12×12 — then opens it.</li>
          <li>Take turns drawing one line between two neighbouring dots.</li>
          <li>Draw the fourth side of a box and it&apos;s yours: your initial goes in, and you draw again.</li>
          <li>When every line is drawn, most boxes wins. Level scores are a dead heat.</li>
          <li>Thirty seconds a line — run out and a line is drawn for you.</li>
        </ol>
        <p className="mt-4 text-[15px]" style={{ color: INK_SOFT }}>
          Tip: avoid drawing the third side of a box — the next player just takes it, and maybe a whole chain after it.
        </p>
      </div>
    </div>
  );
}
