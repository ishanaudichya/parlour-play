"use client";

/* Interaction surfaces: the play sheet for a tapped hand card, the payment
   picker, wildcard rearranging, rules, and the game-over overlay. */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  ACTION_META,
  COLOR_META,
  PAY_MS,
  type MonoCard,
  type MonoColor,
  type MonoDealMove,
  type MonoDealView,
  type MonoPlayerView,
  type PendingView,
  type TableCard,
} from "@/lib/games/monodeal";
import type { PartyView } from "@/lib/party/types";
import { MdCardFace, MdTableMini, SealMark, ValueBadge } from "./cards";
import { Countdown, LedgerButton, nameOf, rentOn, SetGroups } from "./parts";
import { archivo, CHROME, CHROME_SOFT, COPPER_HI, GREEN_HI, GUILLOCHE_DARK, HAIRLINE, PANEL_SOLID, RED_HI } from "./theme";

/* ---------------- bottom sheet primitive ---------------- */

export function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/55" onClick={onClose} />
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg overflow-y-auto rounded-t-2xl px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
            style={{ background: PANEL_SOLID, backgroundImage: GUILLOCHE_DARK, maxHeight: "82dvh", borderTop: `2px solid ${GREEN_HI}`, boxShadow: "0 -8px 30px rgba(0,0,0,0.55)" }}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{ background: "rgba(240,234,217,0.25)" }} />
            {title && (
              <div
                className="mb-2 border-b pb-1.5 text-[10px] font-bold uppercase tracking-[0.22em]"
                style={{ color: GREEN_HI, borderColor: HAIRLINE }}
              >
                {title}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-all active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40"
      style={{ background: "rgba(240,234,217,0.07)", borderColor: HAIRLINE }}
    >
      {children}
    </button>
  );
}

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="px-1 py-1 text-[11px] italic leading-snug" style={{ color: CHROME_SOFT }}>
    {children}
  </p>
);

/* ---------------- the play sheet ---------------- */

type Step =
  | { k: "root" }
  | { k: "wild_color" }
  | { k: "pick_target"; for: "debt_collector" }
  | { k: "pick_prop"; for: "sly_deal" | "forced_deal" }
  | { k: "forced_mine"; target: string; targetCardId: string }
  | { k: "pick_set"; for: "deal_breaker" | "house" | "hotel" }
  | { k: "rent_color" }
  | { k: "rent_finish"; color: MonoColor };

