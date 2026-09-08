"use client";

/* Ludo — an heirloom board on a velvet cloth. Lacquer and brass, ivory
   enamel, four heritage pigments, glossy domed tokens, and a real ivory die
   that tumbles onto a suede tray. The one honest piece of physics is the
   hop: a token moves one square at a time and you hear every step. */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getMutedServerSnapshot, getMutedSnapshot, primeSound, setMuted, subscribeMuted } from "@/lib/client/synthCore";
import { HOME_POS, TURN_MS, type LudoLogEntry, type LudoMove, type LudoView, type LudoViewPlayer } from "@/lib/games/ludo/types";
import type { GameScreenProps } from "@/lib/party/types";
import { LudoBoard } from "./Board";
import { DieTray } from "./Die";
import { rozha } from "./font";
import { GameOverCard, HomeDots, LudoRulesModal, TokenChip } from "./Overlays";
import { BRASS, CREAM, moveDuration, MUTED, PAINT, ROLL_MS, SWIFT } from "./paint";
import { useLudoPlayback } from "./playback";
import { ludoSfx, playLudoDiff } from "./sfx";

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
        <span style={{ color: MUTED }}>{label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: danger ? "#ff8a7a" : CREAM, animation: danger ? "ludo-pulse 0.9s ease-in-out infinite" : undefined }}>
          {secs}s
        </span>
      </div>
      <div className="mt-1 h-[4px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${frac * 100}%`,
            background: danger ? "linear-gradient(90deg,#ff5a4a,#ff9d7a)" : `linear-gradient(90deg, ${color}, ${BRASS})`,
            boxShadow: `0 0 12px ${danger ? "rgba(255,90,74,0.6)" : `${color}77`}`,
            transition: "width 200ms linear",
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- roster card ---------------- */

