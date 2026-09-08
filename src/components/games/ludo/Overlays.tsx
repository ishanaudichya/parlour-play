"use client";

/* Ludo overlays — the instruction card and the end-of-game card. Both share
   the heirloom look: lacquer, brass rules, ivory type, tokens as the only
   ornament. */

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { HOME_POS, type LudoColor, type LudoView } from "@/lib/games/ludo/types";
import type { PartyView } from "@/lib/party/types";
import { DieFace } from "./Die";
import { rozha } from "./font";
import { BRASS, CREAM, MUTED, PAINT, SWIFT } from "./paint";

/* ---------------- a plain CSS token, for chrome outside the board ---------------- */

export function TokenChip({ color, size = 18, dim = false }: { color: LudoColor; size?: number; dim?: boolean }) {
  const p = PAINT[color];
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 38% 32%, ${p.light} 0%, ${p.base} 42%, ${p.deep} 100%)`,
        boxShadow: `inset 0 0 0 ${Math.max(1, size * 0.08)}px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.5)`,
        opacity: dim ? 0.45 : 1,
        filter: dim ? "saturate(0.4)" : undefined,
      }}
    />
  );
}

/** Four little dots: filled for every token home. */
export function HomeDots({ color, home, size = 8 }: { color: LudoColor; home: number; size?: number }) {
  const p = PAINT[color];
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="inline-block rounded-full"
          style={{
            width: size,
            height: size,
            background: i < home ? p.base : "transparent",
            border: `1.5px solid ${i < home ? p.light : "rgba(255,255,255,0.25)"}`,
            boxShadow: i < home ? `0 0 6px ${p.base}88` : undefined,
          }}
        />
      ))}
    </span>
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
  v: LudoView;
  party: PartyView;
  youId: string;
  isHost: boolean;
  playAgain: () => void;
  exitToLobby: () => void;
  delay: number;
}) {
  const winner = v.players.find((p) => p.id === v.winner) ?? null;
  const isPlayer = v.players.some((p) => p.id === youId);
  const youWon = v.winner === youId;
  const tallies = party.tallies.ludo ?? {};
  const accent = winner ? PAINT[winner.color].light : BRASS;

  const headline = isPlayer ? (youWon ? "ALL FOUR HOME" : "OUTRUN") : `${winner?.name ?? "—"} IS HOME`;
  const subline =
    v.winBy === "forfeit"
      ? `Everyone else left the table — the game goes to ${winner?.name ?? "—"}.`
      : `${winner?.name ?? "—"} brought all four ${winner ? PAINT[winner.color].label.toLowerCase() : ""} tokens home in ${v.rolls} rolls.`;

  const progress = (p: LudoView["players"][number]) => p.tokens.reduce((a, x) => a + Math.max(0, x + 1), 0);
  const order = [...v.players].sort((a, b) => {
    if (a.id === v.winner) return -1;
    if (b.id === v.winner) return 1;
    if (a.left !== b.left) return a.left ? 1 : -1;
    if (a.home !== b.home) return b.home - a.home;
    return progress(b) - progress(a);
  });

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, delay, ease: SWIFT }}
      style={{ background: "rgba(14,6,10,0.74)", backdropFilter: "blur(5px)" }}
    >
      <motion.div
        className="relative w-full max-w-sm overflow-hidden rounded-[20px] p-6 text-center"
        style={{
          background: "linear-gradient(170deg, #3a2018 0%, #1d0f0a 100%)",
          boxShadow: `0 30px 80px rgba(0,0,0,0.75), 0 0 0 2px ${BRASS}, 0 0 0 5px rgba(201,164,92,0.25), inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
        initial={{ scale: 0.92, y: 22, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ delay: delay + 0.06, type: "spring", stiffness: 260, damping: 24 }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28" style={{ background: `radial-gradient(80% 100% at 50% 0%, ${accent}30 0%, transparent 70%)` }} />

        <div className="relative text-[10px] uppercase tracking-[0.34em]" style={{ color: MUTED }}>
          {v.winBy === "forfeit" ? "Walkover" : "Ludo"}
        </div>
        <h2 className={`${rozha.className} relative mt-2 text-[28px] leading-tight`} style={{ color: accent, textShadow: `0 0 26px ${accent}55` }}>
          {headline}
        </h2>
        <p className="relative mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "#d9c9ad" }}>
          {subline}
        </p>

        {winner && (
          <div className="relative mt-4 flex items-center justify-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <motion.div key={i} initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: delay + 0.2 + i * 0.07, type: "spring", stiffness: 420, damping: 18 }}>
                <TokenChip color={winner.color} size={26} />
              </motion.div>
            ))}
          </div>
        )}

        <div className="relative mt-5 space-y-1.5">
          {order.map((p) => {
            const won = p.id === v.winner;
            const paint = PAINT[p.color];
            return (
              <div
                key={p.id}
                className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left"
                style={{
                  borderColor: won ? `${paint.base}88` : "rgba(255,255,255,0.08)",
                  background: won ? `${paint.base}22` : "rgba(255,255,255,0.03)",
                }}
              >
                <TokenChip color={p.color} size={16} dim={p.left} />
                <span className={`min-w-0 flex-1 truncate text-[12.5px] font-semibold ${p.left ? "line-through opacity-60" : ""}`} style={{ color: won ? CREAM : "#c9b899" }}>
                  {p.name}
                  {p.id === youId ? " (you)" : ""}
                </span>
                {p.left ? (
                  <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>left</span>
                ) : (
                  <HomeDots color={p.color} home={p.tokens.filter((x) => x === HOME_POS).length} />
                )}
                {(tallies[p.id] ?? 0) > 0 && (
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: BRASS }} title="Ludo wins">
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
                className={`${rozha.className} rounded-xl px-5 py-2.5 text-[14px] transition-transform active:scale-[0.97]`}
                style={{ background: `linear-gradient(180deg, ${BRASS} 0%, #a8843f 100%)`, color: "#1d0f0a", boxShadow: `0 8px 24px rgba(201,164,92,0.35)` }}
              >
                Set the board again
              </button>
              <button
                type="button"
                onClick={exitToLobby}
                className="rounded-xl border px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] transition-transform active:scale-[0.97]"
                style={{ borderColor: "rgba(255,255,255,0.18)", color: MUTED }}
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
      <h3 className={`${rozha.className} mb-1 text-[13px]`} style={{ color: BRASS }}>
        {title}
      </h3>
      <p className="text-[13px] leading-relaxed" style={{ color: "#d9c9ad" }}>
        {children}
      </p>
    </section>
  );
}

export function LudoRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(14,6,10,0.78)", backdropFilter: "blur(5px)" }} onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-[20px] p-5"
        style={{ background: "linear-gradient(170deg, #3a2018 0%, #1d0f0a 100%)", boxShadow: `0 30px 80px rgba(0,0,0,0.7), 0 0 0 2px ${BRASS}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className={`${rozha.className} text-[20px]`} style={{ color: CREAM }}>
            How to play
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg border px-2.5 py-1 text-[12px] transition" style={{ borderColor: "rgba(255,255,255,0.18)", color: MUTED }} aria-label="Close rules">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4 rounded-xl border px-3 py-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <DieFace value={6} size={44} />
            <p className="text-[12.5px] leading-relaxed" style={{ color: "#d9c9ad" }}>
              Four tokens each, all starting in your yard. You need a <b style={{ color: CREAM }}>six</b> to bring one
              out onto your start square. Two to four players; two sit opposite each other.
            </p>
          </div>
          <Rule title="Rolling and moving">
            Roll, then move one token that many squares around the loop. If only one token can use the roll
            it moves by itself. Roll a six and you roll again — but <b style={{ color: CREAM }}>three sixes in a row</b> and
            your turn is forfeited.
          </Rule>
          <Rule title="Captures">
            Land on a square holding another colour and every token there is sent back to its yard — a stack
            is no shelter. A capture earns you another roll. The four <b style={{ color: CREAM }}>start squares</b> and
            the four <b style={{ color: CREAM }}>star squares</b> are safe: nothing is captured there.
          </Rule>
          <Rule title="The home stretch">
            After a full lap a token turns up its own coloured column toward the middle. You need the{" "}
            <b style={{ color: CREAM }}>exact count</b> to step home; overshoots don&apos;t move. Getting a token
            home earns another roll. First to bring all four home wins — there are no draws.
          </Rule>
          <Rule title="The clock">
            You get <b style={{ color: CREAM }}>30 seconds</b> for each roll and each choice. Let it run out and the
            board plays for you — sensibly, but you won&apos;t like it.
          </Rule>
          <Rule title="Leaving">
            Walk out mid-game and your tokens are swept off; play goes on without you. Everyone else in the party
            watches over your shoulder — the board is public, nothing is hidden.
          </Rule>
        </div>
      </div>
    </div>
  );
}
