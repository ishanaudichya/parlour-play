"use client";

/* The lobby: who's at the table, the fourteen games on the shelf, and the
   spotlight — the game the host is pointing at, on every screen at once. The
   host picks (or spins for it) and deals; everyone else reads the bill and
   heckles. Tonight's wins are kept in tally marks. */

import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { primeSound, setMuted, uiClick } from "@/lib/client/synthCore";
import type { Connection } from "@/lib/client/useParty";
import { GAME_META } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";
import { PARTY_MAX, type PartyMemberView, type PartyMove, type PartyView } from "@/lib/party/types";
import { BILLING, GAME_ORDER, SHELVES, type Shelf } from "./catalog";
import { LiveDot, useMuted } from "./PartyMenu";
import { Avatar, Bleed, EASE, Feed, Lineup, liftAccent, MusicPill, PosterFrame, soloBill, Spark, stageName, TopStrip, useFlash } from "./stage";

type Filter = "all" | "fits" | Shelf;

const range = (k: GameType) => {
  const m = GAME_META[k];
  return m.min === m.max ? `${m.min}` : `${m.min}–${m.max}`;
};

/** Can this table play it right now? */
function fit(k: GameType, n: number): { ok: boolean; short: number; over: number } {
  const m = GAME_META[k];
  return { ok: n >= m.min, short: Math.max(0, m.min - n), over: Math.max(0, n - m.max) };
}

/* ---------------- small pieces ---------------- */

function Tally({ n }: { n: number }) {
  const fives = Math.floor(n / 5);
  const rest = n % 5;
  const sticks: React.ReactNode[] = [];
  let x = 0;
  for (let g = 0; g < fives; g++) {
    for (let i = 0; i < 4; i++) sticks.push(<line key={`${g}-${i}`} x1={x + i * 4 + 1} y1={1} x2={x + i * 4 + 1} y2={13} />);
    sticks.push(<line key={`${g}-x`} x1={x - 1} y1={11} x2={x + 14} y2={3} />);
    x += 20;
  }
  for (let i = 0; i < rest; i++) sticks.push(<line key={`r${i}`} x1={x + i * 4 + 1} y1={1} x2={x + i * 4 + 1} y2={13} />);
  const w = Math.max(4, x + rest * 4);
  return (
    <svg width={w} height={14} viewBox={`-1 0 ${w + 1} 14`} className="shrink-0 text-bone" aria-label={`${n} win${n === 1 ? "" : "s"}`}>
      <g stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        {sticks}
      </g>
    </svg>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-seam text-dust transition hover:border-dust hover:text-bone"
    >
      {children}
    </button>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9Z" />
      {muted ? <path d="M16 9l6 6M22 9l-6 6" /> : <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />}
    </svg>
  );
}

function Tick({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 12.5 10 18 19.5 6.5" />
    </svg>
  );
}

/** The faces of everyone who voted for a game, popping in as they vote. */
function Voters({ who, size = 20, max = 4, ring = "ring-void" }: { who: PartyMemberView[]; size?: number; max?: number; ring?: string }) {
  return (
    <span className="flex items-center -space-x-1.5">
      <AnimatePresence initial={false}>
        {who.slice(0, max).map((m) => (
          <motion.span
            key={m.id}
            layout
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
            className="flex"
          >
            <Avatar name={m.name} seat={m.seat} size={size} className={`ring-2 ${ring}`} />
          </motion.span>
        ))}
      </AnimatePresence>
      {who.length > max && (
        <span
          className={`flex items-center justify-center rounded-full bg-bone font-mono text-[10px] font-bold text-void ring-2 ${ring}`}
          style={{ width: size, height: size }}
        >
          +{who.length - max}
        </span>
      )}
    </span>
  );
}

/* ---------------- the seats ---------------- */

