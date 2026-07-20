"use client";

/* Teen Patti — midnight casino felt. Oval emerald table, gold-rimmed player
   pucks, blind/seen betting tray, chip flights, showdown drama. */

import { AnimatePresence, motion } from "framer-motion";
import { Marcellus } from "next/font/google";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getMutedServerSnapshot,
  getMutedSnapshot,
  primeSound,
  setMuted,
  subscribeMuted,
} from "@/lib/client/synthCore";
import { rankLabel } from "@/lib/games/teenpatti/ranking";
import {
  TURN_MS,
  type TeenPattiMove,
  type TeenPattiView,
  type TPLogEntry,
} from "@/lib/games/teenpatti/types";
import type { GameScreenProps } from "@/lib/party/types";
import { ActionTray } from "./ActionTray";
import { ChipStack, ChipSvg } from "./Chips";
import { SessionOverOverlay, ShowdownOverlay, TPRulesModal } from "./Overlays";
import { FlipCard } from "./PlayingCard";
import { PlayerPuck } from "./PlayerPuck";
import { playTeenPattiDiff } from "./sfx";

const marcellus = Marcellus({ weight: "400", subsets: ["latin"], display: "swap" });

const GOLD = "#c9a961";

/* subtle damask diamonds worked into the felt */
const FELT_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Cpath d='M24 4 L44 24 L24 44 L4 24 Z' fill='none' stroke='%23c9a961' stroke-opacity='0.055'/%3E%3Cpath d='M24 14 L34 24 L24 34 L14 24 Z' fill='none' stroke='%23c9a961' stroke-opacity='0.04'/%3E%3Ccircle cx='24' cy='24' r='1' fill='%23c9a961' fill-opacity='0.05'/%3E%3C/svg%3E\")";

/* ---------------- clock (no impure calls during render) ---------------- */

/** Smoothly advancing estimate of server time: client clock + skew, updated
    on an interval so render itself stays pure. */
function useNowEst(serverNow: number, skew: number): number {
  const [nowEst, setNowEst] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNowEst(Date.now() + skew), 200);
    return () => clearInterval(id);
  }, [skew]);
  return Math.max(nowEst, serverNow);
}

/* ---------------- table geometry (percent coordinates) ---------------- */

const CENTER = { x: 50, y: 42 };
const MY_POS = { x: 50, y: 96 };

function seatPos(i: number, m: number): { x: number; y: number } {
  const f = m <= 1 ? 0.5 : i / (m - 1);
  const rad = ((-126 + 252 * f) * Math.PI) / 180; // arc over the top of the oval
  // rounded: sin/cos can differ by 1 ULP between server and client (hydration)
  return {
    x: Number((50 + 42 * Math.sin(rad)).toFixed(2)),
    y: Number((CENTER.y - 33 * Math.cos(rad)).toFixed(2)),
  };
}

const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/* ---------------- log ticker ---------------- */

function logLine(l: TPLogEntry): string {
  switch (l.kind) {
    case "next_hand": return `Hand ${l.hand} — ${l.actor} has the button`;
    case "boot": return `Boots in the pot (+${l.amount})`;
    case "deal": return "Three cards each, everyone blind";
    case "see": return `${l.actor} looks at their cards`;
    case "blind_bet": return `${l.actor} bets ${l.amount} blind`;
    case "chaal": return `${l.actor} plays chaal for ${l.amount}`;
    case "raise": return `${l.actor} raises — ${l.amount} in`;
    case "allin": return `${l.actor} is ALL-IN`;
    case "fold": return `${l.actor} folds`;
    case "timeout": return `${l.actor} ran out of time`;
    case "show": return `${l.actor} pays ${l.amount} for a show`;
    case "showdown": return l.detail ?? "Showdown";
    case "win_hand": return `${l.actor} wins the pot (${l.amount})`;
    case "bust": return `${l.actor} is out of chips`;
    case "leave": return `${l.actor} left the table`;
    case "session_over": return `${l.actor} wins the session`;
    default: return "";
  }
}

const BET_KINDS = new Set<TPLogEntry["kind"]>(["blind_bet", "chaal", "raise", "allin", "show"]);

/* ==================== screen ==================== */

