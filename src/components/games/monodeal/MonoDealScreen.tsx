"use client";

/* Monopoly Deal — top-level game screen. "Banknote ledger" light theme:
   cream paper, guilloche engraving, money-green and copper ink.

   Layout: opponents as a responsive grid across the top (horizontal scroll
   strip on mobile), one compact center band (draw pile · discard · ledger
   line · plays pips), the running ledger filling the middle on desktop, and
   your table / bank / hand docked at the bottom as a full-width card tray. */

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ACTION_META,
  COLOR_META,
  DISCARD_MS,
  HAND_LIMIT,
  JSN_MS,
  type MonoDealMove,
  type MonoDealView,
  type MonoLogEntry,
  type PendingView,
} from "@/lib/games/monodeal";
import type { GameScreenProps } from "@/lib/party/types";
import { primeSound } from "@/lib/client/synthCore";
import { MdCardBack, MdCardFace } from "./cards";
import {
  AnnouncementLine,
  Countdown,
  LedgerButton,
  LogLedger,
  nameOf,
  OpponentLedger,
  PlayPips,
  RollingTotal,
  SetGroups,
} from "./parts";
import { GameOverOverlay, PaymentSheet, PlaySheet, RearrangeSheet, RulesSheet } from "./sheets";
import { mdSfx, type MdSfxName } from "./sfx";
import { archivo, COPPER, franklin, GREEN, GREEN_DEEP, GUILLOCHE, INK, INK_SOFT, LINE, PAPER, RED } from "./theme";

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

