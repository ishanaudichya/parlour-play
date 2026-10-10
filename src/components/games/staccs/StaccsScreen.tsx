"use client";

/* STACCS — the table. The STACC sits in the middle on a cobalt table; the
   other players ride along the top; your hand lies in a dock at the bottom
   with exactly the actions that make sense right now. Pick a card and its
   legal spots glow on the table; hover one to see which surfaces it would
   match; click to lay it. A wild pauses on its spot while you choose the new
   direction (only open ones are offered) and the suit to call. */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { getMutedServerSnapshot, getMutedSnapshot, primeSound, setMuted, subscribeMuted } from "@/lib/client/synthCore";
import { boundsFor, legalSpots, openRotations, type V } from "@/lib/games/staccs";
import { TURN_MS, type Card, type StaccsLogEntry, type StaccsMove, type StaccsView, type Suit } from "@/lib/games/staccs/types";
import type { GameScreenProps } from "@/lib/party/types";
import { Board, type Ghost } from "./Board";
import { CubeChip, Pip } from "./Cube";
import { pixel, pixelSans } from "./font";
import { GameOverCard, StaccsRulesModal } from "./Overlays";
import { CYAN, DANGER, GOLD, LINE, PAGE, SEAT_COLORS, SUIT_COLOR, SUIT_NAME, SURFACE, SWIFT, TEXT, TEXT_2, TEXT_3 } from "./palette";
import { staccsSfx } from "./sfx";

const SUITS: Suit[] = ["S", "H", "C", "D"];
const RANK_ORDER = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A", "W"];
const ARROWS = ["↑", "↗", "↘", "↓", "↙", "↖"];

function useNowEst(serverNow: number, skew: number) {
  const [n, setN] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setN(Date.now() + skew), 250);
    return () => clearInterval(id);
  }, [skew]);
  return Math.max(n, serverNow);
}

const rankName = (c: Card) => (c.rank === "W" ? "Wild" : c.rank === "J" ? "Jack" : c.rank === "Q" ? "Queen" : c.rank === "K" ? "King" : c.rank === "A" ? "Ace" : String(c.rank));
const cardName = (c: Card) => (c.rank === "W" ? "a Wild" : `the ${rankName(c)} of ${SUIT_NAME[c.suit]}`);

function logLine(l: StaccsLogEntry): string {
  switch (l.kind) {
    case "start":
      return `The STACC starts on ${l.card ? cardName(l.card) : "a card"} — ${l.actor} goes first`;
    case "play":
      return `${l.actor} stacks ${l.card ? cardName(l.card) : "a card"}`;
    case "draw":
      return `${l.actor} draws`;
    case "take":
      return `${l.actor} takes ${l.n} card${l.n === 1 ? "" : "s"}`;
    case "give":
      return `${l.actor} hands ${l.target} ${l.n} card${l.n === 1 ? "" : "s"}`;
    case "attack":
      return `ATTACC! ${l.target} must draw ${l.n} — or counter`;
    case "counter":
      return l.card?.rank === "Q" ? `${l.actor} counters the Queen — ${l.n} cards to give` : `${l.actor} counters! Now it's draw ${l.n}`;
    case "zero":
      return l.n ? `${l.actor}'s zero blocks the top and reverses play` : `${l.actor}'s zero blocks the top`;
    case "ace":
      return `${l.actor} plays an Ace — another turn`;
    case "wild":
      return `${l.actor} turns the STACC and calls ${l.suit ? SUIT_NAME[l.suit] : "a suit"}`;
    case "uhoh":
      return `${l.actor}: “UH OH!”`;
    case "catch":
      return `${l.actor} catches ${l.target} — draw ${l.n}`;
    case "pass":
      return `${l.actor} can't play and the pile is empty`;
    case "timeout":
      return `${l.actor} ran out of time`;
    case "left":
      return `${l.actor} left — their cards go under the pile`;
    case "win":
      return `${l.actor} wins!`;
    case "stalemate":
      return "Nobody can move — it's a tie";
    default:
      return "";
  }
}

function sortHand(h: Card[]) {
  return [...h].sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank) || "SHCD".indexOf(a.suit) - "SHCD".indexOf(b.suit));
}

