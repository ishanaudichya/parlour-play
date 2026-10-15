"use client";

/* Chain Reaction — a sheet of black glass on a dark bench. Hairline grid
   lines glow in the colour of whoever holds the turn, orbs are luminous
   glass with a hot core, and the one honest piece of physics is the
   cascade: a cell bursts, its orbs fly to the neighbours, and whatever that
   tips over bursts in the next wave. */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PartyMenu } from "@/components/party/PartyMenu";
import { getMutedServerSnapshot, getMutedSnapshot, primeSound, setMuted, subscribeMuted } from "@/lib/client/synthCore";
import { criticalMass } from "@/lib/games/chainreaction/engine";
import { TURN_MS, type ChainLogEntry, type ChainMove, type ChainView, type ChainViewPlayer } from "@/lib/games/chainreaction/types";
import type { GameScreenProps } from "@/lib/party/types";
import { ChainBoardView } from "./Board";
import { chakra } from "./font";
import { ChainRulesModal, GameOverCard, OrbChip } from "./Overlays";
import { cascadeTimeline, CELL, CREAM, FRAME, MUTED, paintFor, SWIFT } from "./palette";
import { useCascadePlayback } from "./playback";
import { chainSfx, playChainDiff } from "./sfx";

const EASE = "cubic-bezier(0.16,1,0.3,1)";

/* ---------------- clock (never Date.now() during render) ---------------- */

function useNowEst(serverNow: number, skew: number): number {
  const [nowEst, setNowEst] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNowEst(Date.now() + skew), 200);
    return () => clearInterval(id);
  }, [skew]);
  return Math.max(nowEst, serverNow);
}

/* ---------------- log ticker ---------------- */

function logLine(l: ChainLogEntry): string {
  switch (l.kind) {
    case "start":
      return `${l.actor} places first`;
    case "place": {
      const at = `${String.fromCharCode(65 + (l.col ?? 0))}${(l.row ?? 0) + 1}`;
      if (!l.waves) return `${l.actor} sets an orb down at ${at}`;
      if (l.waves === 1) return `${l.actor} bursts ${at}`;
      return `${l.actor} sets off a ${l.waves}-wave cascade from ${at} — ${l.bursts} bursts`;
    }
    case "eliminated":
      return `${l.actor} is wiped off the glass by ${l.by}`;
    case "timeout":
      return `${l.actor} ran the clock out — the reactor places for them`;
    case "win":
      return `${l.actor} holds the whole board`;
    case "left":
      return `${l.actor} left the bench — their orbs are swept away`;
    default:
      return "";
  }
}

/* ---------------- countdown ---------------- */