function PlayerCard({ p, active, you, wins, won }: { p: LudoViewPlayer; active: boolean; you: boolean; wins: number; won: boolean }) {
  const paint = PAINT[p.color];
  const home = p.tokens.filter((x) => x === HOME_POS).length;
  const racing = p.tokens.filter((x) => x >= 0 && x < HOME_POS).length;
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-[border-color,background,box-shadow] duration-300"
      style={{
        borderColor: active ? `${paint.light}99` : "rgba(255,255,255,0.08)",
        background: active ? `${paint.base}22` : "rgba(255,255,255,0.03)",
        boxShadow: active ? `0 0 24px ${paint.base}33, inset 0 1px 0 rgba(255,255,255,0.06)` : "inset 0 1px 0 rgba(255,255,255,0.03)",
        transitionTimingFunction: EASE,
        opacity: p.left ? 0.5 : 1,
      }}
    >
      <div className="relative shrink-0">
        <TokenChip color={p.color} size={24} dim={p.left} />
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
            {p.name}
          </span>
          {you && (
            <span className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-[0.14em]" style={{ background: "rgba(255,255,255,0.12)", color: MUTED }}>
              you
            </span>
          )}
          {wins > 0 && (
            <span className="ml-auto text-[10px] font-bold tabular-nums" style={{ color: BRASS }} title="Ludo wins">
              ★{wins}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[9.5px] uppercase tracking-[0.14em]" style={{ color: MUTED }}>
          <HomeDots color={p.color} home={home} size={7} />
          {p.left ? <span>left</span> : <span className="tabular-nums">{racing} out · {p.inYard} in yard</span>}
        </div>
      </div>
    </div>
  );
}

/* ==================== screen ==================== */

export function LudoScreen(props: GameScreenProps<LudoView>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;

  const [rulesOpen, setRulesOpen] = useState(false);
  const [hoverToken, setHoverToken] = useState<number | null>(null);
  const nowEst = useNowEst(v.now, skew);
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const pb = useLudoPlayback(v);

  const me = v.players.find((p) => p.id === youId) ?? null;
  const turnPlayer = v.turn ? v.players.find((p) => p.id === v.turn) ?? null : null;
  const winner = v.winner ? v.players.find((p) => p.id === v.winner) ?? null : null;
  const myTurn = !spectating && me !== null && !me.left && v.phase !== "over" && v.turn === youId;
  const canRoll = myTurn && v.phase === "roll";
  const canPick = myTurn && v.phase === "move";
  const tallies = party.tallies.ludo ?? {};
  const accentColor = turnPlayer ? PAINT[turnPlayer.color] : winner ? PAINT[winner.color] : null;
  const accent = accentColor ? accentColor.light : BRASS;

  /* --- sounds: diff the previous view's log ------------------------------ */

  const prevRef = useRef<LudoView | null>(null);
  useEffect(() => {
    playLudoDiff(prevRef.current, v, youId);
    prevRef.current = v;
  }, [v, youId]);

  useEffect(() => {
    document.title = myTurn ? (canRoll ? "● Your roll — Ludo" : "● Your move — Ludo") : "Ludo";
  }, [myTurn, canRoll]);

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
    if (!myTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        if (canRoll) {
          e.preventDefault();
          roll();
        }
      } else if (/^[1-4]$/.test(e.key) && canPick) {
        e.preventDefault();
        pickToken(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [myTurn, canRoll, canPick, roll, pickToken]);

  /* --- chrome ------------------------------------------------------------ */

  const lastLog = v.log.length ? v.log[v.log.length - 1] : null;

  const banner = useMemo(() => {
    if (v.phase === "over") {
      return { text: winner ? `${winner.name} brings all four home` : "Game over", color: accent };
    }
    if (me?.left) return { text: "You left the table", color: MUTED };
    if (spectating || !me) {
      return { text: turnPlayer ? (v.phase === "roll" ? `${turnPlayer.name} to roll` : `${turnPlayer.name} is choosing`) : "…", color: accent };
    }
    if (canRoll) return { text: v.sixes ? "A six — roll again" : "Your roll", color: accent };
    if (canPick) return { text: `You rolled a ${v.die} — pick a token`, color: accent };
    return { text: `Waiting for ${turnPlayer?.name ?? "…"}…`, color: MUTED };
  }, [v.phase, v.sixes, v.die, winner, me, spectating, turnPlayer, canRoll, canPick, accent]);

  const dieCaption = useMemo(() => {
    if (v.phase === "over") return winner ? `${winner.name} wins` : "Game over";
    if (canRoll) return "Tap to roll";
    if (pb.rolling) return "…";
    if (v.phase === "move") return `${turnPlayer?.name ?? ""} rolled a ${v.die}`;
    return turnPlayer ? `${turnPlayer.name}'s roll` : "";
  }, [v.phase, v.die, winner, canRoll, pb.rolling, turnPlayer]);

  // hold the game-over card until the die and the last hop have played out
  const overDelay = useMemo(() => {
    if (v.phase !== "over") return 0.4;
    let ms = 300;
    if (v.lastRoll && v.lastMove && v.lastMove.rollN === v.lastRoll.n) ms += ROLL_MS;
    if (v.lastMove) ms += moveDuration(v.lastMove.from, v.lastMove.to, v.lastMove.captured.length);
    return ms / 1000;
  }, [v.phase, v.lastRoll, v.lastMove]);

  const dieTray = (
    <DieTray value={pb.dieFace} rolling={pb.rolling} canRoll={canRoll} onRoll={roll} accent={accent} caption={dieCaption} />
  );

  const roster = (
    <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1 lg:gap-2">
      {v.players.map((p) => (
        <PlayerCard key={p.id} p={p} active={v.phase !== "over" && v.turn === p.id} you={p.id === youId} wins={tallies[p.id] ?? 0} won={v.winner === p.id} />
      ))}
    </div>
  );

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col overflow-x-hidden"
      style={{
        background: `radial-gradient(90% 55% at 50% -10%, ${accent}2e 0%, ${accent}0a 40%, transparent 65%), linear-gradient(180deg, #2c1622 0%, #1c0d15 50%, #12080d 100%)`,
        fontFamily: "var(--font-sans)",
        transition: "background 700ms ease",
      }}
      onPointerDown={primeSound}
    >
      <style>{`
@keyframes ludo-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
`}</style>

      {/* velvet sheen + lamp */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 0%, rgba(255,226,180,0.08) 0%, transparent 70%), repeating-linear-gradient(115deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 2px, transparent 2px, transparent 7px)",
        }}
      />

      {/* header */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-3 pb-1 pt-3 sm:px-5">
        <div className="min-w-0">
          <h1 className={`${rozha.className} truncate text-[22px] leading-none sm:text-[26px]`} style={{ color: CREAM, textShadow: `0 2px 0 rgba(0,0,0,0.5), 0 0 24px ${accent}55` }}>
            Ludo
          </h1>
          <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.22em]" style={{ color: MUTED }}>
            <span className="tabular-nums">{v.rolls} rolls</span>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span className="tabular-nums">{v.moves} moves</span>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span>{v.players.length} colours</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className={`rounded-lg border px-2.5 py-1.5 text-[13px] transition ${muted ? "line-through" : ""}`}
            style={{ borderColor: "rgba(255,255,255,0.16)", color: muted ? "rgba(164,147,122,0.5)" : MUTED }}
          >
            ♪
          </button>
          <button type="button" onClick={() => setRulesOpen(true)} className="rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition" style={{ borderColor: "rgba(255,255,255,0.16)", color: MUTED }}>
            Rules
          </button>
        </div>
      </header>

      {spectating && (
        <div className="relative z-10 mx-auto mt-1 rounded-full border px-3 py-0.5 text-[9px] uppercase tracking-[0.26em]" style={{ borderColor: `${BRASS}66`, background: "rgba(30,16,22,0.7)", color: "#e8d3a4" }}>
          Spectating — pull up a chair
        </div>
      )}

      {/* banner + clock */}
      <div className="relative z-10 mt-2 space-y-2 px-3 sm:px-5">
        <div className="flex min-h-[32px] items-center justify-center gap-2.5">
          {turnPlayer && v.phase !== "over" && <TokenChip color={turnPlayer.color} size={16} />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={banner.text}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.28, ease: SWIFT }}
              className={`${rozha.className} text-[17px] leading-none sm:text-[19px]`}
              style={{ color: banner.color, textShadow: `0 0 20px ${banner.color}44` }}
            >
              {banner.text}
            </motion.span>
          </AnimatePresence>
        </div>
        {v.phase !== "over" && v.deadline !== null && (
          <DeadlineBar deadline={v.deadline} nowEst={nowEst} color={accent} label={turnPlayer ? `${turnPlayer.name} — ${v.phase === "roll" ? "to roll" : "to move"}` : "clock"} />
        )}
      </div>

      {/* the table */}
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-3 pb-6 pt-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(250px,300px)] lg:items-start lg:gap-6">
          <div className="min-w-0">
            <div className="mx-auto w-full" style={{ maxWidth: "min(100%, 720px, 80vh)" }}>
              <LudoBoard
                players={v.players}
                pb={pb}
                turnSeat={v.phase !== "over" ? (turnPlayer?.seat ?? null) : null}
                interactive={canPick}
                mySeat={me?.seat ?? null}
                movable={v.movable}
                die={v.die}
                hoverToken={hoverToken}
                onHoverToken={handleHover}
                onPickToken={pickToken}
                winnerSeat={v.phase === "over" && !pb.animating ? (winner?.seat ?? null) : null}
              />
            </div>

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
                    style={{ color: "rgba(164,147,122,0.95)" }}
                  >
                    {logLine(lastLog)}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            {myTurn && (
              <p className="mt-1 hidden text-center text-[9px] uppercase tracking-[0.2em] lg:block" style={{ color: "rgba(164,147,122,0.55)" }}>
                {canRoll ? "tap the die · space also rolls" : "tap a glowing token · keys 1–4 also work"}
              </p>
            )}
          </div>

          {/* the side of the table: die tray + the players */}
          <div className="flex flex-col items-stretch gap-4">
            <div
              className="rounded-2xl border px-4 py-4"
              style={{ borderColor: "rgba(201,164,92,0.28)", background: "linear-gradient(180deg, rgba(58,32,24,0.55) 0%, rgba(29,15,10,0.55) 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 40px rgba(0,0,0,0.35)" }}
            >
              {dieTray}
            </div>
            {roster}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {v.phase === "over" && (
          <GameOverCard key="ludo-over" v={v} party={party} youId={youId} isHost={isHost} playAgain={playAgain} exitToLobby={exitToLobby} delay={overDelay} />
        )}
      </AnimatePresence>

      {rulesOpen && <LudoRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
