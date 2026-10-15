"use client";

/* UNO — top-level game screen. Neon arcade playful: charcoal backdrop, glow
   tinted by the active color, chunky rounded geometry, Baloo 2. */

import { AnimatePresence, motion } from "framer-motion";
import { Baloo_2 } from "next/font/google";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { PartyMenu } from "@/components/party/PartyMenu";
import {
  getMutedServerSnapshot,
  getMutedSnapshot,
  primeSound,
  setMuted,
  subscribeMuted,
} from "@/lib/client/synthCore";
import { isPlayable } from "@/lib/games/uno/engine";
import type {
  UnoCard,
  UnoColor,
  UnoLogEntry,
  UnoLogKind,
  UnoMove,
  UnoSymbol,
  UnoView,
} from "@/lib/games/uno/types";
import type { GameScreenProps } from "@/lib/party/types";
import { CardFace, UNO_HEX } from "./cards";
import { ColorPicker, DrawnPrompt, GameOverOverlay, RulesModal } from "./overlays";
import { unoSfx, type UnoSfxName } from "./sfx";
import {
  CHIP_H,
  CHIP_W,
  DirectionRing,
  DiscardStack,
  DrawPile,
  EASE,
  OpponentChip,
  TurnClock,
  turnPctOf,
} from "./table";

const baloo = Baloo_2({ subsets: ["latin"], weight: ["500", "600", "700", "800"] });

const KEYFRAMES = `
@keyframes uno-rot { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes uno-flash { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.uno-scroll { scrollbar-width: none; }
.uno-scroll::-webkit-scrollbar { display: none; }
`;

/* ---------------- pure helpers ---------------- */

const COLOR_ORDER: Record<UnoColor, number> = { red: 0, yellow: 1, green: 2, blue: 3 };
const SYM_ORDER: Record<UnoSymbol, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  skip: 10, reverse: 11, draw2: 12, wild: 13, wild4: 14,
};

function sortHand(hand: UnoCard[]): UnoCard[] {
  return [...hand].sort(
    (a, b) =>
      (a.color ? COLOR_ORDER[a.color] : 4) - (b.color ? COLOR_ORDER[b.color] : 4) ||
      SYM_ORDER[a.symbol] - SYM_ORDER[b.symbol] ||
      a.id.localeCompare(b.id)
  );
}

function recentEntry(
  view: UnoView,
  serverNow: number,
  pred: (l: UnoLogEntry) => boolean,
  within = 3200
): UnoLogEntry | null {
  for (let i = view.log.length - 1; i >= 0; i--) {
    const l = view.log[i];
    if (pred(l)) return serverNow - l.ts <= within ? l : null;
  }
  return null;
}

function logText(l: UnoLogEntry): string {
  switch (l.kind) {
    case "play": return `${l.actor} played ${l.color} ${l.symbol}`;
    case "skip": return `${l.actor} skipped ${l.target}`;
    case "reverse": return `${l.actor} reversed the direction`;
    case "draw2": return `${l.actor} made ${l.target} draw ${l.n ?? 2}`;
    case "wild": return `${l.actor} went wild — ${l.color} now`;
    case "wild4": return `${l.actor} hit ${l.target} with +4 — ${l.color} now`;
    case "draw": return `${l.actor} drew a card`;
    case "pass": return `${l.actor} passed`;
    case "uno": return `${l.actor} called UNO!`;
    case "catch": return `${l.actor} caught ${l.target} — +${l.n ?? 2}`;
    case "timeout": return `${l.actor} ran out of time`;
    case "leave": return `${l.actor} left the table`;
    case "win": return `${l.actor} wins the round!`;
  }
}

const LOG_SFX: Partial<Record<UnoLogKind, UnoSfxName>> = {
  play: "pop",
  draw: "swish",
  pass: "click",
  skip: "skip",
  reverse: "reverse",
  draw2: "buzz",
  wild: "shimmer",
  wild4: "buzz",
  uno: "uno",
  catch: "catch",
  timeout: "timeout",
  leave: "leave",
};

