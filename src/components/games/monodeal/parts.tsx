"use client";

/* Ledger-layer pieces: opponent rows, set groups, the announcement line,
   countdowns, pips and the log text. */

import { AnimatePresence, motion } from "framer-motion";
import {
  COLOR_META,
  COLORS,
  DISCARD_MS,
  JSN_MS,
  PAY_MS,
  TURN_MS,
  type MonoColor,
  type MonoDealView,
  type MonoLogEntry,
  type MonoPlayerView,
  type PendingView,
  type TableCard,
} from "@/lib/games/monodeal";
import { MdTableMini, SealMark, SetChip } from "./cards";
import {
  archivo,
  CHROME,
  CHROME_FAINT,
  CHROME_SOFT,
  COPPER_HI,
  GREEN_HI,
  HAIRLINE,
  HAIRLINE_SOFT,
  PANEL,
  RED_HI,
} from "./theme";

/* ---------------- helpers over the view ---------------- */

export interface SetGroup {
  color: MonoColor;
  entries: TableCard[];
  complete: boolean;
  houses: number;
  hotels: number;
}

export function groupTable(p: MonoPlayerView): SetGroup[] {
  const groups: SetGroup[] = [];
  for (const color of COLORS) {
    const entries = p.table.filter((t) => t.color === color);
    if (entries.length === 0) continue;
    groups.push({
      color,
      entries,
      complete: p.completed.includes(color),
      houses: p.buildings.filter((b) => b.color === color && b.card.kind === "action" && b.card.action === "house").length,
      hotels: p.buildings.filter((b) => b.color === color && b.card.kind === "action" && b.card.action === "hotel").length,
    });
  }
  return groups;
}

/** rent a player would charge on a color right now (mirrors the engine) */
export function rentOn(p: MonoPlayerView, color: MonoColor): number {
  const n = p.table.filter((t) => t.color === color).length;
  if (n === 0) return 0;
  const meta = COLOR_META[color];
  let amt = meta.rent[Math.min(n, meta.setSize) - 1];
  for (const b of p.buildings)
    if (b.color === color && b.card.kind === "action") amt += b.card.action === "house" ? 3 : 4;
  return amt;
}

export const nameOf = (v: MonoDealView, id: string | undefined) =>
  v.players.find((p) => p.id === id)?.name ?? "?";

/* ---------------- log text ---------------- */

export function logLine(e: MonoLogEntry): string {
  const A = e.actor?.toUpperCase() ?? "?";
  const T = e.target?.toUpperCase();
  const color = e.color ? COLOR_META[e.color].label.toUpperCase() : "";
  switch (e.kind) {
    case "start":
      return `New ledger opened — ${A} leads`;
    case "draw":
      return `${A} draws ${e.n} card${e.n === 1 ? "" : "s"}`;
    case "bank":
      return `${A} banks ${e.card} — $${e.amount}M`;
    case "property":
      return `${A} files ${e.card}${e.color ? ` as ${color}` : ""}`;
    case "rearrange":
      return `${A} reassigns ${e.n} wildcard${e.n === 1 ? "" : "s"}`;
    case "action":
      if (e.amount) return `${A} plays ${e.card} on ${T} — $${e.amount}M`;
      return T ? `${A} plays ${e.card} on ${T}` : `${A} plays ${e.card}`;
    case "building":
      return `${A} builds a ${e.card} on ${color}`;
    case "slide":
      return `${A}'s ${e.card} slides to the bank`;
    case "rent":
      return `${A} charges rent on ${color} — $${e.amount}M${e.n ? ` (doubled ×${2 ** e.n})` : ""}`;
    case "jsn":
      return `${A} slams JUST SAY NO`;
    case "pay":
      return e.amount === 0 ? `${A} has nothing to pay` : `${A} pays ${T} $${e.amount}M`;
    case "steal":
      return `${A} slys ${e.card} from ${T}`;
    case "swap":
      return `${A} forces a deal with ${T}`;
    case "deal_breaker":
      return `${A} seizes ${T}'s ${color} set!`;
    case "discard":
      return `${A} discards ${e.n} card${e.n === 1 ? "" : "s"}`;
    case "forfeit":
      return `${A} left the table — ${e.n} card${e.n === 1 ? "" : "s"} to the discard`;
    case "timeout":
      return `${A} ran out of time`;
    case "cap":
      return `Round cap — richest table takes it ($${e.amount}M)`;
    case "win":
      return `${A} WINS the ledger`;
  }
}

/* ---------------- primitives ---------------- */

export function Countdown({
  deadline,
  now,
  total,
  tint = COPPER_HI,
}: {
  deadline: number;
  now: number;
  total: number;
  tint?: string;
}) {
  const left = Math.max(0, deadline - now);
  const pct = Math.max(0, Math.min(1, left / total));
  return (
    <div className="flex w-full items-center gap-1.5">
      <div className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: "rgba(240,234,217,0.16)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-linear"
          style={{ width: `${pct * 100}%`, background: tint }}
        />
      </div>
      <span className="w-6 text-right text-[10px] font-bold tabular-nums" style={{ color: CHROME_SOFT }}>
        {Math.ceil(left / 1000)}s
      </span>
    </div>
  );
}

