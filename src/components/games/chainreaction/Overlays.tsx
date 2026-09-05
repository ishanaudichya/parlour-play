"use client";

/* Chain Reaction overlays — the instruction card and the end-of-game card.
   Both share the bench look: black glass, hairline rules, orbs as the only
   ornament. */

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { ChainView } from "@/lib/games/chainreaction/types";
import type { PartyView } from "@/lib/party/types";
import { chakra } from "./font";
import { CREAM, MUTED, paintFor, SWIFT } from "./palette";

/* ---------------- a plain CSS orb, for chrome outside the board ---------------- */

export function OrbChip({ seat, size = 18, dim = false }: { seat: number; size?: number; dim?: boolean }) {
  const p = paintFor(seat);
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 36% 30%, ${p.light} 0%, ${p.base} 40%, ${p.deep} 100%)`,
        boxShadow: dim ? "none" : `0 0 ${size * 0.7}px ${p.glow}, 0 1px 3px rgba(0,0,0,0.6)`,
        opacity: dim ? 0.35 : 1,
        filter: dim ? "saturate(0.3)" : undefined,
      }}
    />
  );
}

/* ---------------- game over ---------------- */

export function GameOverCard({
  v,
  party,
  youId,
  isHost,
  playAgain,
  exitToLobby,
  delay,
}: {
  v: ChainView;
  party: PartyView;
  youId: string;
  isHost: boolean;
  playAgain: () => void;
  exitToLobby: () => void;
  /** seconds to hold while the last cascade finishes on the board */
  delay: number;
}) {
  const winner = v.players.find((p) => p.id === v.winner) ?? null;
  const isPlayer = v.players.some((p) => p.id === youId);
  const youWon = v.winner === youId;
  const tallies = party.tallies.chainreaction ?? {};
  const accent = winner ? paintFor(winner.seat).base : CREAM;
  const orbsOnBoard = v.board.reduce((a, c) => a + c.n, 0);

  const headline = isPlayer ? (youWon ? "YOU HOLD THE BOARD" : "WIPED OUT") : `${winner?.name ?? "—"} HOLDS THE BOARD`;
  const subline =
    v.winBy === "forfeit"
      ? `Everyone else left the bench — the win goes to ${winner?.name ?? "—"}.`
      : `Every one of the ${orbsOnBoard} orbs on the glass is ${winner ? paintFor(winner.seat).label.toLowerCase() : "theirs"}. Last one standing.`;

  // knocked out first → listed last
  const order = [...v.players].sort((a, b) => {
    if (a.id === v.winner) return -1;
    if (b.id === v.winner) return 1;
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.orbs - a.orbs;
  });

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, delay, ease: SWIFT }}
      style={{ background: "rgba(4,5,9,0.74)", backdropFilter: "blur(5px)" }}
    >
      <motion.div
        className="relative w-full max-w-sm overflow-hidden rounded-[22px] border p-6 text-center"
        style={{
          borderColor: `${accent}55`,
          background: "linear-gradient(170deg, #14161f 0%, #0a0b10 100%)",
          boxShadow: `0 30px 80px rgba(0,0,0,0.75), 0 0 60px ${accent}22, inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}
        initial={{ scale: 0.92, y: 22, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ delay: delay + 0.06, type: "spring", stiffness: 260, damping: 24 }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28"
          style={{ background: `radial-gradient(80% 100% at 50% 0%, ${accent}30 0%, transparent 70%)` }}
        />

        <div className="relative text-[10px] uppercase tracking-[0.34em]" style={{ color: MUTED }}>
          {v.winBy === "forfeit" ? "Walkover" : "Chain reaction"}
        </div>

        <h2 className={`${chakra.className} relative mt-2 text-[24px] font-bold leading-tight`} style={{ color: accent, textShadow: `0 0 26px ${accent}66` }}>
          {headline}
        </h2>

        <p className="relative mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "#b9bfd0" }}>
          {subline}
        </p>

        {winner && (
          <div className="relative mt-4 flex items-center justify-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ y: -18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: delay + 0.2 + i * 0.07, type: "spring", stiffness: 420, damping: 18 }}
              >
                <OrbChip seat={winner.seat} size={24} />
              </motion.div>
            ))}
          </div>
        )}

        {/* the bench, in finishing order */}
        <div className="relative mt-5 max-h-[38vh] space-y-1.5 overflow-y-auto pr-0.5">
          {order.map((p) => {
            const won = p.id === v.winner;
            const paint = paintFor(p.seat);
            return (
              <div
                key={p.id}
                className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left"
                style={{
                  borderColor: won ? `${paint.base}66` : "rgba(255,255,255,0.07)",
                  background: won ? `${paint.base}14` : "rgba(255,255,255,0.03)",
                }}
              >
                <OrbChip seat={p.seat} size={16} dim={!won} />
                <span
                  className={`min-w-0 flex-1 truncate text-[12.5px] font-semibold ${p.left ? "line-through opacity-60" : ""}`}
                  style={{ color: won ? CREAM : "#aab0c2" }}
                >
                  {p.name}
                  {p.id === youId ? " (you)" : ""}
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] tabular-nums" style={{ color: MUTED }}>
                  {won ? `${p.orbs} orbs` : p.left ? "left" : "out"}
                </span>
                {(tallies[p.id] ?? 0) > 0 && (
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: paint.light }} title="Chain Reaction wins">
                    ★{tallies[p.id]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="relative mt-5 flex flex-wrap justify-center gap-2">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={playAgain}
                className={`${chakra.className} rounded-xl px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] transition-transform active:scale-[0.97]`}
                style={{ background: accent, color: "#0a0b10", boxShadow: `0 8px 24px ${accent}55` }}
              >
                Run it again
              </button>
              <button
                type="button"
                onClick={exitToLobby}
                className="rounded-xl border px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] transition-transform active:scale-[0.97]"
                style={{ borderColor: "rgba(255,255,255,0.16)", color: MUTED }}
              >
                Back to lobby
              </button>
            </>
          ) : (
            <span className="text-[11px] uppercase tracking-[0.22em]" style={{ color: MUTED }}>
              Waiting for the host…
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------- rules ---------------- */

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className={`${chakra.className} mb-1 text-[10px] font-bold uppercase tracking-[0.24em]`} style={{ color: "#c86bff" }}>
        {title}
      </h3>
      <p className="text-[13px] leading-relaxed" style={{ color: "#b9bfd0" }}>
        {children}
      </p>
    </section>
  );
}

function MiniCell({ n, crit, seat }: { n: number; crit: number; seat: number }) {
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <span
        className="flex h-9 w-9 items-center justify-center gap-[2px] rounded-[6px] border"
        style={{ borderColor: `${paintFor(seat).base}66`, background: "#05060a" }}
      >
        {Array.from({ length: n }, (_, i) => (
          <OrbChip key={i} seat={seat} size={7} />
        ))}
      </span>
      <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>
        bursts at {crit}
      </span>
    </span>
  );
}

export function ChainRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(4,5,9,0.78)", backdropFilter: "blur(5px)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-[22px] border p-5 shadow-2xl"
        style={{ borderColor: "rgba(200,107,255,0.3)", background: "linear-gradient(170deg, #14161f 0%, #0a0b10 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className={`${chakra.className} text-[17px] font-bold`} style={{ color: CREAM }}>
            How the reactor works
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-2.5 py-1 text-[12px] transition"
            style={{ borderColor: "rgba(255,255,255,0.16)", color: MUTED }}
            aria-label="Close rules"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <Rule title="Placing">
            On your turn, drop one orb into an <b style={{ color: CREAM }}>empty cell</b> or a cell you
            already hold. You can never touch someone else&apos;s cell directly.
          </Rule>
          <Rule title="Critical mass">
            A cell bursts the moment it holds as many orbs as it has neighbours: corners at two,
            edges at three, the middle at four. Cells one orb short <b style={{ color: CREAM }}>shiver</b>.
          </Rule>
          <div className="flex flex-wrap items-start justify-center gap-4 rounded-xl border px-3 py-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <MiniCell n={1} crit={2} seat={0} />
            <MiniCell n={2} crit={3} seat={1} />
            <MiniCell n={3} crit={4} seat={2} />
          </div>
          <Rule title="The cascade">
            A burst sends one orb into each neighbouring cell and <b style={{ color: CREAM }}>converts
            them to your colour</b> — whatever they held before. Anything that pushes over the edge bursts
            too. One orb can flip half the board.
          </Rule>
          <Rule title="Knockout">
            Lose your last orb and you&apos;re out — once everyone has had a first turn. The
            <b style={{ color: CREAM }}> last player holding orbs</b> wins. There are no draws.
          </Rule>
          <Rule title="The clock">
            You get <b style={{ color: CREAM }}>45 seconds</b> a turn. Let it run out and the reactor
            places for you, somewhere legal and probably unwise.
          </Rule>
          <Rule title="Leaving">
            Walk out mid-game and your orbs are swept off the glass; play goes on without you. Everyone
            else in the party watches over your shoulder — the board is public, nothing is hidden.
          </Rule>
        </div>
      </div>
    </div>
  );
}
