"use client";

/* Monopoly Deal — top-level game screen. "Banknote ledger": cream paper
   cards on a deep casino-green table, guilloche engraving, money-green and
   copper ink (see theme.ts).

   Layout (always exactly one screen tall): the toolbar; the opponents' ledger
   pages filling the free height (scrolling inside if a late game overflows);
   one compact center band (draw pile · discard · ledger line · plays pips);
   your table / bank / hand docked at the bottom. On wide screens the running
   ledger gets its own column on the right; below that it opens as a sheet. */

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PartyMenu } from "@/components/party/PartyMenu";
import {
  ACTION_META,
  COLOR_META,
  DISCARD_MS,
  HAND_LIMIT,
  JSN_MS,
  type MonoDealMove,
  type MonoDealView,
  type MonoLogEntry,
  type MonoPlayerView,
  type PendingView,
} from "@/lib/games/monodeal";
import type { GameScreenProps } from "@/lib/party/types";
import { primeSound } from "@/lib/client/synthCore";
import { MdCardBack, MdCardFace } from "./cards";
import {
  AnnouncementLine,
  Countdown,
  groupTable,
  LedgerButton,
  ledgerStrip,
  LogLedger,
  nameOf,
  OpponentLedger,
  PlayPips,
  RollingTotal,
  SetGroups,
  type SetGroup,
} from "./parts";
import { GameOverOverlay, PaymentSheet, PlaySheet, RearrangeSheet, RulesSheet } from "./sheets";
import { mdSfx, type MdSfxName } from "./sfx";
import {
  archivo,
  CHROME,
  CHROME_SOFT,
  COPPER_HI,
  franklin,
  GREEN_HI,
  GUILLOCHE_DARK,
  HAIRLINE,
  PANEL_SOLID,
  RED,
  RED_HI,
  TABLE_BG,
  VIGNETTE,
} from "./theme";

/* ---------------- sound diffing (Coup playDiff pattern) ---------------- */

const LOG_SFX: Partial<Record<MonoLogEntry["kind"], MdSfxName>> = {
  draw: "draw",
  bank: "bank",
  property: "stamp",
  action: "stamp",
  building: "stamp",
  rearrange: "draw",
  rent: "rent",
  jsn: "jsn",
  pay: "pay",
  steal: "steal",
  swap: "steal",
  deal_breaker: "alarm",
  discard: "discard",
  slide: "slide",
};

const mustActNow = (v: MonoDealView, id: string): boolean =>
  v.winner
    ? false
    : v.pending
      ? v.pending.stage === "jsn"
        ? v.pending.jsnBy === id
        : v.pending.target === id
      : v.discarding
        ? v.discarding.player === id
        : v.turn === id;

function playDiff(prev: MonoDealView | null, next: MonoDealView, youId: string) {
  if (!prev) return;
  const lastSeen = prev.log.length ? prev.log[prev.log.length - 1].i : 0;
  const fresh = next.log.filter((l) => l.i > lastSeen);
  const played = new Set<MdSfxName>();
  for (const l of fresh) {
    if (l.kind === "win") {
      mdSfx(next.winner === youId ? "win" : "defeat");
      played.add("win");
      continue;
    }
    const s = LOG_SFX[l.kind];
    if (s && !played.has(s)) {
      mdSfx(s);
      played.add(s);
    }
  }
  if (!next.winner && mustActNow(next, youId) && !mustActNow(prev, youId)) {
    mdSfx("turn");
    try {
      navigator.vibrate?.(60);
    } catch {}
  }
}

/* ---------------- local clock & viewport ---------------- */

function useNow(serverNow: number, skew: number): number {
  const [clientNow, setClientNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClientNow(Date.now() + skew), 300);
    return () => clearInterval(id);
  }, [skew]);
  return Math.max(serverNow, clientNow);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Track an element's size (ResizeObserver), for fit-to-screen layouts. */
function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/* ---- opponent ledger pages, fitted to the free height ----
   Every page is stretched to share the space; the property minis are the
   largest size at which every opponent's sets still fit their page without
   scrolling (sets wrap like the real flex rows). When even the smallest deed
   tokens would overflow, the pages switch to compact colour chips. */

const PAGE_TOP = 53; // border, padding, name row, hand/sets row, gaps
const PAGE_BOTTOM = 9;
const STRIP_H = 30; // "deciding… / owes $xM" + countdown