export function PlayPips({ left }: { left: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${left} plays left`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full transition-colors"
          style={{ background: i < left ? GREEN_HI : "rgba(240,234,217,0.18)" }}
        />
      ))}
    </span>
  );
}

export function RollingTotal({ value, size = 18 }: { value: number; size?: number }) {
  return (
    <span
      className={`${archivo.className} relative inline-flex items-baseline overflow-hidden tabular-nums`}
      style={{ color: GREEN_HI, fontSize: size, lineHeight: 1.15 }}
    >
      <span style={{ fontSize: size * 0.62 }}>$</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: size * 0.8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -size * 0.8, opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
      <span style={{ fontSize: size * 0.62 }}>M</span>
    </span>
  );
}

/* ---------------- opponent ledger row ---------------- */

export function OpponentLedger({
  p,
  view,
  now,
  mini = 24,
}: {
  p: MonoPlayerView;
  view: MonoDealView;
  now: number;
  /** table mini-card width (larger in the desktop grid) */
  mini?: number;
}) {
  const pending = view.pending;
  const isTurn = view.turn === p.id && !view.winner;
  const isTarget = pending?.target === p.id;
  const isDecider = pending?.stage === "jsn" && pending.jsnBy === p.id;
  const mustPay = pending?.stage === "pay" && pending.target === p.id;
  const groups = groupTable(p);

  return (
    <div
      className={`relative flex w-full min-w-[150px] max-w-[200px] shrink-0 flex-col gap-1.5 rounded-[5px] px-2.5 py-2 lg:max-w-none ${
        p.left ? "opacity-50 grayscale" : ""
      }`}
      style={{
        background: PANEL,
        border: `1px solid ${p.left ? HAIRLINE : isTarget ? RED_HI : isTurn ? GREEN_HI : HAIRLINE}`,
        boxShadow:
          isTurn && !p.left
            ? `0 0 0 1px ${GREEN_HI}, 0 2px 12px rgba(63,174,127,0.28)`
            : isTarget && !p.left
              ? `0 0 0 1px ${RED_HI}55`
              : "0 1px 3px rgba(0,0,0,0.35)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: CHROME }}>
            {p.name}
          </span>
          {p.left && (
            <span
              className="shrink-0 rounded-[3px] border px-1 py-px text-[8px] font-bold uppercase tracking-[0.14em]"
              style={{ borderColor: HAIRLINE, color: CHROME_SOFT }}
            >
              left
            </span>
          )}
        </span>
        <RollingTotal value={p.bankTotal} size={13} />
      </div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: CHROME_SOFT }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="5" y="3" width="14" height="18" rx="2" />
          </svg>
          ×{p.handCount}
        </span>
        <span
          className="flex items-center gap-1 text-[10px] font-semibold"
          style={{ color: p.completed.length >= 2 ? COPPER_HI : CHROME_SOFT }}
        >
          {p.completed.length} set{p.completed.length === 1 ? "" : "s"}
          {p.completed.length >= 2 && <SealMark size={11} />}
        </span>
      </div>
      <SetGroups p={p} mini={mini} emptyText={p.left ? "left the game" : "no properties filed"} />
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {groups
            .filter((g) => g.complete)
            .map((g) => (
              <SetChip key={g.color} color={g.color} count={g.entries.length} complete />
            ))}
        </div>
      )}
      {(isDecider || mustPay) && pending && !p.left && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: RED_HI }}>
            {isDecider ? "deciding…" : `owes $${pending.amount}M`}
          </span>
          <Countdown deadline={pending.deadline} now={now} total={pending.stage === "jsn" ? JSN_MS : PAY_MS} tint={RED_HI} />
        </div>
      )}
    </div>
  );
}

/* ---------------- table set groups ---------------- */

export function SetGroups({
  p,
  onWildTap,
  mini = 40,
  emptyText = "No properties on your table yet — file some deeds.",
  still = false,
}: {
  p: MonoPlayerView;
  onWildTap?: (cardId: string) => void;
  mini?: number;
  emptyText?: string;
  /** render without layoutIds (for overlays, so ids stay unique) */
  still?: boolean;
}) {
  const groups = groupTable(p);
  if (groups.length === 0)
    return (
      <span className="px-1 py-1 text-[10px] italic" style={{ color: CHROME_SOFT }}>
        {emptyText}
      </span>
    );
  return (
    <div className="flex flex-wrap items-start gap-2.5">
      {groups.map((g) => {
        const meta = COLOR_META[g.color];
        return (
          <div
            key={g.color}
            className="relative flex flex-col gap-1 rounded-md p-1.5"
            style={{
              background: g.complete ? `${meta.hex}30` : "rgba(240,234,217,0.05)",
              border: `1px solid ${g.complete ? meta.hex : HAIRLINE}`,
            }}
          >
            <div className="flex items-center justify-between gap-1.5 px-0.5">
              <span className="text-[8.5px] font-bold uppercase tracking-[0.1em]" style={{ color: CHROME }}>
                {meta.label}
              </span>
              <span className="flex items-center gap-1">
                {g.houses > 0 && (
                  <span className="rounded-[3px] px-1 text-[8px] font-bold" style={{ background: GREEN_HI, color: "#0b100d" }}>
                    H{g.houses > 1 ? `×${g.houses}` : ""}
                  </span>
                )}
                {g.hotels > 0 && (
                  <span className="rounded-[3px] px-1 text-[8px] font-bold" style={{ background: RED_HI, color: "#1c0b08" }}>
                    HT
                  </span>
                )}
                {g.complete ? (
                  <SealMark size={13} />
                ) : (
                  <span className="text-[8.5px] font-bold tabular-nums" style={{ color: CHROME_SOFT }}>
                    {g.entries.length}/{meta.setSize}
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-1">
              {g.entries.map((t) => {
                const mini_ = (
                  <MdTableMini
                    t={t}
                    w={mini}
                    onClick={onWildTap && t.card.kind === "wild" ? () => onWildTap(t.card.id) : undefined}
                  />
                );
                return still ? (
                  <div key={t.card.id}>{mini_}</div>
                ) : (
                  <motion.div key={t.card.id} layoutId={`md-${t.card.id}`} layout>
                    {mini_}
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- log ledger ---------------- */

export function LogLedger({ log, className = "max-h-56" }: { log: MonoLogEntry[]; className?: string }) {
  const rows = [...log].reverse();
  return (
    <div className={`flex flex-col overflow-y-auto ${className}`}>
      {rows.map((e) => (
        <div
          key={e.i}
          className="flex items-baseline gap-2 border-b px-1 py-1.5 last:border-b-0"
          style={{ borderColor: HAIRLINE_SOFT }}
        >
          <span className="w-7 shrink-0 text-right text-[9px] tabular-nums" style={{ color: CHROME_FAINT }}>
            {e.i}
          </span>
          <span className="text-[11px] leading-snug" style={{ color: e.kind === "win" ? GREEN_HI : CHROME }}>
            {logLine(e)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- announcement line ---------------- */

export function AnnouncementLine({ view, now }: { view: MonoDealView; now: number }) {
  const pending = view.pending;
  const last = view.log.length ? view.log[view.log.length - 1] : null;

  let text: string;
  let tint = CHROME;
  if (view.winner) {
    text = `${nameOf(view, view.winner).toUpperCase()} wins the ledger`;
    tint = GREEN_HI;
  } else if (pending) {
    const t = nameOf(view, pending.target).toUpperCase();
    const a = nameOf(view, pending.actor).toUpperCase();
    if (pending.stage === "jsn") {
      const d = nameOf(view, pending.jsnBy).toUpperCase();
      text = pending.jsnDepth > 0 ? `${d} may say no to the NO…` : `${d} may JUST SAY NO`;
      tint = RED_HI;
    } else {
      text = `${t} owes ${a} $${pending.amount}M`;
      tint = COPPER_HI;
    }
  } else if (view.discarding) {
    text = `${nameOf(view, view.discarding.player).toUpperCase()} discards to 7`;
    tint = COPPER_HI;
  } else if (last) {
    text = logLine(last);
  } else {
    text = "Ledger open";
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={text}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="truncate text-center text-[11.5px] font-semibold"
          style={{ color: tint }}
        >
          {text}
        </motion.div>
      </AnimatePresence>
      {pending ? (
        <Countdown
          deadline={pending.deadline}
          now={now}
          total={pending.stage === "jsn" ? JSN_MS : PAY_MS}
          tint={RED_HI}
        />
      ) : view.discarding ? (
        <Countdown deadline={view.discarding.deadline} now={now} total={DISCARD_MS} tint={COPPER_HI} />
      ) : !view.winner ? (
        <Countdown deadline={view.turnDeadline} now={now} total={TURN_MS} tint={GREEN_HI} />
      ) : null}
    </div>
  );
}

/* ---------------- shared light-theme button ---------------- */

export function LedgerButton({
  children,
  onClick,
  variant = "outline",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: GREEN_HI, color: "#0b100d", border: "1px solid #2c7d5b" },
    outline: { background: "rgba(240,234,217,0.06)", color: GREEN_HI, border: `1px solid ${GREEN_HI}55` },
    danger: { background: RED_HI, color: "#1c0b08", border: "1px solid #a8342a" },
    ghost: { background: "transparent", color: CHROME_SOFT, border: "1px solid transparent" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[4px] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

/** referenced by PendingView type in props signatures */
export type { PendingView };
