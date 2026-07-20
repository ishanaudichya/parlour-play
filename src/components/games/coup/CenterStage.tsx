"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CardBack } from "./CardArt";
import { ACTION_INFO } from "@/lib/games/coup/meta";
import type { CoupView } from "@/lib/games/coup/types";
import { ACT_MS, CHOOSE_MS, RESPONSE_MS } from "@/lib/games/coup/types";
import { Ch, Nm } from "./logText";

function nameOf(v: CoupView, id?: string) {
  return v.players.find((p) => p.id === id)?.name ?? "…";
}

function banner(v: CoupView): { key: string; node: React.ReactNode; tone: "gold" | "blood" | "calm" } {
  const you = v.youId;
  if (v.phase === "over") {
    return { key: "over", node: <>The dust settles…</>, tone: "gold" };
  }
  if (v.lose) {
    const n = nameOf(v, v.lose.player);
    return {
      key: `lose-${v.lose.player}`,
      node:
        v.lose.player === you ? (
          <>You must surrender an influence</>
        ) : (
          <>
            <Nm>{n}</Nm> must surrender an influence
          </>
        ),
      tone: "blood",
    };
  }
  const p = v.pending;
  if (!p) {
    const yourTurn = v.turn === you;
    return {
      key: `turn-${v.turn}`,
      node: yourTurn ? (
        <>Your move</>
      ) : (
        <>
          <Nm>{nameOf(v, v.turn)}</Nm> is plotting…
        </>
      ),
      tone: yourTurn ? "gold" : "calm",
    };
  }
  const actor = nameOf(v, p.actor);
  const target = p.target ? nameOf(v, p.target) : null;
  if (p.stage === "exchange") {
    return {
      key: "exchange",
      node: (
        <>
          <Nm>{actor}</Nm> is consulting the court deck…
        </>
      ),
      tone: "calm",
    };
  }
  if (p.stage === "block_challenge_window") {
    return {
      key: `bcw-${p.block!.blocker}`,
      node: (
        <>
          <Nm>{nameOf(v, p.block!.blocker)}</Nm> claims the <Ch ch={p.block!.claim} /> to block
        </>
      ),
      tone: "blood",
    };
  }
  if (p.stage === "block_window") {
    if (p.type === "foreign_aid") {
      return {
        key: "bw-fa",
        node: (
          <>
            <Nm>{actor}</Nm> requests foreign aid — any <Ch ch="duke" /> may block
          </>
        ),
        tone: "calm",
      };
    }
    return {
      key: `bw-${p.type}`,
      node: (
        <>
          <Nm>{actor}</Nm>
          {p.type === "steal" ? " moves to steal from " : " targets "}
          <Nm>{target}</Nm> — {target === nameOf(v, you) ? "you" : "they"} may block
        </>
      ),
      tone: "calm",
    };
  }
  // action_window
  const info = ACTION_INFO[p.type];
  return {
    key: `aw-${p.type}-${p.actor}`,
    node: (
      <>
        <Nm>{actor}</Nm> claims the <Ch ch={p.claim!} />
        {" — "}
        {info.label.toLowerCase()}
        {target && (
          <>
            {" on "}
            <Nm>{target}</Nm>
          </>
        )}
      </>
    ),
    tone: "calm",
  };
}

function Countdown({ deadline, skew, total }: { deadline: number; skew: number; total: number }) {
  const [frac, setFrac] = useState(1);
  useEffect(() => {
    const update = () => {
      const remaining = deadline - (Date.now() + skew);
      setFrac(Math.max(0, Math.min(1, remaining / total)));
    };
    update();
    const id = setInterval(update, 150);
    return () => clearInterval(id);
  }, [deadline, skew, total]);
  const urgent = frac < 0.28;
  return (
    <div className="mx-auto mt-3 h-[3px] w-56 overflow-hidden rounded-full bg-ink-600/60 sm:w-72">
      <div
        className="h-full rounded-full transition-[width] duration-150 ease-linear"
        style={{
          width: `${frac * 100}%`,
          background: urgent ? "#dd6374" : "linear-gradient(90deg,#9a7a41,#ecd39a)",
        }}
      />
    </div>
  );
}

export function CenterStage({ v, skew, respondersLeft }: { v: CoupView; skew: number; respondersLeft: string[] }) {
  const b = banner(v);
  const p = v.pending;
  const showWaiting =
    p && !v.lose && p.stage !== "exchange" && respondersLeft.length > 0 && !respondersLeft.includes(v.youId);

  // whichever clock is running: reaction window, or the required act (choose/lose/exchange)
  const windowDeadline = !v.lose && p?.stage !== "exchange" ? p?.deadline : undefined;
  const deadline = v.phase === "play" ? (windowDeadline ?? v.actDeadline) : undefined;
  const total = windowDeadline ? RESPONSE_MS : v.lose || p?.stage === "exchange" ? ACT_MS : CHOOSE_MS;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center py-4 text-center">
      {/* deck */}
      <div className="pointer-events-none absolute left-1 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-1.5 opacity-80 md:flex">
        <div className="relative h-[72px] w-[48px]">
          <CardBack className="absolute left-0 top-0 w-[48px] -rotate-3" />
          <CardBack className="absolute left-[3px] top-[-3px] w-[48px] rotate-2" />
        </div>
        <span className="label !text-[9px]">Deck · {v.deckCount}</span>
      </div>

      <div className="label mb-2">The Court</div>
      <AnimatePresence mode="wait">
        <motion.div
          key={b.key}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`mx-auto max-w-xl px-4 font-display text-xl leading-snug sm:text-2xl ${
            b.tone === "gold" ? "gold-text font-bold" : b.tone === "blood" ? "text-blood-300" : "text-parch-300"
          }`}
        >
          {b.node}
        </motion.div>
      </AnimatePresence>

      {deadline && <Countdown deadline={deadline} skew={skew} total={total} />}

      {showWaiting && (
        <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-parch-500">
          waiting on {respondersLeft.map((id) => nameOf(v, id)).join(", ")}
        </div>
      )}
    </div>
  );
}