export function PlaySheet({
  view,
  you,
  card,
  send,
  onClose,
}: {
  view: MonoDealView;
  you: MonoPlayerView;
  card: MonoCard;
  send: (m: MonoDealMove) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ k: "root" });
  const [dtr, setDtr] = useState(0);
  const [rentTarget, setRentTarget] = useState<string | null>(null);

  const opponents = view.players.filter((p) => p.id !== you.id);
  const canPlay = view.playsLeft > 0;
  const go = (m: MonoDealMove) => {
    send(m);
    onClose();
  };

  const stealable = (p: MonoPlayerView): TableCard[] => p.table.filter((t) => !p.completed.includes(t.color));

  /* ---- step bodies ---- */
  let body: React.ReactNode = null;

  if (step.k === "root") {
    const options: React.ReactNode[] = [];
    if (card.kind !== "property" && card.kind !== "wild") {
      options.push(
        <Row key="bank" disabled={!canPlay} onClick={() => go({ type: "bank", cardId: card.id })}>
          <ValueBadge value={card.value} s={1.15} />
          <span className="flex flex-col">
            <b className="text-[12.5px]" style={{ color: CHROME }}>
              Bank it — ${card.value}M
            </b>
            <span className="text-[10px]" style={{ color: CHROME_SOFT }}>
              Adds to your bank as money. 1 play.
            </span>
          </span>
        </Row>
      );
    }
    if (card.kind === "property") {
      options.push(
        <Row key="place" disabled={!canPlay} onClick={() => go({ type: "place", cardId: card.id })}>
          <span className="h-4 w-4 rounded-[3px]" style={{ background: COLOR_META[card.color].hex }} />
          <span className="flex flex-col">
            <b className="text-[12.5px]" style={{ color: CHROME }}>
              File as {COLOR_META[card.color].label}
            </b>
            <span className="text-[10px]" style={{ color: CHROME_SOFT }}>
              Onto your table. 1 play.
            </span>
          </span>
        </Row>
      );
    }
    if (card.kind === "wild") {
      options.push(
        <Row key="wildp" disabled={!canPlay} onClick={() => setStep({ k: "wild_color" })}>
          <span className="h-4 w-4 rounded-[3px] bg-[conic-gradient(#c13a34,#e2c23e,#1d7a53,#2a4a86,#c33e8d,#c13a34)]" />
          <span className="flex flex-col">
            <b className="text-[12.5px]" style={{ color: CHROME }}>
              File as property…
            </b>
            <span className="text-[10px]" style={{ color: CHROME_SOFT }}>
              Choose which color it counts as. 1 play.
            </span>
          </span>
        </Row>
      );
    }
    if (card.kind === "action") {
      const a = card.action;
      const playRow = (label: string, sub: string, onClick: () => void, disabled = false) => (
        <Row key={`act-${a}`} disabled={!canPlay || disabled} onClick={onClick}>
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ border: `1.5px solid ${COPPER_HI}` }}
          >
            <span className={archivo.className} style={{ color: COPPER_HI, fontSize: 10 }}>
              GO
            </span>
          </span>
          <span className="flex flex-col">
            <b className="text-[12.5px]" style={{ color: CHROME }}>
              {label}
            </b>
            <span className="text-[10px]" style={{ color: CHROME_SOFT }}>
              {sub}
            </span>
          </span>
        </Row>
      );
      if (a === "pass_go") options.push(playRow("Play — draw 2 cards", "The voucher is spent. 1 play.", () => go({ type: "play_action", cardId: card.id })));
      if (a === "birthday")
        options.push(
          playRow(
            "Play — everyone owes you $2M",
            "Each player gets a Just Say No window. 1 play.",
            () => go({ type: "play_action", cardId: card.id })
          )
        );
      if (a === "debt_collector")
        options.push(playRow("Play — collect $5M…", "Pick who owes you. 1 play.", () => setStep({ k: "pick_target", for: "debt_collector" })));
      if (a === "sly_deal") {
        const any = opponents.some((p) => stealable(p).length > 0);
        options.push(
          playRow("Play — steal a property…", any ? "Not from completed sets. 1 play." : "No stealable properties right now.", () => setStep({ k: "pick_prop", for: "sly_deal" }), !any)
        );
      }
      if (a === "forced_deal") {
        const any = opponents.some((p) => stealable(p).length > 0) && you.table.length > 0;
        options.push(
          playRow(
            "Play — swap properties…",
            any ? "Take theirs, give one of yours. 1 play." : "You need a property, and they need a stealable one.",
            () => setStep({ k: "pick_prop", for: "forced_deal" }),
            !any
          )
        );
      }
      if (a === "deal_breaker") {
        const any = opponents.some((p) => p.completed.length > 0);
        options.push(
          playRow("Play — seize a completed set…", any ? "Buildings included. 1 play." : "Nobody has a completed set yet.", () => setStep({ k: "pick_set", for: "deal_breaker" }), !any)
        );
      }
      if (a === "house" || a === "hotel") {
        const eligible = you.completed.filter((c) => {
          if (!COLOR_META[c].buildable) return false;
          const hasHouse = you.buildings.some((b) => b.color === c && b.card.kind === "action" && b.card.action === "house");
          const hasHotel = you.buildings.some((b) => b.color === c && b.card.kind === "action" && b.card.action === "hotel");
          return a === "house" ? !hasHouse : hasHouse && !hasHotel;
        });
        options.push(
          playRow(
            a === "house" ? "Build — +$3M rent on a set…" : "Build — +$4M rent on a set…",
            eligible.length
              ? "Pick one of your completed sets. 1 play."
              : a === "house"
                ? "Needs a completed street set without a house."
                : "Needs a completed set that already has a house.",
            () => setStep({ k: "pick_set", for: a }),
            eligible.length === 0
          )
        );
      }
      if (a === "just_say_no")
        options.push(<Hint key="jsn">Just Say No plays itself when someone targets you — from here it can only be banked.</Hint>);
      if (a === "double_rent")
        options.push(<Hint key="dtr">Double The Rent is declared together with a rent card — pick a rent card in your hand to use it.</Hint>);
    }
    if (card.kind === "rent") {
      const owned = card.wild
        ? Array.from(new Set(you.table.map((t) => t.color)))
        : card.colors.filter((c) => you.table.some((t) => t.color === c));
      options.push(
        <Row key="rent" disabled={!canPlay || owned.length === 0} onClick={() => setStep({ k: "rent_color" })}>
          <span className={archivo.className} style={{ color: COPPER_HI, fontSize: 11 }}>
            $→
          </span>
          <span className="flex flex-col">
            <b className="text-[12.5px]" style={{ color: CHROME }}>
              Charge rent…
            </b>
            <span className="text-[10px]" style={{ color: CHROME_SOFT }}>
              {owned.length
                ? card.wild
                  ? "Any color you own, one player pays."
                  : "All players pay for a color you own."
                : "You own no property this card can charge."}
            </span>
          </span>
        </Row>
      );
    }
    body = (
      <div className="flex flex-col gap-1.5">
        {!canPlay && <Hint>No plays left this turn — end your turn.</Hint>}
        {options}
      </div>
    );
  }

  if (step.k === "wild_color" && card.kind === "wild") {
    body = (
      <div className="grid grid-cols-2 gap-1.5">
        {card.colors.map((c) => (
          <Row key={c} onClick={() => go({ type: "place", cardId: card.id, color: c })}>
            <span className="h-4 w-4 rounded-[3px]" style={{ background: COLOR_META[c].hex }} />
            <span className="flex flex-col">
              <b className="text-[12px]" style={{ color: CHROME }}>
                {COLOR_META[c].label}
              </b>
              <span className="text-[9.5px] tabular-nums" style={{ color: CHROME_SOFT }}>
                you have {you.table.filter((t) => t.color === c).length}/{COLOR_META[c].setSize}
              </span>
            </span>
          </Row>
        ))}
      </div>
    );
  }

  if (step.k === "pick_target") {
    body = (
      <div className="flex flex-col gap-1.5">
        {opponents.map((p) => (
          <Row key={p.id} onClick={() => go({ type: "play_action", cardId: card.id, target: p.id })}>
            <b className="text-[12.5px] uppercase" style={{ color: CHROME }}>
              {p.name}
            </b>
            <span className="ml-auto text-[11px] font-semibold tabular-nums" style={{ color: GREEN_HI }}>
              bank ${p.bankTotal}M · table ${p.tableValue}M
            </span>
          </Row>
        ))}
      </div>
    );
  }

  if (step.k === "pick_prop") {
    const kind = step.for;
    body = (
      <div className="flex flex-col gap-2.5">
        {opponents.map((p) => {
          const cands = stealable(p);
          if (cands.length === 0) return null;
          return (
            <div key={p.id} className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: CHROME_SOFT }}>
                {p.name}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {cands.map((t) => (
                  <MdTableMini
                    key={t.card.id}
                    t={t}
                    w={52}
                    onClick={() =>
                      kind === "sly_deal"
                        ? go({ type: "play_action", cardId: card.id, target: p.id, targetCardId: t.card.id })
                        : setStep({ k: "forced_mine", target: p.id, targetCardId: t.card.id })
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
        <Hint>Properties inside completed sets are protected.</Hint>
      </div>
    );
  }

  if (step.k === "forced_mine") {
    body = (
      <div className="flex flex-col gap-2">
        <Hint>Now pick which of your properties to give away.</Hint>
        <div className="flex flex-wrap gap-1.5">
          {you.table.map((t) => (
            <MdTableMini
              key={t.card.id}
              t={t}
              w={52}
              onClick={() =>
                go({
                  type: "play_action",
                  cardId: card.id,
                  target: step.target,
                  targetCardId: step.targetCardId,
                  myCardId: t.card.id,
                })
              }
            />
          ))}
        </div>
      </div>
    );
  }

  if (step.k === "pick_set") {
    if (step.for === "deal_breaker") {
      body = (
        <div className="flex flex-col gap-1.5">
          {opponents.flatMap((p) =>
            p.completed.map((c) => (
              <Row key={`${p.id}-${c}`} onClick={() => go({ type: "play_action", cardId: card.id, target: p.id, color: c })}>
                <span className="h-4 w-4 rounded-[3px]" style={{ background: COLOR_META[c].hex }} />
                <b className="text-[12.5px]" style={{ color: CHROME }}>
                  {p.name}&apos;s {COLOR_META[c].label} set
                </b>
                <span className="ml-auto">
                  <SealMark size={14} />
                </span>
              </Row>
            ))
          )}
        </div>
      );
    } else {
      const a = step.for;
      const eligible = you.completed.filter((c) => {
        if (!COLOR_META[c].buildable) return false;
        const hasHouse = you.buildings.some((b) => b.color === c && b.card.kind === "action" && b.card.action === "house");
        const hasHotel = you.buildings.some((b) => b.color === c && b.card.kind === "action" && b.card.action === "hotel");
        return a === "house" ? !hasHouse : hasHouse && !hasHotel;
      });
      body = (
        <div className="flex flex-col gap-1.5">
          {eligible.map((c) => (
            <Row key={c} onClick={() => go({ type: "play_action", cardId: card.id, color: c })}>
              <span className="h-4 w-4 rounded-[3px]" style={{ background: COLOR_META[c].hex }} />
              <b className="text-[12.5px]" style={{ color: CHROME }}>
                {COLOR_META[c].label} set
              </b>
              <span className="ml-auto text-[10.5px] font-semibold" style={{ color: GREEN_HI }}>
                rent → ${rentOn(you, c) + (a === "house" ? 3 : 4)}M
              </span>
            </Row>
          ))}
        </div>
      );
    }
  }

  if (step.k === "rent_color" && card.kind === "rent") {
    const owned = card.wild
      ? Array.from(new Set(you.table.map((t) => t.color)))
      : card.colors.filter((c) => you.table.some((t) => t.color === c));
    body = (
      <div className="flex flex-col gap-1.5">
        {owned.map((c) => (
          <Row key={c} onClick={() => setStep({ k: "rent_finish", color: c })}>
            <span className="h-4 w-4 rounded-[3px]" style={{ background: COLOR_META[c].hex }} />
            <b className="text-[12.5px]" style={{ color: CHROME }}>
              {COLOR_META[c].label}
            </b>
            <span className="ml-auto text-[11px] font-bold tabular-nums" style={{ color: COPPER_HI }}>
              ${rentOn(you, c)}M
            </span>
          </Row>
        ))}
      </div>
    );
  }

  if (step.k === "rent_finish" && card.kind === "rent") {
    const dtrIds = (you.hand ?? [])
      .filter((c) => c.kind === "action" && c.action === "double_rent")
      .map((c) => c.id);
    const maxDtr = Math.min(2, dtrIds.length, view.playsLeft - 1);
    const amount = rentOn(you, step.color) * 2 ** dtr;
    const needTarget = card.wild;
    const ready = !needTarget || rentTarget !== null;
    body = (
      <div className="flex flex-col gap-2.5">
        {needTarget && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: CHROME_SOFT }}>
              Who pays?
            </span>
            {opponents.map((p) => (
              <Row key={p.id} onClick={() => setRentTarget(p.id)}>
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ border: `2px solid ${GREEN_HI}`, background: rentTarget === p.id ? GREEN_HI : "transparent" }}
                />
                <b className="text-[12.5px] uppercase" style={{ color: CHROME }}>
                  {p.name}
                </b>
                <span className="ml-auto text-[10.5px] tabular-nums" style={{ color: CHROME_SOFT }}>
                  bank ${p.bankTotal}M
                </span>
              </Row>
            ))}
          </div>
        )}
        {maxDtr > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: CHROME_SOFT }}>
              Double the rent
            </span>
            {[0, 1, 2].slice(0, maxDtr + 1).map((n) => (
              <button
                key={n}
                onClick={() => setDtr(n)}
                className="rounded-[4px] px-2.5 py-1 text-[11px] font-bold transition-all"
                style={{
                  background: dtr === n ? COPPER_HI : "rgba(240,234,217,0.07)",
                  color: dtr === n ? "#1a1108" : CHROME,
                  border: `1px solid ${dtr === n ? COPPER_HI : HAIRLINE}`,
                }}
              >
                ×{2 ** n}
              </button>
            ))}
            <span className="text-[9.5px]" style={{ color: CHROME_SOFT }}>
              each uses a play
            </span>
          </div>
        )}
        <LedgerButton
          variant="primary"
          disabled={!ready}
          onClick={() =>
            go({
              type: "play_rent",
              cardId: card.id,
              color: step.color,
              target: card.wild ? rentTarget ?? undefined : undefined,
              doubleIds: dtrIds.slice(0, dtr),
            })
          }
        >
          Charge ${amount}M {card.wild ? "" : "from everyone"}
        </LedgerButton>
      </div>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Play a card">
      <div className="flex gap-3">
        <MdCardFace card={card} w={96} className="drop-shadow-md" />
        <div className="min-w-0 flex-1">{body}</div>
      </div>
      {step.k !== "root" && (
        <button
          onClick={() => setStep({ k: "root" })}
          className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: CHROME_SOFT }}
        >
          ← back
        </button>
      )}
    </Sheet>
  );
}

