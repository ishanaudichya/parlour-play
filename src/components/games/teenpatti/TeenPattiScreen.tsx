"use client";

/* Teen Patti — midnight casino felt. Oval emerald table, gold-rimmed player
   pucks, blind/seen betting tray, chip flights, showdown drama. */

import { AnimatePresence, motion } from "framer-motion";
import { Marcellus } from "next/font/google";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { PartyMenu } from "@/components/party/PartyMenu";
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

/* ---------------- table geometry (pixels, fitted to the space) ---------------- */

type Pt = { x: number; y: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** natural puck footprint at zoom 1 (see PlayerPuck) */
const PUCK_W = 86;
const PUCK_H = 128;

interface TableLayout {
  /** the oval (rail outer box) */
  oval: { x: number; y: number; w: number; h: number };
  center: Pt;
  pot: Pt;
  /** opponent puck centres, in seat order */
  seats: Pt[];
  /** your seat block: top-left, size; your puck centre (chip flights) */
  mine: { x: number; y: number; w: number; h: number; puck: Pt };
  puckScale: number;
  cardW: number;
  chipW: number;
}

/** Fit the felt, the opponents' arc and your seat into the measured box.
    Everyone sits evenly around the table as if you were at the bottom;
    the arc never dips below ±126° so the lowest pucks clear your seat. */
function tableLayout(tw: number, th: number, nOpp: number, hasSeat: boolean): TableLayout {
  const narrow = tw < 640;
  const crowd = nOpp <= 3 ? 1 : nOpp <= 5 ? 0.9 : 0.8;
  const puckScale = narrow
    ? clamp((tw / 400) * crowd, 0.7, 1)
    : clamp(Math.min(th / 600, tw / 760) * (nOpp <= 5 ? 1 : 0.92), 0.8, 1.3);
  const pw = PUCK_W * puckScale;
  const ph = PUCK_H * puckScale;

  // your three cards: as large as the height allows, never wider than the seat row
  const cardW = hasSeat ? Math.round(clamp(Math.min(th * 0.15, (tw - pw - 40) / 3.3), 48, 112)) : 0;
  const seatW = hasSeat ? pw + 14 + cardW * 3 + 12 : 0;
  const seatH = hasSeat ? Math.max(ph, cardW * 1.4 + 22) : 0;

  // the oval sits above your seat, which overlaps its bottom rail
  const top = ph * 0.42;
  const sink = hasSeat ? seatH * 0.6 : ph * 0.35;
  const side = narrow ? 6 : Math.max(16, pw * 0.35);
  let h = th - top - sink;
  let w = Math.min(tw - side * 2, h * 1.9);
  if (narrow) h = Math.min(h, w * 1.55);
  else h = Math.min(h, w / 1.15);
  w = Math.min(w, tw - side * 2);
  const used = top + h + sink;
  const y0 = Math.max(0, (th - used) / 2) + top;
  const x0 = (tw - w) / 2;
  const center = { x: tw / 2, y: y0 + h / 2 };

  const N = nOpp + (hasSeat ? 1 : 0);
  const half = nOpp <= 1 ? 0 : Math.min(126, 180 - 360 / Math.max(N, 2));
  const seats: Pt[] = [];
  for (let i = 0; i < nOpp; i++) {
    const deg = nOpp <= 1 ? 0 : -half + (2 * half * i) / (nOpp - 1);
    const rad = (deg * Math.PI) / 180;
    // rounded: trig can differ by 1 ULP between engines
    const x = Number((center.x + (w / 2) * 0.9 * Math.sin(rad)).toFixed(1));
    const y = Number((center.y - (h / 2) * 0.86 * Math.cos(rad)).toFixed(1));
    seats.push({ x: clamp(x, pw / 2 + 2, tw - pw / 2 - 2), y: clamp(y, ph / 2, th - ph / 2) });
  }

  const seatTop = Math.min(th - seatH, y0 + h - seatH * 0.4);
  const mine = {
    x: (tw - seatW) / 2,
    y: seatTop,
    w: seatW,
    h: seatH,
    puck: { x: (tw - seatW) / 2 + pw / 2, y: seatTop + ph / 2 },
  };
  const chipW = clamp(w / 34, 18, 30);
  return {
    oval: { x: x0, y: y0, w, h },
    center,
    pot: { x: center.x, y: center.y - h * 0.06 },
    seats,
    mine,
    puckScale,
    cardW,
    chipW,
  };
}

const lerp = (a: Pt, b: Pt, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Track an element's size (ResizeObserver), for fit-to-screen layouts. */
function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

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

  const showMyHand = !spectating && !!me && me.inHand && !me.busted;
  const hasSeat = !spectating && !!me;

  const [tableRef, box] = useBoxSize<HTMLDivElement>();
  const L = tableLayout(box?.w ?? 900, box?.h ?? 560, others.length, hasSeat);

  /* pixel positions for chip flights */
  const posMap = new Map<string, Pt>();
  others.forEach((p, i) => posMap.set(p.id, L.seats[i]));
  if (me && hasSeat) posMap.set(me.id, L.mine.puck);

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
    v.phase === "hand_over" && v.lastHand ? posMap.get(v.lastHand.winnerId) ?? L.pot : null;

  const myCards = v.yourCards;
  const ps = L.puckScale;
  const flyW = Math.round(L.chipW * 0.8);

  return (
    <div
      className={`${marcellus.className} relative flex h-dvh flex-col overflow-hidden text-[#efe6d0]`}
      style={{ background: "radial-gradient(130% 100% at 50% 0%, #10261e 0%, #0a1a14 55%, #050d0a 100%)" }}
      onPointerDown={primeSound}
    >
      {/* header — floats above the hand/session overlays so the Parlour menu is always reachable */}
      <header className="relative z-[55] flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-2.5 sm:px-5">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 whitespace-nowrap text-[15px] tracking-[0.26em] text-[#e9cf8e] sm:tracking-[0.34em]">
            TEEN PATTI
            {spectating && (
              <span className="hidden rounded-full border border-[#7ea0c2]/40 bg-[#101c2a]/80 px-2 py-px text-[9px] uppercase tracking-[0.24em] text-[#9fc0e0] sm:inline">
                Spectating
              </span>
            )}
          </h1>
          <div className="truncate text-[10px] uppercase tracking-[0.12em] text-[#8fa396] sm:tracking-[0.22em]">
            Hand {Math.max(1, v.handNo)} of {v.handCap} · stake {v.stake}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className={`h-8 rounded-md border border-[#4a5a50]/70 px-2.5 text-[13px] transition hover:border-[#c9a961]/70 hover:text-[#e9cf8e] ${
              muted ? "text-[#5c6e64] line-through" : "text-[#a8b8ae]"
            }`}
          >
            ♪
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            aria-label="Rules"
            className="h-8 min-w-8 rounded-md border border-[#4a5a50]/70 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a8b8ae] transition hover:border-[#c9a961]/70 hover:text-[#e9cf8e]"
          >
            <span className="text-[12px] sm:hidden">?</span>
            <span className="hidden sm:inline">Rules</span>
          </button>
          <PartyMenu
            className="text-[#c9b98f]"
            style={{ borderRadius: 6, borderColor: "rgba(74,90,80,.7)", background: "rgba(6,20,15,.6)" }}
          />
        </div>
      </header>

      {/* log ticker */}
      <div className="flex h-5 shrink-0 items-center justify-center gap-2 px-4 text-[11px] italic text-[#8fa396] sm:text-[12px]">
        {spectating && (
          <span className="shrink-0 rounded-full border border-[#7ea0c2]/40 bg-[#101c2a]/80 px-2 py-px text-[9px] not-italic uppercase tracking-[0.2em] text-[#9fc0e0] sm:hidden">
            Watching
          </span>
        )}
        <span className="min-w-0 truncate">{lastLog ? logLine(lastLog) : ""}</span>
      </div>

      {/* ---------------- the table (measured; everything inside is placed in px) ---------------- */}
      <div ref={tableRef} className="relative min-h-0 flex-1">
        {/* mahogany rail */}
        <div
          className="absolute"
          style={{
            left: L.oval.x,
            top: L.oval.y,
            width: L.oval.w,
            height: L.oval.h,
            borderRadius: "50%",
            background: "linear-gradient(160deg, #4a2420, #2b1210 60%, #1c0b0a)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.6), inset 0 2px 3px rgba(255,255,255,0.08)",
            padding: clamp(L.oval.w * 0.013, 8, 16),
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
            className="pointer-events-none absolute"
            style={{
              inset: clamp(L.oval.w * 0.013, 8, 16) + 6,
              borderRadius: "50%",
              border: "1px solid rgba(201,169,97,0.28)",
            }}
          />
        </div>

        {/* pot */}
        <div
          className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: L.pot.x, top: L.pot.y }}
        >
          <div className="flex items-end gap-1">
            <ChipStack amount={Math.floor(v.pot / 2)} w={Math.round(L.chipW * 0.85)} />
            <ChipStack amount={v.pot - Math.floor(v.pot / 2)} w={Math.round(L.chipW)} />
          </div>
          <div
            className="mt-1 rounded-full border border-[#c9a961]/40 bg-[#06251c]/85 px-3 py-0.5 tracking-[0.1em]"
            style={{ color: GOLD, fontSize: clamp(L.chipW * 0.6, 13, 17) }}
          >
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
              // just clear of the puck, on the line to the pot (top seats sit close to it)
              const dist = Math.hypot(L.pot.x - pos.x, L.pot.y - pos.y) || 1;
              const at = lerp(pos, L.pot, clamp((PUCK_H * ps * 0.6 + 16) / dist, 0.38, 0.64));
              return (
                <div
                  key={`bet-${p.id}`}
                  className={`absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center ${p.folded ? "opacity-40" : ""}`}
                  style={{ left: at.x, top: at.y }}
                >
                  <ChipStack amount={p.betThisHand} w={Math.round(L.chipW * 0.66)} />
                  <span className="text-[10px] text-[#c9a961]/90">{p.betThisHand}</span>
                </div>
              );
            })}

        {/* chip arcing to the pot on the latest bet */}
        {v.phase === "playing" && lastBet && lastBetPos && (
          <motion.div
            key={`fly-${lastBet.i}`}
            className="pointer-events-none absolute z-20"
            style={{ width: flyW, marginLeft: -flyW / 2, marginTop: -flyW / 2 }}
            initial={{ left: lastBetPos.x, top: lastBetPos.y, scale: 1, opacity: 1 }}
            animate={{
              left: L.pot.x,
              top: L.pot.y,
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
              className="pointer-events-none absolute z-20"
              style={{ width: flyW, marginLeft: -flyW / 2, marginTop: -flyW / 2 }}
              initial={{ left: L.pot.x, top: L.pot.y, opacity: 1, scale: 1 }}
              animate={{
                left: winnerPos.x + ((i % 3) - 1) * flyW * 0.6,
                top: winnerPos.y,
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
          const pos = L.seats[i];
          return (
            <div
              key={p.id}
              className="absolute z-10"
              style={{ left: pos.x - (PUCK_W * ps) / 2, top: pos.y - (PUCK_H * ps) / 2 }}
            >
              <div style={{ zoom: ps }}>
                <PlayerPuck
                  p={p}
                  isDealer={v.dealerId === p.id}
                  isTurn={v.phase === "playing" && v.turn === p.id}
                  frac={frac}
                  isWinner={v.phase === "hand_over" && v.lastHand?.winnerId === p.id}
                />
              </div>
            </div>
          );
        })}

        {/* ---------------- your seat ---------------- */}
        {me && hasSeat && (
          <div
            className="absolute z-10 flex items-end justify-center gap-3.5"
            style={{ left: L.mine.x, top: L.mine.y, width: L.mine.w, height: L.mine.h }}
          >
            <div className="shrink-0 self-center" style={{ zoom: ps }}>
              <PlayerPuck
                p={me}
                isDealer={v.dealerId === me.id}
                isTurn={v.phase === "playing" && v.turn === me.id}
                frac={frac}
                isWinner={v.phase === "hand_over" && v.lastHand?.winnerId === me.id}
                isYou
              />
            </div>
            {/* your three cards; out of the hand, the puck sits alone (the tray says why) */}
            {showMyHand && (
              <div className="flex flex-col items-center" style={{ width: L.cardW * 3 + 12 }}>
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
                      <div style={{ width: L.cardW }}>
                        <FlipCard
                          card={myCards?.[i] ?? null}
                          faceUp={!!myCards}
                          delay={i * 0.12}
                          dim={me.folded}
                          className="w-full"
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
                <div
                  className="mt-1.5 h-4 truncate text-center tracking-[0.14em]"
                  style={{ color: myCards ? GOLD : "#9fc0e0", fontSize: clamp(L.cardW * 0.12, 11, 13), width: "100%" }}
                >
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
