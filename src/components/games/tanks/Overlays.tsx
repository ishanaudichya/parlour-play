"use client";

/* The end-of-game card and the rules. Quiet surfaces, one stencilled
   headline, the field stays the star. */

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { TanksView } from "@/lib/games/tanks/types";
import { WEAPONS } from "@/lib/games/tanks/weapons";
import type { PartyView } from "@/lib/party/types";
import { stencil } from "./font";
import { WeaponIcon } from "./icons";
import { AMBER, LINE, SURFACE, SURFACE_2, SWIFT, TANK, TEXT as PAINT, TEXT_2 as PAINT_SOFT, TEXT_3 as PAINT_FAINT } from "./palette";

export function GameOverCard({
  v,
  party,
  youId,
  isHost,
  playAgain,
  exitToLobby,
}: {
  v: TanksView;
  party: PartyView;
  youId: string;
  isHost: boolean;
  playAgain: () => void;
  exitToLobby: () => void;
}) {
  const winner = v.players.find((p) => p.id === v.winner) ?? null;
  const isPlayer = v.players.some((p) => p.id === youId);
  const tallies = party.tallies.tanks ?? {};
  const draw = !winner;
  const accent = winner ? TANK[winner.color].light : AMBER;
  const headline = draw ? "STALEMATE" : isPlayer ? (v.winner === youId ? "VICTORY" : "DEFEAT") : `${winner!.name.toUpperCase()} WINS`;
  const sub = draw
    ? "Dead level when the last shell landed. Nobody takes the ridge."
    : v.winBy === "forfeit"
      ? `Everyone else pulled out — the ridge goes to ${winner!.name}.`
      : `${winner!.name} held the ridge with ${winner!.score} points.`;
  const order = [...v.players].sort((a, b) => (a.left !== b.left ? (a.left ? 1 : -1) : b.score - a.score));

  return (
    <motion.div className="absolute inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, delay: 0.3, ease: SWIFT }} style={{ background: "rgba(6,7,4,0.72)", backdropFilter: "blur(4px)" }}>
      <motion.div
        className="relative w-full max-w-md overflow-hidden rounded-2xl p-5 text-center"
        style={{ background: SURFACE, border: `1px solid ${LINE}`, boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
        initial={{ y: 30, scale: 0.94, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ delay: 0.36, type: "spring", stiffness: 240, damping: 24 }}
      >
        <motion.h2 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.4, ease: SWIFT }} className={`${stencil.className} relative text-[30px] leading-tight`} style={{ color: accent }}>
          {headline}
        </motion.h2>
        <p className="relative mt-1 text-[12.5px]" style={{ color: PAINT_SOFT }}>
          {sub}
        </p>

        <div className="relative mt-4 space-y-1.5 text-left">
          {order.map((p, i) => {
            const P = TANK[p.color];
            const won = p.id === v.winner;
            return (
              <motion.div
                key={p.id}
                initial={{ x: -16, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.6 + i * 0.08 }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                style={{ background: SURFACE_2, border: `1px solid ${won ? P.base : LINE}`, opacity: p.left ? 0.55 : 1 }}
              >
                <span className="w-4 text-[12px] tabular-nums" style={{ color: PAINT_FAINT }}>
                  {i + 1}
                </span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: P.base }} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] font-semibold ${p.left ? "line-through" : ""}`} style={{ color: PAINT }}>
                    {p.name}
                    {p.id === youId ? " (you)" : ""}
                  </span>
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: PAINT_FAINT }}>
                    {p.left ? (
                      "left the field"
                    ) : p.best ? (
                      <>
                        best: <WeaponIcon id={p.best.weapon} size={13} plate={false} /> {WEAPONS[p.best.weapon].name} +{p.best.pts}
                      </>
                    ) : (
                      "no hits landed"
                    )}
                    {!p.left && <span className="ml-1">· took {p.taken}</span>}
                  </span>
                </span>
                {(tallies[p.id] ?? 0) > 0 && (
                  <span className="text-[10px] font-bold" style={{ color: AMBER }} title="Pocket Tanks wins">
                    ★{tallies[p.id]}
                  </span>
                )}
                <span className="text-[20px] font-semibold tabular-nums" style={{ color: won ? PAINT : PAINT_SOFT }}>
                  {p.score}
                </span>
              </motion.div>
            );
          })}
        </div>

        <div className="relative mt-5 flex flex-wrap justify-center gap-2">
          {isHost ? (
            <>
              <button type="button" onClick={playAgain} className="rounded-lg px-5 py-2.5 text-[13px] font-semibold transition-transform active:scale-[0.97]" style={{ background: "#d8392b", color: "#fff6ee" }}>
                New ridge
              </button>
              <button type="button" onClick={exitToLobby} className="rounded-lg px-5 py-2.5 text-[13px] font-medium" style={{ color: PAINT_SOFT, border: `1px solid ${LINE}` }}>
                Back to lobby
              </button>
            </>
          ) : (
            <span className="text-[12px]" style={{ color: PAINT_FAINT }}>
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
      <h3 className="mb-1 text-[13px] font-semibold" style={{ color: PAINT }}>
        {title}
      </h3>
      <p className="text-[12.5px] leading-relaxed" style={{ color: PAINT_SOFT }}>
        {children}
      </p>
    </section>
  );
}

export function TanksRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(6,7,4,0.78)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl p-5" style={{ background: SURFACE, border: `1px solid ${LINE}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className={`${stencil.className} text-[20px]`} style={{ color: PAINT }}>
            How to play
          </h2>
          <button type="button" onClick={onClose} className="rounded-md px-2.5 py-1 text-[12px]" style={{ color: PAINT_SOFT, border: `1px solid ${LINE}` }} aria-label="Close rules">
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <Rule title="The draft">
            A pool of weapons is opened on the table. Take turns — snake order — claiming one at a time until every arsenal is
            full: ten each for two tanks, seven for three, six for four. Utility pieces (dirt, walls, the teleporter) score
            nothing but can win you the war.
          </Rule>
          <Rule title="Firing">
            On your turn, set the elevation and the charge, load a weapon and fire. Every weapon fires exactly once. Drag on the
            field to aim (direction is angle, distance is power), or use the dials. Wind changes every turn — watch the sock.
          </Rule>
          <Rule title="Scoring">
            Every point of damage you deal is a point for you. Hit yourself and it comes off your score. Tanks never die —
            when the last weapon has flown, the highest score wins. A level score is a stalemate.
          </Rule>
          <Rule title="The ground">
            Explosions dig craters and whatever is above falls in. Tanks drop with the dirt, and a long fall hurts — that
            damage scores for whoever caused it.
          </Rule>
          <Rule title="Driving">
            Four drives per game, about a tank-length each. You can drive and still fire the same turn. Tanks can&apos;t climb
            cliffs.
          </Rule>
          <Rule title="The clock">
            45 seconds a shot (20 a draft pick). Run it out and whatever is loaded fires where it&apos;s pointing.
          </Rule>
          <div className="rounded-lg p-3 text-[11px] leading-relaxed" style={{ background: SURFACE_2, color: PAINT_FAINT }}>
            Keys: ←/→ angle · ↑/↓ power (hold Shift for ×5) · Q/E weapon · A/D drive · Space fire
          </div>
        </div>
      </div>
    </div>
  );
}