/* ---------------- payment picker ---------------- */

export function PaymentSheet({
  view,
  you,
  pending,
  now,
  send,
}: {
  view: MonoDealView;
  you: MonoPlayerView;
  pending: PendingView;
  now: number;
  send: (m: MonoDealMove) => void;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  interface PayRow {
    id: string;
    label: string;
    value: number;
    kind: "bank" | "table" | "building";
    color?: MonoColor;
    inSet?: boolean;
  }
  const rows: PayRow[] = [
    ...you.bank.map((c): PayRow => ({
      id: c.id,
      label: c.kind === "money" ? `$${c.value}M note` : c.kind === "action" ? ACTION_META[c.action].label : "Rent card",
      value: c.value,
      kind: "bank",
    })),
    ...you.table
      .filter((t) => t.card.value > 0)
      .map((t): PayRow => ({
        id: t.card.id,
        label: t.card.kind === "property" ? t.card.name : "Wildcard",
        value: t.card.value,
        kind: "table",
        color: t.color,
        inSet: you.completed.includes(t.color),
      })),
    ...you.buildings.map((b): PayRow => ({
      id: b.card.id,
      label: b.card.kind === "action" && b.card.action === "house" ? "House" : "Hotel",
      value: b.card.value,
      kind: "building",
      color: b.color,
    })),
  ];
  const totalAvail = rows.reduce((a, r) => a + r.value, 0);
  const sum = rows.filter((r) => sel.includes(r.id)).reduce((a, r) => a + r.value, 0);
  const covered = sum >= pending.amount || (sel.length === rows.length && rows.length > 0);
  const short = totalAvail < pending.amount;

  return (
    <Sheet open title="Payment due">
      <div className="flex flex-col gap-2">
        <div
          className="flex items-center justify-between rounded-md px-3 py-2"
          style={{ background: `${RED_HI}14`, border: `1px solid ${RED_HI}55` }}
        >
          <span className="text-[12px] font-bold" style={{ color: RED_HI }}>
            {nameOf(view, pending.actor).toUpperCase()} demands ${pending.amount}M
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: CHROME_SOFT }}>
            {pending.kind === "rent" ? `rent · ${pending.color ? COLOR_META[pending.color].label : ""}` : pending.kind.replace("_", " ")}
          </span>
        </div>
        <Countdown deadline={pending.deadline} now={now} total={PAY_MS} tint={RED_HI} />
        {short && (
          <p className="text-[10.5px] italic" style={{ color: CHROME_SOFT }}>
            You can{"'"}t cover it — hand over everything you have (${totalAvail}M). Hand cards are never paid.
          </p>
        )}
        <div className="flex max-h-[38dvh] flex-col gap-1 overflow-y-auto pr-1">
          {rows.map((r) => {
            const on = sel.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => toggle(r.id)}
                className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-all active:scale-[0.99]"
                style={{
                  background: on ? `${GREEN_HI}18` : "rgba(240,234,217,0.07)",
                  borderColor: on ? GREEN_HI : HAIRLINE,
                }}
              >
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-[3px]"
                  style={{ border: `1.5px solid ${on ? GREEN_HI : CHROME_SOFT}`, background: on ? GREEN_HI : "transparent" }}
                >
                  {on && (
                    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
                      <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" fill="none" stroke="#0b100d" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                {r.color && <span className="h-3.5 w-3.5 rounded-[3px]" style={{ background: COLOR_META[r.color].hex }} />}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[12px]" style={{ color: CHROME }}>
                    {r.label}
                  </b>
                  <span className="text-[9px] uppercase tracking-[0.1em]" style={{ color: r.inSet ? RED_HI : CHROME_SOFT }}>
                    {r.kind === "bank" ? "bank" : r.kind === "building" ? "building → their bank" : r.inSet ? "breaks your set!" : "property → their table"}
                  </span>
                </span>
                <b className="text-[12px] tabular-nums" style={{ color: GREEN_HI }}>
                  ${r.value}M
                </b>
              </button>
            );
          })}
          {rows.length === 0 && <Hint>Nothing to pay with.</Hint>}
        </div>
        <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: HAIRLINE }}>
          <span className="text-[11px] font-bold tabular-nums" style={{ color: sum >= pending.amount ? GREEN_HI : CHROME }}>
            selected ${sum}M of ${pending.amount}M
          </span>
          <LedgerButton variant="primary" disabled={!covered} onClick={() => send({ type: "pay", cardIds: sel })}>
            Pay {sel.length > 0 ? `$${sum}M` : ""}
          </LedgerButton>
        </div>
        <p className="text-[9.5px] italic" style={{ color: CHROME_SOFT }}>
          No change is given. On timeout the ledger pays for you: bank first, then cheapest properties.
        </p>
      </div>
    </Sheet>
  );
}

