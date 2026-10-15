"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { PartyMenu } from "@/components/party/PartyMenu";
import { Icons } from "@/components/ui";
import type { CoupMove } from "@/lib/games/coup/engine";
import type { ActionType, CoupView } from "@/lib/games/coup/types";
import { ActionDock } from "./ActionDock";
import { CenterStage } from "./CenterStage";
import { ExchangeModal } from "./ExchangeModal";
import { GameOver } from "./GameOver";
import { useBox } from "@/lib/client/useBox";
import { tableLayout } from "./layout";
import { LogDrawer, LogList } from "./LogDrawer";
import { RulesModal } from "./RulesModal";
import { Seat, seatStatus } from "./Seat";
import { clientResponders } from "./selectors";

const TOOL_BTN =
  "flex h-8 items-center gap-2 rounded-sm border border-gold-500/30 bg-ink-900/70 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-parch-500 transition hover:border-gold-400 hover:text-gold-300 sm:px-3";

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
  const [tableRef, box] = useBox<HTMLElement>("border");

  const you = v.players.find((p) => p.id === v.youId);
  const n = v.players.length;
  const youSeat = you?.seat ?? 0;
  // clockwise around the table, starting to your left
  const opponents = [...v.players]
    .filter((p) => p.id !== v.youId)
    .sort((a, b) => ((a.seat - youSeat + n) % n) - ((b.seat - youSeat + n) % n));

  // spectators have no hand: no dock, so the seats get its room
  const L = tableLayout(box.w, box.h, opponents.length, !!you);

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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* toolbar — the game's own, with the Parlour menu at the far right. It
          sits above the game-over and exchange overlays (z-40/44) so the menu —
          the only way to invite, leave or end the game — is never covered. */}
      <header className="relative z-[45] flex shrink-0 items-center gap-3 border-b border-gold-500/15 bg-ink-950/30 px-3 pb-2 pt-[max(8px,env(safe-area-inset-top))] sm:px-4">
        <span className="font-display text-[15px] font-bold tracking-[0.34em] gold-text">COUP</span>
        {spectating && (
          <span className="truncate rounded-full border border-gold-500/30 px-2.5 py-[3px] text-[9px] uppercase tracking-[0.12em] text-parch-500 sm:tracking-[0.18em]">
            <span className="sm:hidden">Watching</span>
            <span className="hidden sm:inline">Spectating — you join the next game</span>
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button onClick={() => setLogOpen(true)} className={`${TOOL_BTN} lg:hidden`} aria-label="Open game log">
            <Icons.scroll size={13} />
            <span className="hidden sm:inline">Chronicle</span>
          </button>
          <button onClick={() => setRulesOpen(true)} className={TOOL_BTN} aria-label="How to play">
            <Icons.book size={13} />
            <span className="hidden sm:inline">Rules</span>
          </button>
          <PartyMenu className="text-gold-300" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main ref={tableRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* opponents */}
          <div
            className="mx-auto flex w-full flex-wrap items-start justify-center"
            style={{
              gap: L.seatGap,
              paddingLeft: L.padX,
              paddingRight: L.padX,
              paddingTop: L.phone ? 12 : 18,
              maxWidth: L.cols * L.seatW + (L.cols - 1) * L.seatGap + 2 * L.padX,
            }}
          >
            {opponents.map((p) => (
              <Seat
                key={p.id}
                p={p}
                width={L.seatW}
                cardW={L.ow}
                phone={L.phone}
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

          <CenterStage
            v={v}
            skew={skew}
            respondersLeft={responders}
            banner={L.banner}
            deckW={L.phone ? 0 : L.ow * 0.62}
            claimW={L.claimW}
          />

          {you && (
            <ActionDock
              v={v}
              move={move}
              mustRespond={mustRespond}
              targeting={targeting}
              setTargeting={setTargeting}
              wins={tallies[v.youId] ?? 0}
              L={L}
            />
          )}
        </main>

        {/* the chronicle, always in view on desktop */}
        <aside className="hidden min-h-0 w-[clamp(250px,19vw,320px)] shrink-0 flex-col border-l border-gold-500/15 bg-ink-900/40 lg:flex">
          <div className="border-b border-gold-500/10 px-4 py-3">
            <span className="label flex items-center gap-2">
              <Icons.scroll size={12} />
              Chronicle
            </span>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <LogList log={v.log} />
          </div>
        </aside>
      </div>

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