function Seats({ v, onInvite, copied }: { v: PartyView; onInvite: () => void; copied: boolean }) {
  const empty = Math.max(0, PARTY_MAX - v.members.length);
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:flex-wrap lg:justify-end">
      {v.members.map((m, i) => (
        <motion.div
          key={m.id}
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.4, ease: EASE }}
          className={`flex shrink-0 items-center gap-2.5 rounded-full border py-1 pl-1 pr-3.5 ${
            m.id === v.youId ? "border-bone/40 bg-char" : "border-seam bg-soot"
          }`}
        >
          <Avatar name={m.name} seat={m.seat} size={30} />
          <span className="flex flex-col leading-none">
            <span className="max-w-[110px] truncate font-ui text-[13.5px] font-medium text-bone">{m.name}</span>
            <span className="smallprint mt-1 text-[8.5px] text-ash">
              {m.id === v.hostId ? "Host" : "Guest"}
              {m.id === v.youId && " · you"}
            </span>
          </span>
        </motion.div>
      ))}
      {empty > 0 && (
        <button
          type="button"
          onClick={onInvite}
          className="flex shrink-0 items-center gap-2 rounded-full border border-dashed border-seam py-1 pl-1 pr-3.5 text-dust transition hover:border-dust hover:text-bone"
        >
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-dashed border-current text-[16px]">+</span>
          <span className="flex flex-col items-start leading-none">
            <span className="font-ui text-[13.5px] font-medium">{copied ? "Link copied" : "Invite"}</span>
            <span className="smallprint mt-1 text-[8.5px] text-ash">
              {empty} seat{empty === 1 ? "" : "s"} free
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

/* ---------------- a game on the shelf ---------------- */

function ShelfCard({
  k,
  i,
  n,
  selected,
  lit,
  hostPick,
  voters,
  onClick,
}: {
  k: GameType;
  i: number;
  n: number;
  selected: boolean;
  lit: boolean;
  hostPick: string | null;
  voters: PartyMemberView[];
  onClick: () => void;
}) {
  const f = fit(k, n);
  // the poster leans toward the pointer
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 260, damping: 18 });
  const sry = useSpring(ry, { stiffness: 260, damping: 18 });
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.45, ease: EASE, delay: Math.min(i, 10) * 0.025 }}
      onClick={onClick}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 12);
        rx.set(-((e.clientY - r.top) / r.width - 0.32) * 10);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      aria-pressed={selected}
      aria-label={`${GAME_META[k].title}, ${range(k)} players${f.ok ? "" : `, needs ${f.short} more`}${
        voters.length ? `, ${voters.length} vote${voters.length === 1 ? "" : "s"}` : ""
      }${hostPick ? `, ${hostPick}` : ""}`}
      className="group relative flex min-w-0 flex-col text-left"
      style={{ perspective: 800 }}
    >
      <motion.div
        style={{ rotateX: srx, rotateY: sry }}
        className={`relative overflow-hidden rounded-xl transition-[box-shadow,opacity,filter,scale] duration-200 ${
          lit ? "scale-[1.03] ring-[3px] ring-flare" : selected ? "ring-2 ring-bone" : "ring-1 ring-seam group-hover:ring-dust"
        } ${f.ok ? "" : "opacity-55 saturate-50"}`}
      >
        <div className="transition duration-300 group-hover:scale-[1.035]">
          <PosterFrame k={k} rounded="rounded-none" />
        </div>
        {hostPick && (
          <span className="smallprint absolute left-2 top-2 flex items-center gap-1 rounded-full bg-flare px-2 py-1 text-[9px] font-semibold text-void shadow">
            <Spark size={8} /> {hostPick}
          </span>
        )}
        {!f.ok && (
          <span className="smallprint absolute bottom-2 left-2 rounded-full bg-sun px-2 py-1 text-[9px] font-semibold text-void">
            Needs {f.short} more
          </span>
        )}
        {voters.length > 0 && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-void/80 py-0.5 pl-0.5 pr-2 backdrop-blur" title={`${voters.map((m) => m.name).join(", ")} voted for this`}>
            <Voters who={voters} size={20} max={3} ring="ring-void/0" />
            <span className="font-mono text-[11px] font-bold text-bone">{voters.length}</span>
          </span>
        )}
      </motion.div>
      <div className="mt-2 flex items-baseline justify-between gap-2 px-0.5">
        <span
          className={`truncate font-poster text-[21px] font-extrabold uppercase leading-none tracking-[0.01em] transition ${
            selected || lit ? "text-flare" : "text-bone"
          }`}
        >
          {stageName(k)}
        </span>
        <span className="smallprint shrink-0 text-ash">{range(k)}</span>
      </div>
    </motion.button>
  );
}

