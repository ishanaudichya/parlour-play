"use client";

/* Ludo — an heirloom board on a table that is the board writ large: four
   deep pigment panels meeting in a cross. Lacquer and brass, ivory enamel,
   glossy domed tokens, and a real ivory die that tumbles onto a suede tray.

   Everything the screen SAYS about the game — whose turn, what was rolled,
   which tokens may move, who won — comes from the replay's `shown` view, so
   it lands in step with the die and the hops rather than with the packet.
   Only the ability to act reads the live view, gated on the replay. */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PartyMenu } from "@/components/party/PartyMenu";
import { getMutedServerSnapshot, getMutedSnapshot, primeSound, setMuted, subscribeMuted } from "@/lib/client/synthCore";
import { HOME_POS, TURN_MS, type LudoLogEntry, type LudoMove, type LudoView, type LudoViewPlayer } from "@/lib/games/ludo/types";
import type { GameScreenProps } from "@/lib/party/types";
import { LudoBoard } from "./Board";
import { DieTray } from "./Die";
import { rozha } from "./font";
import { GameOverCard, HomeDots, LudoRulesModal, TokenChip } from "./Overlays";
import { BRASS, CARD_BG, CARD_BG_ACTIVE, CARD_BORDER, CREAM, PAINT, ROOM, SIZE, SWIFT, TEXT_SOFT } from "./paint";
import { useLudoPlayback } from "./playback";
import { ludoSfx, playLudoDiff } from "./sfx";

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const IVORY_LINE = "rgba(243,233,210,0.14)";

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

