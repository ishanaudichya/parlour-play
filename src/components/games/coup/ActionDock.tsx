"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CardFace } from "./CardArt";
import { Button, CoinCount, Icons, Medallion } from "@/components/ui";
import type { CoupMove } from "@/lib/games/coup/engine";
import { ACTION_INFO, CHARACTER_INFO } from "@/lib/games/coup/meta";
import type { ActionType, Character, CoupView } from "@/lib/games/coup/types";

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
}: {
  action: ActionType;
  you: { coins: number };
  yourTurn: boolean;
  held: boolean;
  onPick: () => void;
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
      className={`group relative flex flex-col items-center justify-center gap-1 border px-2 py-3 transition-all duration-150 active:scale-[0.97] disabled:opacity-30 rounded-sm
        ${action === "coup" ? "border-blood-500/50 hover:border-blood-400 hover:bg-blood-500/10" : "border-gold-500/30 hover:border-gold-400 hover:bg-gold-500/10"}`}
      style={tint ? { borderColor: `${tint.color}66` } : undefined}
    >
      {held && (
        <span
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold-300 shadow-[0_0_6px_#ecd39a]"
          title="You hold this card"
        />
      )}
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-parch-100">{info.label}</span>
      <span className="text-[9.5px] uppercase tracking-[0.12em]" style={{ color: tint ? tint.bright : "#a89d84" }}>
        {claim
          ? `${CHARACTER_INFO[claim].name}${info.cost ? " · pay 3" : ""}`
          : action === "coup"
            ? "pay 7"
            : action === "income"
              ? "+1 coin"
              : "+2 coins"}
      </span>
    </button>
  );
}

export function ActionDock({
  v,
  move,
  mustRespond,
  targeting,
  setTargeting,
  wins,
}: {
  v: CoupView;
  move: (m: CoupMove) => void;
  mustRespond: boolean;
  targeting: ActionType | null;
  setTargeting: (a: ActionType | null) => void;
  wins: number;
}) {
  const you = v.players.find((p) => p.id === v.youId)!;
  const yourCards = you.cards;
  const heldChars = new Set(yourCards.filter((c) => !c.revealed).map((c) => c.ch));
  const mustLose = v.lose?.player === v.youId;
  const pend = v.pending;
  const yourTurn = v.phase === "play" && v.turn === v.youId && !pend && !v.lose && you.alive;

  const pickAction = (a: ActionType) => {
    if (ACTION_INFO[a].needsTarget) {
      setTargeting(a);
    } else {
      move({ move: "action", action: a });
    }
  };

  const blockOptions: Character[] =
    pend && pend.stage === "block_window" ? (ACTION_INFO[pend.type].blockedBy as Character[]) : [];

  return (
    <div className="relative z-10 mx-auto w-full max-w-4xl px-3 pb-[max(14px,env(safe-area-inset-bottom))]">
      <div className="relative border border-gold-500/25 bg-[#120e18]/90 p-4 backdrop-blur-sm sm:p-6 rounded-md">
        <div className="flex items-stretch gap-4 sm:gap-7">
          {/* your cards */}
          <div className="flex shrink-0 gap-2.5">
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
                  className={`relative w-[76px] sm:w-[100px] rounded-md ${
                    clickable ? "cursor-pointer animate-target-pulse" : ""
                  }`}
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

          {/* context area */}
          <div className="flex min-w-0 flex-1 flex-col min-h-[120px]">
            <div className="mb-3 flex items-center gap-2.5">
              <Medallion name={you.name} seat={you.seat} size={26} dim={!you.alive} />
              <span className="truncate text-sm font-semibold text-parch-100">{you.name}</span>
              {wins > 0 && <span className="text-[11px] font-semibold text-gold-600">♛{wins}</span>}
              <span className="ml-auto">
                <YourCoins n={you.coins} />
              </span>
            </div>

            {/* ------- states ------- */}
            {!you.alive ? (
              <div className="flex flex-1 items-center justify-center text-center text-[13px] italic text-parch-500">
                You are out of the game — spectating the endgame.
              </div>
            ) : mustLose ? (
              <div className="flex flex-1 items-center justify-center text-center font-display text-lg text-blood-300">
                Tap a card to surrender it
              </div>
            ) : targeting ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2">
                <div className="text-center font-display text-lg text-gold-300">
                  Choose a target to {ACTION_INFO[targeting].label.toLowerCase()}
                </div>
                <Button variant="ghost" onClick={() => setTargeting(null)} className="!py-1">
                  Cancel
                </Button>
              </div>
            ) : mustRespond && pend ? (
              <div className="flex flex-1 flex-col justify-center gap-2">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button onClick={() => move({ move: "respond", response: "pass" })} className="px-5">
                    Allow
                  </Button>
                  {(pend.stage === "action_window" || pend.stage === "block_challenge_window") && (
                    <Button
                      variant="danger"
                      onClick={() => move({ move: "respond", response: "challenge" })}
                      className="px-5"
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
                          className="relative px-4"
                          style={{ borderColor: `${info.color}99`, color: info.bright }}
                        >
                          <Icons.shield size={14} />
                          Block as {info.name}
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
                      : "block the action, or let it happen"}
                </div>
              </div>
            ) : pend && pend.stage === "exchange" && pend.actor === v.youId ? (
              <div className="flex flex-1 items-center justify-center text-center text-[13px] text-parch-300">
                Choosing cards…
              </div>
            ) : pend || v.lose ? (
              <div className="flex flex-1 items-center justify-center text-center text-[13px] italic text-parch-500">
                {pend?.passed.includes(v.youId) ? "You allowed it — waiting on the court…" : "Waiting on the court…"}
              </div>
            ) : (
              <div
                className={`grid flex-1 content-center grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-2.5 ${
                  yourTurn ? "" : "opacity-45"
                }`}
              >
                {(["income", "foreign_aid", "tax", "steal", "exchange", "assassinate", "coup"] as ActionType[]).map(
                  (a) => (
                    <ActionButton
                      key={a}
                      action={a}
                      you={you}
                      yourTurn={yourTurn}
                      held={!!ACTION_INFO[a].claim && heldChars.has(ACTION_INFO[a].claim!)}
                      onPick={() => pickAction(a)}
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
