"use client";

/* Chain Reaction — a sheet of black glass on a dark bench. Hairline grid
   lines glow in the colour of whoever holds the turn, orbs are luminous
   glass with a hot core, and the one honest piece of physics is the
   cascade: a cell bursts, its orbs fly to the neighbours, and whatever that
   tips over bursts in the next wave. */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getMutedServerSnapshot, getMutedSnapshot, primeSound, setMuted, subscribeMuted } from "@/lib/client/synthCore";
import { criticalMass } from "@/lib/games/chainreaction/engine";
import { TURN_MS, type ChainLogEntry, type ChainMove, type ChainView, type ChainViewPlayer } from "@/lib/games/chainreaction/types";
import type { GameScreenProps } from "@/lib/party/types";
import { ChainBoardView } from "./Board";
import { chakra } from "./font";
import { ChainRulesModal, GameOverCard, OrbChip } from "./Overlays";
import { cascadeTimeline, CREAM, MUTED, paintFor, SWIFT } from "./palette";
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

function PlayerCard({ p, active, you, wins, won, share }: { p: ChainViewPlayer; active: boolean; you: boolean; wins: number; won: boolean; share: number }) {
  const paint = paintFor(p.seat);
  const out = !p.alive;
  return (
    <div
      className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border px-2.5 py-2 transition-[border-color,background,box-shadow] duration-300"
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
        <OrbChip seat={p.seat} size={22} dim={out} />
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
          <span className={`truncate text-[12.5px] font-semibold ${p.left ? "line-through" : ""}`} style={{ color: won ? paint.light : out ? MUTED : CREAM }}>
            {p.name}
          </span>
          {you && (
            <span className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-[0.14em]" style={{ background: "rgba(255,255,255,0.1)", color: MUTED }}>
              you
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[9.5px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>
          {out ? (
            <span style={{ color: p.left ? MUTED : "#ff8a95" }}>{p.left ? "left" : "knocked out"}</span>
          ) : (
            <>
              <span className="tabular-nums">{p.orbs} orbs</span>
              <span aria-hidden style={{ opacity: 0.4 }}>·</span>
              <span className="tabular-nums">{p.cells} cells</span>
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

  const boardAspect = (v.cols * 100 + 36) / (v.rows * 100 + 36);

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col overflow-x-hidden"
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

      {/* header */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-3 pb-1 pt-3 sm:px-5">
        <div className="min-w-0">
          <h1
            className={`${chakra.className} truncate text-[15px] font-bold leading-none tracking-[0.08em] sm:text-[17px]`}
            style={{ color: CREAM, textShadow: `0 0 24px ${turnColor}55` }}
          >
            CHAIN REACTION
          </h1>
          <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.22em]" style={{ color: MUTED }}>
            <span className="tabular-nums">{orbsOnBoard} orbs</span>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span>
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
            className={`rounded-lg border px-2.5 py-1.5 text-[13px] transition ${muted ? "line-through" : ""}`}
            style={{ borderColor: "rgba(255,255,255,0.14)", color: muted ? "rgba(138,144,163,0.5)" : MUTED }}
          >
            ♪
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition"
            style={{ borderColor: "rgba(255,255,255,0.14)", color: MUTED }}
          >
            Rules
          </button>
        </div>
      </header>

      {spectating && (
        <div
          className="relative z-10 mx-auto mt-1 rounded-full border px-3 py-0.5 text-[9px] uppercase tracking-[0.26em]"
          style={{ borderColor: "rgba(200,107,255,0.35)", background: "rgba(20,16,30,0.7)", color: "#d9b8ff" }}
        >
          Spectating — safe behind the glass
        </div>
      )}

      {/* banner + clock */}
      <div className="relative z-10 mt-2 space-y-2 px-3 sm:px-5">
        <div className="flex min-h-[30px] items-center justify-center gap-2.5">
          {turnPlayer && v.phase === "play" && <OrbChip seat={turnPlayer.seat} size={16} />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={banner.text}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.28, ease: SWIFT }}
              className={`${chakra.className} text-[15px] font-bold leading-none tracking-[0.04em] sm:text-[17px]`}
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

      {/* bench */}
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-3 pb-6 pt-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(200px,250px)_minmax(0,1fr)] lg:items-start lg:gap-6">
          {/* roster */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-1 lg:gap-2">
            {v.players.map((p) => (
              <PlayerCard
                key={p.id}
                p={p}
                active={v.phase === "play" && v.turn === p.id}
                you={p.id === youId}
                wins={tallies[p.id] ?? 0}
                won={v.winner === p.id}
                share={orbsOnBoard ? p.orbs / orbsOnBoard : 0}
              />
            ))}
          </div>

          <div className="min-w-0">
            <div className="mx-auto w-full" style={{ maxWidth: `min(100%, 620px, calc(72vh * ${boardAspect.toFixed(4)}))` }}>
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
            </div>

            {/* log ticker */}
            <div className="mt-3 flex min-h-[18px] items-center justify-center px-2 text-center">
              <AnimatePresence mode="wait" initial={false}>
                {hoverHint ? (
                  <motion.span
                    key={`hint:${hoverHint}`}
                    initial={{ y: 6, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -6, opacity: 0 }}
                    transition={{ duration: 0.2, ease: SWIFT }}
                    className="text-[11px] uppercase tracking-[0.18em]"
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
                      className="text-[11px] italic"
                      style={{ color: "rgba(138,144,163,0.95)" }}
                    >
                      {logLine(lastLog)}
                    </motion.span>
                  )
                )}
              </AnimatePresence>
            </div>

            {interactive && (
              <p className="mt-1 hidden text-center text-[9px] uppercase tracking-[0.2em] lg:block" style={{ color: "rgba(138,144,163,0.55)" }}>
                click a cell · arrows and enter also work
              </p>
            )}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {v.phase === "over" && (
          <GameOverCard key="cr-over" v={v} party={party} youId={youId} isHost={isHost} playAgain={playAgain} exitToLobby={exitToLobby} delay={overDelay} />
        )}
      </AnimatePresence>

      {rulesOpen && <ChainRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