function logLine(l: LudoLogEntry): string {
  switch (l.kind) {
    case "start":
      return `${l.actor} rolls first`;
    case "roll":
      return `${l.actor} rolls a ${l.value}`;
    case "move":
      return (l.from ?? 0) < 0 ? `${l.actor} brings a token out` : `${l.actor} moves ${l.value} ${l.value === 1 ? "square" : "squares"}`;
    case "capture":
      return `${l.actor} sends ${l.victim}'s token back to the yard!`;
    case "home":
      return `${l.actor} gets a token home`;
    case "three_sixes":
      return `Three sixes — ${l.actor} forfeits the turn`;
    case "no_move":
      return `${l.actor} rolls a ${l.value} and nothing can move`;
    case "timeout":
      return `${l.actor} ran the clock out — the board plays for them`;
    case "left":
      return `${l.actor} left the table — their tokens are swept off`;
    case "win":
      return `${l.actor} brings all four home`;
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
        <span style={{ color: TEXT_SOFT }}>{label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: danger ? "#ffb3a6" : CREAM, animation: danger ? "ludo-pulse 0.9s ease-in-out infinite" : undefined }}>
          {secs}s
        </span>
      </div>
      <div className="mt-1 h-[4px] overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.35)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${frac * 100}%`,
            background: danger ? "linear-gradient(90deg,#ff7a6a,#ffc0a0)" : `linear-gradient(90deg, ${color}, ${BRASS})`,
            boxShadow: `0 0 12px ${danger ? "rgba(255,120,100,0.6)" : `${color}88`}`,
            transition: "width 200ms linear",
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- roster card ---------------- */

/** `compact`: in portrait the roster shares a row with the die, so cards
    shed the yard count and say "You" instead of your name. */
function PlayerCard({ p, active, you, wins, won, compact }: { p: LudoViewPlayer; active: boolean; you: boolean; wins: number; won: boolean; compact: boolean }) {
  const paint = PAINT[p.color];
  const home = p.tokens.filter((x) => x === HOME_POS).length;
  const racing = p.tokens.filter((x) => x >= 0 && x < HOME_POS).length;
  const c = (cls: string) => (compact ? cls : "");
  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-[border-color,background,box-shadow] duration-300 ${c("portrait:gap-2 portrait:px-2")}`}
      style={{
        borderColor: active ? `${paint.light}aa` : CARD_BORDER,
        background: active ? CARD_BG_ACTIVE : CARD_BG,
        boxShadow: active ? `0 0 26px ${paint.base}66, inset 0 1px 0 rgba(255,255,255,0.08)` : "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 20px rgba(0,0,0,0.25)",
        transitionTimingFunction: EASE,
        opacity: p.left ? 0.5 : 1,
      }}
    >
      <div className="relative shrink-0">
        <TokenChip color={p.color} size={22} dim={p.left} />
        {active && (
          <motion.span
            className="absolute -inset-1 rounded-full"
            style={{ border: `1.5px solid ${paint.light}` }}
            animate={{ opacity: [0.2, 0.9, 0.2], scale: [1, 1.12, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-[12.5px] font-semibold ${p.left ? "line-through" : ""}`} style={{ color: won ? paint.light : CREAM }}>
            {you && compact ? (
              <>
                <span className="landscape:hidden">You</span>
                <span className="portrait:hidden">{p.name}</span>
              </>
            ) : (
              p.name
            )}
          </span>
          {you && (
            <span className={`shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase tracking-[0.14em] ${c("portrait:hidden")}`} style={{ background: "rgba(243,233,210,0.16)", color: CREAM }}>
              you
            </span>
          )}
          {wins > 0 && (
            <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums" style={{ color: BRASS }} title="Ludo wins">
              ★{wins}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 whitespace-nowrap text-[9.5px] uppercase tracking-[0.14em] max-[379px]:gap-1.5 max-[379px]:tracking-[0.06em]" style={{ color: TEXT_SOFT }}>
          <HomeDots color={p.color} home={home} size={7} />
          {p.left ? <span>left</span> : <span className={`tabular-nums ${c("portrait:hidden")}`}>{racing} out · {p.inYard} in yard</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- fitting the board to the room ---------------- */

/** the log ticker under the board */
const TICKER_H = 28;
/** 992 board units; past ~1.05 px a unit the enamel stops looking like a board and starts looking like a floor */
const MAX_BOARD = Math.round(SIZE * 1.05);

/**
 * The table is a row (board, then the side of the table) in landscape and a
 * column (board above the die and the players) in portrait — CSS decides;
 * this reads which, subtracts the panel and the ticker, and squares the
 * board into what's left. It also reports where the board's centre is, so
 * the four pigment panels of the room can meet right under it.
 */
function useTableFit() {
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ size: number; side: boolean; cx: number | null; cy: number | null }>({ size: 0, side: false, cx: null, cy: null });
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
      const size = Math.max(0, Math.floor(Math.min(availW, availH, MAX_BOARD)));
      setFit((f) => (f.size === size && f.side === side ? f : { ...f, size, side }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    ro.observe(panel);
    return () => ro.disconnect();
  }, []);
  // once the board has its size, find its centre for the room's seams
  useLayoutEffect(() => {
    const root = rootRef.current;
    const board = boardRef.current;
    if (!root || !board || !fit.size) return;
    const place = () => {
      const r = root.getBoundingClientRect();
      const b = board.getBoundingClientRect();
      const cx = Math.round(b.left + b.width / 2 - r.left);
      const cy = Math.round(b.top + b.height / 2 - r.top);
      setFit((f) => (f.cx === cx && f.cy === cy ? f : { ...f, cx, cy }));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(root);
    if (panelRef.current) ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, [fit.size, fit.side]);
  return { rootRef, rowRef, panelRef, boardRef, fit };
}

/* ==================== screen ==================== */

export function LudoScreen(props: GameScreenProps<LudoView>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;

  const [rulesOpen, setRulesOpen] = useState(false);
  const [hoverToken, setHoverToken] = useState<number | null>(null);
  const nowEst = useNowEst(v.now, skew);
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const pb = useLudoPlayback(v);
  /** what the screen presents — trails the live view by exactly the replay */
  const d = pb.shown;

  const me = v.players.find((p) => p.id === youId) ?? null;
  const turnPlayer = d.turn ? d.players.find((p) => p.id === d.turn) ?? null : null;
  const winner = d.winner ? d.players.find((p) => p.id === d.winner) ?? null : null;
  const tallies = party.tallies.ludo ?? {};
  const accentPaint = turnPlayer ? PAINT[turnPlayer.color] : winner ? PAINT[winner.color] : null;
  const accent = accentPaint ? accentPaint.light : BRASS;

  // acting reads the LIVE view, but waits for the replay to catch up
  const myTurnLive = !spectating && me !== null && !me.left && v.phase !== "over" && v.turn === youId;
  const canRoll = myTurnLive && v.phase === "roll" && !pb.animating;
  const canPick = myTurnLive && v.phase === "move" && !pb.animating;
  const shownMyTurn = !spectating && me !== null && !me.left && d.phase !== "over" && d.turn === youId;

  /* --- sounds: diff the previous view's log ------------------------------ */

  const prevRef = useRef<LudoView | null>(null);
  useEffect(() => {
    playLudoDiff(prevRef.current, v, youId);
    prevRef.current = v;
  }, [v, youId]);

  useEffect(() => {
    document.title = canRoll ? "● Your roll — Ludo" : canPick ? "● Your move — Ludo" : "Ludo";
  }, [canRoll, canPick]);

  /* --- interaction ------------------------------------------------------- */

  const send = useCallback((m: LudoMove) => move(m), [move]);
  const roll = useCallback(() => {
    if (canRoll) send({ type: "roll" });
  }, [canRoll, send]);
  const pickToken = useCallback(
    (t: number) => {
      if (!canPick || !v.movable.includes(t)) return;
      setHoverToken(null);
      send({ type: "move", token: t });
    },
    [canPick, v.movable, send]
  );
  const handleHover = useCallback(
    (t: number | null) => {
      setHoverToken((prev) => (prev === t ? prev : t));
      if (t !== null && t !== hoverToken) ludoSfx("tick");
    },
    [hoverToken]
  );

  // keyboard: space / enter rolls, 1–4 picks a token
  useEffect(() => {
    if (!canRoll && !canPick) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && canRoll) {
        e.preventDefault();
        roll();
      } else if (/^[1-4]$/.test(e.key) && canPick) {
        e.preventDefault();
        pickToken(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRoll, canPick, roll, pickToken]);

  /* --- chrome ------------------------------------------------------------ */

  const lastLog = d.log.length ? d.log[d.log.length - 1] : null;

  const banner = useMemo(() => {
    if (d.phase === "over") return { text: winner ? `${winner.name} brings all four home` : "Game over", color: accent };
    if (me?.left) return { text: "You left the table", color: TEXT_SOFT };
    if (pb.rolling) return { text: `${turnPlayer?.name ?? "…"} rolls…`, color: accent };
    if (spectating || !me) {
      return { text: turnPlayer ? (d.phase === "roll" ? `${turnPlayer.name} to roll` : `${turnPlayer.name} is choosing`) : "…", color: accent };
    }
    if (shownMyTurn && d.phase === "roll") return { text: d.sixes ? "A six — roll again" : "Your roll", color: accent };
    if (shownMyTurn && d.phase === "move") return { text: `You rolled a ${d.die} — pick a token`, color: accent };
    return { text: `Waiting for ${turnPlayer?.name ?? "…"}…`, color: TEXT_SOFT };
  }, [d.phase, d.sixes, d.die, winner, me, spectating, turnPlayer, shownMyTurn, pb.rolling, accent]);

  const dieCaption = useMemo(() => {
    if (pb.rolling) return "…";
    if (d.phase === "over") return winner ? `${winner.name} wins` : "Game over";
    if (canRoll) return "Tap to roll";
    if (shownMyTurn && d.phase === "roll") return "Your roll";
    if (d.phase === "move") return `${turnPlayer?.name ?? ""} rolled a ${d.die}`;
    return turnPlayer ? `${turnPlayer.name}'s roll` : "";
  }, [pb.rolling, d.phase, d.die, winner, canRoll, shownMyTurn, turnPlayer]);

  const { rootRef, rowRef, panelRef, boardRef, fit } = useTableFit();
  // the room's four panels meet under the board's centre
  const X = fit.cx !== null ? `${fit.cx}px` : "50%";
  const Y = fit.cy !== null ? `${fit.cy}px` : "50%";
  const n = d.players.length;
  const toolBtn = "flex h-8 items-center justify-center rounded-lg border px-2.5 transition hover:brightness-125";

  return (
    <div
      ref={rootRef}
      className="relative flex h-dvh flex-col overflow-hidden"
      style={{
        background: [
          // lamp over the table
          "radial-gradient(70% 42% at 50% 0%, rgba(255,236,200,0.16) 0%, transparent 60%)",
          // the board's own shadow pooling under it
          `radial-gradient(52% 52% at ${X} ${Y}, rgba(18,8,6,0.55) 0%, rgba(18,8,6,0.22) 48%, transparent 76%)`,
          // a soft sheen on each panel
          "radial-gradient(38% 38% at 22% 24%, rgba(255,255,255,0.07) 0%, transparent 70%)",
          "radial-gradient(38% 38% at 78% 24%, rgba(255,255,255,0.07) 0%, transparent 70%)",
          "radial-gradient(38% 38% at 22% 78%, rgba(255,255,255,0.06) 0%, transparent 70%)",
          "radial-gradient(38% 38% at 78% 78%, rgba(255,255,255,0.06) 0%, transparent 70%)",
          // the ivory seams between the panels
          `linear-gradient(90deg, transparent calc(${X} - 1px), ${IVORY_LINE} calc(${X} - 1px), ${IVORY_LINE} calc(${X} + 1px), transparent calc(${X} + 1px))`,
          `linear-gradient(180deg, transparent calc(${Y} - 1px), ${IVORY_LINE} calc(${Y} - 1px), ${IVORY_LINE} calc(${Y} + 1px), transparent calc(${Y} + 1px))`,
          // the four panels: marigold top-right, indigo bottom-right, vermilion bottom-left, emerald top-left
          `conic-gradient(from 0deg at ${X} ${Y}, ${ROOM.yellow} 0deg 90deg, ${ROOM.blue} 90deg 180deg, ${ROOM.red} 180deg 270deg, ${ROOM.green} 270deg 360deg)`,
        ].join(", "),
        fontFamily: "var(--font-sans)",
      }}
      onPointerDown={primeSound}
    >
      <style>{`
@keyframes ludo-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
`}</style>

      {/* header — rides above the game-over veil so the menu is always in reach */}
      <header className="relative z-[55] flex shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-3 sm:px-5">
        <div className="min-w-0">
          <h1 className={`${rozha.className} truncate text-[22px] leading-none sm:text-[26px]`} style={{ color: CREAM, textShadow: "0 2px 0 rgba(0,0,0,0.45), 0 0 24px rgba(0,0,0,0.35)" }}>
            Ludo
          </h1>
          <div className="mt-1 flex items-center gap-2 overflow-hidden whitespace-nowrap text-[9px] uppercase tracking-[0.22em] max-[379px]:tracking-[0.16em]" style={{ color: TEXT_SOFT }}>
            <span className="tabular-nums">{d.rolls} rolls</span>
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <span className="tabular-nums">{d.moves} moves</span>
            <span aria-hidden className="max-sm:hidden" style={{ opacity: 0.5 }}>·</span>
            <span className="max-sm:hidden">{d.players.length} colours</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className={`${toolBtn} w-8 px-0 text-[13px] ${muted ? "line-through" : ""}`}
            style={{ borderColor: CARD_BORDER, background: CARD_BG, color: muted ? "rgba(243,233,210,0.4)" : CREAM }}
          >
            ♪
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className={`${toolBtn} text-[10px] font-semibold uppercase tracking-[0.16em]`}
            style={{ borderColor: CARD_BORDER, background: CARD_BG, color: CREAM }}
          >
            Rules
          </button>
          <PartyMenu style={{ borderRadius: 8, borderColor: CARD_BORDER, background: CARD_BG, color: CREAM }} />
        </div>
      </header>

      {/* the table: board beside the side of the table in landscape, above it in portrait */}
      <main
        ref={rowRef}
        className="relative z-10 flex min-h-0 flex-1 flex-col items-center gap-3 px-3 pb-3 sm:px-5 sm:landscape:flex-row sm:landscape:justify-center sm:landscape:gap-6 sm:landscape:pb-4"
      >
        <div className="my-auto flex shrink-0 flex-col items-center" style={{ width: fit.size || undefined }}>
          <div ref={boardRef} style={{ width: fit.size, height: fit.size }}>
            {fit.size > 0 && (
              <LudoBoard
                players={d.players}
                pb={pb}
                turnSeat={d.phase !== "over" ? (turnPlayer?.seat ?? null) : null}
                interactive={canPick}
                mySeat={me?.seat ?? null}
                movable={v.movable}
                die={v.die}
                hoverToken={hoverToken}
                onHoverToken={handleHover}
                onPickToken={pickToken}
                winnerSeat={d.phase === "over" ? (winner?.seat ?? null) : null}
              />
            )}
          </div>

          {/* log ticker */}
          <div className="flex w-full items-end justify-center overflow-hidden px-2 text-center" style={{ height: TICKER_H }}>
            <AnimatePresence mode="wait" initial={false}>
              {lastLog && (
                <motion.span
                  key={lastLog.i}
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -6, opacity: 0 }}
                  transition={{ duration: 0.26, ease: SWIFT }}
                  className="truncate text-[11px] italic"
                  style={{ color: TEXT_SOFT, textShadow: "0 1px 0 rgba(0,0,0,0.35)" }}
                >
                  {logLine(lastLog)}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* the side of the table: status, die tray, the players */}
        <div
          ref={panelRef}
          className="flex w-full max-w-[560px] shrink-0 flex-col gap-3 sm:landscape:min-h-0 sm:landscape:w-[clamp(232px,22vw,300px)] sm:landscape:gap-4"
          style={fit.side && fit.size ? { height: fit.size + TICKER_H } : undefined}
        >
          {spectating && (
            <div
              className="mx-auto shrink-0 rounded-full border px-3 py-0.5 text-[9px] uppercase tracking-[0.26em] sm:landscape:mx-0 sm:landscape:self-start"
              style={{ borderColor: `${BRASS}88`, background: CARD_BG_ACTIVE, color: "#eed9a4" }}
            >
              Spectating<span className="sm:landscape:hidden"> — pull up a chair</span>
            </div>
          )}

          {/* banner + clock */}
          <div className="shrink-0 space-y-2">
            <div className="flex min-h-[28px] items-center justify-center gap-2.5 text-center sm:landscape:justify-start sm:landscape:text-left">
              {turnPlayer && d.phase !== "over" && <TokenChip color={turnPlayer.color} size={16} />}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={banner.text}
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.28, ease: SWIFT }}
                  className={`${rozha.className} text-[17px] leading-tight sm:text-[19px]`}
                  style={{ color: banner.color, textShadow: "0 1px 0 rgba(0,0,0,0.45), 0 0 18px rgba(0,0,0,0.35)" }}
                >
                  {banner.text}
                </motion.span>
              </AnimatePresence>
            </div>
            {d.phase !== "over" && v.deadline !== null && (
              <DeadlineBar deadline={v.deadline} nowEst={nowEst} color={accent} label={turnPlayer ? `${turnPlayer.name} — ${d.phase === "roll" ? "to roll" : "to move"}` : "clock"} />
            )}
          </div>

          {/* die tray + roster: side by side in portrait, stacked in landscape */}
          <div className="flex min-h-0 items-stretch gap-3 sm:landscape:flex-col sm:landscape:gap-4">
            <div
              className="flex shrink-0 items-center justify-center rounded-2xl border px-3 py-3 sm:landscape:px-4 sm:landscape:py-4"
              style={{
                borderColor: "rgba(201,164,92,0.35)",
                background: "linear-gradient(180deg, rgba(58,32,24,0.78) 0%, rgba(29,15,10,0.82) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 40px rgba(0,0,0,0.4)",
              }}
            >
              <DieTray value={pb.dieFace} rolling={pb.rolling} canRoll={canRoll} onRoll={roll} accent={accent} caption={dieCaption} />
            </div>
            <div
              className={`grid min-w-0 flex-1 content-center gap-1.5 ${n <= 2 ? "grid-cols-1" : "grid-cols-2"} sm:landscape:-mx-1 sm:landscape:flex sm:landscape:min-h-0 sm:landscape:flex-col sm:landscape:content-start sm:landscape:gap-2 sm:landscape:overflow-y-auto sm:landscape:px-1 sm:landscape:pb-1`}
            >
              {d.players.map((p) => (
                <PlayerCard key={p.id} p={p} active={d.phase !== "over" && d.turn === p.id} you={p.id === youId} wins={tallies[p.id] ?? 0} won={d.winner === p.id} compact={n > 2} />
              ))}
            </div>
          </div>

          {(canRoll || canPick) && (
            <p className="mt-auto hidden shrink-0 text-[9px] uppercase leading-relaxed tracking-[0.2em] sm:landscape:block" style={{ color: "rgba(243,233,210,0.55)" }}>
              {canRoll ? "tap the die · space also rolls" : "tap a glowing token · keys 1–4 also work"}
            </p>
          )}
        </div>
      </main>

      <AnimatePresence>
        {d.phase === "over" && (
          <GameOverCard key="ludo-over" v={d} party={party} youId={youId} isHost={isHost} playAgain={playAgain} exitToLobby={exitToLobby} delay={0.35} />
        )}
      </AnimatePresence>

      {rulesOpen && <LudoRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