/* ---------------- layout ---------------- */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const HEADER_H = 48;
const ACTION_H = 48;

interface UnoLayout {
  compact: boolean;
  /** opponent chip zoom + rows */
  chipScale: number;
  oppCols: number;
  oppGap: number;
  oppH: number;
  /** your hand: card width + fan step between card origins */
  handW: number;
  handStep: number;
  handH: number;
  /** draw / discard pile card width */
  pileW: number;
  ring: number;
  pileGap: number;
  stackGap: number;
  /** status pill font size */
  pill: number;
}

/** Size everything from the viewport: opponents across the top, your hand
    along the bottom, and the piles take whatever height is left. */
function unoLayout(W: number, H: number, nOpp: number, handN: number, spectating: boolean): UnoLayout {
  const compact = W < 640;
  const availW = W - 24;

  /* opponents: one row if they fit at a readable size, else two */
  const oppGap = compact ? 8 : 12;
  const ideal = compact ? 1 : clamp(H / 800, 0.85, 1.4);
  const n = Math.max(1, nOpp);
  const fitOne = (availW - (n - 1) * oppGap) / n / CHIP_W;
  let oppCols = n;
  let chipScale = Math.min(ideal, fitOne);
  if (fitOne < 0.8) {
    oppCols = Math.ceil(n / 2);
    chipScale = Math.min(ideal, (availW - (oppCols - 1) * oppGap) / oppCols / CHIP_W);
  }
  const rows = Math.ceil(n / oppCols);
  const oppH = nOpp === 0 ? 8 : rows * CHIP_H * chipScale + (rows - 1) * oppGap + 22;

  /* your hand: as tall as ~15% of the screen, shrunk only when the fan
     would otherwise overlap past the corner indices */
  const baseHandW = Math.min(clamp(H * 0.15, 60, 168), compact ? availW / 3.3 : 999);
  let handW = baseHandW;
  const m = Math.max(1, handN);
  const minStep = 0.36;
  if (m > 1 && handW + (m - 1) * handW * minStep > availW - 24) {
    handW = Math.max(54, (availW - 24) / (1 + minStep * (m - 1)));
  }
  const handStep = m > 1 ? clamp((availW - 24 - handW) / (m - 1), handW * 0.3, handW * 0.64) : handW;
  // card + lift room above + rotation droop below + the safe-area pad
  const handH = spectating ? 72 : handW * 1.6 + 30;

  /* piles get the rest of the height, capped by width and by the hand's
     natural size (not the squeezed one — a big hand shouldn't shrink the piles) */
  const centerH = H - HEADER_H - oppH - ACTION_H - handH;
  const stackGap = clamp(centerH * 0.045, 6, 22);
  const chrome = 30 + 8 + 6 + 22 + stackGap * 2; // status pill, clock, colour tag
  const byH = (centerH - chrome - 14) / 1.5;
  const ringGuess = clamp(byH * 0.42, 40, 72);
  const pileGap = compact ? 14 : clamp(W * 0.02, 18, 40);
  const byW = (availW - ringGuess - pileGap * 2) / 2 - 10;
  const pileW = Math.floor(clamp(Math.min(byH, byW, baseHandW * 1.4, 236), 52, 236));
  const ring = Math.round(clamp(pileW * 0.42, 36, 72));
  const pill = clamp(pileW * 0.1, 12, 16);

  return { compact, chipScale, oppCols, oppGap, oppH, handW, handStep, handH, pileW, ring, pileGap, stackGap, pill };
}

/** Track an element's size (ResizeObserver), for fit-to-screen layouts. */
function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s && s.w === Math.round(r.width) && s.h === Math.round(r.height) ? s : { w: Math.round(r.width), h: Math.round(r.height) }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/* ---------------- hooks ---------------- */

/** Server-clock "now", ticking locally every 200ms using the party skew. */
function useServerNow(skew: number, fallback: number): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew), 200);
    return () => clearInterval(id);
  }, [skew]);
  return now || fallback;
}

