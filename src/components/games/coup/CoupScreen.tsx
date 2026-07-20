"use client";

import { useEffect, useRef } from "react";
import { sfx, type SfxName } from "@/lib/client/sound";
import type { CoupMove } from "@/lib/games/coup/engine";
import type { CoupView, LogEntry } from "@/lib/games/coup/types";
import type { GameScreenProps } from "@/lib/party/types";
import { GameTable } from "./GameTable";

const LOG_SFX: Partial<Record<LogEntry["kind"], SfxName>> = {
  start: "start",
  income: "coin",
  foreign_aid: "whoosh",
  tax: "whoosh",
  steal: "whoosh",
  exchange: "whoosh",
  exchange_done: "deal",
  coup: "thud",
  assassinate: "dagger",
  block: "block",
  challenge: "challenge",
  lose_influence: "lose",
  eliminated: "eliminated",
  steal_resolved: "coins",
  tax_resolved: "coins",
  foreign_aid_resolved: "coins",
};

function playDiff(prev: CoupView | null, next: CoupView) {
  if (!prev) return;
  const lastSeen = prev.log.length ? prev.log[prev.log.length - 1].i : 0;
  const fresh = next.log.filter((l) => l.i > lastSeen);
  const played = new Set<SfxName>();
  for (const l of fresh) {
    if (l.kind === "win") {
      sfx(next.winner === next.youId ? "win" : "defeat");
      played.add("win");
      continue;
    }
    const s = LOG_SFX[l.kind];
    if (s && !played.has(s)) {
      sfx(s);
      played.add(s);
    }
  }
  const becameMyTurn =
    next.phase === "play" &&
    next.turn === next.youId &&
    !next.pending &&
    !next.lose &&
    (prev.turn !== prev.youId || prev.pending !== null || prev.lose !== null || prev.phase !== "play");
  const mustRespond = next.lose?.player === next.youId && prev.lose?.player !== next.youId;
  if (becameMyTurn || mustRespond) {
    sfx("turn");
    try {
      navigator.vibrate?.(60);
    } catch {}
  }
}

export function CoupScreen({
  view,
  party,
  isHost,
  skew,
  spectating,
  move,
  playAgain,
  exitToLobby,
}: GameScreenProps<CoupView>) {
  const prevRef = useRef<CoupView | null>(null);
  useEffect(() => {
    playDiff(prevRef.current, view);
    prevRef.current = view;
  }, [view]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{
        background:
          "radial-gradient(1100px 700px at 50% -12%, #221a30 0%, rgba(34,26,48,0) 60%), radial-gradient(900px 600px at 85% 110%, #1a1226 0%, rgba(26,18,38,0) 55%), linear-gradient(180deg, #0d0a13 0%, #080609 100%)",
      }}
    >
      <GameTable
        v={view}
        skew={skew}
        move={(m: CoupMove) => move(m)}
        tallies={party.tallies.coup ?? {}}
        isHost={isHost}
        spectating={spectating}
        playAgain={playAgain}
        exitToLobby={exitToLobby}
      />
    </div>
  );
}
