"use client";

/* Ludo — an heirloom board on a table that is the board writ large: four
   deep pigment panels meeting in a cross. Lacquer and brass, ivory enamel,
   glossy domed tokens, and a real ivory die that tumbles onto a suede tray.

   Everything the screen SAYS about the game — whose turn, what was rolled,
   which tokens may move, who won — comes from the replay's `shown` view, so
   it lands in step with the die and the hops rather than with the packet.
   Only the ability to act reads the live view, gated on the replay. */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getMutedServerSnapshot, getMutedSnapshot, primeSound, setMuted, subscribeMuted } from "@/lib/client/synthCore";
import { HOME_POS, TURN_MS, type LudoLogEntry, type LudoMove, type LudoView, type LudoViewPlayer } from "@/lib/games/ludo/types";
import type { GameScreenProps } from "@/lib/party/types";
import { LudoBoard } from "./Board";
import { DieTray } from "./Die";
import { rozha } from "./font";
import { GameOverCard, HomeDots, LudoRulesModal, TokenChip } from "./Overlays";
import { BRASS, CARD_BG, CARD_BG_ACTIVE, CARD_BORDER, CREAM, PAINT, ROOM, SWIFT, TEXT_SOFT } from "./paint";
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

function PlayerCard({ p, active, you, wins, won }: { p: LudoViewPlayer; active: boolean; you: boolean; wins: number; won: boolean }) {
  const paint = PAINT[p.color];
  const home = p.tokens.filter((x) => x === HOME_POS).length;
  const racing = p.tokens.filter((x) => x >= 0 && x < HOME_POS).length;
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-[border-color,background,box-shadow] duration-300"
      style={{
        borderColor: active ? `${paint.light}aa` : CARD_BORDER,
        background: active ? CARD_BG_ACTIVE : CARD_BG,
        boxShadow: active ? `0 0 26px ${paint.base}66, inset 0 1px 0 rgba(255,255,255,0.08)` : "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 20px rgba(0,0,0,0.25)",
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
            <span className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-[0.14em]" style={{ background: "rgba(243,233,210,0.16)", color: CREAM }}>
              you
            </span>
          )}
          {wins > 0 && (
            <span className="ml-auto text-[10px] font-bold tabular-nums" style={{ color: BRASS }} title="Ludo wins">
              ★{wins}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[9.5px] uppercase tracking-[0.14em]" style={{ color: TEXT_SOFT }}>
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

  const dieTray = <DieTray value={pb.dieFace} rolling={pb.rolling} canRoll={canRoll} onRoll={roll} accent={accent} caption={dieCaption} />;

  const roster = (
    <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1 lg:gap-2">
      {d.players.map((p) => (
        <PlayerCard key={p.id} p={p} active={d.phase !== "over" && d.turn === p.id} you={p.id === youId} wins={tallies[p.id] ?? 0} won={d.winner === p.id} />
      ))}
    </div>
  );

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col overflow-x-hidden"
      style={{
        background: [
          // lamp over the table
          "radial-gradient(70% 42% at 50% 0%, rgba(255,236,200,0.16) 0%, transparent 60%)",
          // the board's own shadow pooling under it
          "radial-gradient(52% 52% at 50% 50%, rgba(18,8,6,0.55) 0%, rgba(18,8,6,0.22) 48%, transparent 76%)",
          // a soft sheen on each panel
          "radial-gradient(38% 38% at 22% 24%, rgba(255,255,255,0.07) 0%, transparent 70%)",
          "radial-gradient(38% 38% at 78% 24%, rgba(255,255,255,0.07) 0%, transparent 70%)",
          "radial-gradient(38% 38% at 22% 78%, rgba(255,255,255,0.06) 0%, transparent 70%)",
          "radial-gradient(38% 38% at 78% 78%, rgba(255,255,255,0.06) 0%, transparent 70%)",
          // the ivory seams between the panels
          `linear-gradient(90deg, transparent calc(50% - 1px), ${IVORY_LINE} calc(50% - 1px), ${IVORY_LINE} calc(50% + 1px), transparent calc(50% + 1px))`,
          `linear-gradient(180deg, transparent calc(50% - 1px), ${IVORY_LINE} calc(50% - 1px), ${IVORY_LINE} calc(50% + 1px), transparent calc(50% + 1px))`,
          // the four panels: marigold top-right, indigo bottom-right, vermilion bottom-left, emerald top-left
          `conic-gradient(from 0deg at 50% 50%, ${ROOM.yellow} 0deg 90deg, ${ROOM.blue} 90deg 180deg, ${ROOM.red} 180deg 270deg, ${ROOM.green} 270deg 360deg)`,
        ].join(", "),
        fontFamily: "var(--font-sans)",
      }}
      onPointerDown={primeSound}
    >
      <style>{`
@keyframes ludo-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
`}</style>

      {/* header */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-3 pb-1 pt-3 sm:px-5">
        <div className="min-w-0">
          <h1 className={`${rozha.className} truncate text-[22px] leading-none sm:text-[26px]`} style={{ color: CREAM, textShadow: "0 2px 0 rgba(0,0,0,0.45), 0 0 24px rgba(0,0,0,0.35)" }}>
            Ludo
          </h1>
          <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.22em]" style={{ color: TEXT_SOFT }}>
            <span className="tabular-nums">{d.rolls} rolls</span>
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <span className="tabular-nums">{d.moves} moves</span>
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <span>{d.players.length} colours</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className={`rounded-lg border px-2.5 py-1.5 text-[13px] transition ${muted ? "line-through" : ""}`}
            style={{ borderColor: CARD_BORDER, background: CARD_BG, color: muted ? "rgba(243,233,210,0.4)" : CREAM }}
          >
            ♪
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition"
            style={{ borderColor: CARD_BORDER, background: CARD_BG, color: CREAM }}
          >
            Rules
          </button>
        </div>
      </header>

      {spectating && (
        <div className="relative z-10 mx-auto mt-1 rounded-full border px-3 py-0.5 text-[9px] uppercase tracking-[0.26em]" style={{ borderColor: `${BRASS}88`, background: CARD_BG_ACTIVE, color: "#eed9a4" }}>
          Spectating — pull up a chair
        </div>
      )}

      {/* banner + clock */}
      <div className="relative z-10 mt-2 space-y-2 px-3 sm:px-5">
        <div className="flex min-h-[32px] items-center justify-center gap-2.5">
          {turnPlayer && d.phase !== "over" && <TokenChip color={turnPlayer.color} size={16} />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={banner.text}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.28, ease: SWIFT }}
              className={`${rozha.className} text-[17px] leading-none sm:text-[19px]`}
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

      {/* the table */}
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-3 pb-6 pt-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(250px,300px)] lg:items-start lg:gap-6">
          <div className="min-w-0">
            <div className="mx-auto w-full" style={{ maxWidth: "min(100%, 720px, 80vh)" }}>
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
                    style={{ color: TEXT_SOFT, textShadow: "0 1px 0 rgba(0,0,0,0.35)" }}
                  >
                    {logLine(lastLog)}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            {(canRoll || canPick) && (
              <p className="mt-1 hidden text-center text-[9px] uppercase tracking-[0.2em] lg:block" style={{ color: "rgba(243,233,210,0.5)" }}>
                {canRoll ? "tap the die · space also rolls" : "tap a glowing token · keys 1–4 also work"}
              </p>
            )}
          </div>

          {/* the side of the table: die tray + the players */}
          <div className="flex flex-col items-stretch gap-4">
            <div
              className="rounded-2xl border px-4 py-4"
              style={{
                borderColor: "rgba(201,164,92,0.35)",
                background: "linear-gradient(180deg, rgba(58,32,24,0.78) 0%, rgba(29,15,10,0.82) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 40px rgba(0,0,0,0.4)",
              }}
            >
              {dieTray}
            </div>
            {roster}
          </div>
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