/* ---------------- the spotlight ---------------- */

function Spotlight({
  k,
  v,
  isHost,
  hostName,
  spinning,
  onDeal,
  onSpin,
  canSpin,
  onVote,
}: {
  k: GameType | null;
  v: PartyView;
  isHost: boolean;
  hostName: string;
  spinning: boolean;
  onDeal: () => void;
  onSpin: () => void;
  canSpin: boolean;
  onVote: (k: GameType | null) => void;
}) {
  const n = v.members.length;
  if (!k)
    return (
      <div className="flex h-full flex-col justify-center rounded-3xl border border-seam bg-soot p-6">
        <span className="smallprint text-flare">Tonight&apos;s first game</span>
        <div className="mt-3 font-poster text-[64px] font-extrabold uppercase leading-[0.86]" style={{ fontVariationSettings: '"opsz" 72' }}>
          What are
          <br />
          we playing?
        </div>
        <p className="mt-4 font-aside text-[20px] italic leading-snug text-dust">
          {isHost ? "Pick one off the shelf to read the bill — or let the wheel decide." : `${hostName} picks the game. Browse the shelf meanwhile.`}
        </p>
        {isHost && (
          <button
            type="button"
            onClick={onSpin}
            disabled={!canSpin}
            className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-bone/30 py-3 font-poster text-[22px] font-extrabold uppercase tracking-[0.04em] text-bone transition hover:border-bone hover:bg-bone hover:text-void disabled:opacity-40"
          >
            <Spark size={13} /> Spin for it
          </button>
        )}
      </div>
    );

  const m = GAME_META[k];
  const f = fit(k, n);
  const seated = v.members.slice(0, m.max);
  const watching = v.members.slice(m.max);
  const shelf = SHELVES.find((s) => BILLING[k].shelves.includes(s.key))?.label;

  return (
    <div className="relative flex flex-col rounded-3xl border border-seam bg-soot">
      {/* while the roulette runs the bill flips instantly; once it lands it eases in */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={spinning ? "spin" : k}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          {/* short screens keep the deal button in view: the shelf already shows the poster */}
          <div className="relative overflow-hidden rounded-t-3xl lg:[@media(max-height:820px)]:hidden">
            <div className="push-in">
              <PosterFrame k={k} rounded="rounded-none" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-soot to-transparent" />
          </div>
          <div className="px-5 pb-1 pt-1 lg:[@media(max-height:820px)]:pt-5">
            <Lineup rows={soloBill(k)} decor maxFont={78} />
            <p className="mt-1 font-aside text-[21px] italic leading-tight" style={{ color: liftAccent(k) }}>
              {m.tagline}
            </p>
            <p className="mt-2.5 font-ui text-[14px] leading-relaxed text-dust">{BILLING[k].pitch}</p>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mx-5 mt-4 grid grid-cols-[0.8fr_0.9fr_1.3fr] divide-x divide-seam rounded-2xl border border-seam">
        {[
          ["Players", range(k)],
          ["Time", `~${BILLING[k].minutes} min`],
          ["Kind", shelf ?? "—"],
        ].map(([a, b], i) => (
          <div key={a} className="min-w-0 px-3 py-2.5">
            <div className="smallprint text-[9px] text-ash">{a}</div>
            <div
              className={`mt-1 font-poster font-bold uppercase leading-none text-bone ${i === 2 ? "text-[15px] leading-[1.05]" : "truncate text-[19px]"}`}
            >
              {b}
            </div>
          </div>
        ))}
      </div>

      {/* the call to action stays in view while the bill scrolls */}
      <div className="sticky bottom-0 z-10 rounded-b-3xl bg-soot px-5 pb-5 pt-4 shadow-[0_-18px_24px_-6px_var(--color-soot)]">
        {(() => {
          const voters = v.members.filter((m) => v.votes[m.id] === k);
          return (
            <div className="mb-3 flex min-h-[26px] items-center gap-2.5 border-b border-seam pb-3">
              {voters.length ? (
                <>
                  <Voters who={voters} size={24} max={5} ring="ring-soot" />
                  <span className="font-ui text-[12.5px] text-bone">
                    {voters.length === 1 ? `${voters[0].name} wants this` : `${voters.length} votes for this`}
                  </span>
                </>
              ) : (
                <span className="font-ui text-[12.5px] text-ash">No votes for this one yet</span>
              )}
            </div>
          );
        })()}
        {f.ok ? (
          <div className="mb-3 flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {seated.map((p) => (
                <Avatar key={p.id} name={p.name} seat={p.seat} size={24} className="ring-2 ring-soot" />
              ))}
            </div>
            <span className="font-ui text-[12.5px] text-dust">
              {watching.length ? `First ${m.max} play · ${watching.map((w) => w.name).join(", ")} watch${watching.length === 1 ? "es" : ""}` : "Everyone's dealt in"}
            </span>
          </div>
        ) : (
          <p className="mb-3 font-ui text-[12.5px] text-sun">
            Needs {f.short} more {f.short === 1 ? "player" : "players"} — send the invite.
          </p>
        )}
        {isHost ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!f.ok || spinning}
              onClick={onDeal}
              className="group flex flex-1 items-center justify-between rounded-2xl bg-flare px-5 py-3.5 text-void transition hover:bg-flare-hi active:scale-[0.99] disabled:bg-char disabled:text-ash"
            >
              <span className="truncate font-poster text-[24px] font-extrabold uppercase leading-none tracking-[0.03em]">
                Deal {stageName(k)}
              </span>
              <span aria-hidden className="text-[20px] transition-transform group-hover:translate-x-1">
                →
              </span>
            </button>
            <button
              type="button"
              onClick={onSpin}
              disabled={!canSpin || spinning}
              aria-label="Spin for a random game"
              title="Spin for a random game"
              className="flex w-[54px] items-center justify-center rounded-2xl border border-seam text-bone transition hover:border-dust disabled:opacity-40"
            >
              <motion.span animate={spinning ? { rotate: 360 } : { rotate: 0 }} transition={spinning ? { repeat: Infinity, duration: 0.6, ease: "linear" } : { duration: 0.2 }}>
                <Spark size={18} />
              </motion.span>
            </button>
          </div>
        ) : (
          <>
            {v.votes[v.youId] === k ? (
              <button
                type="button"
                onClick={() => onVote(null)}
                className="group flex w-full items-center justify-between rounded-2xl bg-bone px-5 py-3.5 text-void transition active:scale-[0.99]"
              >
                <span className="flex items-center gap-2 font-poster text-[24px] font-extrabold uppercase leading-none tracking-[0.03em]">
                  <Tick size={18} /> Your vote
                </span>
                <span className="smallprint text-void/50 group-hover:text-void">Take it back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onVote(k)}
                className="group flex w-full items-center justify-between rounded-2xl bg-flare px-5 py-3.5 text-void transition hover:bg-flare-hi active:scale-[0.99]"
              >
                <span className="truncate font-poster text-[24px] font-extrabold uppercase leading-none tracking-[0.03em]">
                  Vote {stageName(k)}
                </span>
                <span className="smallprint shrink-0 text-void/60">{v.votes[v.youId] ? "Switch vote" : "I'd play this"}</span>
              </button>
            )}
            <div className="mt-3 flex items-center gap-2.5 px-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-flare opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-flare" />
              </span>
              <span className="font-ui text-[12.5px] text-dust">
                {v.spotlight?.game === k ? `${hostName} has this one in hand` : `Votes help — ${hostName} picks and deals`}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** What the table wants to play, most wanted first. The host still decides. */
