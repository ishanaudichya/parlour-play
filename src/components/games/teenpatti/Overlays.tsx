"use client";

/* Showdown overlay (hand_over), session-over overlay, and the rules modal. */

import { motion } from "framer-motion";
import type { PartyView } from "@/lib/party/types";
import type { TeenPattiView } from "@/lib/games/teenpatti/types";
import { CardFace } from "./PlayingCard";
import { ChipStack, ChipSvg } from "./Chips";

const GOLD = "#c9a961";
const panelCls =
  "relative w-full max-w-md rounded-xl border border-[#c9a961]/50 bg-[#0a1f18]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur";

/* ---------------- hand over / showdown ---------------- */

export function ShowdownOverlay({
  v,
  youId,
  nowEst,
}: {
  v: TeenPattiView;
  youId: string;
  nowEst: number;
}) {
  const hand = v.lastHand!;
  const secs = v.deadline ? Math.max(0, Math.ceil((v.deadline - nowEst) / 1000)) : 0;
  const youWon = hand.winnerId === youId;

  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 0.45, duration: 0.35 }}
    >
      {/* celebratory chip rain */}
      {Array.from({ length: 9 }, (_, i) => (
        <motion.div
          key={`${hand.handNo}-${i}`}
          className="pointer-events-none absolute top-[-30px] w-[20px]"
          style={{ left: `${8 + ((i * 37) % 84)}%` }}
          initial={{ y: -30, rotate: 0, opacity: 0 }}
          animate={{ y: "108vh", rotate: 180 + (i % 3) * 120, opacity: [0, 1, 1, 0.6] }}
          transition={{ delay: 0.7 + i * 0.12, duration: 2.4, ease: "easeIn" }}
        >
          <ChipSvg denom={[100, 25, 5, 1][i % 4]} />
        </motion.div>
      ))}

      <motion.div
        className={panelCls}
        initial={{ scale: 0.85, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ delay: 0.45, type: "spring", stiffness: 260, damping: 22 }}
      >
        <div className="text-center text-[10px] uppercase tracking-[0.3em] text-[#8fa396]">
          Hand {hand.handNo} · {hand.reason === "fold" ? "everyone folded" : hand.reason === "show" ? "show" : "showdown"}
        </div>
        <div className="mt-1 text-center text-xl text-[#e9cf8e]">
          {youWon ? "You take the pot" : `${hand.winnerName} takes the pot`}
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-[#e9d9ae]">
          <ChipStack amount={hand.amount} w={20} />
          <span className="text-2xl" style={{ color: GOLD }}>
            {hand.amount}
          </span>
        </div>

        {hand.revealed.length > 0 ? (
          <div className="mt-4 space-y-2.5">
            {hand.revealed.map((r, ri) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  r.id === hand.winnerId
                    ? "border-[#c9a961]/70 bg-[#123328]"
                    : "border-[#2a4438]/70 bg-[#08170f]/80"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-[#efe6d0]">
                    {r.name}
                    {r.id === hand.winnerId && <span style={{ color: GOLD }}> ♛</span>}
                  </div>
                  <div className="text-[11px]" style={{ color: r.id === hand.winnerId ? GOLD : "#8fa396" }}>
                    {r.label}
                  </div>
                </div>
                <div className="flex gap-1" style={{ perspective: 500 }}>
                  {r.cards.map((c, ci) => (
                    <motion.div
                      key={ci}
                      className="w-9"
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={{ delay: 0.75 + ri * 0.25 + ci * 0.12, duration: 0.4 }}
                    >
                      <CardFace card={c} className="w-full" />
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-center text-[12px] text-[#8fa396]">
            Cards stay face down — the last player standing never shows.
          </p>
        )}

        <div className="mt-4 text-center text-[11px] uppercase tracking-[0.24em] text-[#8fa396]">
          Next hand in <span style={{ color: GOLD }}>{secs}s</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------- session over ---------------- */

export function SessionOverOverlay({
  v,
  party,
  youId,
  isHost,
  playAgain,
  exitToLobby,
}: {
  v: TeenPattiView;
  party: PartyView;
  youId: string;
  isHost: boolean;
  playAgain: () => void;
  exitToLobby: () => void;
}) {
  const winner = v.players.find((p) => p.id === v.winnerId);
  const standings = [...v.players].sort((a, b) => b.chips - a.chips);
  const tallies = party.tallies.teenpatti ?? {};
  const youWon = v.winnerId === youId;

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className={panelCls}
        initial={{ scale: 0.85, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
      >
        <div className="text-center text-[10px] uppercase tracking-[0.32em] text-[#8fa396]">
          Session over · hand {v.handNo} of {v.handCap}
        </div>
        <div className="mt-2 text-center text-3xl" style={{ color: GOLD }}>
          ♛
        </div>
        <div className="mt-1 text-center text-2xl text-[#e9cf8e]">
          {youWon ? "You win the table" : `${winner?.name ?? "—"} wins the table`}
        </div>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-[13px] text-[#c9a961]">
          <ChipSvg denom={100} className="w-4" />
          {winner?.chips ?? 0} chips
        </div>

        <div className="mt-4 space-y-1">
          {standings.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] ${
                p.id === v.winnerId
                  ? "border-[#c9a961]/60 bg-[#123328] text-[#e9d9ae]"
                  : "border-[#2a4438]/60 bg-[#08170f]/70 text-[#c8bfa4]"
              }`}
            >
              <span className="w-5 text-right text-[11px] text-[#8fa396]">{i + 1}.</span>
              <span className={`min-w-0 flex-1 truncate ${p.left ? "text-[#5c6e64] line-through" : ""}`}>
                {p.name}
                {p.id === youId ? " (you)" : ""}
                {p.left ? " · left" : ""}
              </span>
              {(tallies[p.id] ?? 0) > 0 && (
                <span className="text-[11px]" style={{ color: GOLD }} title="Teen Patti session wins">
                  ♛{tallies[p.id]}
                </span>
              )}
              <span className={p.busted || p.left ? "text-[#8a5a5a] line-through" : ""}>{p.chips}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-center gap-2">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={playAgain}
                className="rounded-md border border-[#c9a961] bg-[#3a2c10] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#e9cf8e] transition hover:bg-[#4a3a16] active:scale-[0.98]"
              >
                Play again
              </button>
              <button
                type="button"
                onClick={exitToLobby}
                className="rounded-md border border-[#4a5a50] bg-transparent px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#a8b8ae] transition hover:border-[#8fa396] active:scale-[0.98]"
              >
                Back to lobby
              </button>
            </>
          ) : (
            <span className="text-[12px] uppercase tracking-[0.2em] text-[#8fa396]">
              Waiting for the host…
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------- rules ---------------- */

const RANKS: [string, string][] = [
  ["Trail (set)", "Three of a kind — A-A-A is the best hand in the game"],
  ["Pure sequence", "Straight flush — A-K-Q suited, then A-2-3, then K-Q-J … 4-3-2"],
  ["Sequence", "Straight, mixed suits — same ordering as above"],
  ["Color", "Flush — three of one suit, compared card by card"],
  ["Pair", "Two of a kind — higher pair wins, then the kicker"],
  ["High card", "Nothing — highest card wins"],
];

export function TPRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#c9a961]/50 bg-[#0a1f18] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg tracking-[0.2em] text-[#e9cf8e]">HOW TO PLAY</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#4a5a50] px-2.5 py-1 text-[12px] text-[#a8b8ae] hover:border-[#8fa396]"
            aria-label="Close rules"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 space-y-4 text-[13px] leading-relaxed text-[#c8bfa4]">
          <section>
            <h3 className="mb-1 text-[11px] uppercase tracking-[0.24em] text-[#c9a961]">The deal</h3>
            <p>
              Everyone starts the session with 200 chips and antes a boot of 2 into the pot each
              hand. Three cards each, dealt face down — everyone starts <b className="text-[#9fc0e0]">blind</b>.
              The player left of the dealer acts first; the button rotates every hand.
            </p>
          </section>

          <section>
            <h3 className="mb-1 text-[11px] uppercase tracking-[0.24em] text-[#c9a961]">Betting</h3>
            <p>
              On your turn, bet or fold — you have 40 seconds before you are folded automatically.
              A <b className="text-[#9fc0e0]">blind</b> player bets the stake (or double it to raise).
              Once you <b className="text-[#9fc0e0]">see</b> your cards you play seen and must put in
              twice the stake (or four times to raise). Raising doubles the stake for everyone after
              you. Seeing your cards is free and can be done at any time.
            </p>
          </section>

          <section>
            <h3 className="mb-1 text-[11px] uppercase tracking-[0.24em] text-[#c9a961]">Show</h3>
            <p>
              When only two players remain, either may pay for a <b className="text-[#e9cf8e]">show</b>
              {" "}(the stake if blind, twice the stake if seen): both hands are revealed and the better
              hand takes the pot. On a tie, the player who asked for the show loses.
            </p>
          </section>

          <section>
            <h3 className="mb-1 text-[11px] uppercase tracking-[0.24em] text-[#c9a961]">Hand rankings</h3>
            <ol className="space-y-1">
              {RANKS.map(([name, desc], i) => (
                <li key={name} className="flex gap-2">
                  <span className="w-4 shrink-0 text-right text-[#8fa396]">{i + 1}.</span>
                  <span>
                    <b className="text-[#e9d9ae]">{name}</b> — {desc}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="mb-1 text-[11px] uppercase tracking-[0.24em] text-[#c9a961]">Table rules</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <b className="text-[#e9d9ae]">All-in:</b> if a bet costs more than you have, you may
                push all your chips. You stop acting but stay in for the showdown of the whole pot —
                there are no side pots. When nobody left can bet, hands go straight to showdown.
              </li>
              <li>Showdown ties go to the player closest to the dealer&apos;s left.</li>
              <li>If you cannot post the boot you are out of the session (you keep leftover chips).</li>
              <li>
                The session ends when one player remains — or after 50 hands, when the richest
                player wins.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