function DeadlineBar({ deadline, nowEst, color, label }: { deadline: number; nowEst: number; color: string; label: string }) {
  const frac = Math.max(0, Math.min(1, (deadline - nowEst) / TURN_MS));
  const secs = Math.max(0, Math.ceil((deadline - nowEst) / 1000));
  const danger = frac < 0.25;
  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div className="flex items-baseline justify-between text-[9px] uppercase tracking-[0.22em]">
        <span style={{ color: MUTED }}>{label}</span>
        <span
          className="text-[11px] font-bold tabular-nums"
          style={{ color: danger ? "#ff7a6d" : CREAM, animation: danger ? "cr-pulse 0.9s ease-in-out infinite" : undefined }}
        >
          {secs}s
        </span>
      </div>
      <div className="mt-1 h-[4px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${frac * 100}%`,
            background: danger ? "linear-gradient(90deg,#ff5a4a,#ff9d7a)" : `linear-gradient(90deg, ${color}, ${color}aa)`,
            boxShadow: `0 0 12px ${danger ? "rgba(255,90,74,0.6)" : `${color}77`}`,
            transition: "width 200ms linear",
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- roster card ---------------- */

/** Narrow roster cards — "You" in place of your own name, orbs only. They
    switch on with a media variant, so the same card is roomy in the side
    panel and compact in a four-across portrait grid. Literal class strings,
    so Tailwind sees every one. */
const DENSE = {
  /** three players: only phones need it */
  phone: {
    card: "max-sm:gap-1.5 max-sm:px-1.5 max-sm:py-1.5",
    name: "max-sm:text-[12px]",
    full: "max-sm:hidden",
    short: "sm:hidden",
    stats: "max-sm:gap-1 max-sm:text-[9px] max-sm:tracking-[0.04em]",
  },
  /** four or more: any portrait screen packs them four across */
  portrait: {
    card: "portrait:gap-1.5 portrait:px-1.5 portrait:py-1.5 portrait:sm:gap-2 portrait:sm:px-2.5",
    name: "portrait:text-[12px]",
    full: "portrait:hidden",
    short: "landscape:hidden",
    stats: "portrait:gap-1 portrait:text-[9px] portrait:tracking-[0.04em] portrait:sm:tracking-[0.14em]",
  },
} as const;
type Dense = keyof typeof DENSE | null;

function PlayerCard({ p, active, you, wins, won, share, dense }: { p: ChainViewPlayer; active: boolean; you: boolean; wins: number; won: boolean; share: number; dense: Dense }) {
  const paint = paintFor(p.seat);
  const out = !p.alive;
  const D = dense ? DENSE[dense] : null;
  return (
    <div
      className={`relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border px-2.5 py-2 transition-[border-color,background,box-shadow] duration-300 ${D?.card ?? ""}`}
      style={{
        borderColor: active ? `${paint.base}88` : "rgba(255,255,255,0.07)",
        background: active ? `${paint.base}14` : "rgba(255,255,255,0.025)",
        boxShadow: active ? `0 0 24px ${paint.base}22, inset 0 1px 0 rgba(255,255,255,0.05)` : "inset 0 1px 0 rgba(255,255,255,0.03)",
        transitionTimingFunction: EASE,
        opacity: out ? 0.55 : 1,
      }}
    >
      {/* territory bar along the bottom */}
      {!out && (
        <span
          className="absolute inset-x-0 bottom-0 h-[2px]"
          style={{ width: `${Math.round(share * 100)}%`, background: paint.base, opacity: 0.8, transition: "width 500ms ease" }}
        />
      )}
      <div className="relative shrink-0">
        <OrbChip seat={p.seat} size={20} dim={out} />
        {active && (
          <motion.span
            className="absolute -inset-1 rounded-full"
            style={{ border: `1.5px solid ${paint.base}` }}
            animate={{ opacity: [0.2, 0.85, 0.2], scale: [1, 1.12, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-[12.5px] font-semibold ${D?.name ?? ""} ${p.left ? "line-through" : ""}`} style={{ color: won ? paint.light : out ? MUTED : CREAM }}>
            {you && D ? (
              <>
                <span className={D.short}>You</span>
                <span className={D.full}>{p.name}</span>
              </>
            ) : (
              p.name
            )}
          </span>
          {you && (
            <span className={`shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase tracking-[0.14em] ${D?.full ?? ""}`} style={{ background: "rgba(255,255,255,0.1)", color: MUTED }}>
              you
            </span>
          )}
        </div>
        <div className={`mt-0.5 flex items-center gap-2 whitespace-nowrap text-[9.5px] uppercase tracking-[0.14em] ${D?.stats ?? ""}`} style={{ color: MUTED }}>
          {out ? (
            <span style={{ color: p.left ? MUTED : "#ff8a95" }}>{p.left ? "left" : D ? "out" : "knocked out"}</span>
          ) : (
            <>
              <span className="tabular-nums">{p.orbs} orbs</span>
              <span aria-hidden className={D?.full} style={{ opacity: 0.4 }}>
                ·
              </span>
              <span className={`tabular-nums ${D?.full ?? ""}`}>{p.cells} cells</span>
            </>
          )}
          {wins > 0 && (
            <span className="tabular-nums" style={{ color: paint.light }} title="Chain Reaction wins">
              ★{wins}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- fitting the glass to the room ---------------- */

/** Board units per CSS pixel are capped so a huge monitor doesn't get
    football-pitch cells: 100-unit cells top out at ~125px. */
const MAX_SCALE = 1.25;
/** the log ticker under the glass */
const TICKER_H = 30;

/**
 * Sizes the board to the room it actually has. The bench is a row (side
 * panel + glass) in landscape and a column (panel above the glass) in
 * portrait — CSS decides which; this reads the result, subtracts the panel
 * and the ticker, and fits the board's aspect into what's left.
 */
function useGlassFit(aspect: number, unitsW: number) {
  const rowRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ w: number; h: number; side: boolean }>({ w: 0, h: 0, side: false });
  useLayoutEffect(() => {
    const row = rowRef.current;
    const panel = panelRef.current;
    if (!row || !panel) return;
    const measure = () => {
      const cs = getComputedStyle(row);
      const side = cs.flexDirection === "row";
      const W = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const H = row.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const gap = parseFloat(side ? cs.columnGap : cs.rowGap) || 0;
      const availW = side ? W - panel.offsetWidth - gap : W;
      const availH = (side ? H : H - panel.offsetHeight - gap) - TICKER_H;
      const w = Math.max(0, Math.floor(Math.min(availW, availH * aspect, unitsW * MAX_SCALE)));
      const next = { w, h: Math.floor(w / aspect), side };
      setFit((f) => (f.w === next.w && f.h === next.h && f.side === next.side ? f : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    ro.observe(panel);
    return () => ro.disconnect();
  }, [aspect, unitsW]);
  return { rowRef, panelRef, fit };
}

/* ==================== screen ==================== */

export function ChainReactionScreen(props: GameScreenProps<ChainView>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;

  const [rulesOpen, setRulesOpen] = useState(false);
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const nowEst = useNowEst(v.now, skew);
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const pb = useCascadePlayback(v);

  const me = v.players.find((p) => p.id === youId) ?? null;
  const myTurn = !spectating && me !== null && me.alive && v.phase === "play" && v.turn === youId;
  const turnPlayer = v.turn ? v.players.find((p) => p.id === v.turn) ?? null : null;
  const winner = v.winner ? v.players.find((p) => p.id === v.winner) ?? null : null;
  const tallies = party.tallies.chainreaction ?? {};
  const moveKey = `${v.startedAt}:${v.lastMove?.n ?? 0}`;
  const orbsOnBoard = useMemo(() => v.board.reduce((a, c) => a + c.n, 0), [v.board]);
  const alive = v.players.filter((p) => p.alive).length;

  /* --- sounds: diff the previous view's log ------------------------------ */

  const prevRef = useRef<ChainView | null>(null);
  useEffect(() => {
    playChainDiff(prevRef.current, v, youId);
    prevRef.current = v;
  }, [v, youId]);

  useEffect(() => {
    document.title = myTurn ? "● Your move — Chain Reaction" : "Chain Reaction";
  }, [myTurn]);

  /* --- interaction ------------------------------------------------------- */

  const send = useCallback((m: ChainMove) => move(m), [move]);

  // deliberately NOT gated on the replay: a paused animation (background tab)
  // must never be able to lock a player out of their own turn
  const interactive = myTurn;

  const placeAt = useCallback(
    (i: number) => {
      if (!interactive || me === null) return;
      if (i < 0 || i >= v.board.length) return;
      const c = v.board[i];
      if (!(c.n === 0 || c.owner === me.seat)) return;
      send({ type: "place", col: i % v.cols, row: Math.floor(i / v.cols) });
    },
    [interactive, me, send, v.board, v.cols]
  );

  const handleHover = useCallback(
    (i: number | null) => {
      setHoverCell((prev) => (prev === i ? prev : i));
      if (i !== null && i !== hoverCell && interactive) chainSfx("tick");
    },
    [hoverCell, interactive]
  );

  // keyboard: arrows walk the grid, Enter / Space places
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      const n = v.board.length;
      const step =
        e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -v.cols : e.key === "ArrowDown" ? v.cols : 0;
      if (step !== 0) {
        e.preventDefault();
        const from = hoverCell ?? Math.floor(n / 2) - step;
        const next = ((from + step) % n + n) % n;
        setHoverCell(next);
        chainSfx("tick");
      } else if (e.key === "Enter" || e.key === " ") {
        if (hoverCell === null) return;
        e.preventDefault();
        placeAt(hoverCell);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interactive, hoverCell, v.board.length, v.cols, placeAt]);

  /* --- chrome ------------------------------------------------------------ */

  const lastLog = v.log.length ? v.log[v.log.length - 1] : null;
  const turnColor = turnPlayer ? paintFor(turnPlayer.seat).base : "#c86bff";

  const banner = useMemo(() => {
    if (v.phase === "over") {
      return { text: winner ? `${winner.name} holds the board` : "Game over", color: winner ? paintFor(winner.seat).base : MUTED };
    }
    if (me && !me.alive && !spectating) {
      return { text: me.left ? "You left the bench" : "You're out — watch it burn", color: MUTED };
    }
    if (spectating || !me) return { text: turnPlayer ? `${turnPlayer.name} to place` : "…", color: turnColor };
    return myTurn ? { text: "Your move", color: turnColor } : { text: `Waiting for ${turnPlayer?.name ?? "…"}…`, color: MUTED };
  }, [v.phase, winner, me, spectating, turnPlayer, myTurn, turnColor]);

  // hold the game-over card until the last cascade has finished on the board
  const overDelay = v.lastMove && v.lastMove.waves.length ? cascadeTimeline(v.lastMove.waves.length).end / 1000 + 0.45 : 0.4;

  const hoverHint = useMemo(() => {
    if (!interactive || hoverCell === null || me === null) return null;
    const c = v.board[hoverCell];
    if (!(c.n === 0 || c.owner === me.seat)) return "held by someone else";
    const crit = criticalMass(v.cols, v.rows, hoverCell);
    return c.n + 1 >= crit ? "this one bursts" : `${crit - c.n - 1} more to burst`;
  }, [interactive, hoverCell, me, v.board, v.cols, v.rows]);

  const unitsW = v.cols * CELL + FRAME * 2;
  const boardAspect = unitsW / (v.rows * CELL + FRAME * 2);
  const { rowRef, panelRef, fit } = useGlassFit(boardAspect, unitsW);
  const n = v.players.length;
  // portrait roster: everyone on one or two even rows; three or more go dense on phones
  const rosterCols = n <= 2 ? "grid-cols-2" : n === 3 || n === 5 || n === 6 ? "grid-cols-3" : "grid-cols-4";
  const dense: Dense = n >= 4 ? "portrait" : n === 3 ? "phone" : null;
  const toolBtn = "flex h-8 items-center justify-center rounded-lg border px-2.5 transition hover:border-white/30";

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden"
      style={{
        background: `radial-gradient(100% 60% at 50% -10%, ${turnColor}26 0%, ${turnColor}08 36%, transparent 64%), linear-gradient(180deg, #11131b 0%, #0a0b10 50%, #07080c 100%)`,
        fontFamily: "var(--font-sans)",
        transition: "background 700ms ease",
      }}
      onPointerDown={primeSound}
    >
      <style>{`
@keyframes cr-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
@keyframes cr-shiver {
  0% { transform: translate(0px, 0px) }
  20% { transform: translate(2.2px, -1.6px) }
  40% { transform: translate(-1.8px, 1.4px) }
  60% { transform: translate(1.4px, 2px) }
  80% { transform: translate(-2px, -1.2px) }
  100% { transform: translate(0px, 0px) }
}
@keyframes cr-pop { 0% { transform: scale(0.2); opacity: 0 } 60% { opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
@keyframes cr-flash { 0% { transform: scale(0.35); opacity: 0.95 } 100% { transform: scale(1.7); opacity: 0 } }
`}</style>

      {/* bench light from above */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[46vh]" style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(255,255,255,0.05) 0%, transparent 70%)" }} />

      {/* header — rides above the game-over veil so the menu is always in reach */}
      <header className="relative z-[55] flex shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-3 sm:px-5">
        <div className="min-w-0">
          <h1
            className={`${chakra.className} truncate text-[15px] font-bold leading-none tracking-[0.08em] sm:text-[17px]`}
            style={{ color: CREAM, textShadow: `0 0 24px ${turnColor}55` }}
          >
            CHAIN REACTION
          </h1>
          <div className="mt-1 flex items-center gap-2 overflow-hidden whitespace-nowrap text-[9px] uppercase tracking-[0.22em]" style={{ color: MUTED }}>
            <span className="tabular-nums">{orbsOnBoard} orbs</span>
            <span aria-hidden className="max-sm:hidden" style={{ opacity: 0.4 }}>
              ·
            </span>
            <span className="max-sm:hidden">
              {v.cols} × {v.rows}
            </span>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span className="tabular-nums">
              {alive}/{v.players.length} in
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className={`${toolBtn} w-8 px-0 text-[13px] ${muted ? "line-through" : ""}`}
            style={{ borderColor: "rgba(255,255,255,0.14)", color: muted ? "rgba(138,144,163,0.5)" : MUTED }}
          >
            ♪
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className={`${toolBtn} text-[10px] font-semibold uppercase tracking-[0.16em]`}
            style={{ borderColor: "rgba(255,255,255,0.14)", color: MUTED }}
          >
            Rules
          </button>
          <PartyMenu style={{ borderRadius: 8, borderColor: "rgba(255,255,255,0.14)", color: MUTED }} />
        </div>
      </header>

      {/* the bench: a side panel and the glass in landscape, stacked in portrait */}
      <div
        ref={rowRef}
        className="relative z-10 flex min-h-0 flex-1 flex-col items-center gap-3 px-3 pb-3 sm:px-5 sm:landscape:flex-row sm:landscape:justify-center sm:landscape:gap-6 sm:landscape:pb-5"
      >
        {/* status + roster */}
        <div
          ref={panelRef}
          className="flex w-full max-w-[640px] shrink-0 flex-col gap-2 sm:landscape:min-h-0 sm:landscape:w-[clamp(210px,21vw,272px)] sm:landscape:gap-3"
          style={fit.side && fit.h ? { height: fit.h + TICKER_H } : undefined}
        >
          {spectating && (
            <div
              className="mx-auto shrink-0 rounded-full border px-3 py-0.5 text-[9px] uppercase tracking-[0.26em] sm:landscape:mx-0 sm:landscape:self-start"
              style={{ borderColor: "rgba(200,107,255,0.35)", background: "rgba(20,16,30,0.7)", color: "#d9b8ff" }}
            >
              Spectating<span className="sm:landscape:hidden"> — safe behind the glass</span>
            </div>
          )}

          {/* banner + clock */}
          <div className="shrink-0 space-y-2">
            <div className="flex min-h-[28px] items-center justify-center gap-2.5 sm:landscape:justify-start">
              {turnPlayer && v.phase === "play" && <OrbChip seat={turnPlayer.seat} size={16} />}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={banner.text}
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.28, ease: SWIFT }}
                  className={`${chakra.className} text-[15px] font-bold leading-tight tracking-[0.04em] sm:text-[17px] lg:landscape:text-[19px]`}
                  style={{ color: banner.color, textShadow: `0 0 20px ${banner.color}44` }}
                >
                  {banner.text}
                </motion.span>
              </AnimatePresence>
            </div>
            {v.phase === "play" && v.deadline !== null && (
              <DeadlineBar deadline={v.deadline} nowEst={nowEst} color={turnColor} label={turnPlayer ? `${turnPlayer.name}'s turn` : "turn clock"} />
            )}
          </div>

          {/* roster */}
          <div className={`grid shrink-0 gap-1.5 ${rosterCols} sm:landscape:-mx-1 sm:landscape:flex sm:landscape:min-h-0 sm:landscape:shrink sm:landscape:flex-col sm:landscape:gap-2 sm:landscape:overflow-y-auto sm:landscape:px-1 sm:landscape:py-1`}>
            {v.players.map((p) => (
              <PlayerCard
                key={p.id}
                p={p}
                active={v.phase === "play" && v.turn === p.id}
                you={p.id === youId}
                wins={tallies[p.id] ?? 0}
                won={v.winner === p.id}
                share={orbsOnBoard ? p.orbs / orbsOnBoard : 0}
                dense={dense}
              />
            ))}
          </div>

          {interactive && (
            <p className="mt-auto hidden shrink-0 pt-1 text-[9px] uppercase leading-relaxed tracking-[0.2em] sm:landscape:block" style={{ color: "rgba(138,144,163,0.55)" }}>
              click a cell · or arrows + enter
            </p>
          )}
        </div>

        {/* the glass */}
        <div className="my-auto flex shrink-0 flex-col items-center" style={{ width: fit.w || undefined }}>
          <div style={{ width: fit.w, height: fit.h }}>
            {fit.w > 0 && (
              <ChainBoardView
                cols={v.cols}
                rows={v.rows}
                board={pb.board}
                flights={pb.flights}
                bursting={pb.bursting}
                flightMs={pb.flightMs}
                turnSeat={v.phase === "play" ? (turnPlayer?.seat ?? null) : null}
                yourSeat={me?.seat ?? null}
                interactive={interactive}
                hoverCell={interactive ? hoverCell : null}
                onHoverCell={handleHover}
                onPlace={placeAt}
                landed={pb.landed}
                moveKey={moveKey}
                winnerSeat={v.phase === "over" && !pb.animating ? (winner?.seat ?? null) : null}
              />
            )}
          </div>

          {/* log ticker */}
          <div className="flex w-full items-end justify-center overflow-hidden px-2 text-center" style={{ height: TICKER_H }}>
            <AnimatePresence mode="wait" initial={false}>
              {hoverHint ? (
                <motion.span
                  key={`hint:${hoverHint}`}
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -6, opacity: 0 }}
                  transition={{ duration: 0.2, ease: SWIFT }}
                  className="truncate text-[11px] uppercase tracking-[0.18em]"
                  style={{ color: me ? paintFor(me.seat).light : MUTED }}
                >
                  {hoverHint}
                </motion.span>
              ) : (
                lastLog && (
                  <motion.span
                    key={lastLog.i}
                    initial={{ y: 6, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -6, opacity: 0 }}
                    transition={{ duration: 0.26, ease: SWIFT }}
                    className="truncate text-[11px] italic"
                    style={{ color: "rgba(138,144,163,0.95)" }}
                  >
                    {logLine(lastLog)}
                  </motion.span>
                )
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {v.phase === "over" && (
          <GameOverCard key="cr-over" v={v} party={party} youId={youId} isHost={isHost} playAgain={playAgain} exitToLobby={exitToLobby} delay={overDelay} />
        )}
      </AnimatePresence>

      {rulesOpen && <ChainRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