/** Play sounds by diffing fresh log entries against the previous view. */
function useUnoSounds(view: UnoView, youId: string, spectating: boolean) {
  const prevRef = useRef<UnoView | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = view;
    if (!prev) return;
    const lastSeen = prev.log.length ? prev.log[prev.log.length - 1].i : 0;
    const played = new Set<UnoSfxName>();
    for (const l of view.log) {
      if (l.i <= lastSeen) continue;
      if (l.kind === "win") {
        unoSfx(view.winner === youId ? "win" : "defeat");
        continue;
      }
      const name = LOG_SFX[l.kind];
      if (name && !played.has(name)) {
        unoSfx(name);
        played.add(name);
      }
    }
    const becameMyTurn =
      !spectating && view.phase === "play" && view.turn === youId && prev.turn !== youId;
    if (becameMyTurn) {
      unoSfx("turn");
      try {
        navigator.vibrate?.(60);
      } catch {}
    }
  }, [view, youId, spectating]);
}

/* ---------------- small bits ---------------- */

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-white/10 bg-white/5 text-white/70 transition-colors hover:border-white/25 hover:text-white"
    >
      {children}
    </button>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5z" fill="currentColor" stroke="none" />
      {muted ? (
        <>
          <line x1="15" y1="9" x2="21" y2="15" />
          <line x1="21" y1="9" x2="15" y2="15" />
        </>
      ) : (
        <>
          <path d="M15 9.5a4 4 0 0 1 0 5" />
          <path d="M17.5 7a8 8 0 0 1 0 10" />
        </>
      )}
    </svg>
  );
}

/* ---------------- screen ---------------- */

