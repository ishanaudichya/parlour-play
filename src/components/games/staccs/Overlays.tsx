"use client";

/* The end-of-game card and the rules sheet — cobalt glass, pixel headlines,
   and a real cube to point at when explaining TOP, SIDE and FACE. */

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { StaccsView } from "@/lib/games/staccs/types";
import type { PartyView } from "@/lib/party/types";
import { Cube, CubeChip } from "./Cube";
import { pixel, pixelSans } from "./font";
import { CYAN, GOLD, LINE, TEXT, TEXT_2, TEXT_3 } from "./palette";

const PANEL = { background: "linear-gradient(180deg, #16328f 0%, #0d1f63 100%)", border: `1px solid ${LINE}`, boxShadow: "0 30px 80px rgba(0,6,30,0.6)" };

export function GameOverCard({
  v,
  party,
  youId,
  isHost,
  playAgain,
  exitToLobby,
  seatColor,
}: {
  v: StaccsView;
  party: PartyView;
  youId: string;
  isHost: boolean;
  playAgain: () => void;
  exitToLobby: () => void;
  seatColor: (seat: number) => string;
}) {
  const winner = v.players.find((p) => p.id === v.winner) ?? null;
  const tallies = party.tallies.staccs ?? {};
  const headline = !winner ? "STALEMATE" : winner.id === youId ? "YOU WIN!" : `${winner.name.toUpperCase()} WINS`;
  const sub = !winner
    ? "Nobody could stack another card — tied on fewest cards."
    : v.winBy === "forfeit"
      ? "Everyone else left the table."
      : v.winBy === "fewest"
        ? "The STACC jammed — fewest cards in hand takes it."
        : `Stacked every card. ${v.board.length} cards in the STACC.`;
  const order = [...v.players].sort((a, b) => (a.id === v.winner ? -1 : b.id === v.winner ? 1 : a.left !== b.left ? (a.left ? 1 : -1) : a.count - b.count));
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, delay: 0.6 }} style={{ background: "rgba(4,10,36,0.6)", backdropFilter: "blur(4px)" }}>
      <motion.div className="w-full max-w-sm rounded-3xl p-6 text-center" style={PANEL} initial={{ y: 24, scale: 0.94 }} animate={{ y: 0, scale: 1 }} transition={{ delay: 0.7, type: "spring", stiffness: 260, damping: 22 }}>
        <div className="flex justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.85 + i * 0.12, type: "spring", stiffness: 420, damping: 16 }}>
              <CubeChip card={i === 1 ? { id: "w", suit: "H", rank: "W" } : "back"} size={i === 1 ? 46 : 36} />
            </motion.div>
          ))}
        </div>
        <h2 className={`${pixel.className} mt-3 text-[28px] leading-tight`} style={{ color: winner ? GOLD : TEXT }}>
          {headline}
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: TEXT_2 }}>
          {sub}
        </p>
        <div className="mt-4 space-y-1.5 text-left">
          {order.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${p.id === v.winner ? GOLD : "transparent"}`, opacity: p.left ? 0.5 : 1 }}>
              <span className={`${pixel.className} flex h-6 w-6 items-center justify-center rounded-md text-[11px]`} style={{ background: seatColor(p.seat), color: "#071233" }}>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: TEXT }}>
                {p.name}
                {p.id === youId ? " (you)" : ""}
              </span>
              {(tallies[p.id] ?? 0) > 0 && (
                <span className="text-[11px] font-bold" style={{ color: GOLD }}>
                  ★{tallies[p.id]}
                </span>
              )}
              <span className={`${pixel.className} text-[12px]`} style={{ color: TEXT_2 }}>
                {p.left ? "left" : p.count === 0 ? "out!" : `${p.count} left`}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-center gap-2">
          {isHost ? (
            <>
              <button type="button" onClick={playAgain} className={`${pixelSans.className} rounded-xl px-5 py-2.5 text-[14px] font-semibold`} style={{ background: CYAN, color: "#071233" }}>
                Deal again
              </button>
              <button type="button" onClick={exitToLobby} className="rounded-xl px-5 py-2.5 text-[13px]" style={{ color: TEXT_2, border: `1px solid ${LINE}` }}>
                Lobby
              </button>
            </>
          ) : (
            <span className="text-[12px]" style={{ color: TEXT_3 }}>
              Waiting for the host…
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className={`${pixel.className} mb-1 text-[12px]`} style={{ color: CYAN }}>
        {title}
      </h3>
      <div className="text-[13px] leading-relaxed" style={{ color: TEXT_2 }}>
        {children}
      </div>
    </section>
  );
}

const S = Math.sqrt(3) / 2;

export function StaccsRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(4,10,36,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="max-h-[86dvh] w-full max-w-md overflow-y-auto rounded-3xl p-5" style={PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className={`${pixel.className} text-[20px]`} style={{ color: TEXT }}>
            How to STACC
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-1 text-[12px]" style={{ color: TEXT_2, border: `1px solid ${LINE}` }} aria-label="Close rules">
            ✕
          </button>
        </div>

        {/* the cube, labelled */}
        <div className="mt-4 flex items-center gap-4 rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
          <svg viewBox="-1.9 -1.5 3.8 3" className="h-[120px] w-[150px] shrink-0" aria-hidden>
            <Cube card={{ id: "r", suit: "C", rank: 5 }} />
            <g style={{ fontFamily: "var(--staccs-pixel)" }} fontSize={0.2} fill={CYAN}>
              <path d="M0 -0.55L0 -1.25" stroke={CYAN} strokeWidth={0.03} />
              <text x={0} y={-1.32} textAnchor="middle">TOP</text>
              <path d={`M${-S * 0.6} 0.3L-1.25 0.6`} stroke={CYAN} strokeWidth={0.03} />
              <text x={-1.3} y={0.85} textAnchor="middle">FACE</text>
              <path d={`M${S * 0.6} 0.3L1.25 0.6`} stroke={CYAN} strokeWidth={0.03} />
              <text x={1.3} y={0.85} textAnchor="middle">SIDE</text>
            </g>
          </svg>
          <div className="text-[12.5px] leading-relaxed" style={{ color: TEXT_2 }}>
            Every card is a cube. Stack on the
            <b style={{ color: TEXT }}> TOP</b> with the same <b style={{ color: TEXT }}>suit</b>, on the
            <b style={{ color: TEXT }}> SIDE</b> with the same <b style={{ color: TEXT }}>number</b>, on the
            <b style={{ color: TEXT }}> FACE</b> with the same <b style={{ color: TEXT }}>letter</b> (J Q K A).
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <Rule title="Goal">Be the first to stack every card in your hand. Seven each (five with five players); six or more play with two decks.</Rule>
          <Rule title="Your turn">
            Stack a card that fits, or draw one and your turn ends. A card must match <b style={{ color: TEXT }}>every</b> surface it lands
            squarely on, and you can&apos;t stack on a surface that&apos;s partly covered. Pick a card and the spots where it fits light up; hover one
            to see what it would match.
          </Rule>
          <Rule title="Special cards">
            <b style={{ color: TEXT }}>0</b> blocks its top for the next player (and reverses play with 3+). <b style={{ color: TEXT }}>J</b> next
            player draws 1. <b style={{ color: TEXT }}>K</b> next player draws 2. <b style={{ color: TEXT }}>Q</b> give a card to the next player.{" "}
            <b style={{ color: TEXT }}>A</b> take another turn. Hit by a J, Q or K? Play the same letter to pass it on — it adds up. You still get
            your turn either way.
          </Rule>
          <Rule title="Wilds">
            Go on any open top and must turn the STACC a new way; call a suit. Everything before the wild is locked — the next card goes on the
            wild&apos;s top in the called suit. You can&apos;t go out on a wild.
          </Rule>
          <Rule title="More than one">A number that&apos;s already in the STACC? Lay as many of it as you can in one turn.</Rule>
          <Rule title="UH OH!">
            Down to one card? Call UH OH (tap it as you play your second-to-last). Get caught before your next turn and you draw 3.
          </Rule>
          <Rule title="The table">
            Cards can&apos;t go past the table&apos;s edge — use wilds to steer. If the pile runs dry and nobody can play, fewest cards wins.
          </Rule>
        </div>
      </div>
    </div>
  );
}
