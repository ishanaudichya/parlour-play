"use client";

/* Four in a Row — an arcade cabinet on a warm dark table. Royal-blue moulded
   plastic under an amber spotlight, glossy discs, and one honest piece of
   physics: the disc accelerates down the slot, knocks, and settles. */

import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getMutedServerSnapshot,
  getMutedSnapshot,
  primeSound,
  setMuted,
  subscribeMuted,
} from "@/lib/client/synthCore";
import {
  CELLS,
  COLS,
  ROWS,
  TURN_MS,
  type C4LogEntry,
  type C4ViewPlayer,
  type Connect4Move,
  type Connect4View,
} from "@/lib/games/connect4/types";
import type { GameScreenProps } from "@/lib/party/types";
import { Connect4Board, type FallingDisc } from "./Board";
import { bungee } from "./font";
import { AMBER, CREAM, DISC_PAINT, MUTED, SWIFT } from "./geometry";
import { C4RulesModal, DiscChip, GameOverCard } from "./Overlays";
import { c4Sfx, playConnect4Diff } from "./sfx";

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

function logLine(l: C4LogEntry): string {
  switch (l.kind) {
    case "start":
      return `${l.actor} drops first`;
    case "drop":
      return `${l.actor} plays column ${(l.col ?? 0) + 1}`;
    case "timeout":
      return `${l.actor} ran the clock out — the cabinet drops for them`;
    case "win":
      return `${l.actor} connects four!`;
    case "draw":
      return "Forty-two discs, no line — a draw";
    case "left":
      return `${l.actor} left the table`;
    default:
      return "";
  }
}

/* ---------------- countdown ---------------- */