/** one set group's footprint (label row over a row of minis) */
function groupW(g: SetGroup, mini: number): number {
  const label = COLOR_META[g.color].label.length * 5.8 + 46 + (g.houses ? 16 : 0) + (g.hotels ? 14 : 0);
  return Math.max(label, g.entries.length * (mini + 4) - 4 + 14);
}

/** height a page needs; mini === null → compact chips */
function pageNeed(groups: SetGroup[], mini: number | null, innerW: number, extra: number): number {
  if (groups.length === 0) return PAGE_TOP + 18 + PAGE_BOTTOM + extra;
  const gap = mini === null ? 4 : 10;
  const itemH = mini === null ? 19 : Math.round(mini * 1.36) + 31;
  let rows = 1;
  let x = 0;
  for (const g of groups) {
    const w =
      mini === null
        ? 12 + Math.max(COLOR_META[g.color].setSize, g.entries.length) * 9 + (g.complete ? 13 : 0)
        : groupW(g, mini);
    if (w > innerW) return Infinity;
    if (x > 0 && x + gap + w > innerW) {
      rows++;
      x = w;
    } else x += (x > 0 ? gap : 0) + w;
  }
  return PAGE_TOP + rows * itemH + (rows - 1) * gap + PAGE_BOTTOM + extra;
}

function opponentFit(w: number, h: number, opps: MonoPlayerView[], view: MonoDealView, maxMini: number) {
  const gap = 8;
  const n = Math.max(1, opps.length);
  const maxCols = w < 600 ? Math.min(n, 2) : Math.min(n, Math.max(1, Math.floor((w + gap) / (210 + gap))));
  const groups = opps.map(groupTable);
  const extras = opps.map((p) => (ledgerStrip(p, view) ? STRIP_H : 0));
  const fits = (cols: number, mini: number | null) => {
    const rows = Math.ceil(n / cols);
    const pageW = (w - (cols - 1) * gap) / cols;
    const pageH = (h - (rows - 1) * gap) / rows;
    return groups.every((g, i) => pageNeed(g, mini, pageW - 22, extras[i]) <= pageH);
  };
  // largest minis win; on a tie (both at the cap) prefer pages shaped most
  // like a ledger page (landscape ~1.6:1) over tall thin columns
  const shape = (cols: number) => {
    const rows = Math.ceil(n / cols);
    const aspect = (w - (cols - 1) * gap) / cols / ((h - (rows - 1) * gap) / rows);
    return Math.abs(Math.log(aspect / 1.6));
  };
  let best: { cols: number; mini: number } | null = null;
  for (let cols = maxCols; cols >= 1; cols--) {
    for (let mini = maxMini; mini >= 22; mini -= 2) {
      if (fits(cols, mini)) {
        if (!best || mini > best.mini || (mini === best.mini && shape(cols) < shape(best.cols))) best = { cols, mini };
        break;
      }
    }
  }
  if (best) return { ...best, gap, compact: false };
  for (let cols = maxCols; cols >= 1; cols--) if (fits(cols, null)) return { cols, mini: 22, gap, compact: true };
  return { cols: maxCols, mini: 22, gap, compact: true };
}

/** Height the opponents need to show their sets at full size (the best grid),
    plus some headroom so the next filed set doesn't immediately reflow. */
function opponentNeed(w: number, opps: MonoPlayerView[], view: MonoDealView, mini: number): number {
  const gap = 8;
  const n = opps.length;
  if (n === 0) return 0;
  const maxCols = w < 600 ? Math.min(n, 2) : Math.min(n, Math.max(1, Math.floor((w + gap) / (210 + gap))));
  const groups = opps.map(groupTable);
  const extras = opps.map((p) => (ledgerStrip(p, view) ? STRIP_H : 0));
  let best = Infinity;
  for (let cols = 1; cols <= maxCols; cols++) {
    const innerW = (w - (cols - 1) * gap) / cols - 22;
    let total = 0;
    for (let r = 0; r < n; r += cols) {
      let rowH = 0;
      for (let i = r; i < Math.min(n, r + cols); i++) rowH = Math.max(rowH, pageNeed(groups[i], mini, innerW, extras[i]));
      total += rowH + (r > 0 ? gap : 0);
    }
    best = Math.min(best, total);
  }
  return best + Math.round((mini * 1.36 + 41) * 0.6);
}

/* ---------------- engraved section caption ---------------- */

