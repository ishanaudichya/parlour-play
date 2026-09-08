"use client";

/* The lobby IS the table, set for game night: place settings around the felt,
   the games spread across the middle like box lids, a reservation card with
   the table code, and a score pad keeping the night's tally. */

import { motion } from "framer-motion";
import { useState } from "react";
import { GAME_UI } from "@/components/games/registry";
import { PaperCard } from "@/components/party/shell";
import { Icons, Medallion } from "@/components/ui";
import { uiClick } from "@/lib/client/synthCore";
import { GAME_META } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";
import { PARTY_MAX, type PartyMove, type PartyView } from "@/lib/party/types";

const GAME_ORDER: GameType[] = [
  "coup",
  "uno",
  "monodeal",
  "teenpatti",
  "mafia",
  "battleship",
  "connect4",
  "avalon",
  "secrethitler",
  "chainreaction",
  "ludo",
];

const EASE = [0.16, 1, 0.3, 1] as const;

/* gentle arc offsets so the seat rows follow the table's curve —
   pure translate within padded rows, so nothing can ever clip */
const TOP_ARC = [14, 0, 0, 14];
const BOTTOM_ARC = [-14, 0, 0, -14];

function PlaceSetting({
  member,
  isHost,
  isYou,
  delay,
}: {
  member: { id: string; name: string; seat: number } | null;
  isHost: boolean;
  isYou: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: EASE }}
      className="flex w-[86px] flex-col items-center"
    >
      {member ? (
        <>
          <span
            className="relative flex h-[62px] w-[62px] items-center justify-center rounded-full"
            style={{
              background: "radial-gradient(circle at 38% 30%, #4a2c1a, #2a1810 70%)",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6), 0 4px 10px rgba(0,0,0,0.45), 0 0 0 2px rgba(212,160,92,0.35)",
            }}
          >
            <Medallion name={member.name} seat={member.seat} size={40} />
            {isHost && (
              <span
                className="absolute -top-1.5 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-[#d4a05c] text-[#241407] shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                title="Host — deals the games"
              >
                <Icons.crown size={11} />
              </span>
            )}
          </span>
          <span
            className={`mt-1.5 max-w-full -rotate-2 truncate px-2 py-[1px] font-hand text-[14px] font-semibold leading-tight shadow-[0_1px_3px_rgba(0,0,0,0.45)] ${
              isYou ? "bg-[#f2e2b8] text-[#6b4a2a]" : "bg-[#efe6cf]/95 text-[#463d2e]"
            }`}
          >
            {member.name}
            {isYou && " (you)"}
          </span>
        </>
      ) : (
        <>
          <span
            className="flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 border-dashed border-[#d4a05c]/30"
            title="An empty chair"
          >
            <span className="font-hand text-[20px] text-[#d4a05c]/40">?</span>
          </span>
          <span className="mt-1.5 rotate-1 px-2 font-hand text-[13px] text-[#e8c087]/45">empty chair</span>
        </>
      )}
    </motion.div>
  );
}

