"use client";

/* Bluff — Indian truck art at night. A midnight-blue body hung with jhalar
   fringe; the claim painted on a signboard ("TWO KINGS"); the pile of
   evil-eyed backs in the middle; a big chilli-red BLUFF! for anyone who
   doesn't believe it; your hand along the bottom, tap to pick, one to four.
   Calls are turned face up for everyone, stamped CAUGHT! or TRUE!. */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PartyMenu } from "@/components/party/PartyMenu";
import { clamp, useBox, useBoxSize } from "@/lib/client/useBox";
import { getMutedServerSnapshot, getMutedSnapshot, primeSound, setMuted, subscribeMuted } from "@/lib/client/synthCore";
import { claimWords, rankLabel, rankName, RANKS } from "@/lib/games/bluff/engine";
import { LASTCALL_MS, MAX_PLAY, TURN_MS, type BluffLogEntry, type BluffMove, type BluffView, type Card } from "@/lib/games/bluff/types";
import type { GameScreenProps } from "@/lib/party/types";
import { CARD_ASPECT, CardBack, CardFace } from "./Card";
import { paint } from "./font";
import { BluffRulesModal, GameOverCard } from "./Overlays";
import { CHILLI, CREAM, enamelOf, GOLD, INK, JHALAR, LEAF, lettering, LINE, MARIGOLD, NIGHT, NIGHT_DEEP, PINK, SURFACE, SWIFT, TEXT, TEXT_2, TEXT_3 } from "./palette";
import { bluffSfx } from "./sfx";

/** How long a call stays turned up on the table. */
const REVEAL_MS = 3600;

function useNowEst(serverNow: number, skew: number) {
  const [n, setN] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setN(Date.now() + skew), 250);
    return () => clearInterval(id);
  }, [skew]);
  return Math.max(n, serverNow);
}

/* a painted lotus-and-dot ground, very faint */
const GROUND =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cg fill='none' stroke='%23f2c14e' stroke-opacity='0.07' stroke-width='1.2'%3E%3Cpath d='M32 18c5 6 5 14 0 20-5-6-5-14 0-20Z'/%3E%3Cpath d='M32 38c-7-1-12-6-13-13 7 1 12 6 13 13Zm0 0c7-1 12-6 13-13-7 1-12 6-13 13Z'/%3E%3C/g%3E%3Ccircle cx='0' cy='0' r='2' fill='%23d81f6c' fill-opacity='0.12'/%3E%3Ccircle cx='64' cy='64' r='2' fill='%23d81f6c' fill-opacity='0.12'/%3E%3C/svg%3E\")";

type Namer = (seat?: number, start?: boolean) => string;

/** One line of table talk from the log. */
function said(e: BluffLogEntry, name: Namer): string {
  const who = name(e.seat, true);
  switch (e.kind) {
    case "lead":
      return `${who} led ${claimWords(e.n ?? 1, e.rank ?? 1)}`;
    case "play":
      return `${who} put down ${claimWords(e.n ?? 1, e.rank ?? 1)}`;
    case "pass":
      return `${who} passed`;
    case "burn":
      return `Everyone passed — ${e.n} card${e.n === 1 ? "" : "s"} set aside`;
    case "call":
      return `${who} called ${name(e.other)} — ${e.honest ? "it was true" : "caught!"}`;
    case "lastcall":
      return `${who} ${who === "You" ? "are" : "is"} out of cards!`;
    case "timeout":
      return `${who} ran out of time`;
    case "left":
      return `${who} left the table`;
    case "win":
      return `${who} ${who === "You" ? "win" : "wins"}`;
  }
}

/** The pile's place on the table: a rangoli in fine gold line, under the cards. */
function Rangoli({ size }: { size: number }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="-100 -100 200 200" width={size} height={size} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden style={{ opacity: 0.28 }}>
      <g fill="none" stroke={GOLD} strokeWidth="1.1">
        <circle r="95" strokeDasharray="1.5 5" strokeLinecap="round" />
        <circle r="86" />
        {petals.map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <path d="M0 -84C11 -72 11 -60 0 -52C-11 -60 -11 -72 0 -84Z" />
            <path d="M0 -78C4 -71 4 -64 0 -58" />
          </g>
        ))}
        <circle r="50" strokeDasharray="1.5 4" strokeLinecap="round" />
      </g>
      {petals.map((a) => (
        <circle key={a} r="2.2" fill={PINK} transform={`rotate(${a + 15}) translate(0 -91)`} />
      ))}
    </svg>
  );
}

