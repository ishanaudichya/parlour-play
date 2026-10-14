"use client";

/* Dots and Boxes — a notebook open on a desk. First the host sets the page
   up: how many boxes across, how many down, with presets and a live preview
   everyone can see. Then the page opens and the pens go round: draw a line,
   close a box, go again. Quiet chrome — the page is the game. */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getMutedServerSnapshot, getMutedSnapshot, primeSound, setMuted, subscribeMuted } from "@/lib/client/synthCore";
import { LINE_MS, MAX_SIDE, MIN_SIDE, SETUP_MS, type DotsMove, type DotsView, type Orient } from "@/lib/games/dots/types";
import type { GameScreenProps } from "@/lib/party/types";
import { hand } from "./font";
import { GameOverCard, DotsRulesModal } from "./Overlays";
import { Page, pageAspect } from "./Page";
import { DESK, inkOf, LINE, PAPER, PAPER_EDGE, SURFACE, SWIFT, TEXT, TEXT_2, TEXT_3 } from "./palette";
import { dotsSfx } from "./sfx";

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: "Quick", w: 3, h: 3 },
  { label: "Classic", w: 5, h: 5 },
  { label: "Big", w: 8, h: 8 },
  { label: "Wide", w: 9, h: 5 },
  { label: "Tall", w: 5, h: 9 },
  { label: "Marathon", w: 12, h: 12 },
];
const SIZE_KEY = "dots.size";

function useNowEst(serverNow: number, skew: number) {
  const [n, setN] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setN(Date.now() + skew), 250);
    return () => clearInterval(id);
  }, [skew]);
  return Math.max(n, serverNow);
}

function Stepper({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean }) {
  const btn = "flex h-10 w-10 items-center justify-center rounded-lg text-[18px] transition-colors enabled:hover:bg-white/10 disabled:opacity-30";
  return (
    <div className="flex flex-col items-center">
      <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: TEXT_3 }}>
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" aria-label={`Fewer boxes ${label.toLowerCase()}`} disabled={disabled || value <= MIN_SIDE} onClick={() => onChange(value - 1)} className={btn} style={{ border: `1px solid ${LINE}`, color: TEXT }}>
          −
        </button>
        <span className={`${hand.className} w-10 text-center text-[28px] font-bold leading-none tabular-nums`} style={{ color: TEXT }}>
          {value}
        </span>
        <button type="button" aria-label={`More boxes ${label.toLowerCase()}`} disabled={disabled || value >= MAX_SIDE} onClick={() => onChange(value + 1)} className={btn} style={{ border: `1px solid ${LINE}`, color: TEXT }}>
          +
        </button>
      </div>
    </div>
  );
}

