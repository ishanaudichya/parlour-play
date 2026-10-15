"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CardFace } from "./CardArt";
import { Button, CoinCount, Icons, Medallion } from "@/components/ui";
import type { CoupMove } from "@/lib/games/coup/engine";
import { ACTION_INFO, CHARACTER_INFO } from "@/lib/games/coup/meta";
import type { ActionType, Character, CoupView } from "@/lib/games/coup/types";
import type { TableLayout } from "./layout";

function YourCoins({ n }: { n: number }) {
  const prev = useRef(n);
  const [delta, setDelta] = useState<{ v: number; key: number } | null>(null);
  useEffect(() => {
    if (n !== prev.current) {
      setDelta({ v: n - prev.current, key: Date.now() });
      prev.current = n;
      const id = setTimeout(() => setDelta(null), 1100);
      return () => clearTimeout(id);
    }
  }, [n]);
  return (
    <span className="relative inline-flex">
      <CoinCount n={n} size="lg" />
      <AnimatePresence>
        {delta && (
          <motion.span
            key={delta.key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: -18 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className={`absolute -right-1 -top-1 text-sm font-bold ${delta.v > 0 ? "text-gold-300" : "text-blood-400"}`}
          >
            {delta.v > 0 ? `+${delta.v}` : delta.v}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function ActionButton({
  action,
  you,
  yourTurn,
  held,
  onPick,
  roomy,
  phone,
  className = "",
}: {
  action: ActionType;
  you: { coins: number };
  yourTurn: boolean;
  held: boolean;
  onPick: () => void;
  roomy: boolean;
  phone: boolean;
  className?: string;
}) {
  const info = ACTION_INFO[action];
  const forced = you.coins >= 10;
  let disabled = !yourTurn;
  let reason = "";
  if (info.cost > you.coins) {
    disabled = true;
    reason = `needs ${info.cost} coins`;
  }
  if (forced && action !== "coup") {
    disabled = true;
    reason = "10+ coins: you must coup";
  }
  const claim = info.claim;
  const tint = claim ? CHARACTER_INFO[claim] : null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      title={reason || info.blurb}
      className={`group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-sm border text-center transition-all duration-150 active:scale-[0.97] disabled:opacity-30
        ${phone ? "px-1 py-2" : roomy ? "px-2.5 py-4" : "px-2 py-3"}
        ${action === "coup" ? "border-blood-500/50 hover:border-blood-400 hover:bg-blood-500/10" : "border-gold-500/30 hover:border-gold-400 hover:bg-gold-500/10"} ${className}`}
      style={tint ? { borderColor: `${tint.color}66` } : undefined}
    >
      {held && (
        <span
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold-300 shadow-[0_0_6px_#ecd39a]"
          title="You hold this card"
        />
      )}
      <span
        className={`font-semibold uppercase leading-tight text-parch-100 ${
          phone ? "text-[10.5px] tracking-[0.08em]" : roomy ? "text-[12.5px] tracking-[0.12em]" : "text-[11px] tracking-[0.1em]"
        }`}
      >
        {info.label}
      </span>
      <span
        className={`uppercase leading-tight ${phone ? "text-[9px] tracking-[0.08em]" : "text-[9.5px] tracking-[0.12em]"}`}
        style={{ color: tint ? tint.bright : "#a89d84" }}
      >
        {claim
          ? `${CHARACTER_INFO[claim].name}${info.cost ? " · pay 3" : ""}`
          : action === "coup"
            ? "pay 7"
            : action === "income"
              ? "+1 coin"
              : "+2 coins"}
      </span>
      {roomy && <span className="mt-1 text-[11px] leading-snug text-parch-500">{info.blurb}</span>}
    </button>
  );
}

const ACTIONS: ActionType[] = ["income", "foreign_aid", "tax", "steal", "exchange", "assassinate", "coup"];

export function ActionDock({
  v,
  move,
  mustRespond,
  targeting,
  setTargeting,
  wins,
  L,
}: {
  v: CoupView;
  move: (m: CoupMove) => void;
  mustRespond: boolean;
  targeting: ActionType | null;
  setTargeting: (a: ActionType | null) => void;
  wins: number;
  L: TableLayout;
}) {
  const you = v.players.find((p) => p.id === v.youId)!;
  const yourCards = you.cards;
  const heldChars = new Set(yourCards.filter((c) => !c.revealed).map((c) => c.ch));
  const mustLose = v.lose?.player === v.youId;
  const pend = v.pending;
  const yourTurn = v.phase === "play" && v.turn === v.youId && !pend && !v.lose && you.alive;
  const { phone, yc } = L;

  const pickAction = (a: ActionType) => {
    if (ACTION_INFO[a].needsTarget) {
      setTargeting(a);
    } else {
      move({ move: "action", action: a });
    }
  };

  const blockOptions: Character[] =
    pend && pend.stage === "block_window" ? (ACTION_INFO[pend.type].blockedBy as Character[]) : [];

  const bigText = phone ? "text-[15px]" : yc > 120 ? "text-xl" : "text-lg";

  /* reaction buttons: one row of equal columns across the controls (never a
     ragged wrap), tall enough to hit; "Block as …" shortens when columns are narrow */
  const dockGutter = L.dockW > 1000 ? 28 : 20;
  const ctxW = phone ? L.dockW - 2 * L.dockPad : L.dockW - 2 * L.dockPad - 2 * yc - 10 - dockGutter;
  const canChallenge = !!pend && (pend.stage === "action_window" || pend.stage === "block_challenge_window");
  const reactN = 1 + (canChallenge ? 1 : 0) + blockOptions.length;
  const reactGap = phone ? 6 : 10;
  const reactW = phone ? ctxW : Math.min(ctxW, reactN * 240);
  const reactColW = (reactW - (reactN - 1) * reactGap) / reactN;
  const reactFont = !phone && yc > 120 ? 12 : 11;
  const longestBlock = Math.max(0, ...blockOptions.map((ch) => `Block as ${CHARACTER_INFO[ch].name}`.length));
  // label + shield icon + gap + padding
  const longBlock = !phone && reactColW >= longestBlock * reactFont * 0.82 + 52;
  const reactCls = `w-full !px-2 ${phone ? "h-11 !tracking-[0.1em]" : yc > 120 ? "h-14 !text-[12px]" : "h-12"}`;

  /* ------- the state-dependent controls ------- */
  let body: React.ReactNode;
  if (!you.alive) {
    body = (
      <div className="flex flex-1 items-center justify-center text-center text-[13px] italic text-parch-500">
        You are out of the game — spectating the endgame.
      </div>
    );
  } else if (mustLose) {
    body = (
      <div className={`flex flex-1 items-center justify-center text-center font-display text-blood-300 ${bigText}`}>
        Tap a card to surrender it
      </div>
    );
  } else if (targeting) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <div className={`text-center font-display text-gold-300 ${bigText}`}>
          Choose a target to {ACTION_INFO[targeting].label.toLowerCase()}
        </div>
        <Button variant="ghost" onClick={() => setTargeting(null)} className="!py-1">
          Cancel
        </Button>
      </div>
    );
  } else if (mustRespond && pend) {
    body = (
      <div className="flex flex-1 flex-col justify-center gap-2.5">
        <div
          className="mx-auto grid w-full"
          style={{ gap: reactGap, maxWidth: reactW, gridTemplateColumns: `repeat(${reactN}, minmax(0, 1fr))` }}
        >
          <Button
            onClick={() => move({ move: "respond", response: "pass" })}
            className={reactCls}
          >
            Allow
          </Button>
          {canChallenge && (
            <Button
              variant="danger"
              onClick={() => move({ move: "respond", response: "challenge" })}
              className={reactCls}
            >
              <Icons.swords size={14} />
              Challenge
            </Button>
          )}
          {pend.stage === "block_window" &&
            blockOptions.map((ch) => {
              const info = CHARACTER_INFO[ch];
              return (
                <Button
                  key={ch}
                  variant="outline"
                  onClick={() => move({ move: "respond", response: "block", character: ch })}
                  className={`relative ${reactCls}`}
                  style={{ borderColor: `${info.color}99`, color: info.bright }}
                >
                  <Icons.shield size={14} />
                  {longBlock ? `Block as ${info.name}` : info.name}
                  {heldChars.has(ch) && (
                    <span
                      className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-gold-300 shadow-[0_0_6px_#ecd39a]"
                      title="You hold this card"
                    />
                  )}
                </Button>
              );
            })}
        </div>
        <div className="text-center text-[10.5px] uppercase tracking-[0.16em] text-parch-500">
          {pend.stage === "action_window"
            ? "challenge if you think it's a bluff"
            : pend.stage === "block_challenge_window"
              ? "challenge the block, or let it stand"
              : phone
                ? "block it, or let it happen"
                : "block the action, or let it happen"}
        </div>
      </div>
    );
  } else if (pend && pend.stage === "exchange" && pend.actor === v.youId) {
    body = (
      <div className="flex flex-1 items-center justify-center text-center text-[13px] text-parch-300">
        Choosing cards…
      </div>
    );
  } else if (pend || v.lose) {
    body = (
      <div className="flex flex-1 items-center justify-center text-center text-[13px] italic text-parch-500">
        {pend?.passed.includes(v.youId) ? "You allowed it — waiting on the court…" : "Waiting on the court…"}
      </div>
    );
  } else {
    // 7 in a row when there's room; otherwise 4 + 3, each row filling the width
    body = (
      <div
        className={`grid flex-1 content-center ${L.actionCols === 7 ? "grid-cols-7 gap-2.5" : "grid-cols-12 gap-1.5 sm:gap-2"} ${
          yourTurn ? "" : "opacity-45"
        }`}
      >
        {ACTIONS.map((a, i) => (
          <ActionButton
            key={a}
            action={a}
            you={you}
            yourTurn={yourTurn}
            held={!!ACTION_INFO[a].claim && heldChars.has(ACTION_INFO[a].claim!)}
            onPick={() => pickAction(a)}
            roomy={L.roomy}
            phone={phone}
            className={L.actionCols === 7 ? "" : i < 4 ? "col-span-3" : "col-span-4"}
          />
        ))}
      </div>
    );
  }

  const hand = (
    <div className="flex shrink-0" style={{ gap: phone ? 8 : 10 }}>
      {yourCards.map((c) => {
        const clickable = mustLose && !c.revealed;
        return (
          <motion.button
            key={c.id}
            type="button"
            disabled={!clickable}
            onClick={() => move({ move: "lose", cardId: c.id })}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            whileHover={clickable ? { y: -6 } : undefined}
            style={{ width: yc }}
            className={`relative rounded-md ${clickable ? "cursor-pointer animate-target-pulse" : ""}`}
          >
            {c.ch ? (
              <CardFace
                ch={c.ch}
                className={`h-auto w-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.5)] ${
                  c.revealed ? "opacity-40 saturate-[0.35]" : ""
                }`}
              />
            ) : null}
            {c.revealed && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="h-[2px] w-[130%] -rotate-45 bg-blood-500/80" />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );

  const nameRow = (
    <div className="flex items-center gap-2.5">
      <Medallion name={you.name} seat={you.seat} size={phone ? 24 : yc > 120 ? 32 : 26} dim={!you.alive} />
      <span className={`truncate font-semibold text-parch-100 ${yc > 120 ? "text-base" : "text-sm"}`}>{you.name}</span>
      {wins > 0 && <span className="text-[11px] font-semibold text-gold-600">♛{wins}</span>}
      <span className="ml-auto">
        <YourCoins n={you.coins} />
      </span>
    </div>
  );

  return (
    <div
      className="relative z-10 mx-auto w-full shrink-0"
      style={{
        maxWidth: L.dockW + 2 * L.padX,
        paddingLeft: L.padX,
        paddingRight: L.padX,
        paddingBottom: `max(${phone ? 8 : 12}px, env(safe-area-inset-bottom))`,
      }}
    >
      <div
        className="relative rounded-md border border-gold-500/25 bg-[#120e18]/90 backdrop-blur-sm"
        style={{ padding: L.dockPad }}
      >
        {phone ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-stretch gap-3">
              {hand}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                {nameRow}
                {/* the hand is small here: name the influence you hold */}
                <div className="flex flex-wrap gap-1">
                  {yourCards.map((c) =>
                    c.ch ? (
                      <span
                        key={c.id}
                        className={`rounded-full border px-2 py-[1px] text-[9px] font-semibold uppercase tracking-[0.12em] ${
                          c.revealed ? "line-through opacity-40" : ""
                        }`}
                        style={{
                          color: CHARACTER_INFO[c.ch].bright,
                          borderColor: `${CHARACTER_INFO[c.ch].color}88`,
                          background: `${CHARACTER_INFO[c.ch].deep}cc`,
                        }}
                      >
                        {CHARACTER_INFO[c.ch].name}
                      </span>
                    ) : null
                  )}
                </div>
              </div>
            </div>
            <div className="flex min-h-[110px] flex-col">{body}</div>
          </div>
        ) : (
          <div className="flex items-stretch" style={{ gap: L.dockW > 1000 ? 28 : 20 }}>
            {hand}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {nameRow}
              {body}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