function GameBox({
  type,
  v,
  isHost,
  onStart,
  delay,
}: {
  type: GameType;
  v: PartyView;
  isHost: boolean;
  onStart: () => void;
  delay: number;
}) {
  const meta = GAME_META[type];
  const ui = GAME_UI[type];
  const n = v.members.length;
  const tooFew = n < meta.min;
  const overflow = Math.max(0, n - meta.max);
  const canStart = isHost && !!ui && !tooFew;

  return (
    <motion.button
      type="button"
      disabled={!canStart}
      onClick={() => {
        uiClick();
        onStart();
      }}
      initial={{ opacity: 0, y: 18, rotate: 0 }}
      animate={{ opacity: 1, y: 0, rotate: delay % 2 ? 0.8 : -0.8 }}
      transition={{ delay: 0.15 + delay * 0.06, duration: 0.5, ease: EASE }}
      whileHover={canStart ? { y: -6, rotate: 0, scale: 1.03, transition: { duration: 0.18 } } : undefined}
      whileTap={canStart ? { scale: 0.98 } : undefined}
      className={`group relative flex flex-col overflow-hidden rounded-[6px] text-left shadow-[0_12px_26px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.4)] transition-opacity ${
        canStart ? "cursor-pointer" : "cursor-default"
      } ${!canStart && !tooFew && !isHost ? "" : tooFew || !ui ? "opacity-60 saturate-[0.7]" : ""}`}
      style={{ border: "3px solid #1d120a", outline: "1px solid rgba(212,160,92,0.25)" }}
      title={`${meta.title} — ${meta.tagline}`}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-night-900">
        {ui ? (
          <ui.Poster />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[radial-gradient(circle_at_50%_30%,#241407,#160d07_75%)]">
            <span className="font-shell text-lg" style={{ color: meta.accent }}>
              {meta.title}
            </span>
            <span className="rotate-[-3deg] bg-[#efe6cf]/90 px-2 font-hand text-[13px] font-semibold text-[#6b4a2a]">
              still at the printer&apos;s…
            </span>
          </div>
        )}
        {canStart && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/35">
            <span className="scale-75 rotate-[-6deg] rounded-[4px] border-[2.5px] border-[#f2e2b8] px-4 py-1.5 text-[13px] font-bold uppercase tracking-[0.26em] text-[#f2e2b8] opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-all duration-150 group-hover:scale-100 group-hover:opacity-100">
              Deal it
            </span>
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 bg-[#efe6cf] px-2.5 py-1.5">
        <span className="truncate font-hand text-[15px] font-bold leading-tight text-[#463d2e]">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: meta.accent }} />
          {meta.title}
        </span>
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a7d68]">
          {tooFew ? (
            <span className="text-[#a63c2b]">+{meta.min - n} more</span>
          ) : overflow > 0 ? (
            `first ${meta.max}`
          ) : (
            `${meta.min}–${meta.max}`
          )}
        </span>
      </div>
    </motion.button>
  );
}

export function PartyLobby({
  v,
  move,
  onLeave,
}: {
  v: PartyView;
  move: (m: PartyMove) => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const isHost = v.hostId === v.youId;

  async function copy(kind: "link" | "code") {
    const text = kind === "link" ? `${window.location.origin}/p/${v.code}` : v.code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {}
  }

  const seats: (PartyView["members"][number] | null)[] = [
    ...v.members,
    ...Array(Math.max(0, PARTY_MAX - v.members.length)).fill(null),
  ];
  const talliedGames = GAME_ORDER.filter((g) => Object.keys(v.tallies[g] ?? {}).length > 0);

  const reservation = (
    <motion.div
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mx-auto w-full max-w-[440px]"
    >
      <PaperCard rotate={-1.2} className="px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.26em] text-[#8a7d68]">
              Reserved · table
            </div>
            <div className="font-shell text-[30px] leading-none tracking-[0.3em] text-[#4c331d]">{v.code}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                uiClick();
                void copy("link");
              }}
              className="rounded-[4px] border-[2px] border-[#6b4a2a] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b4a2a] transition hover:bg-[#6b4a2a]/10 active:scale-[0.97]"
            >
              {copied === "link" ? "✓ copied" : "Copy invite"}
            </button>
            <button
              onClick={() => {
                uiClick();
                void copy("code");
              }}
              className="px-1 font-hand text-[15px] font-semibold text-[#8a7d68] transition hover:text-[#6b4a2a]"
            >
              {copied === "code" ? "✓" : "just the code"}
            </button>
          </div>
        </div>
        <div className="mt-2 font-hand text-[15px] text-[#7a6d58]">
          {v.members.length} of {PARTY_MAX} chairs taken
          {v.members.length < 2 && " — the table needs at least one more"}
          {isHost ? " · you're dealing tonight" : " · the host deals"}
        </div>
      </PaperCard>
    </motion.div>
  );

  const scorepad =
    talliedGames.length > 0 ? (
      <PaperCard rotate={1.6} className="w-[210px] px-4 py-3">
        <div className="font-hand text-[19px] font-bold text-[#463d2e]">tonight&apos;s score</div>
        {talliedGames.map((g) => {
          const t = v.tallies[g]!;
          const rows = v.members
            .map((m) => ({ m, w: t[m.id] ?? 0 }))
            .filter((r) => r.w > 0)
            .sort((a, b) => b.w - a.w);
          return (
            <div key={g} className="mt-1.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: GAME_META[g].accent }}>
                {GAME_META[g].title}
              </div>
              {rows.map(({ m, w }) => (
                <div key={m.id} className="flex justify-between font-hand text-[15px] leading-snug text-[#5d5344]">
                  <span>{m.name}</span>
                  <span>{"✓".repeat(Math.min(w, 6))}{w > 6 ? ` ${w}` : ""}</span>
                </div>
              ))}
            </div>
          );
        })}
      </PaperCard>
    ) : null;

  const shelf = (
    <div className="mx-auto grid w-full max-w-[720px] grid-cols-2 gap-3 sm:grid-cols-3">
      {GAME_ORDER.map((g, i) => (
        <GameBox
          key={g}
          type={g}
          v={v}
          isHost={isHost}
          delay={i}
          onStart={() => void move({ kind: "party", action: "start_game", game: g })}
        />
      ))}
    </div>
  );

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col px-2 pb-2 sm:px-4 sm:pb-4">
        <div className="relative flex flex-1 flex-col pt-4 sm:pt-6">
          {reservation}

          {/* desktop: seat rows arc above and below the shelf — flow layout, nothing clips */}
          <div className="mx-auto mt-3 hidden w-full max-w-[1100px] flex-col lg:flex">
            <div className="flex items-start justify-center gap-8 px-6 pb-1 pt-2 xl:gap-14">
              {seats.slice(0, 4).map((m, i) => (
                <div key={m?.id ?? `top-${i}`} style={{ transform: `translateY(${TOP_ARC[i]}px)` }}>
                  <PlaceSetting
                    member={m}
                    isHost={!!m && m.id === v.hostId}
                    isYou={!!m && m.id === v.youId}
                    delay={0.1 + i * 0.05}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-6 px-6 py-7">
              {shelf}
              {scorepad && <div className="hidden shrink-0 self-end xl:block">{scorepad}</div>}
            </div>

            <div className="flex items-start justify-center gap-8 px-6 pb-4 xl:gap-14">
              {seats.slice(4, PARTY_MAX).map((m, i) => (
                <div key={m?.id ?? `bottom-${i}`} style={{ transform: `translateY(${BOTTOM_ARC[i]}px)` }}>
                  <PlaceSetting
                    member={m}
                    isHost={!!m && m.id === v.hostId}
                    isYou={!!m && m.id === v.youId}
                    delay={0.3 + i * 0.05}
                  />
                </div>
              ))}
            </div>

            {scorepad && <div className="flex justify-center pb-4 xl:hidden">{scorepad}</div>}
          </div>

          {/* mobile: stacked */}
          <div className="mt-5 flex flex-col gap-5 lg:hidden">
            <div className="flex flex-wrap items-start justify-center gap-x-1 gap-y-3 px-2">
              {seats.slice(0, PARTY_MAX).map((m, i) => (
                <PlaceSetting
                  key={m?.id ?? `empty-${i}`}
                  member={m}
                  isHost={!!m && m.id === v.hostId}
                  isYou={!!m && m.id === v.youId}
                  delay={0.08 + i * 0.04}
                />
              ))}
            </div>
            <div className="px-2">{shelf}</div>
            {scorepad && <div className="flex justify-center pb-2">{scorepad}</div>}
          </div>

          <button
            onClick={onLeave}
            className="mx-auto mb-3 mt-4 font-hand text-[15px] text-[#e8c087]/50 transition hover:text-[#e0556d]"
          >
            ✗ leave the table
          </button>
        </div>
      </div>
    </main>
  );
}