/* ---------------- wildcard rearrange ---------------- */

export function RearrangeSheet({
  entry,
  you,
  canPlay,
  send,
  onClose,
}: {
  entry: TableCard;
  you: MonoPlayerView;
  canPlay: boolean;
  send: (m: MonoDealMove) => void;
  onClose: () => void;
}) {
  if (entry.card.kind !== "wild") return null;
  return (
    <Sheet open onClose={onClose} title="Reassign wildcard">
      {!canPlay && <Hint>Rearranging costs one of your 3 plays — none left.</Hint>}
      <div className="grid grid-cols-2 gap-1.5">
        {entry.card.colors
          .filter((c) => c !== entry.color)
          .map((c) => (
            <Row
              key={c}
              disabled={!canPlay}
              onClick={() => {
                send({ type: "rearrange", moves: [{ cardId: entry.card.id, color: c }] });
                onClose();
              }}
            >
              <span className="h-4 w-4 rounded-[3px]" style={{ background: COLOR_META[c].hex }} />
              <span className="flex flex-col">
                <b className="text-[12px]" style={{ color: CHROME }}>
                  {COLOR_META[c].label}
                </b>
                <span className="text-[9.5px] tabular-nums" style={{ color: CHROME_SOFT }}>
                  you have {you.table.filter((t) => t.color === c).length}/{COLOR_META[c].setSize}
                </span>
              </span>
            </Row>
          ))}
      </div>
      <Hint>Moving a wildcard out of a built set slides its buildings to your bank.</Hint>
    </Sheet>
  );
}

