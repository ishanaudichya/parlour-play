"use client";

/* Four in a Row overlays — the folded instruction leaflet and the end-of-game
   card. Both share the cabinet look: warm dark card, amber rules, chunky
   plastic discs as the only ornament. */

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { Connect4View, Disc } from "@/lib/games/connect4/types";
import type { PartyView } from "@/lib/party/types";
import { bungee } from "./font";
import { AMBER, CREAM, DISC_PAINT, MUTED, SWIFT } from "./geometry";

/* ---------------- a plain CSS disc, for chrome outside the board ---------------- */

export function DiscChip({ color, size = 18 }: { color: Disc; size?: number }) {
  const p = DISC_PAINT[color];
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 28%, ${p.light} 0%, ${p.base} 45%, ${p.deep} 100%)`,
        boxShadow: `inset 0 0 0 ${Math.max(1, size * 0.09)}px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.5)`,
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
}: {
  v: Connect4View;
  party: PartyView;
  youId: string;
  isHost: boolean;
  playAgain: () => void;
  exitToLobby: () => void;
}) {
  const winner = v.players.find((p) => p.id === v.winner) ?? null;
  const loser = v.players.find((p) => p.id !== v.winner) ?? null;
  const isPlayer = v.players.some((p) => p.id === youId);
  const youWon = v.winner === youId;
  const tallies = party.tallies.connect4 ?? {};
  const accent = v.draw ? MUTED : winner ? DISC_PAINT[winner.color].base : AMBER;

  const headline = v.draw
    ? "DRAW"
    : isPlayer
      ? youWon
        ? "YOU CONNECT FOUR"
        : "BEATEN"
      : `${winner?.name ?? "—"} WINS`;

  const subline = v.draw
    ? "All forty-two discs down and not a line in sight."
    : v.winBy === "forfeit"
      ? `${loser?.name ?? "Your opponent"} left the table — the win goes to ${winner?.name ?? "—"}.`
      : `${winner?.name ?? "—"} linked four ${winner ? DISC_PAINT[winner.color].label.toLowerCase() : ""} discs.`;

  // delay just long enough for the winning line to draw itself
  const delay = v.winningLine ? 1.15 : 0.35;

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, delay, ease: SWIFT }}
      style={{ background: "rgba(9,7,14,0.74)", backdropFilter: "blur(4px)" }}
    >
      <motion.div
        className="relative w-full max-w-sm overflow-hidden rounded-[26px] border p-6 text-center"
        style={{
          borderColor: `${accent}55`,
          background: "linear-gradient(170deg, #1d1826 0%, #12101a 100%)",
          boxShadow: `0 30px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}
        initial={{ scale: 0.9, y: 22, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ delay: delay + 0.06, type: "spring", stiffness: 260, damping: 24 }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28"
          style={{ background: `radial-gradient(80% 100% at 50% 0%, ${accent}2e 0%, transparent 70%)` }}
        />

        <div className="relative text-[10px] uppercase tracking-[0.34em]" style={{ color: MUTED }}>
          {v.draw ? "Board full" : v.winBy === "forfeit" ? "Walkover" : "Four in a row"}
        </div>

        <h2
          className={`${bungee.className} relative mt-2 text-[26px] leading-tight`}
          style={{ color: accent, textShadow: `0 0 26px ${accent}55` }}
        >
          {headline}
        </h2>

        <p className="relative mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "#c3b8a6" }}>
          {subline}
        </p>

        {/* four discs, or the mixed pile of a draw */}
        <div className="relative mt-4 flex items-center justify-center gap-2">
          {(v.draw
            ? (["red", "yellow", "red", "yellow"] as Disc[])
            : winner
              ? ([winner.color, winner.color, winner.color, winner.color] as Disc[])
              : []
          ).map((c, i) => (
            <motion.div
              key={i}
              initial={{ y: -18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: delay + 0.2 + i * 0.07, type: "spring", stiffness: 420, damping: 18 }}
            >
              <DiscChip color={c} size={26} />
            </motion.div>
          ))}
        </div>

        {/* scoreline */}
        <div className="relative mt-5 space-y-1.5">
          {v.players.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left"
              style={{
                borderColor: p.id === v.winner ? `${DISC_PAINT[p.color].base}66` : "rgba(255,255,255,0.07)",
                background: p.id === v.winner ? `${DISC_PAINT[p.color].base}14` : "rgba(255,255,255,0.03)",
              }}
            >
              <DiscChip color={p.color} size={16} />
              <span
                className={`min-w-0 flex-1 truncate text-[12.5px] font-semibold ${p.left ? "line-through opacity-60" : ""}`}
                style={{ color: CREAM }}
              >
                {p.name}
                {p.id === youId ? " (you)" : ""}
              </span>
              <span className="text-[11px] tabular-nums" style={{ color: MUTED }}>
                {p.discsPlaced} discs
              </span>
              {(tallies[p.id] ?? 0) > 0 && (
                <span className="text-[11px] font-bold tabular-nums" style={{ color: AMBER }} title="Four in a Row wins">
                  ★{tallies[p.id]}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="relative mt-5 flex flex-wrap justify-center gap-2">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={playAgain}
                className={`${bungee.className} rounded-xl px-5 py-2.5 text-[12px] tracking-[0.1em] transition-transform active:scale-[0.97]`}
                style={{ background: AMBER, color: "#241a08", boxShadow: `0 8px 22px ${AMBER}44` }}
              >
                Play again
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
      <h3 className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: AMBER }}>
        {title}
      </h3>
      <p className="text-[13px] leading-relaxed" style={{ color: "#c3b8a6" }}>
        {children}
      </p>
    </section>
  );
}

export function C4RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(9,7,14,0.78)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-[24px] border p-5 shadow-2xl"
        style={{
          borderColor: "rgba(245,178,62,0.28)",
          background: "linear-gradient(170deg, #1d1826 0%, #12101a 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className={`${bungee.className} text-[17px]`} style={{ color: CREAM }}>
            How to play
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
          <Rule title="The drop">
            Tap or click a column and your disc falls to the lowest free slot. Red always goes to
            seat one, gold to seat two; who starts is decided by the machine.
          </Rule>
          <Rule title="Winning">
            Line up <b style={{ color: CREAM }}>four of your discs</b> in a row — across, up, or
            along either diagonal. The board lights the line up the moment it happens.
          </Rule>
          <Rule title="The clock">
            You get <b style={{ color: CREAM }}>45 seconds</b> a turn. Let it run out and the
            cabinet drops a disc for you into a random open column, so a game can never stall.
          </Rule>
          <Rule title="Draws happen">
            Fill all forty-two slots with nobody connecting four and it is a{" "}
            <b style={{ color: CREAM }}>draw</b> — no winner, no point scored, start another.
          </Rule>
          <Rule title="Leaving">
            Walk out mid-game and your opponent takes the win. Everyone else in the party watches
            over your shoulder; the board is public, there is nothing to hide.
          </Rule>
        </div>
      </div>
    </div>
  );
}
