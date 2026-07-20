"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Icons } from "@/components/ui";
import type { CoupMove } from "@/lib/games/coup/engine";
import type { ActionType, CoupView } from "@/lib/games/coup/types";
import { ActionDock } from "./ActionDock";
import { CenterStage } from "./CenterStage";
import { ExchangeModal } from "./ExchangeModal";
import { GameOver } from "./GameOver";
import { LogDrawer, LogList } from "./LogDrawer";
import { RulesModal } from "./RulesModal";
import { Seat, seatStatus } from "./Seat";
import { clientResponders } from "./selectors";

export function GameTable({
  v,
  skew,
  move,
  tallies,
  isHost,
  spectating,
  playAgain,
  exitToLobby,
}: {
  v: CoupView;
  skew: number;
  move: (m: CoupMove) => void;
  tallies: Record<string, number>;
  isHost: boolean;
  spectating: boolean;
  playAgain: () => void;
  exitToLobby: () => void;
}) {
  const [targeting, setTargeting] = useState<ActionType | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const you = v.players.find((p) => p.id === v.youId);
  const n = v.players.length;
  const youSeat = you?.seat ?? 0;
  // clockwise around the table, starting to your left
  const opponents = [...v.players]
    .filter((p) => p.id !== v.youId)
    .sort((a, b) => ((a.seat - youSeat + n) % n) - ((b.seat - youSeat + n) % n));

  const responders = clientResponders(v);
  const mustRespond = !spectating && responders.includes(v.youId);

  // while a target is being chosen no other input can change the game state,
  // so targeting mode can only be left via pick or cancel — no reset effect needed
  const yourChoice = !spectating && v.phase === "play" && v.turn === v.youId && !v.pending && !v.lose;

  // flash the tab title when input is needed
  useEffect(() => {
    const needed = yourChoice || mustRespond || v.lose?.player === v.youId;
    document.title = needed ? "● Your move — Coup" : "Coup — PARLOUR";
    return () => {
      document.title = "PARLOUR";
    };
  }, [yourChoice, mustRespond, v.lose, v.youId]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {spectating && (
        <div className="mx-auto mt-2 rounded-full border border-gold-500/30 bg-ink-900/80 px-4 py-1 text-[10px] uppercase tracking-[0.2em] text-parch-500">
          Spectating — you join the next game
        </div>
      )}

      {/* opponents */}
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-start justify-center gap-2.5 px-3 pt-3 sm:gap-4">
        {opponents.map((p) => (
          <Seat
            key={p.id}
            p={p}
            isTurn={v.phase === "play" && v.turn === p.id}
            wins={tallies[p.id] ?? 0}
            status={seatStatus(v, p, responders)}
            targetable={!!targeting && p.alive}
            isTargetOfPending={v.pending?.target === p.id}
            onTarget={
              targeting
                ? () => {
                    move({ move: "action", action: targeting, target: p.id });
                    setTargeting(null);
                  }
                : undefined
            }
          />
        ))}
      </div>

      <CenterStage v={v} skew={skew} respondersLeft={responders} />

      {you && (
        <ActionDock
          v={v}
          move={move}
          mustRespond={mustRespond}
          targeting={targeting}
          setTargeting={setTargeting}
          wins={tallies[v.youId] ?? 0}
        />
      )}

      {/* floating controls (chronicle button only where the sidebar is hidden) */}
      <div className="fixed right-3 top-[70px] z-30 flex flex-col gap-2">
        <button
          onClick={() => setLogOpen(true)}
          className="flex items-center gap-2 border border-gold-500/30 bg-ink-900/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-parch-500 backdrop-blur transition hover:border-gold-400 hover:text-gold-300 rounded-sm lg:hidden"
          aria-label="Open game log"
        >
          <Icons.scroll size={13} />
          <span className="hidden sm:inline">Chronicle</span>
        </button>
        <button
          onClick={() => setRulesOpen(true)}
          className="flex items-center gap-2 border border-gold-500/30 bg-ink-900/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-parch-500 backdrop-blur transition hover:border-gold-400 hover:text-gold-300 rounded-sm"
          aria-label="How to play"
        >
          <Icons.book size={13} />
          <span className="hidden sm:inline">Rules</span>
        </button>
      </div>
      </div>

      {/* the chronicle, always in view on desktop */}
      <aside className="sticky top-0 hidden max-h-dvh w-[270px] shrink-0 flex-col self-start border-l border-gold-500/15 bg-ink-900/40 lg:flex">
        <div className="border-b border-gold-500/10 px-4 py-3">
          <span className="label flex items-center gap-2">
            <Icons.scroll size={12} />
            Chronicle
          </span>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-3">
          <LogList log={v.log} />
        </div>
      </aside>

      <LogDrawer open={logOpen} onClose={() => setLogOpen(false)} log={v.log} />
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      {you && (
        <ExchangeModal key={v.pending?.exchangeDrawn?.map((c) => c.id).join("-") ?? "none"} v={v} move={move} />
      )}
      <AnimatePresence>
        {v.phase === "over" && (
          <GameOver v={v} isHost={isHost} tallies={tallies} playAgain={playAgain} exitToLobby={exitToLobby} />
        )}
      </AnimatePresence>
    </div>
  );
}