export function UnoScreen(props: GameScreenProps<UnoView>) {
  const { view, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;

  const [unoArmed, setUnoArmed] = useState(false);
  const [wildPick, setWildPick] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const serverNow = useServerNow(skew, view.now);
  useUnoSounds(view, youId, spectating);

  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);

  const send = useCallback((m: UnoMove) => move(m), [move]);

  const you = view.players.find((p) => p.id === youId);
  const opponents = useMemo(() => {
    const others = view.players.filter((p) => p.id !== youId);
    if (!you) return others;
    const n = view.players.length;
    return [...others].sort(
      (a, b) => ((a.seat - you.seat + n) % n) - ((b.seat - you.seat + n) % n)
    );
  }, [view.players, youId, you]);

  const hex = UNO_HEX[view.activeColor];
  const isYourTurn = view.phase === "play" && view.turn === youId && !spectating;
  const turnPlayer = view.players.find((p) => p.id === view.turn);

  const hand = useMemo(() => (view.hand ? sortHand(view.hand) : []), [view.hand]);
  const playableIds = useMemo(() => {
    const ids = new Set<string>();
    if (!isYourTurn || !view.hand) return ids;
    for (const c of view.hand) {
      if (view.hasDrawn && c.id !== view.drawnCardId) continue;
      if (isPlayable(c, view.discardTop, view.activeColor)) ids.add(c.id);
    }
    return ids;
  }, [isYourTurn, view.hand, view.hasDrawn, view.drawnCardId, view.discardTop, view.activeColor]);

  const drawnCard =
    isYourTurn && view.hasDrawn && view.drawnCardId
      ? (view.hand?.find((c) => c.id === view.drawnCardId) ?? null)
      : null;

  const catchTargets = spectating
    ? []
    : view.players.filter((p) => p.catchable && !p.left && p.id !== youId);
  const selfCatchable = !spectating && !!you?.catchable;
  const showUnoPill = !spectating && view.phase === "play" && (selfCatchable || hand.length === 2);
  const mustDraw = isYourTurn && !view.hasDrawn && playableIds.size === 0;

  const lastEntry = view.log.length ? view.log[view.log.length - 1] : null;
  const lastPlayEntry = recentEntry(
    view,
    serverNow,
    (l) => l.kind === "play" || l.kind === "skip" || l.kind === "reverse" || l.kind === "draw2" || l.kind === "wild" || l.kind === "wild4",
    60_000
  );
  const flyFrom = lastPlayEntry && you && lastPlayEntry.actor === you.name ? "you" : "them";
  const myBurst = you
    ? recentEntry(
        view,
        serverNow,
        (l) => (l.kind === "draw2" || l.kind === "wild4" || l.kind === "catch") && l.target === you.name
      )
    : null;

  const sendPlay = useCallback(
    (cardId: string, chooseColor?: UnoColor) => {
      primeSound();
      send({ type: "play", cardId, chooseColor, declareUno: unoArmed || undefined });
      setUnoArmed(false);
      setWildPick(null);
    },
    [send, unoArmed]
  );

  const onCardTap = useCallback(
    (card: UnoCard) => {
      if (!playableIds.has(card.id)) return;
      primeSound();
      if (card.color === null) {
        unoSfx("click");
        setWildPick(card.id);
        return;
      }
      sendPlay(card.id);
    },
    [playableIds, sendPlay]
  );

  const onDraw = useCallback(() => {
    primeSound();
    send({ type: "draw" });
  }, [send]);

  const onPass = useCallback(() => {
    primeSound();
    send({ type: "pass" });
  }, [send]);

  const [rootRef, box] = useBoxSize<HTMLDivElement>();
  const L = unoLayout(box?.w ?? 1280, box?.h ?? 800, opponents.length, hand.length, !view.hand);
  const clockW = Math.round(clamp(L.pileW * 2.6, 170, 360));

  return (
    <div
      ref={rootRef}
      className={`${baloo.className} relative flex h-dvh w-full flex-col overflow-hidden bg-[#141418] text-white`}
    >
      <style>{KEYFRAMES}</style>

      {/* active-color ambient glow (crossfades on color change) */}
      <AnimatePresence>
        <motion.div
          key={view.activeColor}
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          style={{
            background: `radial-gradient(120% 65% at 50% -12%, ${hex}30, transparent 60%), radial-gradient(110% 55% at 50% 116%, ${hex}22, transparent 55%)`,
          }}
        />
      </AnimatePresence>

      {/* top bar — sits above every overlay so the Parlour menu stays reachable */}
      <header className="relative z-[60] flex shrink-0 items-center gap-2 px-3" style={{ height: HEADER_H }}>
        <div className="flex shrink-0 select-none items-baseline text-xl font-extrabold tracking-tight" aria-label="UNO">
          <span style={{ color: UNO_HEX.red }}>U</span>
          <span style={{ color: UNO_HEX.yellow }}>N</span>
          <span style={{ color: UNO_HEX.blue }}>O</span>
        </div>
        {spectating && (
          <span className="shrink-0 rounded-full border-2 border-white/15 bg-black/50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.24em] text-white/60">
            {L.compact ? "Watching" : "Spectating"}
          </span>
        )}
        <div className="min-w-0 flex-1 text-center">
          {lastEntry && (
            <motion.div
              key={lastEntry.i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="truncate text-[12px] font-semibold text-white/45 sm:text-[13px]"
            >
              {logText(lastEntry)}
            </motion.div>
          )}
        </div>
        <IconButton
          label={muted ? "Unmute sounds" : "Mute sounds"}
          onClick={() => {
            primeSound();
            setMuted(!muted);
          }}
        >
          <SpeakerIcon muted={muted} />
        </IconButton>
        <IconButton label="How to play" onClick={() => setRulesOpen(true)}>
          <span className="text-[15px] font-extrabold">?</span>
        </IconButton>
        <PartyMenu
          className="text-white/80"
          style={{ height: 36, borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)" }}
        />
      </header>

      {/* opponents */}
      <div className="relative z-10 flex shrink-0 items-start justify-center px-3 pb-3.5 pt-2" style={{ height: L.oppH }}>
        <div
          className="flex flex-wrap justify-center"
          style={{
            gap: L.oppGap,
            maxWidth: L.oppCols * CHIP_W * L.chipScale + (L.oppCols - 1) * L.oppGap + 1,
          }}
        >
          {opponents.map((p) => (
            <OpponentChip
              key={p.id}
              p={p}
              scale={L.chipScale}
              isTurn={view.phase === "play" && view.turn === p.id}
              turnPct={turnPctOf(view.deadline, serverNow)}
              activeHex={hex}
              fx={{
                skip: recentEntry(view, serverNow, (l) => l.kind === "skip" && l.target === p.name),
                burst: recentEntry(
                  view,
                  serverNow,
                  (l) => (l.kind === "draw2" || l.kind === "wild4" || l.kind === "catch") && l.target === p.name
                ),
                uno: recentEntry(view, serverNow, (l) => l.kind === "uno" && l.actor === p.name),
              }}
            />
          ))}
        </div>
      </div>

      {/* center stage */}
      <main
        className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-3"
        style={{ gap: L.stackGap }}
      >
        <div className="flex flex-col items-center gap-2">
          <motion.div
            key={`${view.turn}-${view.phase}`}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="rounded-full border-2 px-4 py-1 font-extrabold uppercase tracking-[0.18em]"
            style={{
              fontSize: L.pill,
              borderColor: isYourTurn ? hex : "rgba(255,255,255,.14)",
              color: isYourTurn ? hex : "rgba(255,255,255,.75)",
              boxShadow: isYourTurn ? `0 0 22px ${hex}44` : undefined,
              background: "rgba(0,0,0,.35)",
            }}
          >
            {view.phase === "over"
              ? "Round over"
              : isYourTurn
                ? "Your turn"
                : `${turnPlayer?.name ?? "…"} is up`}
          </motion.div>
          {view.phase === "play" ? (
            <TurnClock deadline={view.deadline} serverNow={serverNow} hex={hex} width={clockW} />
          ) : (
            <div className="h-1.5" />
          )}
        </div>

        <div className="flex items-center" style={{ gap: L.pileGap }}>
          <DrawPile
            count={view.deckCount}
            canDraw={isYourTurn && !view.hasDrawn}
            urge={mustDraw}
            onDraw={onDraw}
            w={L.pileW}
          />
          <DirectionRing direction={view.direction} hex={hex} size={L.ring} />
          <DiscardStack tail={view.discardTail} activeColor={view.activeColor} flyFrom={flyFrom} w={L.pileW} />
        </div>

        <div
          className="rounded-full border-2 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.26em] transition-colors duration-500 sm:text-[11px]"
          style={{ borderColor: hex, color: hex, background: `${hex}1a` }}
        >
          {view.activeColor}
        </div>

      </main>

      {/* action row */}
      <div
        className="relative z-10 flex shrink-0 items-center justify-center gap-2 px-3"
        style={{ height: ACTION_H }}
      >
        {/* drew a playable card: play it or keep it */}
        <AnimatePresence>
          {drawnCard && (
            <DrawnPrompt
              card={drawnCard}
              onPlay={() => {
                if (drawnCard.color === null) {
                  primeSound();
                  setWildPick(drawnCard.id);
                } else {
                  sendPlay(drawnCard.id);
                }
              }}
              onKeep={onPass}
              showText={!(L.compact && showUnoPill)}
            />
          )}
        </AnimatePresence>
        {showUnoPill && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.93 }}
            onClick={() => {
              primeSound();
              if (selfCatchable) send({ type: "callUno" });
              else setUnoArmed((v) => !v);
            }}
            className="rounded-full border-[3px] px-6 py-1 text-lg font-extrabold tracking-wider"
            style={{
              background: unoArmed || selfCatchable ? "#ef5350" : "rgba(0,0,0,.4)",
              borderColor: "#ef5350",
              color: unoArmed || selfCatchable ? "#fff" : "#ef5350",
              boxShadow: unoArmed || selfCatchable ? "0 0 26px #ef535088" : undefined,
              animation: selfCatchable ? "uno-flash 0.6s ease-in-out infinite" : undefined,
            }}
          >
            UNO!
          </motion.button>
        )}
        {unoArmed && !selfCatchable && (
          <span className="text-[11px] font-bold text-white/50">calls UNO with your next play</span>
        )}
        {isYourTurn && view.hasDrawn && !drawnCard && (
          <button
            type="button"
            onClick={onPass}
            className="rounded-full border-2 border-white/20 px-5 py-2 text-[13px] font-extrabold text-white/75 transition-colors hover:text-white"
          >
            Pass
          </button>
        )}
        {catchTargets.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            whileTap={{ scale: 0.93 }}
            onClick={() => {
              primeSound();
              send({ type: "catch", target: t.id });
            }}
            className="rounded-full bg-[#ef5350] px-5 py-2 text-[14px] font-extrabold text-white"
            style={{ animation: "uno-flash 0.55s ease-in-out infinite", boxShadow: "0 0 22px #ef535088" }}
          >
            CATCH {t.name}!
          </motion.button>
        ))}
      </div>

      {/* your hand */}
      <div
        className="relative z-10 flex shrink-0 flex-col justify-end pb-[max(env(safe-area-inset-bottom),4px)]"
        style={{ height: L.handH }}
      >
        {myBurst && (
          <motion.div
            key={`me-${myBurst.i}`}
            className="pointer-events-none absolute -top-4 left-1/2 z-20 -translate-x-1/2 text-2xl font-extrabold"
            style={{ color: "#ef5350", textShadow: "0 2px 10px rgba(0,0,0,.9)" }}
            initial={{ scale: 0.4, opacity: 0, y: 10 }}
            animate={{ scale: [0.4, 1.7, 1.3], opacity: [0, 1, 0], y: -20 }}
            transition={{ duration: 1.6 }}
          >
            +{myBurst.n ?? 2}
          </motion.div>
        )}
        {view.hand ? (
          <div className="uno-scroll w-full overflow-x-auto overflow-y-hidden">
            <div
              className="mx-auto flex w-max items-end px-6 pt-5"
              style={{ paddingBottom: Math.round(L.handW * 0.1) }}
            >
              {hand.map((c, i) => {
                const n = hand.length;
                const off = i - (n - 1) / 2;
                const playable = playableIds.has(c.id);
                const dimmed = isYourTurn && !playable;
                return (
                  <motion.button
                    key={c.id}
                    type="button"
                    layout
                    onClick={() => onCardTap(c)}
                    disabled={!playable}
                    initial={{ y: 70, opacity: 0, scale: 0.7 }}
                    animate={{
                      y: playable ? -Math.round(L.handW * 0.13) : 0,
                      opacity: 1,
                      scale: 1,
                      rotate: off * Math.min(3, 26 / Math.max(n, 1)),
                    }}
                    whileTap={playable ? { scale: 0.92 } : undefined}
                    transition={{ duration: 0.4, ease: EASE }}
                    className="relative shrink-0 rounded-xl disabled:cursor-default"
                    style={{
                      marginLeft: i === 0 ? 0 : Math.round(L.handStep - L.handW),
                      zIndex: i,
                      filter: dimmed ? "brightness(.45) saturate(.65)" : undefined,
                      boxShadow: playable ? `0 8px 24px ${hex}59` : undefined,
                    }}
                    aria-label={`${c.color ?? "wild"} ${c.symbol}${playable ? ", playable" : ""}`}
                  >
                    <CardFace card={c} w={Math.round(L.handW)} className="block" />
                    {wildPick === c.id && (
                      <span className="absolute inset-0 rounded-xl border-[3px] border-white" />
                    )}
                  </motion.button>
                );
              })}
              {hand.length === 0 && view.phase === "play" && (
                <div className="px-8 py-6 text-[13px] font-bold text-white/40">No cards left…</div>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto mb-1 w-fit rounded-2xl border-2 border-dashed border-white/15 px-6 py-3 text-[13px] font-bold text-white/45">
            You&apos;re watching this round
          </div>
        )}
      </div>

      <ColorPicker
        open={wildPick !== null}
        onPick={(c) => {
          if (wildPick) sendPlay(wildPick, c);
        }}
        onCancel={() => setWildPick(null)}
      />
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <AnimatePresence>
        {view.phase === "over" && (
          <GameOverOverlay
            view={view}
            party={party}
            youId={youId}
            isHost={isHost}
            playAgain={playAgain}
            exitToLobby={exitToLobby}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
