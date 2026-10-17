"use client";

/* The final standings and the rules — both painted on a cream signboard with
   an enamel border, like the back of a truck. */

import { motion } from "framer-motion";
import type { BluffView } from "@/lib/games/bluff/types";
import type { PartyView } from "@/lib/party/types";
import { paint } from "./font";
import { CREAM, enamelOf, GOLD, INK, lettering, MARIGOLD, PINK, SWIFT } from "./palette";

const INK_SOFT = "rgba(27,18,51,0.62)";
const BOARD = { background: CREAM, color: INK, border: `3px solid ${INK}`, boxShadow: `8px 8px 0 ${INK}, inset 0 0 0 4px ${PINK}, inset 0 0 0 6px ${GOLD}` };

export function GameOverCard({ v, party, youId, isHost, playAgain, exitToLobby }: { v: BluffView; party: PartyView; youId: string; isHost: boolean; playAgain: () => void; exitToLobby: () => void }) {
  const winner = v.players.find((p) => p.id === v.winner) ?? null;
  const tallies = party.tallies.bluff ?? {};
  const order = [...v.players].sort((a, b) => (a.left !== b.left ? (a.left ? 1 : -1) : a.id === v.winner ? -1 : b.id === v.winner ? 1 : a.count - b.count));
  const headline = !winner ? "Nobody wins" : winner.id === youId ? "You win!" : `${winner.name} wins!`;
  const sub = !winner ? "Everyone left the table." : v.winBy === "forfeit" ? "Everyone else got up and left." : "Hand empty, and nobody could prove a thing.";
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, delay: 0.6 }} style={{ background: "rgba(8,20,48,0.6)", backdropFilter: "blur(3px)" }}>
      <motion.div className="w-full max-w-sm rounded-2xl px-6 pb-6 pt-5" style={BOARD} initial={{ y: 30, rotate: -5, opacity: 0 }} animate={{ y: 0, rotate: -1.5, opacity: 1 }} transition={{ delay: 0.7, type: "spring", stiffness: 240, damping: 20, ease: SWIFT }}>
        <h2 className={`${paint.className} text-[38px] leading-tight`} style={{ color: winner ? enamelOf(winner.seat) : INK, textShadow: lettering(3) }}>
          {headline}
        </h2>
        <p className="text-[14px]" style={{ color: INK_SOFT }}>
          {sub}
        </p>
        <div className="mt-3 space-y-1.5">
          {order.map((p) => (
            <div key={p.id} className="flex items-center gap-3 text-[16px]" style={{ opacity: p.left ? 0.5 : 1 }}>
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: enamelOf(p.seat), boxShadow: `0 0 0 1.5px ${INK}` }} />
              <span className={`min-w-0 flex-1 truncate font-semibold ${p.left ? "line-through" : ""}`}>
                {p.name}
                {p.id === youId ? " (you)" : ""}
              </span>
              {(tallies[p.id] ?? 0) > 0 && (
                <span className="text-[13px]" style={{ color: INK_SOFT }}>
                  ★{tallies[p.id]}
                </span>
              )}
              <span className="text-[13px] tabular-nums" style={{ color: INK_SOFT }}>
                {p.id === v.winner ? "empty hand" : p.left ? "left" : `${p.count} card${p.count === 1 ? "" : "s"}`}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          {isHost ? (
            <>
              <button type="button" onClick={playAgain} className={`${paint.className} rounded-xl px-4 py-2 text-[18px]`} style={{ background: MARIGOLD, color: INK, border: `2.5px solid ${INK}`, boxShadow: `3px 3px 0 ${INK}` }}>
                Deal again
              </button>
              <button type="button" onClick={exitToLobby} className="rounded-xl px-4 py-2 text-[15px] font-semibold" style={{ color: INK, border: `2px solid ${INK}` }}>
                Lobby
              </button>
            </>
          ) : (
            <span className="text-[14px]" style={{ color: INK_SOFT }}>
              Waiting for the host…
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function BluffRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(8,20,48,0.65)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="max-h-[86dvh] w-full max-w-md overflow-y-auto rounded-2xl px-6 pb-6 pt-5" style={BOARD} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className={`${paint.className} text-[30px] leading-tight`} style={{ color: MARIGOLD, textShadow: lettering(2) }}>
            How to play
          </h2>
          <button type="button" onClick={onClose} aria-label="Close rules" className="text-[20px]" style={{ color: INK_SOFT }}>
            ✕
          </button>
        </div>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[15px] leading-snug">
          <li>The whole pack is dealt out. Get rid of every card in your hand to win.</li>
          <li>
            The leader puts down <b>one to four cards</b> face down and names a rank — &ldquo;three Kings&rdquo;. They can be anything: lying is allowed.
          </li>
          <li>Going round, everyone else must put down more of <b>that same rank</b> — or pass. Once you pass, you sit the rest of the round out.</li>
          <li>
            Don&apos;t believe the last play? Hit <b>Bluff!</b> — anyone can, even if they&apos;ve passed. The cards are turned up: if they lied, <b>they</b> take the whole pile; if they told the truth, <b>you</b> do. Whoever was right leads the next round.
          </li>
          <li>If everyone else passes, the pile is set aside unseen and the last player to put cards down leads a new round.</li>
          <li>Put down your last cards and the table gets one last call. Survive it — nobody calls, or they call and you were honest — and you win.</li>
          <li>Forty seconds a turn. Run out while leading and your biggest set goes down for real; run out while following and you pass.</li>
        </ol>
        <p className="mt-4 text-[13px]" style={{ color: INK_SOFT }}>
          Tip: keep count. There are only four of each rank — if seven Kings have gone down this round, somebody&apos;s lying.
        </p>
      </div>
    </div>
  );
}
