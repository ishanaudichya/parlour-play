"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { GAME_UI } from "@/components/games/registry";
import { SButton, SPanel } from "@/components/party/shell";
import { Icons, Medallion } from "@/components/ui";
import { GAME_META } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";
import { PARTY_MAX, type PartyMove, type PartyView } from "@/lib/party/types";

const GAME_ORDER: GameType[] = ["coup", "uno", "monodeal", "teenpatti", "mafia", "battleship", "connect4"];

function GameCard({
  type,
  v,
  isHost,
  onStart,
}: {
  type: GameType;
  v: PartyView;
  isHost: boolean;
  onStart: () => void;
}) {
  const meta = GAME_META[type];
  const ui = GAME_UI[type];
  const n = v.members.length;
  const tooFew = n < meta.min;
  const overflow = Math.max(0, n - meta.max);
  const available = !!ui;
  const canStart = isHost && available && !tooFew;

  return (
    <motion.button
      type="button"
      disabled={!canStart}
      onClick={onStart}
      whileHover={canStart ? { y: -4 } : undefined}
      whileTap={canStart ? { scale: 0.98 } : undefined}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border text-left transition-colors ${
        canStart
          ? "cursor-pointer border-night-600 hover:border-coral-400/70"
          : "cursor-default border-night-600/50 opacity-70"
      }`}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-night-900">
        {ui ? (
          <ui.Poster />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <span className="font-shell text-xl font-semibold" style={{ color: meta.accent }}>
              {meta.title}
            </span>
            <span className="slabel !text-[9px]">Coming soon</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-night-600/70 bg-night-800/90 px-3 py-2.5">
        <div>
          <div className="text-[13px] font-semibold text-linen-100">{meta.title}</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-linen-500">{meta.tagline}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.14em] text-linen-500">
            {meta.min}–{meta.max}
          </div>
          {tooFew ? (
            <div className="text-[10px] text-blood-400">need {meta.min - n} more</div>
          ) : overflow > 0 ? (
            <div className="text-[10px] text-coral-300">first {meta.max} play</div>
          ) : (
            <div className="text-[10px] text-linen-500">{n} ready</div>
          )}
        </div>
      </div>
      {canStart && (
        <span className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
          <span className="translate-y-[-100%] rounded-b-lg bg-coral-400 px-3 py-[3px] text-[9px] font-bold uppercase tracking-[0.2em] text-night-950 transition-transform duration-200 group-hover:translate-y-0">
            Deal us in
          </span>
        </span>
      )}
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

  const talliedGames = GAME_ORDER.filter((g) => Object.keys(v.tallies[g] ?? {}).length > 0);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      {/* code + share */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-7 text-center"
      >
        <div className="slabel mb-3">The party gathers</div>
        <div className="flex items-center justify-center gap-2" aria-label={`Party code ${v.code}`}>
          {v.code.split("").map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.05 }}
              className="flex h-12 w-10 items-center justify-center rounded-xl border border-night-600 bg-night-800/80 font-shell text-xl font-semibold text-coral-300 sm:h-14 sm:w-11"
            >
              {ch}
            </motion.span>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <SButton onClick={() => copy("link")} className="px-4">
            {copied === "link" ? <Icons.check size={13} /> : <Icons.link size={13} />}
            {copied === "link" ? "Copied" : "Copy invite link"}
          </SButton>
          <SButton variant="ghost" onClick={() => copy("code")}>
            {copied === "code" ? <Icons.check size={13} /> : <Icons.copy size={13} />}
            Code
          </SButton>
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        {/* members */}
        <SPanel className="h-fit p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="slabel">The party</span>
            <span className="text-[11px] text-linen-500">
              {v.members.length} / {PARTY_MAX}
            </span>
          </div>
          <ul className="space-y-1.5">
            {v.members.map((m, i) => (
              <motion.li
                key={m.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-2.5 rounded-xl border border-night-600/50 bg-night-900/60 px-2.5 py-2"
              >
                <Medallion name={m.name} seat={m.seat} size={26} />
                <span className="flex-1 truncate text-[13px] font-medium text-linen-100">
                  {m.name}
                  {m.id === v.youId && <span className="text-linen-500"> — you</span>}
                </span>
                {m.id === v.hostId && <Icons.crown size={12} className="shrink-0 text-coral-400" />}
              </motion.li>
            ))}
          </ul>
          <button
            onClick={onLeave}
            className="mt-3 w-full text-center text-[10px] uppercase tracking-[0.18em] text-linen-500 transition hover:text-blood-400"
          >
            Leave the party
          </button>

          {talliedGames.length > 0 && (
            <div className="mt-4 border-t border-night-600/60 pt-3">
              <div className="slabel mb-2">Scoreboard</div>
              {talliedGames.map((g) => {
                const t = v.tallies[g]!;
                const rows = v.members
                  .map((m) => ({ m, w: t[m.id] ?? 0 }))
                  .filter((r) => r.w > 0)
                  .sort((a, b) => b.w - a.w);
                return (
                  <div key={g} className="mb-2">
                    <div
                      className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: GAME_META[g].accent }}
                    >
                      {GAME_META[g].title}
                    </div>
                    {rows.map(({ m, w }) => (
                      <div key={m.id} className="flex justify-between text-[12px] text-linen-300">
                        <span>{m.name}</span>
                        <span className="text-coral-300">★ {w}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </SPanel>

        {/* game picker */}
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="slabel">Choose tonight&apos;s game</span>
            {!isHost && <span className="text-[11px] italic text-linen-500">the host deals</span>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {GAME_ORDER.map((g, i) => (
              <motion.div
                key={g}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <GameCard
                  type={g}
                  v={v}
                  isHost={isHost}
                  onStart={() => void move({ kind: "party", action: "start_game", game: g })}
                />
              </motion.div>
            ))}
          </div>
          {v.members.length < 2 && (
            <p className="mt-3 text-center text-[12px] italic text-linen-500">
              Waiting for at least one more player — share the invite link.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
