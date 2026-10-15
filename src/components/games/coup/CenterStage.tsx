"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CardBack, CardFace } from "./CardArt";
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

function Countdown({ deadline, skew, total, wide }: { deadline: number; skew: number; total: number; wide: boolean }) {
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
    <div className={`mx-auto mt-3 h-[3px] overflow-hidden rounded-full bg-ink-600/60 ${wide ? "w-80" : "w-56 sm:w-72"}`}>
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

export function CenterStage({
  v,
  skew,
  respondersLeft,
  banner: size,
  deckW,
  claimW,
}: {
  v: CoupView;
  skew: number;
  respondersLeft: string[];
  /** headline size in px, from the table layout */
  banner: number;
  /** court-deck card width; 0 hides the art (the count moves into the label) */
  deckW: number;
  /** claimed-character card width; 0 when the court has no room for it */
  claimW: number;
}) {
  const b = banner(v);
  const p = v.pending;
  const showWaiting =
    p && !v.lose && p.stage !== "exchange" && respondersLeft.length > 0 && !respondersLeft.includes(v.youId);

  // whichever clock is running: reaction window, or the required act (choose/lose/exchange)
  const windowDeadline = !v.lose && p?.stage !== "exchange" ? p?.deadline : undefined;
  const deadline = v.phase === "play" ? (windowDeadline ?? v.actDeadline) : undefined;
  const total = windowDeadline ? RESPONSE_MS : v.lose || p?.stage === "exchange" ? ACT_MS : CHOOSE_MS;
  const dw = Math.round(Math.max(40, deckW));
  // the character on trial: the action's claim, or the block's
  const claim =
    v.phase === "play" && p && !v.lose
      ? p.stage === "block_challenge_window"
        ? p.block?.claim
        : p.stage === "action_window"
          ? p.claim
          : undefined
      : undefined;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-3 py-3 text-center">
      {/* deck */}
      {deckW > 0 && (
        <div className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-1.5 opacity-80" style={{ left: 16 }}>
          <div className="relative" style={{ width: dw, height: dw * 1.5 }}>
            <CardBack className="absolute left-0 top-0 h-auto w-full -rotate-3" />
            <CardBack className="absolute left-[3px] top-[-3px] h-auto w-full rotate-2" />
          </div>
          <span className="label !text-[9px]">Deck · {v.deckCount}</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {claim && claimW > 0 && (
          <motion.div
            key={`${claim}-${p?.stage}`}
            initial={{ opacity: 0, y: -14, rotate: -4, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, rotate: -2, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="mb-3 shrink-0"
            style={{ width: claimW }}
            title="The claimed character"
          >
            <CardFace ch={claim} className="h-auto w-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)]" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="label mb-2">
        The Court
        {!deckW && <span className="text-parch-500/70"> · deck {v.deckCount}</span>}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={b.key}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ fontSize: size, maxWidth: Math.max(320, size * 26) }}
          className={`mx-auto px-4 font-display leading-snug ${
            b.tone === "gold" ? "gold-text font-bold" : b.tone === "blood" ? "text-blood-300" : "text-parch-300"
          }`}
        >
          {b.node}
        </motion.div>
      </AnimatePresence>

      {deadline && <Countdown deadline={deadline} skew={skew} total={total} wide={size > 26} />}

      {showWaiting && (
        <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-parch-500">
          waiting on {respondersLeft.map((id) => nameOf(v, id)).join(", ")}
        </div>
      )}
    </div>
  );
}