function Caption({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.22em] lg:text-[10px]" style={{ color: CHROME_SOFT }}>
        {children}
      </span>
      <span className="h-px min-w-4 flex-1" style={{ background: `linear-gradient(90deg, ${COPPER_HI}55, transparent)` }} />
    </div>
  );
}

/* ---------------- dock context strips ---------------- */

function pendingLabel(v: MonoDealView, p: PendingView): string {
  switch (p.kind) {
    case "rent":
      return `Rent on ${p.color ? COLOR_META[p.color].label : "?"} — $${p.amount}M`;
    case "birthday":
      return `${ACTION_META.birthday.label} — $${p.amount}M`;
    case "debt_collector":
      return `${ACTION_META.debt_collector.label} — $${p.amount}M`;
    case "sly_deal":
      return ACTION_META.sly_deal.label;
    case "forced_deal":
      return ACTION_META.forced_deal.label;
    case "deal_breaker":
      return `${ACTION_META.deal_breaker.label} on the ${p.color ? COLOR_META[p.color].label : "?"} set`;
  }
}

/** inline JUST SAY NO strip, lives in the dock (no floating overlay) */
function JsnStrip({
  view,
  pending,
  hasJsn,
  now,
  send,
}: {
  view: MonoDealView;
  pending: PendingView;
  hasJsn: boolean;
  now: number;
  send: (m: MonoDealMove) => void;
}) {
  const countering = pending.jsnBy === pending.actor;
  return (
    <motion.div
      initial={{ y: 14, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="flex flex-col gap-2 rounded-[5px] p-2.5 sm:flex-row sm:items-center sm:gap-3"
      style={{ background: `${RED_HI}16`, border: `2px solid ${RED_HI}` }}
    >
      <span className={`${archivo.className} shrink-0`} style={{ color: RED_HI, fontSize: 16, letterSpacing: "0.04em" }}>
        JUST SAY NO?
      </span>
      <span className="min-w-0 flex-1 text-[10.5px] font-semibold leading-tight lg:text-[11.5px]" style={{ color: CHROME }}>
        {countering
          ? `${nameOf(view, pending.target).toUpperCase()} said NO to your ${pendingLabel(view, pending)}`
          : `${nameOf(view, pending.actor).toUpperCase()} plays ${pendingLabel(view, pending)} on you`}
        <span className="mt-1 block">
          <Countdown deadline={pending.deadline} now={now} total={JSN_MS} tint={RED_HI} />
        </span>
      </span>
      <span className="flex shrink-0 gap-2">
        <LedgerButton variant="ghost" onClick={() => send({ type: "decline" })}>
          {countering ? "Accept the no" : "Let it happen"}
        </LedgerButton>
        <LedgerButton variant="danger" disabled={!hasJsn} onClick={() => send({ type: "jsn" })}>
          {hasJsn ? (countering ? "Counter — say NO" : "Slam JUST SAY NO") : "No JSN in hand"}
        </LedgerButton>
      </span>
    </motion.div>
  );
}

/* ---------------- screen ---------------- */

export function MonoDealScreen({
  view,
  party,
  youId,
  isHost,
  skew,
  spectating,
  move,
  playAgain,
  exitToLobby,
}: GameScreenProps<MonoDealView>) {
  const send = (m: MonoDealMove) => {
    primeSound();
    move(m);
  };
  const now = useNow(view.now, skew);

  const [sheetId, setSheetId] = useState<string | null>(null);
  const [wildId, setWildId] = useState<string | null>(null);
  const [discardSel, setDiscardSel] = useState<string[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  // sounds + haptics from log diffs
  const prevRef = useRef<MonoDealView | null>(null);
  useEffect(() => {
    playDiff(prevRef.current, view, youId);
    prevRef.current = view;
  }, [view, youId]);

  // flash the tab title when input is needed
  const needInput = !spectating && mustActNow(view, youId);
  useEffect(() => {
    document.title = needInput ? "● Your move — MONOPOLY DEAL" : "MONOPOLY DEAL";
    return () => {
      document.title = "MONOPOLY DEAL";
    };
  }, [needInput]);

  const you = view.players.find((p) => p.id === youId);
  const opponents = you
    ? [...view.players]
        .filter((p) => p.id !== youId)
        .sort(
          (a, b) =>
            ((a.seat - you.seat + view.players.length) % view.players.length) -
            ((b.seat - you.seat + view.players.length) % view.players.length)
        )
    : view.players;

  const pending = view.pending;
  const myTurn = !spectating && !view.winner && view.turn === youId && !pending && !view.discarding;
  const mustDiscard = !spectating && view.discarding?.player === youId;
  const mustPay = !spectating && pending?.stage === "pay" && pending.target === youId && !view.winner;
  const mustJsn = !spectating && pending?.stage === "jsn" && pending.jsnBy === youId && !view.winner;
  const hasJsn = you?.hand?.some((c) => c.kind === "action" && c.action === "just_say_no") ?? false;

  const sheetCard = sheetId && myTurn ? you?.hand?.find((c) => c.id === sheetId) ?? null : null;
  const wildEntry = wildId && myTurn ? you?.table.find((t) => t.card.id === wildId) ?? null : null;

  const round = Math.min(60, Math.floor(view.turnsTaken / view.players.length) + 1);
  const lastJsn = [...view.log].reverse().find((l) => l.kind === "jsn");
  const stampVisible = lastJsn && view.now - lastJsn.ts < 3500;

  const toggleDiscard = (id: string) =>
    setDiscardSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const discardNeed = mustDiscard && you?.hand ? you.hand.length - HAND_LIMIT : 0;
  const discardChosen = you?.hand ? discardSel.filter((id) => you.hand!.some((c) => c.id === id)) : [];

  /* ---- fit-to-screen sizing ---- */
  const [rootRef, box] = useBoxSize<HTMLDivElement>();
  const [oppRef, oppBox] = useBoxSize<HTMLDivElement>();
  const [fanRef, fanBox] = useBoxSize<HTMLDivElement>();
  const W = box?.w ?? 1280;
  const H = box?.h ?? 800;
  const isDesktop = W >= 1024;
  /** the running ledger gets its own column */
  const ledgerCol = W >= 1280;
  const narrow = W < 640;
  const oppMaxMini = Math.round(isDesktop ? clamp(H * 0.085, 40, 84) : clamp(Math.min(W * 0.15, H * 0.065), 30, 72));
  const grid = opponentFit(oppBox?.w ?? W - 24, (oppBox?.h ?? H * 0.35) - 8, opponents, view, oppMaxMini);
  const mainW = (ledgerCol ? W - (W >= 1600 ? 340 : 300) : W) - 24;
  const handN = you?.hand?.length ?? 0;
  /* the opponents' pages and your hand fan share whatever height is left
     (their measured sum is constant): the opponents get what they need at
     full size, and any spare goes to bigger cards in your hand */
  const fanH = (w: number) => Math.round(w * 1.58 + 4);
  const baseHandW = isDesktop ? clamp(H * 0.13, 78, 150) : clamp(Math.min(H * 0.11, (mainW - 16) / 4.1), 66, 116);
  const handCap = isDesktop ? clamp(H * 0.18, 78, 200) : clamp(Math.min(H * 0.17, (mainW - 16) / 4.1), 66, 180);
  let handW = baseHandW;
  if (you?.hand && oppBox && fanBox) {
    const spare = oppBox.h + fanBox.h - (opponentNeed(oppBox.w, opponents, view, oppMaxMini) + 8) - fanH(baseHandW);
    if (spare > 0) handW = Math.min(handCap, baseHandW + spare / 1.58);
  }
  // shrink before the fan would hide more than ~60% of each card
  if (handN > 1 && handW + (handN - 1) * handW * 0.42 > mainW - 16)
    handW = Math.max(60, (mainW - 16) / (1 + 0.42 * (handN - 1)));
  handW = Math.round(handW);
  const handStep = handN > 1 ? clamp((mainW - 16 - handW) / (handN - 1), handW * 0.42, handW * 0.8) : handW;
  const tableMini = Math.round(isDesktop ? clamp(H * 0.055, 36, 60) : clamp(H * 0.046, 30, 44));
  const bankW = Math.round(isDesktop ? clamp(H * 0.04, 28, 44) : clamp(H * 0.034, 26, 32));
  const pileW = Math.round(isDesktop ? clamp(H * 0.055, 40, 60) : 38);

  return (
    <div
      ref={rootRef}
      className={`${franklin.className} relative flex h-dvh w-full flex-col overflow-hidden`}
      style={{ backgroundColor: "#0b100d", backgroundImage: `${VIGNETTE}, ${GUILLOCHE_DARK}, ${TABLE_BG}`, color: CHROME }}
    >
      <LayoutGroup>
        {/* toolbar — above every sheet and the game-over overlay so the Parlour menu stays reachable */}
        <header
          className="relative z-[75] shrink-0 border-b"
          style={{ borderColor: HAIRLINE, background: "rgba(11,16,13,0.72)" }}
        >
          <div className="flex w-full items-center justify-between gap-2 px-3 py-2 lg:px-5">
            <div className="flex min-w-0 items-baseline gap-2.5 leading-none">
              <span className={archivo.className} style={{ color: GREEN_HI, fontSize: isDesktop ? 17 : 15 }}>
                MONOPOLY&nbsp;DEAL
              </span>
              <span
                className="hidden text-[9px] font-semibold uppercase tracking-[0.24em] sm:inline"
                style={{ color: COPPER_HI }}
              >
                banknote ledger
              </span>
              {spectating && !narrow && (
                <span
                  className="self-center whitespace-nowrap rounded-[3px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{ background: COPPER_HI, color: "#1c1208" }}
                >
                  {isDesktop ? "Spectating — dealt in next game" : "Spectating"}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.12em] tabular-nums min-[400px]:inline" style={{ color: CHROME_SOFT }}>
                Round {round}/60
              </span>
              {!ledgerCol && (
                <button
                  onClick={() => setLogOpen(true)}
                  className="h-8 rounded-[4px] border px-2 text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ borderColor: HAIRLINE, color: CHROME_SOFT }}
                >
                  Ledger
                </button>
              )}
              <button
                onClick={() => setRulesOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-bold"
                style={{ borderColor: `${GREEN_HI}66`, color: GREEN_HI }}
                aria-label="Rules"
              >
                ?
              </button>
              <PartyMenu style={{ color: CHROME, borderColor: HAIRLINE, borderRadius: 4, background: "rgba(240,234,217,0.04)" }} />
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* main column */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* opponents: ledger pages sharing the free height */}
            <div className="flex min-h-0 flex-1 flex-col px-3 pt-2 lg:px-5">
              <Caption>{you ? "Opponents" : narrow ? "Players · watching — dealt in next game" : "Players"}</Caption>
              <div ref={oppRef} className="mt-1.5 min-h-0 flex-1 overflow-y-auto pb-2" style={{ scrollbarWidth: "thin" }}>
                <div
                  className="grid min-h-full"
                  style={{
                    gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
                    gridAutoRows: "minmax(min-content, 1fr)",
                    gap: grid.gap,
                  }}
                >
                  {opponents.map((p) => (
                    <OpponentLedger key={p.id} p={p} view={view} now={now} mini={grid.mini} compact={grid.compact} />
                  ))}
                </div>
              </div>
            </div>

            {/* center band: deck · discard · ledger line · plays pips */}
            <div className="shrink-0 border-y" style={{ borderColor: HAIRLINE, background: "rgba(11,16,13,0.55)" }}>
              <div className="flex w-full items-center gap-3 px-3 py-1.5 lg:px-5">
                <div className="relative shrink-0">
                  <MdCardBack w={pileW} />
                  <span
                    className="absolute -bottom-1 -right-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums"
                    style={{ background: GREEN_HI, color: "#0b100d" }}
                  >
                    {view.deckCount}
                  </span>
                </div>
                <div className="relative shrink-0" style={{ width: pileW, height: Math.round(pileW * 1.42) }}>
                  <AnimatePresence initial={false}>
                    {view.discardTop ? (
                      <motion.div
                        key={view.discardTop.id}
                        initial={{ scale: 1.35, opacity: 0, rotate: -8 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute inset-0"
                      >
                        <MdCardFace card={view.discardTop} w={pileW} />
                      </motion.div>
                    ) : (
                      <div className="absolute inset-0 rounded-[4px] border border-dashed" style={{ borderColor: HAIRLINE }} />
                    )}
                  </AnimatePresence>
                </div>
                <div className="min-w-0 flex-1">
                  <AnnouncementLine view={view} now={now} />
                </div>
                {!view.winner && (
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <PlayPips left={view.playsLeft} />
                    <span className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: CHROME_SOFT }}>
                      plays
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* your dock: context strip, table + bank, hand */}
            {you && (
              <div
                className="relative z-30 shrink-0"
                style={{
                  background: PANEL_SOLID,
                  backgroundImage: GUILLOCHE_DARK,
                  borderTop: `1px solid ${COPPER_HI}88`,
                  boxShadow: "0 -10px 26px rgba(0,0,0,0.35)",
                }}
              >
                <div className="flex w-full flex-col gap-2 px-3 pb-[max(6px,env(safe-area-inset-bottom))] pt-2 lg:px-5">
                  {/* context strip */}
                  {mustJsn && pending ? (
                    <JsnStrip view={view} pending={pending} hasJsn={hasJsn} now={now} send={send} />
                  ) : mustDiscard ? (
                    <motion.div
                      initial={{ y: 14, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="flex items-center gap-3 rounded-[5px] px-2.5 py-1.5"
                      style={{ background: `${COPPER_HI}14`, border: `2px solid ${COPPER_HI}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <b className="block text-[12px]" style={{ color: CHROME }}>
                          Hand limit is {HAND_LIMIT} — tap cards to discard {discardNeed}
                        </b>
                        {view.discarding && (
                          <Countdown deadline={view.discarding.deadline} now={now} total={DISCARD_MS} tint={COPPER_HI} />
                        )}
                      </div>
                      <LedgerButton
                        variant="primary"
                        disabled={discardChosen.length !== discardNeed}
                        onClick={() => {
                          send({ type: "discard", cardIds: discardChosen });
                          setDiscardSel([]);
                        }}
                      >
                        Discard {discardChosen.length}/{discardNeed}
                      </LedgerButton>
                    </motion.div>
                  ) : myTurn ? (
                    <div
                      className="flex items-center justify-between gap-2 rounded-[5px] px-2.5 py-1"
                      style={{ background: `${GREEN_HI}14`, border: `1px solid ${GREEN_HI}55` }}
                    >
                      <span className="text-[11px] font-bold lg:text-[12px]" style={{ color: GREEN_HI }}>
                        Your move — {view.playsLeft} play{view.playsLeft === 1 ? "" : "s"} left
                      </span>
                      <LedgerButton variant="primary" onClick={() => send({ type: "end_turn" })}>
                        End turn
                      </LedgerButton>
                    </div>
                  ) : null}

                  {/* table + bank */}
                  <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start lg:gap-4">
                    <div className="min-w-0 flex-1">
                      <Caption>Your table · ${you.tableValue}M</Caption>
                      <div
                        className="mt-1.5 lg:overflow-y-auto"
                        style={isDesktop ? { maxHeight: Math.round(tableMini * 1.36 + 36) * 2 + 10, scrollbarWidth: "thin" } : undefined}
                      >
                        <SetGroups
                          p={you}
                          mini={tableMini}
                          row={!isDesktop}
                          onWildTap={myTurn ? (id) => setWildId(id) : undefined}
                        />
                      </div>
                    </div>
                    <div
                      className="flex shrink-0 items-center gap-3 lg:block lg:border-l lg:pl-4"
                      style={{ borderColor: HAIRLINE, width: isDesktop ? clamp(W * 0.2, 240, 340) : undefined }}
                    >
                      <div className="flex shrink-0 items-center justify-between gap-3">
                        <Caption className="lg:flex-1">Bank</Caption>
                        <RollingTotal value={you.bankTotal} size={isDesktop ? 18 : 15} />
                      </div>
                      <div
                        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5 lg:mt-1.5 lg:flex-wrap lg:overflow-visible"
                        style={{ scrollbarWidth: "none", minHeight: Math.round(bankW * 1.42) }}
                      >
                        {you.bank.length === 0 && (
                          <span className="text-[10px] italic" style={{ color: CHROME_SOFT }}>
                            empty — bank cards as money
                          </span>
                        )}
                        {you.bank.map((c) => (
                          <motion.div key={c.id} layoutId={`md-${c.id}`} layout className="shrink-0">
                            <MdCardFace card={c} w={bankW} />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* hand fan */}
                  {you.hand && (
                    <div className="flex flex-col">
                      <div className="flex items-baseline justify-between gap-2">
                        <Caption className="min-w-0 flex-1">
                          Hand · {you.hand.length}/{HAND_LIMIT}
                        </Caption>
                        {mustDiscard ? (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: RED_HI }}>
                            pick {discardNeed - discardChosen.length} more
                          </span>
                        ) : !myTurn && !pending && !view.winner ? (
                          <span className="shrink-0 text-[10px] italic" style={{ color: CHROME_SOFT }}>
                            {nameOf(view, view.turn)} is moving…
                          </span>
                        ) : null}
                      </div>
                      <div className="overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "thin" }}>
                        <div
                          ref={fanRef}
                          className="mx-auto flex w-max items-end px-2 pb-1"
                          style={{ paddingTop: Math.round(handW * 0.16), height: fanH(handW) }}
                        >
                          {you.hand.map((c, i) => {
                            const mid = (you.hand!.length - 1) / 2;
                            const selected = mustDiscard && discardChosen.includes(c.id);
                            return (
                              <motion.button
                                key={c.id}
                                layoutId={`md-${c.id}`}
                                layout
                                initial={{ y: 24, opacity: 0 }}
                                animate={{
                                  y: selected ? -Math.round(handW * 0.12) : 0,
                                  opacity: 1,
                                  rotate: Number(((i - mid) * 1.6).toFixed(2)),
                                }}
                                whileHover={{ y: -Math.round(handW * 0.13) }}
                                whileTap={{ scale: 0.96 }}
                                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                onClick={() => {
                                  primeSound();
                                  if (mustDiscard) toggleDiscard(c.id);
                                  else if (myTurn) setSheetId(c.id);
                                }}
                                className="shrink-0"
                                style={{ marginLeft: i === 0 ? 0 : Math.round(handStep - handW) }}
                              >
                                <MdCardFace
                                  card={c}
                                  w={handW}
                                  className={selected ? "rounded-[6px] ring-2 ring-[#e0685a]" : ""}
                                />
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* the running ledger, its own column on wide screens */}
          {ledgerCol && (
            <aside
              className="flex min-h-0 shrink-0 flex-col border-l px-4 pt-2"
              style={{ width: W >= 1600 ? 340 : 300, borderColor: HAIRLINE, background: "rgba(11,16,13,0.35)" }}
            >
              <Caption>The ledger</Caption>
              <LogLedger log={view.log} className="mt-1 min-h-0 flex-1 pb-3" />
            </aside>
          )}
        </div>

        {/* big stamp when anyone slams a JSN */}
        {stampVisible && lastJsn && (
          <motion.div
            key={lastJsn.i}
            initial={{ opacity: 0, scale: 2.1, rotate: -18 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [2.1, 1, 1, 1.04], rotate: [-18, -9, -9, -9] }}
            transition={{ duration: 1.7, times: [0, 0.18, 0.78, 1] }}
            className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
          >
            <span
              className={archivo.className}
              style={{
                color: RED,
                fontSize: 34,
                letterSpacing: "0.06em",
                border: `4px solid ${RED}`,
                borderRadius: 10,
                padding: "10px 18px",
                background: "rgba(253,243,239,0.88)",
                boxShadow: "0 10px 40px rgba(168,52,42,0.4)",
              }}
            >
              JUST&nbsp;SAY&nbsp;NO
            </span>
          </motion.div>
        )}

        {/* sheets & overlays */}
        {sheetCard && you && (
          <PlaySheet
            key={sheetCard.id}
            view={view}
            you={you}
            card={sheetCard}
            send={send}
            onClose={() => setSheetId(null)}
          />
        )}
        {wildEntry && you && (
          <RearrangeSheet
            key={wildEntry.card.id}
            entry={wildEntry}
            you={you}
            canPlay={view.playsLeft > 0}
            send={send}
            onClose={() => setWildId(null)}
          />
        )}
        {mustPay && pending && you && (
          <PaymentSheet
            key={`${pending.deadline}-${pending.target}`}
            view={view}
            you={you}
            pending={pending}
            now={now}
            send={send}
          />
        )}
        <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
        {logOpen && !ledgerCol && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setLogOpen(false)}>
            <div className="absolute inset-0 bg-black/55" />
            <div
              className="relative w-full max-w-lg rounded-t-2xl px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
              style={{ background: PANEL_SOLID, backgroundImage: GUILLOCHE_DARK, borderTop: `2px solid ${GREEN_HI}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{ background: "rgba(240,234,217,0.25)" }} />
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: GREEN_HI }}>
                The ledger
              </div>
              <LogLedger log={view.log} className="max-h-[55dvh]" />
            </div>
          </div>
        )}
        <AnimatePresence>
          {view.winner && (
            <GameOverOverlay
              view={view}
              party={party}
              isHost={isHost}
              playAgain={playAgain}
              exitToLobby={exitToLobby}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}