/* ---------------- bits ---------------- */

function Btn({ children, onClick, tone = "plain", disabled, pulse, style }: { children: React.ReactNode; onClick: () => void; tone?: "plain" | "go" | "warn" | "gold"; disabled?: boolean; pulse?: boolean; style?: CSSProperties }) {
  const bg = tone === "go" ? CYAN : tone === "warn" ? DANGER : tone === "gold" ? GOLD : "rgba(255,255,255,0.08)";
  const fg = tone === "plain" ? TEXT : "#071233";
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      animate={pulse ? { scale: [1, 1.06, 1] } : undefined}
      transition={pulse ? { duration: 1.1, repeat: Infinity } : undefined}
      className={`${pixelSans.className} h-10 shrink-0 rounded-xl px-4 text-[14px] font-semibold transition-colors disabled:opacity-35`}
      style={{ background: bg, color: fg, border: tone === "plain" ? `1px solid ${LINE}` : "none", ...style }}
    >
      {children}
    </motion.button>
  );
}

function Opponent({ p, seatColor, active, onCatch, canCatch }: { p: StaccsView["players"][number]; seatColor: string; active: boolean; onCatch: () => void; canCatch: boolean }) {
  return (
    <motion.div
      layout
      className="relative flex min-w-[132px] shrink-0 items-center gap-2.5 rounded-2xl px-3 py-2"
      style={{ background: SURFACE, border: `1px solid ${active ? seatColor : LINE}`, boxShadow: active ? `0 0 0 3px ${seatColor}33` : undefined, opacity: p.left ? 0.4 : 1 }}
    >
      <span className={`${pixel.className} flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px]`} style={{ background: seatColor, color: "#071233" }}>
        {p.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold" style={{ color: TEXT }}>
          {p.name}
        </div>
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: TEXT_3 }}>
          <CubeChip card="back" size={18} />
          <span className={`${pixel.className} tabular-nums`} style={{ color: TEXT_2 }}>
            {p.left ? "left" : `× ${p.count}`}
          </span>
        </div>
      </div>
      {p.count === 1 && p.called && (
        <span className={`${pixel.className} absolute -top-2 right-2 rounded-md px-1.5 py-0.5 text-[9px]`} style={{ background: GOLD, color: "#071233" }}>
          UH OH
        </span>
      )}
      {canCatch && (
        <motion.button type="button" onClick={onCatch} initial={{ scale: 0 }} animate={{ scale: 1 }} className={`${pixel.className} absolute -bottom-2.5 right-2 rounded-md px-2 py-0.5 text-[10px]`} style={{ background: DANGER, color: "#fff" }}>
          CATCH!
        </motion.button>
      )}
    </motion.div>
  );
}

/* ==================== screen ==================== */