/** The notebook: paper, spiral binding, the page inside. Sized to fit the room it's given. */
function Notebook({ w, h, children, maxH }: { w: number; h: number; children: React.ReactNode; maxH: string }) {
  const aspect = pageAspect(w, h);
  return (
    <div className="relative mx-auto" style={{ width: `min(100%, calc(${maxH} * ${aspect}))`, aspectRatio: `${aspect}` }}>
      <div className="absolute inset-0 rounded-[6px]" style={{ background: PAPER, boxShadow: `0 1px 0 ${PAPER_EDGE}, 0 2px 0 #d9cfb6, 0 3px 0 ${PAPER_EDGE}, 0 24px 60px rgba(0,0,0,0.55)` }} />
      {/* spiral binding */}
      <div className="pointer-events-none absolute inset-x-[4%] -top-[10px] flex justify-between" aria-hidden>
        {Array.from({ length: Math.max(6, Math.round(w * 1.6)) }, (_, i) => (
          <span key={i} className="block h-[18px] w-[7px] rounded-full" style={{ background: "linear-gradient(90deg,#8d939c,#e6e9ee 45%,#7d838c)", boxShadow: "0 1px 2px rgba(0,0,0,0.5)" }} />
        ))}
      </div>
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

export function DotsScreen(props: GameScreenProps<DotsView>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;
  const nowEst = useNowEst(v.now, skew);
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const [rulesOpen, setRulesOpen] = useState(false);

  const me = v.players.find((p) => p.id === youId) ?? null;
  const turnPlayer = v.players.find((p) => p.id === v.turn) ?? null;
  const chooser = v.phase === "setup" ? turnPlayer : null;
  const iChoose = !spectating && !!me && !me.left && v.phase === "setup" && v.turn === youId;
  const myTurn = !spectating && !!me && !me.left && v.phase === "play" && v.turn === youId;
  const initials = v.players.map((p) => p.name.trim().slice(0, 1).toUpperCase() || "?");
  const total = v.w * v.h;
  const tallies = party.tallies.dots ?? {};

  const send = (m: DotsMove) => move(m);

  /* --- setup: the host's size, optimistic, remembered for next time ----- */

  const [pending, setPending] = useState<{ w: number; h: number } | null>(null);
  const size = pending ?? { w: v.w, h: v.h };
  const setSize = (w: number, h: number) => {
    if (!iChoose) return;
    dotsSfx("tick");
    setPending({ w, h });
    send({ type: "size", w, h });
    try {
      localStorage.setItem(SIZE_KEY, `${w}x${h}`);
    } catch {}
  };
  // the server caught up: drop the optimistic copy
  if (pending && pending.w === v.w && pending.h === v.h) setPending(null);

  // a new setup: the host's page comes up the size they used last time
  const prefilled = useRef<number | null>(null);
  useEffect(() => {
    if (!iChoose || prefilled.current === v.startedAt) return;
    prefilled.current = v.startedAt;
    try {
      const m = /^(\d+)x(\d+)$/.exec(localStorage.getItem(SIZE_KEY) ?? "");
      if (!m) return;
      const w = Number(m[1]);
      const h = Number(m[2]);
      if (w >= MIN_SIDE && w <= MAX_SIDE && h >= MIN_SIDE && h <= MAX_SIDE && (w !== v.w || h !== v.h)) move({ type: "size", w, h } satisfies DotsMove);
    } catch {}
  }, [iChoose, v.startedAt, v.w, v.h, move]);

  /* --- sounds ------------------------------------------------------------- */

  const prev = useRef<DotsView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    if (!p || p.startedAt !== v.startedAt) return;
    if (p.phase === "setup" && v.phase === "play") dotsSfx("page");
    if (v.last && v.last.seq !== p.last?.seq) {
      dotsSfx("scratch");
      if (v.last.boxes.length) window.setTimeout(() => dotsSfx("box"), 200);
    }
    if (v.phase === "over" && p.phase !== "over") window.setTimeout(() => dotsSfx(v.winner ? "win" : "draw"), 300);
    if (v.phase === "play" && v.turn === youId && p.turn !== youId) {
      dotsSfx("yourTurn");
      try {
        navigator.vibrate?.(25);
      } catch {}
    }
  }, [v, youId]);

  useEffect(() => {
    document.title = myTurn ? "● Your line — Dots and Boxes" : iChoose ? "● Set up the page — Dots and Boxes" : "Dots and Boxes";
  }, [myTurn, iChoose]);

  /* --- chrome ------------------------------------------------------------- */

  const limit = v.phase === "setup" ? SETUP_MS : LINE_MS;
  const left = v.deadline ? Math.max(0, v.deadline - nowEst) : 0;
  const frac = Math.min(1, left / limit);
  const extra = v.phase === "play" && v.last && v.last.boxes.length > 0 && turnPlayer && v.last.seat === turnPlayer.seat;
  let banner = "";
  if (v.phase === "setup") banner = iChoose ? "Set up the page" : `${chooser?.name ?? "The host"} is setting up the page`;
  else if (v.phase === "play") {
    if (myTurn) banner = extra ? "Box! Draw again" : "Your line";
    else if (turnPlayer) banner = extra ? `${turnPlayer.name} closed a box — again` : `${turnPlayer.name} is drawing`;
  }
  const accent = turnPlayer && v.phase === "play" ? inkOf(turnPlayer.seat) : TEXT;
  const claimed = v.boxes.filter((b) => b >= 0).length;

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col overflow-x-hidden"
      style={{ background: `radial-gradient(70% 55% at 50% 30%, #3a3029 0%, ${DESK} 70%)`, color: TEXT }}
      onPointerDown={primeSound}
    >
      <header className="flex items-center justify-between gap-3 px-3 pt-3 sm:px-5">
        <div className="min-w-0">
          <h1 className={`${hand.className} text-[24px] font-bold leading-none sm:text-[28px]`}>Dots and Boxes</h1>
          <div className="mt-1 text-[11px]" style={{ color: TEXT_3 }}>
            {v.phase === "setup" ? "New page" : `${v.w} × ${v.h} boxes · ${claimed}/${total} claimed`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"} className="h-9 rounded-lg px-3 text-[12px]" style={{ border: `1px solid ${LINE}`, color: muted ? TEXT_3 : TEXT_2 }}>
            {muted ? "Sound off" : "Sound on"}
          </button>
          <button type="button" onClick={() => setRulesOpen(true)} className="h-9 rounded-lg px-3 text-[12px] font-medium" style={{ border: `1px solid ${LINE}`, color: TEXT_2 }}>
            Rules
          </button>
        </div>
      </header>

      {/* the pens */}
      <div className="mt-3 flex flex-wrap justify-center gap-2 px-3">
        {v.players.map((p) => {
          const ink = inkOf(p.seat);
          const on = v.phase === "play" && v.turn === p.id;
          return (
            <motion.div
              key={p.id}
              layout
              className="flex items-center gap-2 rounded-xl px-3 py-1.5"
              style={{ background: on ? `${ink}26` : SURFACE, border: `1px solid ${on ? ink : LINE}`, opacity: p.left ? 0.4 : 1, transition: "background 200ms, border-color 200ms" }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ink }} />
              <span className={`max-w-[110px] truncate text-[13px] font-semibold ${p.left ? "line-through" : ""}`}>
                {p.name}
                {p.id === youId ? <span style={{ color: TEXT_3 }}> · you</span> : null}
              </span>
              {v.phase !== "setup" && (
                <motion.span key={p.score} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className={`${hand.className} text-[20px] font-bold leading-none tabular-nums`} style={{ color: ink === "#6f4e2c" ? "#c49a6c" : ink }}>
                  {p.score}
                </motion.span>
              )}
              {(tallies[p.id] ?? 0) > 0 && (
                <span className="text-[10px]" style={{ color: TEXT_3 }}>
                  ★{tallies[p.id]}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* banner + clock */}
      <div className="mt-3 flex flex-col items-center px-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={banner} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: SWIFT }} className={`${hand.className} text-[20px] font-bold leading-none`} style={{ color: accent }}>
            {banner}
          </motion.div>
        </AnimatePresence>
        {v.phase !== "over" && (
          <div className="mt-2 h-[3px] w-40 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: frac < 0.25 ? "#ff6a5a" : accent, transition: "width 250ms linear" }} />
          </div>
        )}
      </div>

      <main className="flex flex-1 flex-col items-center px-3 pb-6 pt-6 sm:px-6">
        {v.phase === "setup" ? (
          <>
            <div className="w-full max-w-3xl">
              <Notebook w={size.w} h={size.h} maxH="min(44dvh, 560px)">
                <Page w={size.w} h={size.h} hLines={[]} vLines={[]} boxes={[]} initials={initials} last={null} drawAs={null} />
              </Notebook>
            </div>
            <div className="mt-6 flex w-full max-w-xl flex-col items-center gap-4">
              <div className="flex items-end justify-center gap-8">
                <Stepper label="Across" value={size.w} disabled={!iChoose} onChange={(w) => setSize(w, size.h)} />
                <span className={`${hand.className} pb-2 text-[22px]`} style={{ color: TEXT_3 }}>
                  ×
                </span>
                <Stepper label="Down" value={size.h} disabled={!iChoose} onChange={(h) => setSize(size.w, h)} />
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {PRESETS.map((p) => {
                  const on = p.w === size.w && p.h === size.h;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      disabled={!iChoose}
                      onClick={() => setSize(p.w, p.h)}
                      className="rounded-lg px-3 py-1.5 text-[12px] transition-colors enabled:hover:bg-white/10 disabled:cursor-default"
                      style={{ border: `1px solid ${on ? TEXT_2 : LINE}`, color: on ? TEXT : TEXT_2, background: on ? "rgba(255,255,255,0.08)" : "transparent" }}
                    >
                      {p.label} <span style={{ color: TEXT_3 }}>{p.w}×{p.h}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[12px]" style={{ color: TEXT_3 }}>
                {size.w * size.h} boxes · {(size.h + 1) * size.w + size.h * (size.w + 1)} lines to draw
              </div>
              {iChoose ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    dotsSfx("page");
                    send({ type: "start" });
                  }}
                  className={`${hand.className} rounded-xl px-8 py-2.5 text-[20px] font-bold`}
                  style={{ background: PAPER, color: "#1f2330", boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}
                >
                  Open the page
                </motion.button>
              ) : (
                <div className="text-[13px]" style={{ color: TEXT_2 }}>
                  Waiting for {chooser?.name ?? "the host"} to open the page…
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="w-full max-w-4xl">
            <Notebook w={v.w} h={v.h} maxH="calc(100dvh - 250px)">
              <Page
                w={v.w}
                h={v.h}
                hLines={v.hLines}
                vLines={v.vLines}
                boxes={v.boxes}
                initials={initials}
                last={v.last}
                drawAs={myTurn && me ? me.seat : null}
                onLine={(o: Orient, r: number, c: number) => send({ type: "line", o, r, c })}
              />
            </Notebook>
            {myTurn && (
              <p className="mt-4 text-center text-[12px]" style={{ color: TEXT_3 }}>
                Tap between two dots to draw a line. Close a box and you go again.
              </p>
            )}
          </div>
        )}
      </main>

      <AnimatePresence>
        {v.phase === "over" && <GameOverCard key="dots-over" v={v} party={party} youId={youId} isHost={isHost} playAgain={playAgain} exitToLobby={exitToLobby} />}
      </AnimatePresence>
      {rulesOpen && <DotsRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