/* ---------------- rules ---------------- */

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] first:mt-0" style={{ color: GREEN_HI }}>
    {children}
  </h3>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-1 text-[12px] leading-relaxed" style={{ color: CHROME }}>
    {children}
  </p>
);

export function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How Monopoly Deal works">
      <div className="pb-2">
        <H>Goal</H>
        <P>Collect 3 completed property sets of different colors. The moment you do, you win.</P>
        <H>Your turn</H>
        <P>
          Draw 2 cards (5 if your hand was empty), then make up to 3 plays: bank a card as money, file a property,
          rearrange your wildcards, or play an action/rent card. End with at most 7 cards in hand.
        </P>
        <H>Money and payments</H>
        <P>
          Debts are paid from your bank and table — never your hand. No change is given. Paid properties join the
          collector{"'"}s table; paid buildings and money go to their bank. If you can{"'"}t cover a debt, you hand over
          everything payable. The all-color wild is worth $0 and can never pay.
        </P>
        <H>Actions</H>
        <P>
          Pass Go draws 2. Debt Collector charges one player $5M; Birthday charges everyone $2M. Rent cards charge for a
          color you own (wild rent picks one player). Double The Rent doubles a rent and costs an extra play — two of
          them quadruple it. Sly Deal steals a lone property, Forced Deal swaps one, and Deal Breaker seizes a whole
          completed set. House (+$3M) and Hotel (+$4M) build on completed street sets.
        </P>
        <H>Just Say No</H>
        <P>
          When an action targets you, you get a window to slam a Just Say No. It can be countered by another Just Say
          No. Windows time out as a decline.
        </P>
        <H>House rules</H>
        <P>
          Extra properties of a completed color are protected with the set. If a built set loses a property, its
          buildings slide to the owner{"'"}s bank as money. After 60 full rounds the richest table wins.
        </P>
      </div>
    </Sheet>
  );
}