function DeadlineBar({
  deadline,
  nowEst,
  color,
  label,
}: {
  deadline: number;
  nowEst: number;
  color: string;
  label: string;
}) {
  const frac = Math.max(0, Math.min(1, (deadline - nowEst) / TURN_MS));
  const secs = Math.max(0, Math.ceil((deadline - nowEst) / 1000));
  const danger = frac < 0.25;
  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div className="flex items-baseline justify-between text-[9px] uppercase tracking-[0.22em]">
        <span style={{ color: MUTED }}>{label}</span>
        <span
          className="text-[11px] font-bold tabular-nums"
          style={{ color: danger ? "#ff7a6d" : CREAM, animation: danger ? "c4-pulse 0.9s ease-in-out infinite" : undefined }}
        >
          {secs}s
        </span>
      </div>
      <div className="mt-1 h-[5px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${frac * 100}%`,
            background: danger ? "linear-gradient(90deg,#ff5a4a,#ff9d7a)" : `linear-gradient(90deg, ${color}, ${AMBER})`,
            boxShadow: `0 0 12px ${danger ? "rgba(255,90,74,0.6)" : `${color}66`}`,
            transition: `width 200ms linear`,
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- player card ---------------- */

function PlayerCard({
  p,
  active,
  you,
  wins,
  won,
}: {
  p: C4ViewPlayer;
  active: boolean;
  you: boolean;
  wins: number;
  won: boolean;
}) {
  const paint = DISC_PAINT[p.color];
  return (
    <div
      className="flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition-[border-color,background,box-shadow] duration-300 lg:flex-col lg:gap-2 lg:px-3 lg:py-4 lg:text-center"
      style={{
        borderColor: active ? `${paint.base}80` : "rgba(255,255,255,0.08)",
        background: active ? `${paint.base}14` : "rgba(255,255,255,0.028)",
        boxShadow: active ? `0 0 24px ${paint.base}22, inset 0 1px 0 rgba(255,255,255,0.05)` : "inset 0 1px 0 rgba(255,255,255,0.04)",
        transitionTimingFunction: EASE,
      }}
    >
      <div className="relative shrink-0">
        <DiscChip color={p.color} size={30} />
        {active && (
          <motion.span
            className="absolute -inset-1 rounded-full"
            style={{ border: `1.5px solid ${paint.base}` }}
            animate={{ opacity: [0.2, 0.85, 0.2], scale: [1, 1.1, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 lg:w-full">
        <div className="flex items-center gap-1.5 lg:justify-center">
          <span
            className={`truncate text-[13px] font-semibold ${p.left ? "line-through opacity-55" : ""}`}
            style={{ color: won ? paint.ring : CREAM }}
          >
            {p.name}
          </span>
          {you && (
            <span className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-[0.14em]" style={{ background: "rgba(255,255,255,0.1)", color: MUTED }}>
              you
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] lg:justify-center" style={{ color: MUTED }}>
          <span className="tabular-nums">{p.discsPlaced} discs</span>
          {wins > 0 && (
            <span className="tabular-nums" style={{ color: AMBER }} title="Four in a Row wins">
              ★{wins}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================== screen ==================== */

export function Connect4Screen(props: GameScreenProps<Connect4View>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;

  const [rulesOpen, setRulesOpen] = useState(false);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [settledKey, setSettledKey] = useState("");
  const nowEst = useNowEst(v.now, skew);
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const shudder = useAnimationControls();

  const me = v.players.find((p) => p.id === youId) ?? null;
  const myTurn = !spectating && me !== null && v.phase === "play" && v.turn === youId;
  const turnPlayer = v.turn ? v.players.find((p) => p.id === v.turn) ?? null : null;
  const tallies = party.tallies.connect4 ?? {};

  /* --- the disc in flight ------------------------------------------------ */

  const lastDrop = v.lastDrop;
  const dropKey = lastDrop ? `${v.startedAt}:${lastDrop.n}` : "";
  // memoised so the (memo'd) board doesn't re-render on every clock tick
  const falling: FallingDisc | null = useMemo(
    () =>
      lastDrop && dropKey !== settledKey
        ? { key: dropKey, col: lastDrop.col, row: lastDrop.row, color: lastDrop.color }
        : null,
    [lastDrop, dropKey, settledKey]
  );

  const onLanded = useCallback(() => {
    setSettledKey(dropKey);
    // one small knock through the cabinet, nothing more
    void shudder.start({ y: [0, 2.6, 0] }, { duration: 0.24, ease: SWIFT });
  }, [dropKey, shudder]);

  /* --- sounds: diff the previous view's log ------------------------------ */

  const prevRef = useRef<Connect4View | null>(null);
  useEffect(() => {
    playConnect4Diff(prevRef.current, v, youId);
    prevRef.current = v;
  }, [v, youId]);

  useEffect(() => {
    document.title = myTurn ? "● Your move — Four in a Row" : "Four in a Row";
  }, [myTurn]);

  /* --- interaction ------------------------------------------------------- */

  const send = useCallback((m: Connect4Move) => move(m), [move]);

  // deliberately NOT gated on the falling disc: a paused animation (background
  // tab) must never be able to lock a player out of their own turn
  const interactive = myTurn;

  const dropAt = useCallback(
    (col: number) => {
      if (!interactive) return;
      if (col < 0 || col >= COLS) return;
      if (v.board[col][ROWS - 1] !== null) return;
      send({ type: "drop", col });
    },
    [interactive, send, v.board]
  );

  const handleHover = useCallback(
    (col: number | null) => {
      setHoverCol((prev) => (prev === col ? prev : col));
      if (col !== null && col !== hoverCol && interactive) c4Sfx("tick");
    },
    [hoverCol, interactive]
  );

  // keyboard: ← → pick a column, Enter / Space drops
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.key === "ArrowLeft" ? -1 : 1;
        const from = hoverCol ?? Math.floor(COLS / 2) - step;
        for (let i = 1; i <= COLS; i++) {
          const col = (from + step * i + COLS * COLS) % COLS;
          if (v.board[col][ROWS - 1] === null) {
            setHoverCol(col);
            c4Sfx("tick");
            break;
          }
        }
      } else if (e.key === "Enter" || e.key === " ") {
        if (hoverCol === null) return;
        e.preventDefault();
        dropAt(hoverCol);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interactive, hoverCol, v.board, dropAt]);

  /* --- chrome ------------------------------------------------------------ */

  const lastLog = v.log.length ? v.log[v.log.length - 1] : null;
  const bannerColor = turnPlayer ? DISC_PAINT[turnPlayer.color].base : AMBER;

  const banner = useMemo(() => {
    if (v.phase === "over") {
      if (v.draw) return { text: "Draw — board full", color: MUTED };
      const w = v.players.find((p) => p.id === v.winner);
      return { text: w ? `${w.name} wins` : "Game over", color: w ? DISC_PAINT[w.color].base : AMBER };
    }
    if (spectating || !me) return { text: turnPlayer ? `${turnPlayer.name} to move` : "…", color: bannerColor };
    return myTurn
      ? { text: "Your move", color: bannerColor }
      : { text: `Waiting for ${turnPlayer?.name ?? "…"}…`, color: MUTED };
  }, [v.phase, v.draw, v.players, v.winner, spectating, me, myTurn, turnPlayer, bannerColor]);

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col overflow-x-hidden"
      style={{
        background:
          "radial-gradient(110% 70% at 50% -12%, rgba(245,178,62,0.15) 0%, rgba(245,178,62,0.035) 34%, transparent 64%), linear-gradient(180deg, #171420 0%, #12101a 46%, #0f0d16 100%)",
        fontFamily: "var(--font-sans)",
      }}
      onPointerDown={primeSound}
    >
      <style>{`
@keyframes c4-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
`}</style>

      {/* spotlight cone from above */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[46vh]"
        style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(255,214,150,0.09) 0%, transparent 70%)" }}
      />

      {/* header */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-3 pb-1 pt-3 sm:px-5">
        <div className="min-w-0">
          <h1
            className={`${bungee.className} truncate text-[15px] leading-none tracking-[0.02em] sm:text-[17px]`}
            style={{ color: CREAM, textShadow: "0 2px 0 rgba(0,0,0,0.5), 0 0 24px rgba(245,178,62,0.28)" }}
          >
            FOUR IN A ROW
          </h1>
          <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.22em]" style={{ color: MUTED }}>
            <span className="tabular-nums">
              {v.moves}/{CELLS} discs
            </span>
            <span aria-hidden style={{ opacity: 0.4 }}>
              ·
            </span>
            <span>7 × 6</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className={`rounded-lg border px-2.5 py-1.5 text-[13px] transition ${muted ? "line-through" : ""}`}
            style={{ borderColor: "rgba(255,255,255,0.14)", color: muted ? "rgba(162,149,127,0.5)" : MUTED }}
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
          style={{ borderColor: "rgba(245,178,62,0.35)", background: "rgba(30,24,16,0.7)", color: "#e0c894" }}
        >
          Spectating — pull up a chair
        </div>
      )}

      {/* banner + clock */}
      <div className="relative z-10 mt-2 space-y-2 px-3 sm:px-5">
        <div className="flex min-h-[30px] items-center justify-center gap-2.5">
          {turnPlayer && v.phase === "play" && <DiscChip color={turnPlayer.color} size={18} />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={banner.text}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.28, ease: SWIFT }}
              className={`${bungee.className} text-[15px] leading-none sm:text-[17px]`}
              style={{ color: banner.color, textShadow: `0 0 20px ${banner.color}44` }}
            >
              {banner.text}
            </motion.span>
          </AnimatePresence>
        </div>
        {v.phase === "play" && v.deadline !== null && (
          <DeadlineBar
            deadline={v.deadline}
            nowEst={nowEst}
            color={bannerColor}
            label={turnPlayer ? `${turnPlayer.name}'s turn` : "turn clock"}
          />
        )}
      </div>

      {/* table */}
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-3 pb-6 pt-4 sm:px-5">
        <div className="grid grid-cols-2 items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,560px)_minmax(0,1fr)] lg:items-center lg:gap-6">
          {v.players.map((p, i) => (
            <div key={p.id} className={i === 0 ? "lg:order-1" : "lg:order-3"}>
              <PlayerCard
                p={p}
                active={v.phase === "play" && v.turn === p.id}
                you={p.id === youId}
                wins={tallies[p.id] ?? 0}
                won={v.winner === p.id}
              />
            </div>
          ))}

          <div className="col-span-2 mt-1 lg:order-2 lg:col-span-1 lg:mt-0">
            <motion.div
              animate={shudder}
              className="mx-auto w-full"
              style={{ maxWidth: "min(100%, 560px, 66vh)" }}
            >
              <Connect4Board
                board={v.board}
                yourColor={me?.color ?? null}
                interactive={interactive}
                hoverCol={interactive ? hoverCol : null}
                onHoverCol={handleHover}
                onDropCol={dropAt}
                falling={falling}
                onLanded={onLanded}
                winningLine={v.winningLine}
              />
            </motion.div>

            {/* log ticker */}
            <div className="mt-3 flex min-h-[18px] items-center justify-center px-2 text-center">
              <AnimatePresence mode="wait" initial={false}>
                {lastLog && (
                  <motion.span
                    key={lastLog.i}
                    initial={{ y: 6, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -6, opacity: 0 }}
                    transition={{ duration: 0.26, ease: SWIFT }}
                    className="text-[11px] italic"
                    style={{ color: "rgba(162,149,127,0.9)" }}
                  >
                    {logLine(lastLog)}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {interactive && (
              <p
                className="mt-1 hidden text-center text-[9px] uppercase tracking-[0.2em] lg:block"
                style={{ color: "rgba(162,149,127,0.55)" }}
              >
                click a column · ← → and enter also work
              </p>
            )}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {v.phase === "over" && (
          <GameOverCard
            key="c4-over"
            v={v}
            party={party}
            youId={youId}
            isHost={isHost}
            playAgain={playAgain}
            exitToLobby={exitToLobby}
          />
        )}
      </AnimatePresence>

      {rulesOpen && <C4RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
