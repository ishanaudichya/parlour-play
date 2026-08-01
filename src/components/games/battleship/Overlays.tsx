"use client";

/* Battleship overlays — the ops-manual rules modal and the end-of-action
   report (victory flare / defeat wash, shot statistics, host controls). */

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { BattleshipView } from "@/lib/games/battleship/types";
import type { PartyView } from "@/lib/party/types";
import { BRIGHT, GREEN, RED, STEEL } from "./boards";

const panelCls =
  "relative w-full max-w-md rounded-lg border p-5 shadow-[0_24px_70px_rgba(0,0,0,0.7)] backdrop-blur";

/* ---------------- game over ---------------- */

export function GameOverOverlay({
  v,
  party,
  youId,
  isHost,
  playAgain,
  exitToLobby,
}: {
  v: BattleshipView;
  party: PartyView;
  youId: string;
  isHost: boolean;
  playAgain: () => void;
  exitToLobby: () => void;
}) {
  const winner = v.players.find((p) => p.id === v.winner);
  const loser = v.players.find((p) => p.id !== v.winner);
  const isPlayer = v.players.some((p) => p.id === youId);
  const youWon = v.winner === youId;
  const celebrate = !isPlayer || youWon;
  const tallies = party.tallies.battleship ?? {};

  const accuracy = (p: { shotsFired: number; hitsLanded: number }) =>
    p.shotsFired > 0 ? Math.round((p.hitsLanded / p.shotsFired) * 100) : 0;

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background: "rgba(2,7,12,0.72)", backdropFilter: "blur(3px)" }}
    >
      {/* victory flare / defeat wash */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: celebrate ? [0, 0.9, 0.5] : [0, 0.85, 0.6] }}
        transition={{ duration: 1.6, times: [0, 0.35, 1] }}
        style={{
          background: celebrate
            ? "radial-gradient(80% 60% at 50% 40%, rgba(61,222,155,0.22) 0%, transparent 70%)"
            : "radial-gradient(90% 70% at 50% 45%, rgba(200,30,45,0.25) 0%, transparent 72%)",
        }}
      />

      <motion.div
        className={panelCls}
        style={{
          borderColor: celebrate ? "rgba(61,222,155,0.55)" : "rgba(255,77,94,0.5)",
          background: "rgba(7,16,25,0.96)",
        }}
        initial={{ scale: 0.86, y: 26 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 250, damping: 22 }}
      >
        <div className="text-center text-[10px] uppercase tracking-[0.34em]" style={{ color: STEEL }}>
          {v.winBy === "forfeit" ? "Enemy withdrew" : "Action report"}
        </div>
        <div
          className="mt-2 text-center text-2xl font-bold tracking-[0.14em]"
          style={{
            color: celebrate ? BRIGHT : RED,
            textShadow: celebrate ? "0 0 18px rgba(109,255,192,0.5)" : "0 0 18px rgba(255,77,94,0.5)",
          }}
        >
          {isPlayer
            ? youWon
              ? "VICTORY AT SEA"
              : "FLEET LOST"
            : `${winner?.name ?? "—"} WINS`}
        </div>
        <div className="mt-1 text-center text-[12px]" style={{ color: STEEL }}>
          {v.winBy === "forfeit"
            ? `${loser?.name ?? "The enemy"} abandoned ship — ${winner?.name ?? "the victor"} takes the seas`
            : `${winner?.name ?? "—"} sank the entire enemy fleet`}
        </div>

        {/* fleet salute */}
        <div className="mt-4 flex items-end justify-center gap-2">
          {[3, 4, 5, 4, 3].map((len, i) => (
            <motion.div
              key={i}
              className="rounded-full border"
              style={{
                width: len * 7,
                height: 8,
                borderColor: celebrate ? "rgba(109,255,192,0.6)" : "rgba(255,77,94,0.45)",
                background: celebrate ? "rgba(61,222,155,0.25)" : "rgba(56,26,30,0.7)",
              }}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1, rotate: celebrate ? 0 : i % 2 === 0 ? -14 : 10 }}
              transition={{ delay: 0.3 + i * 0.09, type: "spring", stiffness: 300, damping: 18 }}
            />
          ))}
        </div>

        {/* shot statistics */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {v.players.map((p) => (
            <div
              key={p.id}
              className="rounded-md border px-3 py-2 text-[11px]"
              style={{
                borderColor: p.id === v.winner ? "rgba(61,222,155,0.5)" : "rgba(123,168,192,0.25)",
                background: p.id === v.winner ? "rgba(61,222,155,0.08)" : "rgba(10,22,34,0.6)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`truncate font-semibold uppercase tracking-[0.1em] ${p.left ? "line-through opacity-60" : ""}`}
                  style={{ color: p.id === v.winner ? BRIGHT : "#cfe8dd" }}
                >
                  {p.name}
                  {p.id === youId ? " (you)" : ""}
                </span>
                {(tallies[p.id] ?? 0) > 0 && (
                  <span title="Battleship wins" style={{ color: GREEN }}>
                    ★{tallies[p.id]}
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5 tabular-nums" style={{ color: STEEL }}>
                <div className="flex justify-between">
                  <span>Shots</span>
                  <span>{p.shotsFired}</span>
                </div>
                <div className="flex justify-between">
                  <span>Hits</span>
                  <span style={{ color: "#ffb37c" }}>{p.hitsLanded}</span>
                </div>
                <div className="flex justify-between">
                  <span>Accuracy</span>
                  <span>{accuracy(p)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-center gap-2">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={playAgain}
                className="rounded-md border px-4 py-2 text-[12px] font-bold uppercase tracking-[0.18em] transition active:scale-[0.98]"
                style={{
                  borderColor: GREEN,
                  color: BRIGHT,
                  background: "rgba(61,222,155,0.12)",
                  textShadow: "0 0 10px rgba(109,255,192,0.4)",
                }}
              >
                Re-engage
              </button>
              <button
                type="button"
                onClick={exitToLobby}
                className="rounded-md border px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] transition active:scale-[0.98]"
                style={{ borderColor: "rgba(123,168,192,0.4)", color: STEEL }}
              >
                Back to lobby
              </button>
            </>
          ) : (
            <span className="text-[11px] uppercase tracking-[0.24em]" style={{ color: STEEL }}>
              Awaiting orders from the host…
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------- rules ---------------- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: GREEN }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function BSRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3"
      style={{ background: "rgba(2,7,12,0.75)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-lg border p-5 shadow-2xl"
        style={{ borderColor: "rgba(61,222,155,0.4)", background: "#081522" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold tracking-[0.26em]" style={{ color: BRIGHT }}>
            OPS MANUAL
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-2.5 py-1 text-[12px] transition"
            style={{ borderColor: "rgba(123,168,192,0.4)", color: STEEL }}
            aria-label="Close rules"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 space-y-4 text-[13px] leading-relaxed" style={{ color: "#b7cdc3" }}>
          <Section title="Deployment">
            <p>
              Hide five ships in your 10×10 waters:{" "}
              <b style={{ color: "#e2f3ea" }}>Carrier (5), Battleship (4), Cruiser (3), Submarine (3),
              Destroyer (2)</b>{" "}
              — 17 cells in all. Ships sit horizontally or vertically; they may touch but never
              overlap. Tap a ship in the dock, then tap the grid to drop it (tap a placed ship to
              pick it back up, <b style={{ color: "#e2f3ea" }}>Rotate</b> flips its heading).{" "}
              <b style={{ color: "#e2f3ea" }}>Scatter fleet</b> positions your remaining ships at
              random — press it again on a full board to reshuffle everything. Hit{" "}
              <b style={{ color: BRIGHT }}>READY</b> to lock in.
            </p>
          </Section>

          <Section title="Battle">
            <p>
              On your turn, fire at any square of enemy waters you haven&apos;t tried. A splash means
              your turn is over. A hit means…{" "}
              <b style={{ color: "#ffb37c" }}>you fire again — house rule.</b> Keep hitting, keep
              shooting. Landing the final cell of a ship sinks it and reveals its hull on your
              targeting grid.
            </p>
          </Section>

          <Section title="Timers">
            <ul className="list-inside list-disc space-y-1">
              <li>
                Deployment: <b style={{ color: "#e2f3ea" }}>90 seconds</b>. Dawdlers get their
                unplaced ships scattered and locked in automatically.
              </li>
              <li>
                Each shot: <b style={{ color: "#e2f3ea" }}>45 seconds</b>. If you hesitate, the
                fire-control computer takes one random shot for you.
              </li>
            </ul>
          </Section>

          <Section title="Victory">
            <p>
              Sink all seventeen cells of the enemy fleet and the sea is yours. A player who leaves
              the party strikes their colors — their opponent wins immediately.
            </p>
          </Section>

          <Section title="Intelligence">
            <p>
              Your opponent sees only where you have fired and any hulls they have fully sunk —
              never your ship positions. Spectators see even less: both shot maps and nothing more,
              so screen-peeking reveals no secrets.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