/* ---------------- game over ---------------- */

export function GameOverOverlay({
  view,
  party,
  isHost,
  playAgain,
  exitToLobby,
}: {
  view: MonoDealView;
  party: PartyView;
  isHost: boolean;
  playAgain: () => void;
  exitToLobby: () => void;
}) {
  const winner = view.players.find((p) => p.id === view.winner);
  if (!winner) return null;
  const youWon = view.winner === view.youId;
  const tallies = party.tallies.monodeal ?? {};
  const ranked = view.players
    .map((p) => ({ p, wins: tallies[p.id] ?? 0 }))
    .sort((a, b) => b.wins - a.wins);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto p-4"
    >
      <div className="absolute inset-0" style={{ background: "rgba(3,6,4,0.72)", backdropFilter: "blur(3px)" }} />
      <motion.div
        initial={{ y: 26, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md rounded-lg p-5"
        style={{ background: PANEL_SOLID, backgroundImage: GUILLOCHE_DARK, border: `2px solid ${GREEN_HI}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: COPPER_HI }}>
            {view.cappedOut ? "Ledger closed — round cap" : "Ledger closed"}
          </span>
          <span className={archivo.className} style={{ fontSize: 26, color: GREEN_HI }}>
            {winner.name.toUpperCase()}
          </span>
          <span className="text-[12px] font-semibold" style={{ color: CHROME }}>
            {view.cappedOut
              ? `richest table at the cap — $${winner.tableValue}M in property`
              : winner.completed.length >= 3
                ? youWon
                  ? "You closed 3 full sets!"
                  : "closed 3 full sets"
                : youWon
                  ? "Everyone else left — the table is yours"
                  : "last one at the table"}
          </span>
        </div>

        <div className="mt-3 flex justify-center rounded-md p-2" style={{ background: "rgba(240,234,217,0.05)", border: `1px solid ${HAIRLINE}` }}>
          <SetGroups p={winner} mini={36} still />
        </div>

        {ranked.some((r) => r.wins > 0) && (
          <div className="mt-3 flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: CHROME_SOFT }}>
              Deal tallies
            </span>
            {ranked.map(({ p, wins }) => (
              <div key={p.id} className="flex items-center justify-between text-[11.5px]" style={{ color: CHROME }}>
                <span className="font-semibold uppercase">{p.name}</span>
                <span className="tabular-nums" style={{ color: wins > 0 ? GREEN_HI : CHROME_SOFT }}>
                  {wins} win{wins === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-center gap-2">
          {isHost ? (
            <>
              <LedgerButton variant="primary" onClick={playAgain}>
                Play again
              </LedgerButton>
              <LedgerButton onClick={exitToLobby}>Back to lobby</LedgerButton>
            </>
          ) : (
            <span className="text-[11px] italic" style={{ color: CHROME_SOFT }}>
              Waiting for the host…
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** kept for type re-export symmetry */
export type { MonoCard, TableCard };