const DESKTOP_MQ = "(min-width: 1024px)";
function subscribeDesktop(cb: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getDesktopSnapshot = () => window.matchMedia(DESKTOP_MQ).matches;
const getDesktopServerSnapshot = () => false;

/* ---------------- engraved section caption ---------------- */

function Caption({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: INK_SOFT }}>
        {children}
      </span>
      <span className="h-px min-w-4 flex-1" style={{ background: `linear-gradient(90deg, ${COPPER}66, transparent)` }} />
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
      style={{ background: "#fdf3ef", border: `2px solid ${RED}` }}
    >
      <span className={`${archivo.className} shrink-0`} style={{ color: RED, fontSize: 16, letterSpacing: "0.04em" }}>
        JUST SAY NO?
      </span>
      <span className="min-w-0 flex-1 text-[10.5px] font-semibold leading-tight" style={{ color: INK }}>
        {countering
          ? `${nameOf(view, pending.target).toUpperCase()} said NO to your ${pendingLabel(view, pending)}`
          : `${nameOf(view, pending.actor).toUpperCase()} plays ${pendingLabel(view, pending)} on you`}
        <span className="mt-1 block">
          <Countdown deadline={pending.deadline} now={now} total={JSN_MS} tint={RED} />
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
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot);

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

  const handW = isDesktop ? 106 : 82;
  const handOverlap = isDesktop ? -32 : -22;

  return (
    <div
      className={`${franklin.className} relative flex min-h-dvh w-full flex-col`}
      style={{ background: PAPER, backgroundImage: GUILLOCHE, color: INK }}
    >
      <LayoutGroup>
        {/* header */}
        <header className="border-b" style={{ borderColor: LINE, background: "rgba(255,252,243,0.6)" }}>
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-baseline gap-2.5 leading-none">
              <span className={archivo.className} style={{ color: GREEN_DEEP, fontSize: 15 }}>
                MONOPOLY&nbsp;DEAL
              </span>
              <span
                className="hidden text-[9px] font-semibold uppercase tracking-[0.24em] sm:inline"
                style={{ color: COPPER }}
              >
                banknote ledger
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] tabular-nums" style={{ color: INK_SOFT }}>
                Round {round}/60
              </span>
              <button
                onClick={() => setLogOpen(true)}
                className="rounded-[4px] border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] lg:hidden"
                style={{ borderColor: LINE, color: INK_SOFT }}
              >
                Ledger
              </button>
              <button
                onClick={() => setRulesOpen(true)}
                className="flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold"
                style={{ borderColor: `${GREEN}88`, color: GREEN_DEEP }}
                aria-label="Rules"
              >
                ?
              </button>
            </div>
          </div>
        </header>

        {spectating && (
          <div
            className="px-3 py-1 text-center text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ background: COPPER, color: "#f4efe4" }}
          >
            Spectating — you are dealt into the next game
          </div>
        )}

        {/* opponents: scroll strip on mobile, responsive grid on desktop */}
        <div className="mx-auto w-full max-w-6xl px-3 pt-2">
          <Caption>Opponents</Caption>
          <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] lg:overflow-visible lg:pb-0">
            {opponents.map((p) => (
              <OpponentLedger key={p.id} p={p} view={view} now={now} mini={isDesktop ? 30 : 24} />
            ))}
          </div>
        </div>

        {/* center band: deck · discard · ledger line · plays pips */}
        <div className="mt-2 border-y" style={{ borderColor: LINE, background: "rgba(255,252,243,0.72)" }}>
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-3 py-1.5">
            <div className="relative shrink-0">
              <MdCardBack w={42} />
              <span
                className="absolute -bottom-1 -right-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums"
                style={{ background: GREEN_DEEP, color: "#f4efe4" }}
              >
                {view.deckCount}
              </span>
            </div>
            <div className="relative h-[60px] w-[42px] shrink-0">
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
                    <MdCardFace card={view.discardTop} w={42} />
                  </motion.div>
                ) : (
                  <div className="absolute inset-0 rounded-[4px] border border-dashed" style={{ borderColor: LINE }} />
                )}
              </AnimatePresence>
            </div>
            <div className="min-w-0 flex-1">
              <AnnouncementLine view={view} now={now} />
            </div>
            {!view.winner && (
              <div className="flex shrink-0 flex-col items-center gap-1">
                <PlayPips left={view.playsLeft} />
                <span className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: INK_SOFT }}>
                  plays
                </span>
              </div>
            )}
          </div>
        </div>

        {/* middle: the running ledger fills the free height on desktop */}
        <div className="mx-auto hidden min-h-0 w-full max-w-6xl flex-1 flex-col px-3 py-2 lg:flex">
          <Caption>The ledger</Caption>
          <LogLedger log={view.log} className="mt-1 min-h-0 max-h-[42vh] flex-1" />
        </div>
        <div className="flex-1 lg:hidden" />

        {/* your dock: a card tray spanning the full width */}
        {you && (
          <div
            className="z-30 lg:sticky lg:bottom-0"
            style={{
              background: "#f6f1e2",
              backgroundImage: GUILLOCHE,
              borderTop: `1px solid ${COPPER}`,
              boxShadow: "0 -3px 0 rgba(176,102,47,0.18), 0 -10px 26px rgba(33,28,18,0.1)",
            }}
          >
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
              {/* context strip */}
              {mustJsn && pending ? (
                <JsnStrip view={view} pending={pending} hasJsn={hasJsn} now={now} send={send} />
              ) : mustDiscard ? (
                <motion.div
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="flex items-center gap-3 rounded-[5px] p-2.5"
                  style={{ background: "#fdf8ec", border: `2px solid ${COPPER}` }}
                >
                  <div className="min-w-0 flex-1">
                    <b className="block text-[12px]" style={{ color: INK }}>
                      Hand limit is {HAND_LIMIT} — tap cards to discard {discardNeed}
                    </b>
                    {view.discarding && (
                      <Countdown deadline={view.discarding.deadline} now={now} total={DISCARD_MS} tint={COPPER} />
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
                  className="flex items-center justify-between gap-2 rounded-[5px] px-2.5 py-1.5"
                  style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}55` }}
                >
                  <span className="text-[11px] font-bold" style={{ color: GREEN_DEEP }}>
                    Your move — {view.playsLeft} play{view.playsLeft === 1 ? "" : "s"} left
                  </span>
                  <LedgerButton variant="primary" onClick={() => send({ type: "end_turn" })}>
                    End turn
                  </LedgerButton>
                </div>
              ) : null}

              {/* table + bank */}
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-4">
                <div className="min-w-0 flex-1">
                  <Caption>Your table · ${you.tableValue}M</Caption>
                  <div className="mt-1.5">
                    <SetGroups
                      p={you}
                      mini={isDesktop ? 48 : 40}
                      onWildTap={myTurn ? (id) => setWildId(id) : undefined}
                    />
                  </div>
                </div>
                <div className="shrink-0 lg:w-72 lg:border-l lg:pl-4" style={{ borderColor: LINE }}>
                  <div className="flex items-center justify-between gap-3">
                    <Caption className="flex-1">Bank</Caption>
                    <RollingTotal value={you.bankTotal} size={17} />
                  </div>
                  <div
                    className="mt-1.5 flex items-center gap-1 overflow-x-auto pb-0.5 lg:flex-wrap lg:overflow-visible"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {you.bank.length === 0 && (
                      <span className="text-[10px] italic" style={{ color: INK_SOFT }}>
                        empty — bank cards as money
                      </span>
                    )}
                    {you.bank.map((c) => (
                      <motion.div key={c.id} layoutId={`md-${c.id}`} layout className="shrink-0">
                        <MdCardFace card={c} w={30} />
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              {/* hand fan */}
              {you.hand && (
                <div className="flex flex-col">
                  <div className="flex items-baseline justify-between gap-2 px-1">
                    <Caption className="min-w-0 flex-1">
                      Hand · {you.hand.length}/{HAND_LIMIT}
                    </Caption>
                    {mustDiscard ? (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: RED }}>
                        pick {discardNeed - discardChosen.length} more
                      </span>
                    ) : !myTurn && !pending && !view.winner ? (
                      <span className="shrink-0 text-[10px] italic" style={{ color: INK_SOFT }}>
                        {nameOf(view, view.turn)} is moving…
                      </span>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
                    <div className="mx-auto flex w-max items-end px-2 pb-1 pt-4">
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
                            y: selected ? -12 : 0,
                            opacity: 1,
                            rotate: Number(((i - mid) * 1.6).toFixed(2)),
                          }}
                          whileHover={{ y: -14 }}
                          whileTap={{ scale: 0.96 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          onClick={() => {
                            primeSound();
                            if (mustDiscard) toggleDiscard(c.id);
                            else if (myTurn) setSheetId(c.id);
                          }}
                          className="shrink-0"
                          style={{ marginLeft: i === 0 ? 0 : handOverlap }}
                        >
                          <MdCardFace
                            card={c}
                            w={handW}
                            className={selected ? "rounded-[6px] ring-2 ring-[#a8342a]" : ""}
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
        {logOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setLogOpen(false)}>
            <div className="absolute inset-0 bg-[#211c12]/45" />
            <div
              className="relative w-full max-w-lg rounded-t-2xl px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
              style={{ background: PAPER, borderTop: `2px solid ${GREEN}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: GREEN_DEEP }}>
                The ledger
              </div>
              <LogLedger log={view.log} className="max-h-56" />
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