export function TeenPattiScreen(props: GameScreenProps<TeenPattiView>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;
  const [rulesOpen, setRulesOpen] = useState(false);
  const nowEst = useNowEst(v.now, skew);
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);

  const send = useCallback((m: TeenPattiMove) => move(m), [move]);

  /* sounds: diff the previous view's log against the new one */
  const prevRef = useRef<TeenPattiView | null>(null);
  useEffect(() => {
    playTeenPattiDiff(prevRef.current, v, youId);
    prevRef.current = v;
  }, [v, youId]);

  /* tab title nudge on your turn */
  const myTurn = !spectating && v.phase === "playing" && v.turn === youId;
  useEffect(() => {
    document.title = myTurn ? "● Your move — Teen Patti" : "Teen Patti";
  }, [myTurn]);

  const me = v.players.find((p) => p.id === youId) ?? null;
  const n = v.players.length;
  const mySeat = me?.seat ?? 0;
  const others = v.players
    .filter((p) => p.id !== youId)
    .sort((a, b) => ((a.seat - mySeat + n) % n) - ((b.seat - mySeat + n) % n));

  /* percent positions for chip flights */
  const posMap = new Map<string, { x: number; y: number }>();
  others.forEach((p, i) => posMap.set(p.id, seatPos(i, others.length)));
  if (me) posMap.set(me.id, MY_POS);

  const frac =
    v.phase === "playing" && v.deadline
      ? Math.max(0, Math.min(1, (v.deadline - nowEst) / TURN_MS))
      : null;

  const lastLog = v.log.length ? v.log[v.log.length - 1] : null;
  const lastBet = [...v.log].reverse().find((l) => BET_KINDS.has(l.kind) && l.actor) ?? null;
  const lastBetPos = lastBet
    ? posMap.get(v.players.find((p) => p.name === lastBet.actor)?.id ?? "") ?? null
    : null;
  const winnerPos =
    v.phase === "hand_over" && v.lastHand ? posMap.get(v.lastHand.winnerId) ?? CENTER : null;

  const myCards = v.yourCards;
  const showMyHand = !spectating && !!me && me.inHand && !me.busted;

  return (
    <div
      className={`${marcellus.className} relative flex min-h-[100dvh] flex-col overflow-hidden text-[#efe6d0]`}
      style={{ background: "radial-gradient(130% 100% at 50% 0%, #10261e 0%, #0a1a14 55%, #050d0a 100%)" }}
      onPointerDown={primeSound}
    >
      {/* header */}
      <header className="flex items-center justify-between px-3 pt-2.5 pb-1 sm:px-5">
        <div>
          <h1 className="text-[15px] tracking-[0.34em] text-[#e9cf8e]">TEEN PATTI</h1>
          <div className="text-[10px] uppercase tracking-[0.22em] text-[#8fa396]">
            Hand {Math.max(1, v.handNo)} of {v.handCap} · stake {v.stake}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className={`rounded-md border border-[#4a5a50]/70 px-2.5 py-1.5 text-[13px] transition hover:border-[#c9a961]/70 hover:text-[#e9cf8e] ${
              muted ? "text-[#5c6e64] line-through" : "text-[#a8b8ae]"
            }`}
          >
            ♪
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="rounded-md border border-[#4a5a50]/70 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a8b8ae] transition hover:border-[#c9a961]/70 hover:text-[#e9cf8e]"
          >
            Rules
          </button>
        </div>
      </header>

      {spectating && (
        <div className="mx-auto mt-1 rounded-full border border-[#7ea0c2]/40 bg-[#101c2a]/80 px-3 py-0.5 text-[10px] uppercase tracking-[0.26em] text-[#9fc0e0]">
          Spectating
        </div>
      )}

      {/* log ticker */}
      <div className="h-5 px-4 text-center text-[11px] italic text-[#8fa396]">
        {lastLog ? logLine(lastLog) : ""}
      </div>

      {/* ---------------- the table ---------------- */}
      <div className="relative mx-auto min-h-[330px] w-full max-w-3xl flex-1 px-1 pb-16 pt-6 sm:pb-14">
        {/* mahogany rail */}
        <div
          className="absolute inset-x-3 top-2 bottom-10 sm:inset-x-8"
          style={{
            borderRadius: "50%",
            background: "linear-gradient(160deg, #4a2420, #2b1210 60%, #1c0b0a)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.6), inset 0 2px 3px rgba(255,255,255,0.08)",
            padding: "10px",
          }}
        >
          {/* the felt */}
          <div
            className="h-full w-full"
            style={{
              borderRadius: "50%",
              background: "radial-gradient(ellipse at 50% 36%, #11543f 0%, #0d4a37 48%, #06251c 100%)",
              boxShadow: "inset 0 0 70px rgba(2,16,11,0.9), inset 0 0 6px rgba(201,169,97,0.35)",
            }}
          >
            <div className="h-full w-full" style={{ borderRadius: "50%", backgroundImage: FELT_PATTERN }} />
          </div>
          {/* gold pinstripe */}
          <div
            className="pointer-events-none absolute inset-[16px]"
            style={{ borderRadius: "50%", border: "1px solid rgba(201,169,97,0.28)" }}
          />
        </div>

        {/* pot */}
        <div
          className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: `${CENTER.x}%`, top: `${CENTER.y}%` }}
        >
          <div className="flex items-end gap-1">
            <ChipStack amount={Math.floor(v.pot / 2)} w={20} />
            <ChipStack amount={v.pot - Math.floor(v.pot / 2)} w={24} />
          </div>
          <div className="mt-1 rounded-full border border-[#c9a961]/40 bg-[#06251c]/85 px-3 py-0.5 text-[13px] tracking-[0.1em]" style={{ color: GOLD }}>
            POT {v.pot}
          </div>
        </div>

        {/* per-player bet stacks on the felt */}
        {v.phase === "playing" &&
          v.players
            .filter((p) => p.inHand && p.betThisHand > 0)
            .map((p) => {
              const pos = posMap.get(p.id);
              if (!pos) return null;
              const at = lerp(pos, CENTER, 0.42);
              return (
                <div
                  key={`bet-${p.id}`}
                  className={`absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center ${p.folded ? "opacity-40" : ""}`}
                  style={{ left: `${at.x}%`, top: `${at.y}%` }}
                >
                  <ChipStack amount={p.betThisHand} w={15} />
                  <span className="text-[9px] text-[#c9a961]/90">{p.betThisHand}</span>
                </div>
              );
            })}

        {/* chip arcing to the pot on the latest bet */}
        {v.phase === "playing" && lastBet && lastBetPos && (
          <motion.div
            key={`fly-${lastBet.i}`}
            className="pointer-events-none absolute z-20 w-[18px]"
            style={{ marginLeft: -9, marginTop: -9 }}
            initial={{ left: `${lastBetPos.x}%`, top: `${lastBetPos.y}%`, scale: 1, opacity: 1 }}
            animate={{
              left: `${CENTER.x}%`,
              top: `${CENTER.y}%`,
              scale: [1, 1.35, 0.9],
              opacity: [1, 1, 0],
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <ChipSvg denom={lastBet.kind === "allin" ? 25 : 5} />
          </motion.div>
        )}

        {/* pot cascading to the hand winner */}
        {winnerPos &&
          v.lastHand &&
          v.lastHand.amount > 0 &&
          Array.from({ length: 7 }, (_, i) => (
            <motion.div
              key={`cascade-${v.lastHand!.handNo}-${i}`}
              className="pointer-events-none absolute z-20 w-[17px]"
              style={{ marginLeft: -8, marginTop: -8 }}
              initial={{ left: `${CENTER.x}%`, top: `${CENTER.y}%`, opacity: 1, scale: 1 }}
              animate={{
                left: `${winnerPos.x + ((i % 3) - 1) * 2}%`,
                top: `${winnerPos.y}%`,
                opacity: [1, 1, 0],
                scale: [1, 1.2, 0.8],
              }}
              transition={{ delay: 0.15 + i * 0.09, duration: 0.65, ease: "easeIn" }}
            >
              <ChipSvg denom={[100, 25, 5][i % 3]} />
            </motion.div>
          ))}

        {/* opponent pucks */}
        {others.map((p, i) => {
          const pos = seatPos(i, others.length);
          return (
            <div
              key={p.id}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <PlayerPuck
                p={p}
                isDealer={v.dealerId === p.id}
                isTurn={v.phase === "playing" && v.turn === p.id}
                frac={frac}
                isWinner={v.phase === "hand_over" && v.lastHand?.winnerId === p.id}
              />
            </div>
          );
        })}
      </div>

      {/* ---------------- your seat ---------------- */}
      <div className="relative z-10 -mt-14 flex flex-col items-center">
        {me && (
          <div className="flex items-end justify-center gap-4">
            <PlayerPuck
              p={me}
              isDealer={v.dealerId === me.id}
              isTurn={v.phase === "playing" && v.turn === me.id}
              frac={frac}
              isWinner={v.phase === "hand_over" && v.lastHand?.winnerId === me.id}
              isYou
            />
            {showMyHand && (
              <div className="flex flex-col items-center">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={`${v.handNo}-${i}`}
                      initial={{ y: -46, opacity: 0, scale: 0.7 }}
                      animate={
                        me.folded
                          ? { y: 14, opacity: 0.45, scale: 0.95 }
                          : { y: 0, opacity: 1, scale: 1 }
                      }
                      transition={{ delay: me.folded ? 0 : 0.15 + i * 0.12, duration: 0.45 }}
                    >
                      <FlipCard
                        card={myCards?.[i] ?? null}
                        faceUp={!!myCards}
                        delay={i * 0.12}
                        dim={me.folded}
                        className="w-14 sm:w-[68px]"
                      />
                    </motion.div>
                  ))}
                </div>
                <div className="mt-1 text-[11px] tracking-[0.14em]" style={{ color: myCards ? GOLD : "#9fc0e0" }}>
                  {me.folded
                    ? "Folded"
                    : myCards
                      ? rankLabel(myCards)
                      : "Playing blind — tap See to peek"}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ActionTray v={v} youId={youId} spectating={spectating} send={send} />

      {/* ---------------- overlays ---------------- */}
      <AnimatePresence>
        {v.phase === "hand_over" && v.lastHand && (
          <ShowdownOverlay key={`hand-${v.lastHand.handNo}`} v={v} youId={youId} nowEst={nowEst} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {v.phase === "session_over" && (
          <SessionOverOverlay
            key="session-over"
            v={v}
            party={party}
            youId={youId}
            isHost={isHost}
            playAgain={playAgain}
            exitToLobby={exitToLobby}
          />
        )}
      </AnimatePresence>
      {rulesOpen && <TPRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