/* ---------------- the hand ---------------- */

function Hand({ cards, cw, selected, onToggle, disabled }: { cards: Card[]; cw: number; selected: string[]; onToggle: (id: string) => void; disabled: boolean }) {
  const [ref, box] = useBoxSize();
  const W = box?.w ?? 0;
  const ch = cw * CARD_ASPECT;
  const n = cards.length;
  const lift = Math.round(cw * 0.2);
  // one row while the cards can show enough of themselves, else two
  const fit = (k: number) => (k <= 1 ? cw : Math.min(cw * 0.62, (W - cw) / (k - 1)));
  const rows = n > 1 && fit(n) < cw * 0.3 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const step = fit(perRow);
  const rowGap = ch * 0.42;
  const height = ch + lift + (rows - 1) * rowGap;
  return (
    <div ref={ref} className="relative mx-auto w-full" style={{ height }}>
      {W > 0 &&
        cards.map((c, i) => {
          const row = Math.floor(i / perRow);
          const col = i % perRow;
          const inRow = row === rows - 1 ? n - perRow * (rows - 1) : perRow;
          const left = (W - (cw + step * (inRow - 1))) / 2 + col * step;
          const on = selected.includes(c.id);
          return (
            <motion.button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(c.id)}
              aria-pressed={on}
              className="absolute rounded-[9%] outline-none focus-visible:ring-2 focus-visible:ring-[#f2c14e]"
              style={{ zIndex: row * 100 + col, filter: on ? `drop-shadow(0 0 6px ${MARIGOLD})` : "drop-shadow(0 3px 4px rgba(0,0,0,0.45))" }}
              initial={{ x: left, y: -ch, opacity: 0 }}
              animate={{ x: left, y: lift + row * rowGap - (on ? lift : 0), opacity: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 38 }}
            >
              <CardFace card={c} w={cw} />
            </motion.button>
          );
        })}
    </div>
  );
}

/* ---------------- the pile ---------------- */

function Pile({ v, cw }: { v: BluffView; cw: number }) {
  // a few layers of backs for the body of the pile, the latest play on top
  const ch = cw * CARD_ASPECT;
  const W = cw * 1.9;
  const H = ch * 1.15;
  const x0 = (W - cw) / 2;
  const y0 = (H - ch) / 2;
  const top = v.pile.at(-1);
  const under = Math.max(0, Math.min(8, v.pileCount - (top?.n ?? 0)));
  const jitter = (i: number) => ({ r: ((i * 37) % 13) - 6, x: ((i * 53) % 9) - 4, y: -i * 1.4 });
  return (
    <div className="relative shrink-0" style={{ width: W, height: H }}>
      {Array.from({ length: under }, (_, i) => {
        const j = jitter(i);
        return (
          <div key={`u${i}`} className="absolute" style={{ left: x0, top: y0, transform: `translate(${j.x}px,${j.y}px) rotate(${j.r}deg)` }}>
            <CardBack w={cw} />
          </div>
        );
      })}
      <AnimatePresence>
        {top &&
          Array.from({ length: top.n }, (_, i) => {
            const j = jitter(under + i + top.seq);
            const spread = i - (top.n - 1) / 2;
            return (
              <motion.div
                key={`${top.seq}-${i}`}
                className="absolute"
                style={{ left: x0, top: y0, filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))" }}
                initial={{ x: 0, y: ch * 1.3, rotate: j.r * 3, opacity: 0, scale: 1.15 }}
                animate={{ x: j.x + spread * cw * 0.14, y: j.y - under * 1.4 - i * 2, rotate: j.r + spread * 6, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 380, damping: 28, delay: i * 0.05 }}
              >
                <CardBack w={cw} />
              </motion.div>
            );
          })}
      </AnimatePresence>
      {v.pileCount === 0 && (
        <div className="absolute flex items-center justify-center rounded-[9%] text-center text-[10px] uppercase tracking-[0.16em]" style={{ left: x0, top: y0, width: cw, height: ch, border: `2px dashed ${LINE}`, color: TEXT_3 }}>
          the pile
        </div>
      )}
      {v.pileCount > 0 && (
        <span className={`${paint.className} absolute -right-1 -top-2 z-10 flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[16px] leading-none`} style={{ background: GOLD, color: INK, border: `2px solid ${INK}` }}>
          {v.pileCount}
        </span>
      )}
    </div>
  );
}