export function StaccsScreen(props: GameScreenProps<StaccsView>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;
  const nowEst = useNowEst(v.now, skew);
  const stageRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const [rulesOpen, setRulesOpen] = useState(false);

  const me = v.players.find((p) => p.id === youId) ?? null;
  const myTurn = !spectating && !!me && !me.left && v.turn === youId && v.phase !== "over";
  const turnPlayer = v.players.find((p) => p.id === v.turn) ?? null;
  const bounds = boundsFor(v.decks);
  const hand = useMemo(() => sortHand(v.hand), [v.hand]);
  const seatColor = (seat: number) => SEAT_COLORS[seat % SEAT_COLORS.length];

  /* --- selection ------------------------------------------------------- */

  const turnKey = `${v.startedAt}:${v.seq}:${v.turn}:${v.phase}:${v.hand.length}`;
  const [sel, setSel] = useState<{ key: string; id: string | null; hover: string | null; wild: { v: V; rot: number; called: Suit | null } | null; give: string[]; declare: boolean }>({ key: "", id: null, hover: null, wild: null, give: [], declare: false });
  // a new beat clears whatever was half-chosen (render-phase reset)
  if (sel.key !== turnKey) setSel({ key: turnKey, id: null, hover: null, wild: null, give: [], declare: sel.declare && hand.length === 2 && myTurn });

  // legal spots for every card in hand, once per beat
  const spotsById = useMemo(() => {
    const out = new Map<string, Ghost[]>();
    if (!myTurn || v.phase !== "play") return out;
    for (const c of hand) {
      if (c.rank === "W" && hand.length === 1) continue;
      if (v.combo !== null && c.rank !== v.combo) continue;
      let spots = legalSpots(v.board, c, bounds, v.lockFrom, v.blockedTop);
      if (c.rank === "W") spots = spots.filter((s) => openRotations(v.board, s.v, v.dir, bounds).length > 0);
      if (spots.length) out.set(c.id, spots);
    }
    return out;
  }, [myTurn, v.phase, v.board, v.lockFrom, v.blockedTop, v.combo, v.dir, hand, bounds]);

  const held = sel.id ? hand.find((c) => c.id === sel.id) ?? null : null;
  const ghosts = held ? spotsById.get(held.id) ?? [] : [];

  const choose = (c: Card) => {
    if (v.phase === "give" && myTurn) {
      staccsSfx("select");
      setSel((s) => ({ ...s, give: s.give.includes(c.id) ? s.give.filter((x) => x !== c.id) : s.give.length < v.give ? [...s.give, c.id] : [...s.give.slice(1), c.id] }));
      return;
    }
    if (!spotsById.has(c.id)) return staccsSfx("nope");
    staccsSfx("select");
    setSel((s) => ({ ...s, id: s.id === c.id ? null : c.id, wild: null, hover: null }));
  };

  const send = (m: StaccsMove) => move(m);

  const pickSpot = (g: Ghost) => {
    if (!held) return;
    if (held.rank === "W") {
      const rots = openRotations(v.board, g.v, v.dir, bounds);
      setSel((s) => ({ ...s, hover: null, wild: { v: g.v, rot: rots[0], called: null } }));
      return;
    }
    staccsSfx("place");
    send({ type: "play", place: { cardId: held.id, v: g.v }, declare: sel.declare && hand.length === 2 });
  };

  const placeWild = () => {
    if (!held || !sel.wild || !sel.wild.called) return;
    send({ type: "play", place: { cardId: held.id, v: sel.wild.v, rot: sel.wild.rot, called: sel.wild.called }, declare: sel.declare && hand.length === 2 });
  };

  const wildRots = sel.wild ? openRotations(v.board, sel.wild.v, v.dir, bounds) : [];

  /* --- sounds ---------------------------------------------------------- */

  const prev = useRef<StaccsView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    if (!p || p.startedAt !== v.startedAt) return;
    const last = p.log.length ? p.log[p.log.length - 1].i : 0;
    for (const l of v.log.filter((x) => x.i > last)) {
      if (l.kind === "play") staccsSfx("place");
      if (l.kind === "attack" || l.kind === "counter") staccsSfx("attack");
      if (l.kind === "wild") staccsSfx("wild");
      if (l.kind === "ace") staccsSfx("ace");
      if (l.kind === "zero") staccsSfx("zero");
      if (l.kind === "draw" || l.kind === "take") staccsSfx("draw");
      if (l.kind === "give") staccsSfx("give");
      if (l.kind === "uhoh") staccsSfx("uhoh");
      if (l.kind === "catch") staccsSfx("catch");
      if (l.kind === "win") staccsSfx(v.winner === youId ? "win" : "lose");
    }
    if (v.turn === youId && p.turn !== youId && v.phase !== "over") {
      staccsSfx("yourTurn");
      try {
        navigator.vibrate?.(30);
      } catch {}
    }
  }, [v, youId]);

  useEffect(() => {
    document.title = myTurn ? "● Your turn — STACCS" : "STACCS";
  }, [myTurn]);

  // the board takes exactly the room between the players and the dock
  const aspect = (boundsFor(v.decks).x * 2 + 1) / (boundsFor(v.decks).bottom - boundsFor(v.decks).top + 1);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight;
      const bw = Math.max(0, Math.min(w, h * aspect));
      setStage({ w: Math.round(bw), h: Math.round(bw / aspect) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  /* --- the prompt ------------------------------------------------------ */

  const next = (() => {
    if (!me) return null;
    const live = v.players.filter((p) => !p.left);
    const i = live.findIndex((p) => p.id === youId);
    return live[(i + v.order + live.length) % live.length] ?? null;
  })();

  let prompt: string;
  if (v.phase === "over") prompt = "";
  else if (!myTurn) prompt = turnPlayer ? `${turnPlayer.name}'s turn` : "";
  else if (v.phase === "give") prompt = `Queen! Pick ${v.give} card${v.give === 1 ? "" : "s"} to hand ${next?.name ?? "on"}`;
  else if (sel.wild) prompt = sel.wild.called ? "Place the wild" : "Turn the STACC, then call a suit";
  else if (v.pending) prompt = `${v.pending.rank === "K" ? "King" : "Jack"}! Draw ${v.pending.n} — or counter with a ${v.pending.rank === "K" ? "King" : "Jack"}`;
  else if (v.queenChain > 0) prompt = `A Queen came your way — counter with a Queen to pass ${v.queenChain + 1}`;
  else if (v.combo !== null) prompt = `Lay more ${v.combo}s, or finish your turn`;
  else if (held) prompt = ghosts.length ? `Choose a glowing spot for ${cardName(held)}` : "No spot for that one";
  else if (spotsById.size) prompt = "Your turn — pick a card to stack";
  else prompt = "Nothing fits — draw a card";

  const left = v.deadline ? Math.max(0, v.deadline - nowEst) : 0;
  const frac = Math.min(1, left / TURN_MS);
  const lastLog = v.log.length ? v.log[v.log.length - 1] : null;
  const opponents = v.players.filter((p) => p.id !== youId);
  // the called suit matters only while the wild's own top is the open target
  const wildOnTop = v.lockFrom === v.board.length - 1 && v.board[v.lockFrom]?.card.rank === "W" ? v.board[v.lockFrom].called : null;

  return (
    <div
      className="relative flex h-[100dvh] flex-col overflow-hidden"
      style={{
        background: `radial-gradient(90% 60% at 50% 0%, #1d3a9a 0%, ${PAGE} 65%)`,
        color: TEXT,
        ["--staccs-pixel" as string]: pixel.style.fontFamily,
      }}
      onPointerDown={primeSound}
    >
      {/* header */}
      <header className="flex items-center justify-between gap-3 px-3 pt-3 sm:px-5">
        <div className="min-w-0">
          <h1 className={`${pixel.className} text-[22px] leading-none tracking-[0.04em] sm:text-[26px]`} style={{ color: TEXT, textShadow: "0 3px 0 #0a1f6b" }}>
            STACCS
          </h1>
          <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: TEXT_3 }}>
            <span>{v.decks === 2 ? "Party · two decks" : "UH OH!"}</span>
            <span>·</span>
            <span>{v.order === 1 ? "↻ clockwise" : "↺ reversed"}</span>
            <span>·</span>
            <span>{v.board.length} stacked</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"} className="h-9 rounded-xl px-3 text-[13px]" style={{ border: `1px solid ${LINE}`, color: muted ? TEXT_3 : TEXT_2 }}>
            {muted ? "Sound off" : "Sound on"}
          </button>
          <button type="button" onClick={() => setRulesOpen(true)} className="h-9 rounded-xl px-3 text-[13px] font-medium" style={{ border: `1px solid ${LINE}`, color: TEXT_2 }}>
            Rules
          </button>
        </div>
      </header>

      {/* the others */}
      <div className="mt-3 flex gap-2 overflow-x-auto px-3 pb-3 sm:justify-center sm:px-5">
        {opponents.map((p) => (
          <Opponent key={p.id} p={p} seatColor={seatColor(p.seat)} active={v.turn === p.id && v.phase !== "over"} canCatch={!spectating && !!me && !me.left && p.catchable} onCatch={() => send({ type: "catch", target: p.id })} />
        ))}
      </div>

      {/* the table */}
      <main ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-4">
        <div className="relative" style={{ width: stage.w, height: stage.h }}>
          <Board
            board={v.board}
            bounds={bounds}
            lockFrom={v.lockFrom}
            blockedTop={myTurn ? v.blockedTop : null}
            lastSeq={v.lastPlay?.seq ?? 0}
            lastIdx={v.lastPlay?.idx ?? null}
            ghosts={sel.wild ? [] : ghosts}
            hover={sel.hover}
            onHover={(k) => setSel((s) => (s.hover === k ? s : { ...s, hover: k }))}
            onPick={pickSpot}
            holding={held}
            holdingRot={v.dir}
            wildPreview={sel.wild}
          />

          {/* floating status */}
          <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1.5 sm:left-3 sm:top-3">
            {wildOnTop && (
              <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(7,18,51,0.6)", color: TEXT_2 }}>
                <svg viewBox="0 0 1 1" width={12} height={12} aria-hidden>
                  <Pip suit={wildOnTop} x={0} y={0} w={1} color={wildOnTop === "H" || wildOnTop === "D" ? "#ff8a96" : "#ffffff"} />
                </svg>
                Wild called {SUIT_NAME[wildOnTop]}
              </div>
            )}
          </div>
          <div className="absolute right-2 top-2 sm:right-3 sm:top-3">
            <button
              type="button"
              disabled={!myTurn || v.phase !== "play" || v.combo !== null}
              onClick={() => send({ type: "draw" })}
              className="group flex flex-col items-center rounded-2xl px-2 py-1.5 transition-colors enabled:hover:bg-white/10 disabled:cursor-default"
              aria-label="Draw a card"
            >
              <span className="relative">
                <span className="absolute left-[4px] top-[6px] opacity-50">
                  <CubeChip card="back" size={48} />
                </span>
                <span className="absolute left-[2px] top-[3px] opacity-75">
                  <CubeChip card="back" size={48} />
                </span>
                <CubeChip card="back" size={48} />
              </span>
              <span className={`${pixel.className} mt-1.5 text-[10px]`} style={{ color: TEXT_2 }}>
                Draw · {v.drawCount}
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* the dock */}
      <div className="relative z-20 shrink-0" style={{ background: "linear-gradient(180deg, transparent, rgba(6,14,44,0.92) 30%)" }}>
        <div className="mx-auto max-w-5xl px-3 pb-4 pt-4 sm:px-5">
          {/* prompt + clock */}
          <div className="flex items-center justify-between gap-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={prompt} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: SWIFT }} className={`${pixelSans.className} min-w-0 truncate text-[15px] font-semibold sm:text-[16px]`} style={{ color: myTurn ? CYAN : TEXT_2 }}>
                {prompt}
              </motion.div>
            </AnimatePresence>
            {lastLog && (
              <div className="hidden truncate text-[12px] md:block" style={{ color: TEXT_3 }}>
                {logLine(lastLog)}
              </div>
            )}
          </div>
          {v.phase !== "over" && (
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: frac < 0.25 ? DANGER : myTurn ? CYAN : "rgba(255,255,255,0.35)", transition: "width 250ms linear" }} />
            </div>
          )}

          {/* wild controls */}
          <AnimatePresence>
            {sel.wild && myTurn && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="mr-1 text-[11px] uppercase tracking-[0.14em]" style={{ color: TEXT_3 }}>
                      Direction
                    </span>
                    {ARROWS.map((a, r) => {
                      const ok = wildRots.includes(r);
                      const on = sel.wild!.rot === r;
                      return (
                        <button key={r} type="button" disabled={!ok} onClick={() => setSel((s) => ({ ...s, wild: s.wild && { ...s.wild, rot: r } }))} className="h-9 w-9 rounded-lg text-[16px] font-bold disabled:opacity-20" style={{ background: on ? CYAN : "rgba(255,255,255,0.08)", color: on ? "#071233" : TEXT }} aria-label={`Face ${a}`}>
                          {a}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="mr-1 text-[11px] uppercase tracking-[0.14em]" style={{ color: TEXT_3 }}>
                      Call
                    </span>
                    {SUITS.map((s) => {
                      const on = sel.wild!.called === s;
                      return (
                        <button key={s} type="button" onClick={() => setSel((x) => ({ ...x, wild: x.wild && { ...x.wild, called: s } }))} className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: on ? "#ffffff" : "rgba(255,255,255,0.08)", boxShadow: on ? `0 0 0 2px ${CYAN}` : undefined }} aria-label={SUIT_NAME[s]}>
                          <svg viewBox="0 0 1 1" width={18} height={18} aria-hidden>
                            <Pip suit={s} x={0} y={0} w={1} color={on ? SUIT_COLOR[s] : s === "H" || s === "D" ? "#ff8a96" : "#ffffff"} />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                  <div className="ml-auto flex gap-2">
                    <Btn onClick={() => setSel((s) => ({ ...s, wild: null }))}>Back</Btn>
                    <Btn tone="go" disabled={!sel.wild.called} onClick={placeWild}>
                      Place wild
                    </Btn>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* hand + actions */}
          <div className="mt-3 flex items-end gap-3">
            <div className="min-w-0 flex-1 overflow-x-auto pb-1 pt-5">
              <div className="flex w-max gap-1.5 px-1 sm:gap-2">
                <AnimatePresence initial={false}>
                  {hand.map((c) => {
                    const can = spotsById.has(c.id);
                    const giving = v.phase === "give" && myTurn;
                    const picked = giving ? sel.give.includes(c.id) : sel.id === c.id;
                    const dim = myTurn && !giving && !can;
                    return (
                      <motion.button
                        key={c.id}
                        layout
                        type="button"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: dim ? 0.42 : 1, y: picked ? -14 : 0 }}
                        exit={{ opacity: 0, y: -40, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 420, damping: 30 }}
                        whileHover={myTurn && (can || giving) ? { y: picked ? -14 : -6 } : undefined}
                        onClick={() => choose(c)}
                        className="relative shrink-0 rounded-xl p-1"
                        style={{ filter: picked ? `drop-shadow(0 0 10px ${CYAN})` : "drop-shadow(0 6px 10px rgba(2,8,30,0.5))" }}
                        aria-label={cardName(c)}
                        aria-pressed={picked}
                      >
                        <CubeChip card={c} size={68} />
                        {picked && <span className="absolute inset-x-3 -bottom-1 h-[3px] rounded-full" style={{ background: CYAN }} />}
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
                {spectating && (
                  <div className="py-6 text-[13px]" style={{ color: TEXT_3 }}>
                    Spectating — hands are hidden
                  </div>
                )}
              </div>
            </div>

            {/* actions */}
            {myTurn && (
              <div className="flex shrink-0 flex-col items-stretch gap-2 pb-2">
                {v.phase === "give" ? (
                  <Btn tone="go" disabled={sel.give.length !== v.give} onClick={() => send({ type: "give", cardIds: sel.give })}>
                    Give {v.give} → {next?.name ?? ""}
                  </Btn>
                ) : (
                  <>
                    {v.pending && (
                      <Btn tone="warn" onClick={() => send({ type: "take" })}>
                        Take {v.pending.n}
                      </Btn>
                    )}
                    {v.combo !== null ? (
                      <Btn tone="go" onClick={() => send({ type: "done" })}>
                        Finish turn
                      </Btn>
                    ) : (
                      <Btn onClick={() => send({ type: "draw" })}>Draw</Btn>
                    )}
                    {hand.length === 2 && (
                      <Btn tone={sel.declare ? "gold" : "plain"} onClick={() => setSel((s) => ({ ...s, declare: !s.declare }))}>
                        {sel.declare ? "UH OH! ✓" : "UH OH!"}
                      </Btn>
                    )}
                  </>
                )}
              </div>
            )}
            {!myTurn && me && hand.length === 1 && !me.called && !me.left && (
              <div className="shrink-0 pb-2">
                <Btn tone="gold" pulse onClick={() => send({ type: "uhoh" })}>
                  UH OH!
                </Btn>
              </div>
            )}
          </div>
          {myTurn && hand.length === 1 && me && !me.called && (
            <div className="mt-1 flex justify-end">
              <Btn tone="gold" pulse onClick={() => send({ type: "uhoh" })}>
                UH OH!
              </Btn>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>{v.phase === "over" && <GameOverCard key="st-over" v={v} party={party} youId={youId} isHost={isHost} playAgain={playAgain} exitToLobby={exitToLobby} seatColor={seatColor} />}</AnimatePresence>
      {rulesOpen && <StaccsRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