function Ballot({ v, isHost, hostName, onPick }: { v: PartyView; isHost: boolean; hostName: string; onPick: (k: GameType) => void }) {
  const guests = v.members.filter((m) => m.id !== v.hostId);
  const counts = new Map<GameType, PartyMemberView[]>();
  for (const m of v.members) {
    const g = v.votes[m.id];
    if (g) counts.set(g, [...(counts.get(g) ?? []), m]);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || GAME_ORDER.indexOf(a[0]) - GAME_ORDER.indexOf(b[0]));
  const voted = guests.filter((m) => v.votes[m.id]).length;
  if (!guests.length) return null;
  const top = ranked[0]?.[1].length ?? 0;
  return (
    <div className="rounded-3xl border border-seam bg-soot px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="font-poster text-[22px] font-extrabold uppercase leading-none">The vote</span>
        <span className="smallprint text-ash">
          {voted} of {guests.length} in
        </span>
      </div>
      {ranked.length === 0 ? (
        <p className="mt-2 font-ui text-[12.5px] leading-snug text-dust">
          {isHost ? "Guests can vote for what they'd like to play. You still deal." : `Open a game and vote for it — ${hostName} sees the count and deals.`}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {ranked.map(([g, who]) => (
              <motion.button
                key={g}
                layout
                type="button"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.3, ease: EASE }}
                onClick={() => onPick(g)}
                className="group flex w-full items-center gap-3 text-left"
              >
                <span className="w-[52px] shrink-0 overflow-hidden rounded-md ring-1 ring-seam">
                  <PosterFrame k={g} rounded="rounded-none" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-poster text-[18px] font-extrabold uppercase leading-none text-bone group-hover:text-flare">
                      {stageName(g)}
                    </span>
                    <span className="font-mono text-[12px] font-bold text-bone">{who.length}</span>
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-char">
                    <motion.span
                      className="block h-full rounded-full"
                      style={{ background: liftAccent(g) }}
                      initial={false}
                      animate={{ width: `${(who.length / Math.max(1, top)) * 100}%` }}
                      transition={{ type: "spring", stiffness: 200, damping: 24 }}
                    />
                  </span>
                </span>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Scores({ v }: { v: PartyView }) {
  const games = GAME_ORDER.filter((g) => Object.values(v.tallies[g] ?? {}).some((x) => x > 0));
  if (!games.length) return null;
  return (
    <div className="rounded-3xl border border-seam bg-soot px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="font-poster text-[22px] font-extrabold uppercase leading-none">Tonight</span>
        <span className="smallprint text-ash">wins so far</span>
      </div>
      <div className="mt-3 space-y-3">
        {games.map((g) => {
          const t = v.tallies[g]!;
          const rows = v.members
            .map((m) => ({ m, w: t[m.id] ?? 0 }))
            .filter((r) => r.w > 0)
            .sort((a, b) => b.w - a.w);
          return (
            <div key={g}>
              <div className="smallprint text-[9.5px]" style={{ color: liftAccent(g) }}>
                {stageName(g)}
              </div>
              {rows.map(({ m, w }) => (
                <div key={m.id} className="mt-1 flex items-center gap-2.5">
                  <Avatar name={m.name} seat={m.seat} size={18} />
                  <span className="min-w-0 flex-1 truncate font-ui text-[13px] text-bone">{m.name}</span>
                  <Tally n={w} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==================== the lobby ==================== */

export function PartyLobby({
  v,
  move,
  connection,
  onLeave,
}: {
  v: PartyView;
  move: (m: PartyMove) => void;
  connection: Connection;
  onLeave: () => void;
}) {
  const isHost = v.hostId === v.youId;
  const n = v.members.length;
  const hostName = v.members.find((m) => m.id === v.hostId)?.name ?? "The host";
  const muted = useMuted();
  const [copied, flash] = useFlash();
  const [filter, setFilter] = useState<Filter>("all");
  // the lobby only ever mounts in the browser, so the door's ?pick= is readable here
  const [arrivedWith] = useState<GameType | null>(() => {
    const q = isHost ? new URLSearchParams(window.location.search).get("pick") : null;
    return q && q in GAME_META ? (q as GameType) : null;
  });
  const [sel, setSel] = useState<GameType | null>(arrivedWith ?? v.spotlight?.game ?? null);
  const [seenSpot, setSeenSpot] = useState(v.spotlight?.n ?? 0);
  const [lit, setLit] = useState<GameType | null>(null);
  const [sheet, setSheet] = useState(false);
  const spinTimer = useRef<number | null>(null);
  const spotAtMount = useRef(v.spotlight?.n ?? 0);
  const spinning = lit !== null;

  const shown = useMemo(
    () =>
      GAME_ORDER.filter((g) =>
        filter === "all" ? true : filter === "fits" ? fit(g, n).ok : BILLING[g].shelves.includes(filter)
      ),
    [filter, n]
  );
  const spinPool = useMemo(() => {
    const pool = shown.filter((g) => fit(g, n).ok);
    return pool.length ? pool : GAME_ORDER.filter((g) => fit(g, n).ok);
  }, [shown, n]);

  async function copy(kind: "link" | "code") {
    try {
      await navigator.clipboard.writeText(kind === "link" ? `${window.location.origin}/p/${v.code}` : v.code);
      flash(kind);
    } catch {}
  }

  /** The roulette: a light runs along the shelf, slowing, and stops on `to`. */
  function roulette(to: GameType, pool: GameType[]) {
    if (spinTimer.current) window.clearTimeout(spinTimer.current);
    const order = pool.includes(to) ? pool : [...pool, to];
    const len = order.length;
    const min = len > 1 ? 18 : 0;
    const total = min + ((((order.indexOf(to) - min) % len) + len) % len);
    let i = 0;
    const tick = () => {
      const g = order[i % len];
      setLit(g);
      setSel(g);
      if (i >= total) {
        spinTimer.current = window.setTimeout(() => {
          setLit(null);
          setSel(to);
          setSheet(true);
        }, 420);
        return;
      }
      i++;
      const t = i / Math.max(1, total);
      spinTimer.current = window.setTimeout(tick, 45 + 300 * t * t * t);
    };
    tick();
  }

  // follow the host's pointer; a spin plays the roulette on every screen
  const spot = v.spotlight;
  if (spot && spot.n !== seenSpot) {
    setSeenSpot(spot.n);
    if (!isHost && !spot.spin) setSel(spot.game);
  }
  useEffect(() => {
    if (!spot?.spin || isHost || spot.n === spotAtMount.current) return;
    const pool = shown.includes(spot.game) ? spinPool : GAME_ORDER.filter((g) => fit(g, n).ok);
    const id = window.setTimeout(() => {
      if (!shown.includes(spot.game)) setFilter("all");
      roulette(spot.game, pool);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot?.n]);

  useEffect(
    () => () => {
      if (spinTimer.current) window.clearTimeout(spinTimer.current);
    },
    []
  );

  // arriving from the door with a game in mind: point everyone at it
  useEffect(() => {
    if (!arrivedWith) return;
    if (v.spotlight?.game !== arrivedWith) move({ kind: "party", action: "spotlight", game: arrivedWith });
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(k: GameType) {
    if (spinning) return;
    uiClick();
    setSel(k);
    setSheet(true);
    if (isHost && v.spotlight?.game !== k) move({ kind: "party", action: "spotlight", game: k });
  }

  function spin() {
    if (spinning || !spinPool.length) return;
    primeSound();
    uiClick();
    const to = spinPool[Math.floor(Math.random() * spinPool.length)];
    if (isHost) move({ kind: "party", action: "spotlight", game: to, spin: true });
    roulette(to, spinPool);
  }

  function vote(k: GameType | null) {
    primeSound();
    uiClick();
    move({ kind: "party", action: "vote", game: k });
  }

  function deal(k: GameType) {
    if (!isHost || !fit(k, n).ok) return;
    uiClick();
    move({ kind: "party", action: "start_game", game: k });
  }

  const hostPickLabel = (k: GameType) => (v.spotlight?.game === k && !spinning ? (isHost ? "Your pick" : `${hostName}'s pick`) : null);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: GAME_ORDER.length },
    { key: "fits", label: "Playable now", count: GAME_ORDER.filter((g) => fit(g, n).ok).length },
    ...SHELVES.map((s) => ({ key: s.key as Filter, label: s.label, count: GAME_ORDER.filter((g) => BILLING[g].shelves.includes(s.key)).length })),
  ];

  const spotlight = (
    <Spotlight
      k={sel}
      v={v}
      isHost={isHost}
      hostName={hostName}
      spinning={spinning}
      onDeal={() => sel && deal(sel)}
      onSpin={spin}
      canSpin={spinPool.length > 0}
      onVote={vote}
    />
  );

  const votersOf = (k: GameType) => v.members.filter((m) => v.votes[m.id] === k);
  const free = PARTY_MAX - n;
  const ticker: string[] = [
    `${hostName} deals tonight`,
    ...(v.spotlight && !spinning ? [`${hostName} is eyeing ${stageName(v.spotlight.game)}`] : []),
    ...v.members.filter((m) => v.votes[m.id]).map((m) => `${m.name} wants ${stageName(v.votes[m.id])}`),
    ...GAME_ORDER.flatMap((g) =>
      v.members.filter((m) => (v.tallies[g]?.[m.id] ?? 0) > 0).map((m) => `${m.name} won ${stageName(g)}${v.tallies[g]![m.id] > 1 ? ` ×${v.tallies[g]![m.id]}` : ""}`)
    ),
    ...(Object.keys(v.votes).length === 0 && n > 1 ? ["Guests — vote for what you want to play"] : []),
    ...(free > 0 ? [`${free} seat${free === 1 ? "" : "s"} free — send the link`] : ["Full house"]),
  ];

  return (
    <main className="relative flex min-h-dvh flex-col overflow-x-clip lg:h-dvh lg:overflow-hidden">
      <Bleed className="-left-64 -top-72 opacity-60" size={700} />

      <TopStrip>
        <Feed items={ticker} className="hidden max-w-[380px] font-ui text-[13px] text-dust xl:flex" />
        <span className="smallprint hidden items-center gap-2 text-dust sm:flex">
          <LiveDot c={connection} />
          {connection === "live" ? "Live" : connection === "degraded" ? "Reconnecting" : "Connecting"}
        </span>
        <IconButton
          label={muted ? "Unmute" : "Mute"}
          onClick={() => {
            primeSound();
            setMuted(!muted);
          }}
        >
          <SoundIcon muted={muted} />
        </IconButton>
        <MusicPill className="hidden sm:flex" />
        <button
          type="button"
          onClick={onLeave}
          className="smallprint rounded-full border border-seam px-3.5 py-2 text-dust transition hover:border-flare hover:text-flare"
        >
          Leave
        </button>
      </TopStrip>
      <Feed items={ticker} className="relative z-10 mx-4 mb-3 font-ui text-[13px] text-dust sm:mx-6 xl:hidden" />

      {/* the table: code + seats */}
      <section className="relative z-10 flex flex-col gap-4 px-4 pb-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10 lg:px-10 lg:pb-6">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <div className="smallprint text-dust">
              Table · {n} of {PARTY_MAX}
            </div>
            <div
              className="misprint misprint-live mt-1 font-poster text-[76px] font-extrabold uppercase leading-[0.8] tracking-[0.04em] sm:text-[92px]"
              style={{ fontVariationSettings: '"opsz" 72' }}
              translate="no"
            >
              {v.code}
            </div>
          </div>
          <div className="flex gap-2 pb-1">
            <button
              type="button"
              onClick={() => void copy("link")}
              className="rounded-full bg-bone px-4 py-2.5 font-ui text-[13px] font-semibold text-void transition hover:bg-white active:scale-[0.98]"
            >
              {copied === "link" ? "Invite copied" : "Copy invite link"}
            </button>
            <button
              type="button"
              onClick={() => void copy("code")}
              className="rounded-full border border-seam px-4 py-2.5 font-ui text-[13px] font-semibold text-bone transition hover:border-dust active:scale-[0.98]"
            >
              {copied === "code" ? "Copied" : "Code"}
            </button>
          </div>
        </div>
        <div className="min-w-0 lg:max-w-[60%]">
          <Seats v={v} copied={copied === "link"} onInvite={() => void copy("link")} />
        </div>
      </section>

      {/* the shelf + the spotlight */}
      <section className="relative z-10 flex flex-1 flex-col gap-6 border-t border-seam px-4 pt-4 sm:px-6 lg:min-h-0 lg:flex-row lg:gap-8 lg:px-10 lg:pt-5">
        <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <div className="flex items-center gap-3">
            <div className="no-scrollbar -mx-4 flex flex-1 gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    uiClick();
                    setFilter(f.key);
                  }}
                  className={`smallprint shrink-0 rounded-full border px-3 py-2 transition ${
                    filter === f.key ? "border-bone bg-bone text-void" : "border-seam text-dust hover:border-dust hover:text-bone"
                  }`}
                >
                  {f.label}
                  <sup className={`ml-1 text-[8.5px] ${filter === f.key ? "text-void/55" : "text-ash"}`}>{f.count}</sup>
                </button>
              ))}
            </div>
            {isHost && (
              <button
                type="button"
                onClick={spin}
                disabled={spinning || !spinPool.length}
                className="hidden shrink-0 items-center gap-2 rounded-full bg-sun px-4 py-2 font-poster text-[17px] font-extrabold uppercase leading-none tracking-[0.04em] text-void transition hover:brightness-110 active:scale-[0.97] disabled:opacity-50 sm:flex"
              >
                <Spark size={11} /> Spin
              </button>
            )}
          </div>

          <div className="relative mt-4 lg:min-h-0 lg:flex-1">
            <div className="no-scrollbar h-full pb-28 lg:overflow-y-auto lg:pb-8">
              <motion.div layout className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                <AnimatePresence mode="popLayout">
                  {shown.map((k, i) => (
                    <ShelfCard
                      key={k}
                      k={k}
                      i={i}
                      n={n}
                      selected={sel === k}
                      lit={lit === k}
                      hostPick={hostPickLabel(k)}
                      voters={votersOf(k)}
                      onClick={() => choose(k)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
              <div className="mt-8 space-y-4 lg:hidden">
                <Ballot v={v} isHost={isHost} hostName={hostName} onPick={choose} />
                <Scores v={v} />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-12 bg-gradient-to-t from-void to-transparent lg:block" />
          </div>
        </div>

        <aside className="no-scrollbar hidden w-[380px] shrink-0 flex-col gap-4 overflow-y-auto pb-8 lg:flex xl:w-[420px] [&>*]:shrink-0">
          {spotlight}
          <Ballot v={v} isHost={isHost} hostName={hostName} onPick={choose} />
          <Scores v={v} />
        </aside>
      </section>

      {/* phones: the spotlight rides at the bottom, and opens into a sheet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-seam bg-void/92 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
        {sel ? (
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSheet(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="w-[64px] shrink-0 overflow-hidden rounded-lg ring-1 ring-seam">
                <PosterFrame k={sel} rounded="rounded-none" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-poster text-[22px] font-extrabold uppercase leading-none">{stageName(sel)}</span>
                <span className="smallprint mt-1 block text-[9px] text-ash">{range(sel)} players · tap for the bill</span>
              </span>
            </button>
            {isHost ? (
              <button
                type="button"
                disabled={!fit(sel, n).ok || spinning}
                onClick={() => deal(sel)}
                className="shrink-0 rounded-2xl bg-flare px-5 py-3 font-poster text-[20px] font-extrabold uppercase leading-none tracking-[0.03em] text-void disabled:bg-char disabled:text-ash"
              >
                {fit(sel, n).ok ? "Deal" : `+${fit(sel, n).short}`}
              </button>
            ) : v.votes[v.youId] === sel ? (
              <button
                type="button"
                onClick={() => vote(null)}
                className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-bone px-4 py-3 font-poster text-[20px] font-extrabold uppercase leading-none tracking-[0.03em] text-void"
              >
                <Tick size={15} /> Voted
              </button>
            ) : (
              <button
                type="button"
                onClick={() => vote(sel)}
                className="shrink-0 rounded-2xl bg-flare px-5 py-3 font-poster text-[20px] font-extrabold uppercase leading-none tracking-[0.03em] text-void"
              >
                Vote
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="font-aside text-[19px] italic text-dust">{isHost ? "Pick a game to deal" : `${hostName} is picking…`}</span>
            {isHost && (
              <button
                type="button"
                onClick={spin}
                disabled={spinning || !spinPool.length}
                className="flex items-center gap-2 rounded-2xl bg-sun px-4 py-2.5 font-poster text-[19px] font-extrabold uppercase leading-none text-void disabled:opacity-50"
              >
                <Spark size={11} /> Spin
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {sheet && sel && !spinning && (
          <motion.div className="fixed inset-0 z-40 flex items-end lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-void/70 backdrop-blur-[2px]" onClick={() => setSheet(false)} />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.36, ease: EASE }}
              className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[26px] pb-[env(safe-area-inset-bottom)]"
            >
              <button
                type="button"
                onClick={() => setSheet(false)}
                aria-label="Close"
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-void/70 text-bone backdrop-blur"
              >
                ✕
              </button>
              {spotlight}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