/* ---------------- the screen ---------------- */

export function BluffScreen(props: GameScreenProps<BluffView>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;
  const nowEst = useNowEst(v.now, skew);
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rootRef, root] = useBox<HTMLDivElement>("border");

  const me = v.players.find((p) => p.id === youId) ?? null;
  const seated = !spectating && !!me && !me.left;
  const turnP = v.players.find((p) => p.id === v.turn) ?? null;
  const myTurn = seated && v.phase === "play" && v.turn === youId;
  const leading = v.rank === null;
  const last = v.pile.at(-1) ?? null;
  const owner = last ? v.players[last.seat] : null;
  const canCall = seated && !!last && !!owner && owner.id !== youId && !owner.left && (v.phase === "play" || v.phase === "lastcall");
  const isMe = (seat?: number) => seat !== undefined && v.players[seat]?.id === youId;
  const name: Namer = (seat, start = false) => (isMe(seat) ? (start ? "You" : "you") : seat === undefined ? "?" : (v.players[seat]?.name ?? "?"));
  const whose = (seat: number) => (isMe(seat) ? "your" : `${name(seat)}'s`);
  const tallies = party.tallies.bluff ?? {};

  /* --- picking cards ------------------------------------------------------ */

  const [sel, setSel] = useState<string[]>([]);
  const selected = sel.filter((id) => v.hand.some((c) => c.id === id));
  const selCards = v.hand.filter((c) => selected.includes(c.id));
  const toggle = (id: string) => {
    primeSound();
    bluffSfx("pick");
    setSel((s0) => {
      const s = s0.filter((x) => v.hand.some((c) => c.id === x));
      if (s.includes(id)) return s.filter((x) => x !== id);
      return s.length >= MAX_PLAY ? [...s.slice(1), id] : [...s, id];
    });
  };
  // the rank you lead with: chosen, or what you've picked if it's all one rank
  const [lead, setLead] = useState<{ rank: number; at: number } | null>(null);
  const uniform = selCards.length > 0 && selCards.every((c) => c.r === selCards[0].r) ? selCards[0].r : null;
  const leadRank = lead && lead.at === v.plays ? lead.rank : uniform;

  const [busy, setBusy] = useState(false);
  async function act(m: BluffMove) {
    primeSound();
    setBusy(true);
    const ok = await move(m);
    setBusy(false);
    if (ok && m.type === "play") setSel([]);
  }

  /* --- sounds ------------------------------------------------------------- */

  const prev = useRef<BluffView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    if (!p || p.startedAt !== v.startedAt) {
      if (v.plays === 0) bluffSfx("deal");
      return;
    }
    if (v.plays > p.plays) bluffSfx("slap");
    const seen = p.log.at(-1)?.i ?? 0;
    for (const e of v.log) {
      if (e.i <= seen) continue;
      if (e.kind === "pass") bluffSfx("pass");
      if (e.kind === "burn") bluffSfx("burn");
      if (e.kind === "lastcall") window.setTimeout(() => bluffSfx("lastcall"), 150);
      if (e.kind === "call") {
        bluffSfx("horn");
        window.setTimeout(() => bluffSfx(e.honest ? "honest" : "caught"), 520);
        window.setTimeout(() => bluffSfx("take"), 1100);
      }
    }
    if (v.phase === "over" && p.phase !== "over") window.setTimeout(() => bluffSfx(v.winner === youId ? "win" : "lose"), 600);
    const mine = v.phase === "play" && v.turn === youId;
    if (mine && !(p.phase === "play" && p.turn === youId)) {
      bluffSfx("yourTurn");
      try {
        navigator.vibrate?.(25);
      } catch {}
    }
  }, [v, youId]);

  useEffect(() => {
    document.title = myTurn ? "● Your turn — Bluff" : canCall && v.phase === "lastcall" ? "● Last call — Bluff" : "Bluff";
  }, [myTurn, canCall, v.phase]);

  /* --- the last call, turned up -------------------------------------------- */

  const callEntry = [...v.log].reverse().find((e) => e.kind === "call");
  const [dismissed, setDismissed] = useState<number | null>(null);
  const reveal = v.reveal && callEntry && nowEst - callEntry.ts < REVEAL_MS && dismissed !== v.reveal.seq ? v.reveal : null;

  /* --- sizes ---------------------------------------------------------------- */

  const H = root.h || 800;
  const Wd = root.w || 400;
  const handCw = Math.round(clamp(Math.min(Wd / 5.4, H * 0.125), 52, 96));
  const pileCw = Math.round(clamp(Math.min(Wd / 4.8, H * 0.13), 52, 112));
  const revealCw = Math.round(clamp(Math.min((Wd - 48) / 4.6, H * 0.13), 54, 96));

  const limit = v.phase === "lastcall" ? LASTCALL_MS : TURN_MS;
  const left = v.deadline ? Math.max(0, v.deadline - nowEst) : 0;
  const frac = Math.min(1, left / limit);
  const accent = turnP ? enamelOf(turnP.seat) : MARIGOLD;

  // opponents, in turn order from your left
  const others = me ? [...v.players.slice(me.seat + 1), ...v.players.slice(0, me.seat)] : v.players;
  const latest = v.log.filter((e) => e.kind !== "win").slice(-1)[0];

  let banner = "";
  if (v.phase === "play") {
    if (myTurn) banner = leading ? "Your lead — pick 1 to 4 cards and name a rank" : `Your turn — put down ${rankName(v.rank!)}s, or pass`;
    else if (seated && me!.passed) banner = "You passed this round — you can still call bluff";
    else if (turnP) banner = `${turnP.name} is ${leading ? "leading a new round" : "deciding"}…`;
  } else if (v.phase === "lastcall" && turnP) banner = turnP.id === youId ? "Out of cards! Will they believe you?" : `${turnP.name} is out of cards — call it or let it go`;

  const toolbarBtn = "flex h-9 items-center rounded-lg px-2.5 text-[12px] transition-colors hover:bg-white/5 sm:px-3";
  const claimN = last?.n ?? 0;
  const claimed = v.pileCount;

  return (
    <div
      ref={rootRef}
      className="relative flex h-dvh flex-col overflow-hidden"
      style={{ background: `${GROUND}, radial-gradient(80% 60% at 50% 40%, #16306a 0%, ${NIGHT} 55%, ${NIGHT_DEEP} 100%)`, color: TEXT }}
      onPointerDown={primeSound}
    >
      {/* toolbar */}
      <header className="relative z-[55] flex h-14 shrink-0 items-center justify-between gap-3 px-3 sm:h-16 sm:px-5">
        <div className="min-w-0">
          <h1 className={`${paint.className} truncate text-[26px] leading-none sm:text-[32px]`} style={{ color: MARIGOLD, textShadow: lettering(2) }}>
            Bluff!
          </h1>
          <div className="mt-1 truncate text-[11px]" style={{ color: TEXT_3 }}>
            {spectating ? "Watching · " : ""}
            {v.pileCount} in the pile · {v.burned} set aside
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"} className={toolbarBtn} style={{ border: `1px solid ${LINE}`, color: muted ? TEXT_3 : TEXT_2 }}>
            <span className="hidden sm:inline">{muted ? "Sound off" : "Sound on"}</span>
            <span className={`text-[14px] sm:hidden ${muted ? "line-through" : ""}`} aria-hidden>
              ♪
            </span>
          </button>
          <button type="button" onClick={() => setRulesOpen(true)} className={`${toolbarBtn} font-medium`} style={{ border: `1px solid ${LINE}`, color: TEXT_2 }}>
            Rules
          </button>
          <PartyMenu style={{ height: 36, borderRadius: 8, color: TEXT_2, borderColor: LINE }} />
        </div>
      </header>
      <div className="h-[9px] shrink-0" style={{ background: JHALAR }} aria-hidden />

      {/* the table */}
      <div className="flex shrink-0 flex-wrap justify-center gap-1.5 px-3 pt-2 sm:gap-2">
        {others.map((p) => {
          const c = enamelOf(p.seat);
          const on = (v.phase === "play" || v.phase === "lastcall") && v.turn === p.id;
          return (
            <div
              key={p.id}
              className="relative flex items-center gap-2 overflow-hidden rounded-xl px-2.5 py-1 sm:px-3 sm:py-1.5"
              style={{ background: on ? `${c}2e` : SURFACE, border: `1.5px solid ${on ? c : LINE}`, opacity: p.left ? 0.4 : 1, transition: "background 200ms, border-color 200ms" }}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c, boxShadow: `0 0 0 1.5px ${INK}` }} />
              <span className={`max-w-[92px] truncate text-[13px] font-semibold sm:max-w-[130px] ${p.left ? "line-through" : ""}`}>{p.name}</span>
              <span className="flex items-center gap-1 text-[13px] tabular-nums" style={{ color: TEXT_2 }}>
                <span className="block overflow-hidden rounded-[2px]" style={{ width: 10, height: 14 }}>
                  <CardBack w={10} />
                </span>
                {p.count}
              </span>
              {p.passed && (
                <span className={`${paint.className} rounded px-1.5 text-[11px] leading-[18px]`} style={{ background: SURFACE, color: TEXT_3, border: `1px solid ${LINE}` }}>
                  pass
                </span>
              )}
              {(tallies[p.id] ?? 0) > 0 && (
                <span className="text-[10px]" style={{ color: TEXT_3 }}>
                  ★{tallies[p.id]}
                </span>
              )}
              {on && <span className="absolute bottom-0 left-0 h-[2px]" style={{ width: `${frac * 100}%`, background: frac < 0.25 ? CHILLI : c, transition: "width 250ms linear" }} />}
            </div>
          );
        })}
      </div>

      {/* the middle: the claim, the pile, the call */}
      <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 py-2">
        {/* the signboard */}
        <div className="relative z-10 flex min-h-[64px] flex-col items-center justify-end text-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={last ? `p${last.seq}` : `lead${v.plays}-${v.turn}`} initial={{ opacity: 0, y: 8, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: SWIFT }}>
              {last && owner ? (
                <>
                  <div className="text-[12px] uppercase tracking-[0.18em]" style={{ color: TEXT_3 }}>
                    {owner.id === youId ? "You said" : `${owner.name} says`}
                  </div>
                  <div className={`${paint.className} text-[30px] leading-[1.05] sm:text-[40px]`} style={{ color: enamelOf(owner.seat), textShadow: lettering(3) }}>
                    {claimWords(claimN, v.rank!).toUpperCase()}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[12px] uppercase tracking-[0.18em]" style={{ color: TEXT_3 }}>
                    New round
                  </div>
                  <div className={`${paint.className} text-[26px] leading-[1.05] sm:text-[34px]`} style={{ color: accent, textShadow: lettering(3) }}>
                    {v.phase === "over" ? "Game over" : myTurn ? "Your lead" : `${turnP?.name ?? "—"} leads`}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
          {last && v.rank !== null && (
            <div className="mt-1 text-[12px]" style={{ color: claimed > 4 ? MARIGOLD : TEXT_3 }}>
              {claimed} {rankName(v.rank)}
              {claimed === 1 ? "" : "s"} claimed this round{claimed > 4 ? " — the pack only has four" : ""}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 sm:gap-8">
          {/* set aside */}
          <div className="flex w-[68px] flex-col items-center gap-1 sm:w-[84px]" style={{ opacity: v.burned ? 0.75 : 0 }} title="Cards set aside when everyone passed" aria-hidden={!v.burned}>
            <div className="relative" style={{ width: pileCw * 0.62, height: pileCw * 0.62 * CARD_ASPECT, filter: "grayscale(0.6) brightness(0.6)" }}>
              <div className="absolute inset-0 rotate-[-8deg]">
                <CardBack w={pileCw * 0.62} />
              </div>
            </div>
            <div className="text-center text-[10px] leading-tight" style={{ color: TEXT_3 }}>
              {v.burned} set aside
            </div>
          </div>

          <div className="relative">
            <Rangoli size={pileCw * 2.6} />
            <Pile v={v} cw={pileCw} />
          </div>

          {/* the call */}
          <div className="flex w-[68px] justify-center sm:w-[84px]">
            <AnimatePresence>
              {canCall && v.phase === "play" && (
                <motion.button
                  type="button"
                  disabled={busy}
                  onClick={() => last && act({ type: "call", at: last.seq })}
                  initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
                  animate={{ scale: 1, opacity: 1, rotate: -6 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  whileHover={{ scale: 1.06, rotate: -3 }}
                  whileTap={{ scale: 0.92 }}
                  className={`${paint.className} rounded-xl px-3 py-2 text-[22px] leading-none sm:px-4 sm:py-3 sm:text-[30px]`}
                  style={{ background: CHILLI, color: CREAM, border: `3px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}, inset 0 0 0 2px ${GOLD}`, textShadow: lettering(2) }}
                  aria-label={`Call bluff on ${owner?.name}`}
                >
                  Bluff!
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* table talk */}
        <div className="h-[18px] max-w-full truncate text-center text-[12px]" style={{ color: TEXT_3 }}>
          {latest ? said(latest, name) : ""}
          {last?.cards && v.phase === "play" ? ` · you put down ${last.cards.map((c) => rankLabel(c.r)).join(" ")}` : ""}
        </div>

        {/* last call */}
        <AnimatePresence>
          {v.phase === "lastcall" && turnP && (
            <motion.div key="lastcall" className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-3" exit={{ opacity: 0 }}>
              <motion.div
                className="pointer-events-auto w-full max-w-md rounded-2xl px-5 py-4 text-center"
                style={{ background: CREAM, color: INK, border: `3px solid ${INK}`, boxShadow: `6px 6px 0 ${INK}, inset 0 0 0 3px ${PINK}` }}
                initial={{ opacity: 0, scale: 0.85, rotate: -3 }}
                animate={{ opacity: 1, scale: 1, rotate: -1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <div className="text-[12px] uppercase tracking-[0.18em]" style={{ color: PINK }}>
                  Last call
                </div>
                <div className={`${paint.className} mt-1 text-[26px] leading-tight`}>{turnP.id === youId ? "You're out of cards!" : `${turnP.name} is out of cards!`}</div>
                <div className="mt-1 text-[14px]" style={{ color: "rgba(27,18,51,0.7)" }}>
                  {turnP.id === youId ? "Your" : "Their"} last play: {claimWords(claimN, v.rank ?? 1)}. {turnP.id === youId ? "If nobody calls it, you win." : "Believe it and they win."}
                </div>
                <div className="mx-auto mt-3 h-[4px] w-48 overflow-hidden rounded-full" style={{ background: "rgba(27,18,51,0.12)" }}>
                  <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: PINK, transition: "width 250ms linear" }} />
                </div>
                {canCall ? (
                  <div className="mt-4 flex justify-center gap-2">
                    <button type="button" disabled={busy} onClick={() => last && act({ type: "call", at: last.seq })} className={`${paint.className} rounded-xl px-5 py-2 text-[22px]`} style={{ background: CHILLI, color: CREAM, border: `2.5px solid ${INK}`, boxShadow: `3px 3px 0 ${INK}`, textShadow: lettering(2) }}>
                      Bluff!
                    </button>
                    <button type="button" disabled={busy || v.believed.includes(youId)} onClick={() => act({ type: "believe" })} className="rounded-xl px-4 py-2 text-[15px] font-semibold disabled:opacity-50" style={{ color: INK, border: `2px solid ${INK}` }}>
                      {v.believed.includes(youId) ? "Let go ✓" : "Let it go"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 text-[13px]" style={{ color: "rgba(27,18,51,0.6)" }}>
                    {v.believed.length} of {v.players.filter((p) => !p.left && p.id !== turnP.id).length} have let it go
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* a call, turned face up */}
        <AnimatePresence>
          {reveal && (
            <motion.button
              type="button"
              key={`reveal${reveal.seq}`}
              onClick={() => setDismissed(reveal.seq)}
              className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 px-3"
              style={{ background: "rgba(8,20,48,0.72)", backdropFilter: "blur(2px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-label="Dismiss"
            >
              <div className="text-center text-[13px]" style={{ color: TEXT_2 }}>
                {name(reveal.by, true)} called {whose(reveal.of)} {claimWords(reveal.cards.length, reveal.rank)}
              </div>
              <div className="relative flex gap-2">
                {reveal.cards.map((c, i) => (
                  <motion.div key={c.id} initial={{ rotateY: 90, y: 20 }} animate={{ rotateY: 0, y: 0 }} transition={{ delay: 0.15 + i * 0.12, duration: 0.3, ease: SWIFT }}>
                    <div style={{ outline: c.r === reveal.rank ? "none" : `3px solid ${CHILLI}`, borderRadius: "9%" }}>
                      <CardFace card={c} w={revealCw} />
                    </div>
                  </motion.div>
                ))}
                <motion.div
                  className={`${paint.className} pointer-events-none absolute left-1/2 top-1/2 whitespace-nowrap rounded-lg px-3 py-1 text-[34px] leading-none sm:text-[46px]`}
                  style={{ color: CREAM, background: reveal.honest ? LEAF : CHILLI, border: `3px solid ${INK}`, textShadow: lettering(2), boxShadow: `4px 4px 0 ${INK}` }}
                  initial={{ x: "-50%", y: "-50%", scale: 2.2, rotate: -14, opacity: 0 }}
                  animate={{ x: "-50%", y: "-50%", scale: 1, rotate: -8, opacity: 1 }}
                  transition={{ delay: 0.55 + reveal.cards.length * 0.1, type: "spring", stiffness: 420, damping: 18 }}
                >
                  {reveal.honest ? "TRUE!" : "CAUGHT!"}
                </motion.div>
              </div>
              <div className={`${paint.className} text-center text-[20px] sm:text-[24px]`} style={{ color: enamelOf(reveal.taker) }}>
                {name(reveal.taker, true)} {isMe(reveal.taker) ? "take" : "takes"} {reveal.n} card{reveal.n === 1 ? "" : "s"}
              </div>
            </motion.button>
          )}
        </AnimatePresence>
      </main>

      {/* you */}
      <section className="relative shrink-0 px-2 pb-2 sm:px-4 sm:pb-3">
        <div className="flex h-[24px] items-center justify-center gap-2 px-2 text-center">
          {seated && me && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: enamelOf(me.seat), boxShadow: `0 0 0 1.5px ${INK}` }} />}
          <span className={`${paint.className} truncate text-[15px] sm:text-[17px]`} style={{ color: myTurn ? MARIGOLD : TEXT_2 }}>
            {spectating ? "Watching — you're in the next game" : banner}
          </span>
          {myTurn && <span className="shrink-0 text-[11px] tabular-nums" style={{ color: frac < 0.25 ? CHILLI : TEXT_3 }}>{Math.ceil(left / 1000)}s</span>}
        </div>

        {/* what you can do */}
        <div className="flex min-h-[44px] flex-col items-center justify-center gap-1.5 py-1">
          {myTurn && leading && (
            <div className="flex max-w-full flex-wrap justify-center gap-1" role="radiogroup" aria-label="Rank to name">
              {RANKS.map((r) => {
                const on = leadRank === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={rankName(r)}
                    onClick={() => setLead({ rank: r, at: v.plays })}
                    className={`${paint.className} h-8 w-[26px] rounded-md text-[15px] leading-none sm:w-8`}
                    style={{ background: on ? MARIGOLD : SURFACE, color: on ? INK : TEXT_2, border: `1.5px solid ${on ? INK : LINE}` }}
                  >
                    {rankLabel(r)}
                  </button>
                );
              })}
            </div>
          )}
          {myTurn && (
            <div className="flex items-center gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                disabled={busy || selected.length === 0 || (leading && leadRank === null)}
                onClick={() => act({ type: "play", cards: selected, rank: leading ? leadRank! : undefined })}
                className={`${paint.className} rounded-xl px-4 py-2 text-[17px] leading-none disabled:opacity-40 sm:px-5 sm:text-[19px]`}
                style={{ background: MARIGOLD, color: INK, border: `2.5px solid ${INK}`, boxShadow: `3px 3px 0 ${INK}` }}
              >
                {selected.length === 0
                  ? "Pick your cards"
                  : leading && leadRank === null
                    ? "Name a rank"
                    : `Say “${claimWords(selected.length, (leading ? leadRank : v.rank)!)}”`}
              </motion.button>
              {!leading && (
                <button type="button" disabled={busy} onClick={() => act({ type: "pass" })} className="rounded-xl px-4 py-2 text-[14px] font-semibold disabled:opacity-40" style={{ color: TEXT, border: `1.5px solid ${LINE}`, background: SURFACE }}>
                  Pass
                </button>
              )}
            </div>
          )}
        </div>

        {seated && <Hand cards={v.hand} cw={handCw} selected={selected} onToggle={toggle} disabled={busy} />}
      </section>

      <AnimatePresence>
        {v.phase === "over" && <GameOverCard key="bluff-over" v={v} party={party} youId={youId} isHost={isHost} playAgain={playAgain} exitToLobby={exitToLobby} />}
      </AnimatePresence>
      {rulesOpen && <BluffRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
