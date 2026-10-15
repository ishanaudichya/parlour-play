"use client";

/* The Resistance: Avalon — moonlit Camelot. Quest board of stone medallions,
   a round table of seats, simultaneous vote reveals, anonymous quest cards
   and one dagger at the end. */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PartyMenu } from "@/components/party/PartyMenu";
import { Button, Icons, Medallion, Panel } from "@/components/ui";
import {
  getMutedServerSnapshot,
  getMutedSnapshot,
  primeSound,
  setMuted,
  subscribeMuted,
} from "@/lib/client/synthCore";
import { ROLE_META } from "@/lib/games/avalon/meta";
import type { AvalonLogEntry, AvalonView, AvalonViewPlayer } from "@/lib/games/avalon/types";
import type { GameScreenProps } from "@/lib/party/types";
import { uncial } from "./font";
import {
  AvalonRulesModal,
  GameOverOverlay,
  QuestRevealOverlay,
  ROMAN,
  VoteHistoryDrawer,
  VoteRevealOverlay,
} from "./Overlays";
import { fitQuestBoard, QuestBoard } from "./QuestBoard";
import { FlipRoleCard } from "./RoleCard";
import { avalonSfx, mustAct, playAvalonDiff } from "./sfx";
import { clamp, useBox } from "@/lib/client/useBox";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Mark = "ally" | "seen" | "pair" | null;

const PHASE_COPY: Record<AvalonView["phase"], { eyebrow: string; title: string; hint: string }> = {
  team: {
    eyebrow: "The round table",
    title: "Assemble the quest party",
    hint: "The crowned leader chooses companions. Everyone will vote on the party.",
  },
  vote: {
    eyebrow: "The council",
    title: "Approve or refuse",
    hint: "Tokens stay hidden until every seat has voted — then all flip at once.",
  },
  quest: {
    eyebrow: "The quest rides",
    title: "Success or sabotage",
    hint: "Party members play their cards in secret. Only shuffled counts return.",
  },
  assassination: {
    eyebrow: "Blood price",
    title: "The dagger is drawn",
    hint: "Three quests stand. The Assassin has one throw to find Merlin.",
  },
  over: {
    eyebrow: "The chronicle",
    title: "The tale is told",
    hint: "Every card lies face up on the table.",
  },
};

function useServerNow(serverNow: number, skew: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + skew), 250);
    return () => window.clearInterval(id);
  }, [skew]);
  return Math.max(serverNow, now);
}

function formatClock(deadline: number | null, now: number) {
  if (!deadline) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function logText(entry: AvalonLogEntry): string {
  switch (entry.kind) {
    case "start":
      return "The fellowship gathers at the round table.";
    case "round":
      return `${entry.actor ?? "Someone"} holds the crown for quest ${ROMAN[(entry.quest ?? 1) - 1]}.`;
    case "propose":
      return `${entry.actor ?? "The leader"} proposed a quest party.`;
    case "vote":
      return entry.detail === "approved"
        ? `The council approved the party (${entry.approves}–${entry.refusals}).`
        : `The council refused the party (${entry.approves}–${entry.refusals}).`;
    case "quest":
      return entry.detail === "success"
        ? `Quest ${ROMAN[(entry.quest ?? 1) - 1]} succeeded (${entry.successes}–${entry.fails}).`
        : `Quest ${ROMAN[(entry.quest ?? 1) - 1]} failed (${entry.successes}–${entry.fails}).`;
    case "dagger":
      return "Three quests stand — the Assassin stirs.";
    case "shot":
      return `The dagger falls upon ${entry.target ?? "someone"}.`;
    case "timeout":
      if (entry.detail === "propose") return `${entry.actor ?? "The leader"} hesitated — the clock chose the party.`;
      if (entry.detail === "vote") return "The clock cast the missing votes as approval.";
      if (entry.detail === "quest") return "The clock sealed the missing cards as success.";
      return "The clock guided the dagger.";
    case "left":
      return `${entry.actor ?? "Someone"} abandoned the table.`;
    case "win":
      return "The chronicle closes.";
    default:
      return "The court murmurs.";
  }
}

function CircletIcon({ size = 13, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
      <path d="M3 16 C7 13 17 13 21 16 M4 16.5 L4.5 19.5 H19.5 L20 16.5" strokeLinecap="round" />
      <path d="M12 13.5 L10.6 11 L12 8.6 L13.4 11 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Timer({ text, urgent }: { text: string | null; urgent: boolean }) {
  if (!text) return null;
  return (
    <div
      className={`min-w-[58px] border px-2.5 py-1 text-center font-mono text-xs tabular-nums ${
        urgent ? "border-[#a1273a]/70 bg-[#3a1020]/60 text-[#f2a9b6]" : "border-[#55627a]/45 bg-black/25 text-[#b9c6d8]"
      }`}
      aria-label={`${text} remaining`}
    >
      {text}
    </div>
  );
}

/* ------------------------------- seats -------------------------------- */

function SeatCard({
  player,
  isYou,
  isLeader,
  onTeam,
  voted,
  sealed,
  mark,
  selectable,
  selected,
  onSelect,
  rowH,
  narrow,
  style,
}: {
  player: AvalonViewPlayer;
  isYou: boolean;
  isLeader: boolean;
  onTeam: boolean;
  voted: boolean;
  sealed: boolean;
  mark: Mark;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  /** the row height the table gives this seat — everything inside scales from it */
  rowH: number;
  /** a slim column (three across a phone): tighter padding */
  narrow?: boolean;
  style?: React.CSSProperties;
}) {
  // below 44px a seat folds into a one-line chip; above, it grows in tiers
  const chip = rowH < 44;
  const tier = chip ? 0 : rowH < 78 ? 1 : rowH < 112 ? 2 : rowH < 150 ? 3 : 4;
  const medal = Math.round(clamp(rowH * (chip ? 0.68 : 0.56), 22, 104));
  const badge = Math.round(clamp(medal * 0.36, 13, 26));
  const nameCls = ["text-[12px]", "text-[13px]", "text-[16px]", "text-[19px]", "text-[22px]"][tier];
  const statusCls = ["", "text-[8.5px]", "text-[10px]", "text-[11px]", "text-[12px]"][tier];
  const youCls = ["", "text-[8px]", "text-[9px]", "text-[9px]", "text-[10px]"][tier];
  const pad = narrow ? "gap-1.5 px-1.5" : ["gap-1.5 px-1.5", "gap-2.5 px-2.5", "gap-3.5 px-4", "gap-4 px-5", "gap-5 px-6"][tier];
  const content = (
    <>
      <div className="relative shrink-0">
        <Medallion name={player.name} seat={player.seat} size={medal} dim={player.left} />
        {isLeader ? (
          <span
            className="absolute left-1/2 -translate-x-1/2 text-[#d6c389]"
            style={{ top: -Math.round(medal * 0.2) }}
            title="Quest leader"
          >
            <CircletIcon size={Math.round(clamp(medal * 0.36, 12, 26))} />
          </span>
        ) : null}
        {mark ? (
          <span
            className="absolute -bottom-1 -right-1 grid place-items-center rounded-full border font-bold"
            style={{
              width: badge,
              height: badge,
              fontSize: Math.round(badge * 0.46),
              ...(mark === "pair"
                ? { borderColor: "#d6c389", background: "#1a2438", color: "#d6c389" }
                : { borderColor: "#e0556d", background: "#3a1020", color: "#e0556d" }),
            }}
            title={mark === "ally" ? "Fellow minion" : mark === "seen" ? "Seen by Merlin" : "Merlin or Morgana"}
          >
            {mark === "ally" ? "M" : mark === "seen" ? "◆" : "?"}
          </span>
        ) : null}
      </div>
      {chip ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className={`truncate font-medium ${nameCls} ${player.left ? "text-[#5f6673] line-through" : "text-[#dfe8f2]"}`}>
            {player.name}
          </span>
          {onTeam ? <span className="shrink-0 text-[9px] text-[#8fb8de]" title="On the quest party">◆</span> : null}
          {voted || sealed ? (
            <span className="shrink-0 text-[10px] text-[#d6c389]" title={voted ? "Voted" : "Card sealed"}>
              ✓
            </span>
          ) : null}
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <div className={`truncate font-medium ${nameCls} ${player.left ? "text-[#5f6673] line-through" : "text-[#dfe8f2]"}`}>
            {player.name}
            {isYou ? <span className={`ml-1.5 uppercase tracking-widest text-[#7d94ad] ${youCls}`}>you</span> : null}
          </div>
          <div className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 uppercase tracking-[0.16em] text-[#5f7189] ${statusCls}`}>
            <span>{player.left ? "fled" : `seat ${player.seat + 1}`}</span>
            {onTeam ? <span className="text-[#8fb8de]">· party</span> : null}
            {voted ? <span className="text-[#d6c389]">· voted</span> : null}
            {sealed ? <span className="text-[#d6c389]">· sealed</span> : null}
          </div>
        </div>
      )}
    </>
  );

  const ring = selected
    ? "border-[#d6c389] bg-[#2a2410]/60 shadow-[0_0_18px_rgba(214,195,137,.22)]"
    : onTeam
      ? "border-[#8fb8de]/80 bg-[#16283f]/70 shadow-[0_0_16px_rgba(143,184,222,.18)]"
      : isYou && chip
        ? "border-[#7d94ad]/60 bg-[#0d1526]/75"
        : "border-[#3c4f6b]/45 bg-[#0d1526]/75";

  if (!selectable) {
    return (
      <div role="listitem" className={`flex min-w-0 items-center border ${chip ? "py-1" : "py-1.5"} ${pad} ${ring}`} style={style}>
        {content}
      </div>
    );
  }
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Choose ${player.name}`}
      className={`flex w-full min-w-0 items-center border text-left transition-colors hover:border-[#8fb8de]/70 ${chip ? "py-1" : "py-1.5"} ${pad} ${ring}`}
      style={style}
    >
      {content}
    </motion.button>
  );
}

/** How the round table lays out in the space it has: columns by width, row
    height by what is left after the board and the action dock. Seats grow
    with the room (up to half their width), and fold into chips below 44px. */
function seatLayout(w: number, h: number, n: number) {
  const gap = w < 520 ? 6 : w < 1100 ? 10 : 14;
  const fitFor = (cols: number) => {
    const rows = Math.ceil(n / cols);
    const cardW = (w - gap * (cols - 1)) / cols;
    const cap = Math.min(200, cardW * 0.5);
    const fit = h > 0 ? Math.floor((h - gap * (rows - 1)) / rows) : 60;
    return { cols, rows, rowH: Math.max(32, Math.min(cap, fit)) };
  };
  // phones keep two columns while two-line seats fit, then try three
  if (w < 520) {
    const two = fitFor(2);
    if (two.rowH >= 44 || n <= 4) return { gap, ...two };
    const three = fitFor(3);
    return { gap, ...(three.rowH > two.rowH ? three : two) };
  }
  // wider tables take whichever column count gives the largest seats (ties
  // go to more columns, which keeps rows short and the seats well-shaped)
  let best = fitFor(w < 760 ? 3 : 2);
  for (const cols of [3, 4]) {
    if (cols > n) break;
    const c = fitFor(cols);
    if (c.rowH >= best.rowH - 2) best = c;
  }
  return { gap, ...best };
}

/* ---------------------- phase stage (keyed remount) --------------------- */

function Stage({
  view,
  youId,
  spectating,
  send,
}: {
  view: AvalonView;
  youId: string;
  spectating: boolean;
  send: (m: unknown) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const seats = useMemo(() => [...view.players].sort((a, b) => a.seat - b.seat), [view.players]);
  const byId = useMemo(() => new Map(view.players.map((p) => [p.id, p])), [view.players]);
  const evilSet = useMemo(() => new Set(view.knowledge?.evilIds ?? []), [view.knowledge]);
  const pairSet = useMemo(() => new Set(view.knowledge?.merlinCandidates ?? []), [view.knowledge]);
  const teamSet = new Set(view.team);
  const votedSet = new Set(view.votedIds);
  const sealedSet = new Set(view.questSubmittedIds);

  const isLeader = view.leaderId === youId && !spectating;
  const isAssassin = view.yourRole === "assassin" && !spectating;
  const onTeam = teamSet.has(youId);
  const size = view.quests[view.quest - 1]?.size ?? 0;
  const leaderName = byId.get(view.leaderId)?.name ?? "The leader";

  const picking = view.phase === "team" && isLeader && !sent;
  const striking = view.phase === "assassination" && isAssassin && !sent;

  const markFor = (p: AvalonViewPlayer): Mark => {
    if (view.phase === "over") return null;
    if (evilSet.size && evilSet.has(p.id) && p.id !== youId)
      return view.yourFaction === "evil" ? "ally" : "seen";
    if (pairSet.has(p.id)) return "pair";
    return null;
  };

  const toggle = (id: string) => {
    if (picking) {
      setPicked((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < size ? [...prev, id] : prev
      );
    } else if (striking) {
      setPicked((prev) => (prev[0] === id ? [] : [id]));
    }
  };

  const selectable = (p: AvalonViewPlayer) =>
    (picking && !p.left) || (striking && !p.left && !evilSet.has(p.id));

  const votesIn = view.votedIds.length;
  const cardsIn = view.questSubmittedIds.length;

  const [tableRef, table] = useBox<HTMLDivElement>();
  const { cols, gap, rowH } = seatLayout(table.w, table.h, seats.length);
  const narrow = cols >= 3 && table.w / cols < 140;
  const lastRowStart = seats.length - (seats.length % cols || cols);
  const orphanOffset = cols - (seats.length - lastRowStart);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={tableRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div
          className="grid min-h-full content-center"
          style={{
            gridTemplateColumns: `repeat(${cols * 2}, minmax(0, 1fr))`,
            gridAutoRows: rowH,
            gap,
          }}
          role="list"
          aria-label="Players"
        >
          {seats.map((p, i) => (
            <SeatCard
              key={p.id}
              rowH={rowH}
              narrow={narrow}
              style={{
                gridColumn: `${i === lastRowStart && orphanOffset > 0 ? orphanOffset + 1 : "auto"} / span 2`,
              }}
              player={p}
              isYou={p.id === youId}
              isLeader={p.id === view.leaderId && view.phase !== "over"}
              onTeam={teamSet.has(p.id)}
              voted={view.phase === "vote" && votedSet.has(p.id)}
              sealed={view.phase === "quest" && sealedSet.has(p.id)}
              mark={markFor(p)}
              selectable={selectable(p)}
              selected={picked.includes(p.id)}
              onSelect={() => toggle(p.id)}
            />
          ))}
        </div>
      </div>

      {/* ------------------------- action dock ------------------------- */}
      <div className="mt-3 shrink-0 lg:mt-4">
        {view.phase === "team" ? (
          picking ? (
            <Panel className="p-3 sm:p-4">
              <div className="flex flex-col items-center gap-2.5 sm:flex-row sm:justify-between sm:gap-3">
                <div>
                  <div className="text-center text-[9px] uppercase tracking-[0.28em] text-[#d6c389] sm:text-left">You wear the circlet</div>
                  <div className="mt-1 text-center text-sm text-[#b9c6d8] sm:text-left">
                    Choose <b className="text-[#dfe8f2]">{size}</b> companions — you may ride yourself.
                    <span className="ml-2 text-[#7d94ad] tabular-nums">
                      {picked.length}/{size}
                    </span>
                  </div>
                </div>
                <Button
                  variant="primary"
                  disabled={picked.length !== size}
                  onClick={() => {
                    setSent(true);
                    send({ type: "propose", team: picked });
                  }}
                >
                  Send the quest party
                </Button>
              </div>
            </Panel>
          ) : (
            <div className="border border-[#3c4f6b]/40 bg-black/20 p-3 text-center text-xs text-[#7d94ad] sm:p-4 lg:text-[13px]">
              {isLeader
                ? "The proposal is sealed…"
                : `${leaderName} is assembling a party of ${size} for quest ${ROMAN[view.quest - 1]}…`}
            </div>
          )
        ) : null}

        {view.phase === "vote" ? (
          !spectating && !sent && view.yourVote === undefined && !votedSet.has(youId) ? (
            <Panel className="p-3 sm:p-4">
              <div className="text-center text-[9px] uppercase tracking-[0.28em] text-[#7d94ad]">
                Place your token · hidden until all are in
              </div>
              <div className="mt-2.5 flex items-center justify-center gap-6 sm:mt-3 lg:gap-10">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.93 }}
                  onClick={() => {
                    setSent(true);
                    avalonSfx("clink");
                    send({ type: "vote", approve: true });
                  }}
                  className="grid h-[72px] w-[72px] place-items-center rounded-full border-2 border-[#dfe8f2]/80 text-[10px] font-bold uppercase tracking-[0.14em] text-[#0d1526] shadow-[0_6px_24px_rgba(185,198,216,.25)] sm:h-20 sm:w-20 lg:h-24 lg:w-24 lg:text-[11px]"
                  style={{ background: "radial-gradient(circle at 35% 30%, #dfe8f2, #7d94ad 78%)" }}
                >
                  Approve
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.93 }}
                  onClick={() => {
                    setSent(true);
                    avalonSfx("clink");
                    send({ type: "vote", approve: false });
                  }}
                  className="grid h-[72px] w-[72px] place-items-center rounded-full border-2 border-[#e0556d]/80 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f2c9d1] shadow-[0_6px_24px_rgba(224,85,109,.25)] sm:h-20 sm:w-20 lg:h-24 lg:w-24 lg:text-[11px]"
                  style={{ background: "radial-gradient(circle at 35% 30%, #a1273a, #3a1020 78%)" }}
                >
                  Reject
                </motion.button>
              </div>
              <div className="mt-2.5 text-center text-[10px] text-[#5f7189] tabular-nums sm:mt-3">
                {votesIn}/{view.players.length} tokens placed
              </div>
            </Panel>
          ) : (
            <div className="border border-[#3c4f6b]/40 bg-black/20 p-3 text-center text-xs text-[#7d94ad] tabular-nums sm:p-4 lg:text-[13px]">
              {!spectating && view.yourVote !== undefined
                ? `Your token is on the table — you ${view.yourVote ? "approved" : "refused"}. `
                : "The council votes… "}
              {votesIn}/{view.players.length} tokens placed.
            </div>
          )
        ) : null}

        {view.phase === "quest" ? (
          onTeam && !spectating && !sent && view.yourQuestCard === undefined ? (
            <Panel className="p-3 sm:p-4">
              <div className="text-center text-[9px] uppercase tracking-[0.28em] text-[#7d94ad]">
                Play your quest card · only shuffled counts return
              </div>
              <div className="mt-2.5 flex items-center justify-center gap-4 sm:mt-3 lg:gap-6">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    setSent(true);
                    avalonSfx("parchment");
                    send({ type: "quest", success: true });
                  }}
                  className="w-32 border-2 border-[#4a6f8e] px-3 py-4 text-center lg:w-40 lg:py-6"
                  style={{ background: "linear-gradient(160deg, #f0e6cd, #d9c9a5)" }}
                >
                  <div className={`${uncial.className} text-sm text-[#2c4a63] lg:text-base`}>Success</div>
                  <div className="mt-1 text-[8px] uppercase tracking-[0.2em] text-[#4a6f8e]">For Camelot</div>
                </motion.button>
                {view.yourFaction === "evil" ? (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      setSent(true);
                      avalonSfx("parchment");
                      send({ type: "quest", success: false });
                    }}
                    className="w-32 border-2 border-[#7e2231] px-3 py-4 text-center lg:w-40 lg:py-6"
                    style={{ background: "linear-gradient(160deg, #f0e6cd, #d9c9a5)" }}
                  >
                    <div className={`${uncial.className} text-sm text-[#7e2231] lg:text-base`}>Fail</div>
                    <div className="mt-1 text-[8px] uppercase tracking-[0.2em] text-[#7e2231]">For Mordred</div>
                  </motion.button>
                ) : (
                  <div className="w-32 border border-dashed border-[#55627a]/40 px-3 py-4 text-center text-[9.5px] leading-4 text-[#5f7189] lg:w-40 lg:py-6 lg:text-[10.5px]">
                    You are sworn to the quest — good cannot play Fail.
                  </div>
                )}
              </div>
              <div className="mt-2.5 text-center text-[10px] text-[#5f7189] tabular-nums sm:mt-3">
                {cardsIn}/{view.team.length} cards returned
              </div>
            </Panel>
          ) : (
            <div className="border border-[#3c4f6b]/40 bg-black/20 p-3 text-center text-xs text-[#7d94ad] tabular-nums sm:p-4 lg:text-[13px]">
              {onTeam && !spectating && view.yourQuestCard !== undefined
                ? `Your card is sealed — you played ${view.yourQuestCard ? "Success" : "Fail"}. `
                : "The party rides in silence… "}
              {cardsIn}/{view.team.length} cards returned.
            </div>
          )
        ) : null}

        {view.phase === "assassination" ? (
          isAssassin ? (
            <Panel className="p-3 sm:p-4">
              <div className="flex flex-col items-center gap-2.5 sm:flex-row sm:justify-between sm:gap-3">
                <div>
                  <div className="text-center text-[9px] uppercase tracking-[0.28em] text-[#e0556d] sm:text-left">One throw remains</div>
                  <div className="mt-1 text-center text-sm text-[#b9c6d8] sm:text-left">
                    Choose who is <b className="text-[#dfe8f2]">Merlin</b>. Hit, and the game is stolen.
                  </div>
                </div>
                <Button
                  variant="danger"
                  disabled={picked.length !== 1 || sent}
                  onClick={() => {
                    setSent(true);
                    avalonSfx("dagger");
                    send({ type: "assassinate", target: picked[0] });
                  }}
                >
                  {picked[0] ? `Strike ${byId.get(picked[0])?.name ?? ""}` : "Strike"}
                </Button>
              </div>
            </Panel>
          ) : (
            <motion.div
              className="border border-[#a1273a]/50 bg-[#1c060c]/70 p-4 text-center sm:p-5"
              animate={{ opacity: [0.75, 1, 0.75] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className={`${uncial.className} text-base text-[#e0556d]`}>The Assassin is choosing…</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-[#8a5560]">
                {view.yourFaction === "evil" ? "Your blade-brother weighs the throw" : "Hold your breath"}
              </div>
            </motion.div>
          )
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------- role sidebar ----------------------------- */

function roleKnowledge(view: AvalonView, youId: string): string {
  const byId = new Map(view.players.map((p) => [p.id, p.name]));
  if (view.yourFaction === "evil") {
    const others = (view.knowledge?.evilIds ?? []).filter((id) => id !== youId).map((id) => byId.get(id) ?? id);
    return `Mordred's own: ${others.join(", ")}. Their roles stay veiled, even to you.`;
  }
  if (view.yourRole === "merlin") {
    const evils = (view.knowledge?.evilIds ?? []).map((id) => byId.get(id) ?? id);
    return `Mordred's minions are ${evils.join(", ")}. Guard this — the Assassin hunts you.`;
  }
  if (view.yourRole === "percival") {
    const pair = (view.knowledge?.merlinCandidates ?? []).map((id) => byId.get(id) ?? id);
    return `One of ${pair.join(" and ")} is Merlin — the other is Morgana.`;
  }
  return "You know only your loyalty. Watch the votes; trust is earned.";
}

function RolePanel({
  view,
  youId,
  hidden,
  onToggle,
  cardW,
}: {
  view: AvalonView;
  youId: string;
  hidden: boolean;
  onToggle: () => void;
  cardW: number;
}) {
  if (!view.yourRole || !view.yourFaction) return null;
  const meta = ROLE_META[view.yourRole];
  const you = view.players.find((p) => p.id === youId);
  const variant = you ? you.seat : 0;
  const roomy = cardW >= 112;

  return (
    <Panel className="shrink-0 p-4">
      <div className="text-[9px] uppercase tracking-[0.3em] text-[#7d94ad]">Your sealed role</div>
      <div className="mt-3 flex items-start gap-3.5">
        <FlipRoleCard role={view.yourRole} variant={variant} w={cardW} hidden={hidden} onToggle={onToggle} />
        <div className="min-w-0 flex-1">
          <div className={`${uncial.className} ${roomy ? "text-lg leading-6" : "text-base leading-5"}`} style={{ color: meta.color }}>
            {hidden ? "Hidden" : meta.title}
          </div>
          {!hidden ? (
            <p className={`mt-1.5 text-[#7d94ad] ${roomy ? "text-[12px] leading-[18px]" : "text-[11px] leading-4"}`}>{meta.blurb}</p>
          ) : (
            <p className={`mt-1.5 text-[#5f7189] ${roomy ? "text-[12px] leading-[18px]" : "text-[11px] leading-4"}`}>
              Tap the card when no one is looking.
            </p>
          )}
        </div>
      </div>
      {!hidden ? (
        <div
          className={`mt-3 border px-3 py-2.5 ${roomy ? "text-[12px] leading-[18px]" : "text-[11px] leading-4"}`}
          style={{
            borderColor: "#b9a97e66",
            background: "linear-gradient(160deg, #efe5cc, #dbcda6)",
            color: "#3a2f1d",
          }}
        >
          <span className={`${uncial.className} mr-1 text-[10px] text-[#6f5f41]`}>You know:</span>
          {roleKnowledge(view, youId)}
        </div>
      ) : null}
      <div className="mt-2 text-center text-[8.5px] uppercase tracking-[0.2em] text-[#4d5b70]">
        Tap the card to flip it {hidden ? "face-up" : "face-down"}
      </div>
    </Panel>
  );
}

/** Below the desktop breakpoint the role rides in one compact strip under the
    table: the card (still tap-to-hide), its name and what it lets you know. */
function RoleStrip({
  view,
  youId,
  hidden,
  onToggle,
  cardW,
}: {
  view: AvalonView;
  youId: string;
  hidden: boolean;
  onToggle: () => void;
  cardW: number;
}) {
  if (!view.yourRole || !view.yourFaction) return null;
  const meta = ROLE_META[view.yourRole];
  const you = view.players.find((p) => p.id === youId);
  const roomy = cardW >= 72;
  // on short phones the strip slims down: a smaller card, two lines of what
  // you know, and the flip hint folds into the card's own tooltip
  const slim = cardW < 50;
  return (
    <Panel className={`shrink-0 ${slim ? "px-2.5 py-2" : "px-3 py-2.5"}`}>
      <div className={`flex items-center ${slim ? "gap-2.5" : "gap-3"}`}>
        <FlipRoleCard role={view.yourRole} variant={you ? you.seat : 0} w={cardW} hidden={hidden} onToggle={onToggle} />
        <div className="min-w-0 flex-1">
          <div
            className={`${uncial.className} truncate ${roomy ? "text-lg" : slim ? "text-[14px]" : "text-[15px]"} leading-5`}
            style={{ color: hidden ? "#7d94ad" : meta.color }}
          >
            {hidden ? "Your sealed role" : meta.title}
          </div>
          <p
            className={`text-[#9db1c7] ${
              roomy ? "mt-1 line-clamp-3 text-[12.5px] leading-[18px]" : slim ? "mt-0.5 line-clamp-2 text-[11px] leading-[15px]" : "mt-1 line-clamp-3 text-[11px] leading-4"
            }`}
          >
            {hidden ? "Face-down. Tap the card when no one is looking." : roleKnowledge(view, youId)}
          </p>
          {slim ? null : (
            <div className="mt-1 text-[8px] uppercase tracking-[0.2em] text-[#4d5b70]">
              tap the card to {hidden ? "reveal" : "hide"} it
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ChronicleList({ log }: { log: AvalonLogEntry[] }) {
  return (
    <div className="space-y-2.5" aria-live="polite">
      {[...log].reverse().map((entry, index) => (
        <div
          key={entry.i}
          className={`border-l pl-3 ${index === 0 ? "border-[#8fb8de] text-[#b9c6d8]" : "border-[#3c4f6b] text-[#5f7189]"}`}
        >
          <div className="text-[11.5px] leading-4">{logText(entry)}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- screen -------------------------------- */

const TOOL_BTN =
  "grid h-8 w-8 shrink-0 place-items-center border border-[#3c4f6b]/50 text-[#7d94ad] transition-colors hover:border-[#8fb8de]/60 hover:text-[#cfe4f7]";

export function AvalonScreen({
  view,
  party,
  youId,
  isHost,
  skew,
  spectating,
  move,
  playAgain,
  exitToLobby,
}: GameScreenProps<AvalonView>) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileLogOpen, setMobileLogOpen] = useState(false);
  const [cardHidden, setCardHidden] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const now = useServerNow(view.now, skew);
  const clock = formatClock(view.deadline, now);
  const urgent = Boolean(view.deadline && view.deadline - now < 10_000);
  const copy = PHASE_COPY[view.phase];

  // the play column's box drives the board's scale and the role card's size:
  // the board takes up to a quarter of the column's height, the rest is the
  // table and the action dock
  const [playRef, play] = useBox<HTMLDivElement>();
  const boardK = fitQuestBoard(view.quests, play.w, play.h * 0.25);
  // short, narrow columns (phones) drop the phase hint and slim the role strip
  const tight = play.h > 0 && play.h < 700 && play.w < 700;
  const desktopCardW = play.h >= 940 ? 132 : play.h >= 780 ? 116 : 100;
  const stripCardW = tight ? 42 : play.w >= 600 && play.h >= 820 ? 84 : 54;
  const showRole = !spectating && !!view.yourRole;

  const prevViewRef = useRef<AvalonView | null>(null);
  useEffect(() => {
    playAvalonDiff(prevViewRef.current, view, youId);
    prevViewRef.current = view;
  }, [view, youId]);

  useEffect(() => {
    document.title = mustAct(view, youId) ? "● Your move — Avalon" : "Avalon";
  }, [view, youId]);

  useEffect(() => {
    if (view.phase !== "assassination") return;
    const id = window.setInterval(() => avalonSfx("heartbeat"), 2600);
    return () => window.clearInterval(id);
  }, [view.phase]);

  // reveal moments, gated by log timestamps so late joiners don't replay them
  const lastVoteLog = useMemo(() => [...view.log].reverse().find((l) => l.kind === "vote"), [view.log]);
  const lastQuestLog = useMemo(() => [...view.log].reverse().find((l) => l.kind === "quest"), [view.log]);
  const lastProposal = view.proposals.length ? view.proposals[view.proposals.length - 1] : null;
  const questRevealActive = Boolean(
    lastQuestLog &&
      typeof lastQuestLog.quest === "number" &&
      view.phase !== "over" &&
      now - lastQuestLog.ts < 6400
  );
  const voteRevealActive = Boolean(
    !questRevealActive && lastVoteLog && lastProposal && view.phase !== "over" && now - lastVoteLog.ts < 5100
  );

  return (
    <div
      className="relative flex h-dvh shrink-0 flex-col overflow-hidden text-[#b9c6d8]"
      style={{
        background:
          "radial-gradient(90% 65% at 50% -12%, rgba(143,184,222,.16), transparent 62%), radial-gradient(120% 100% at 50% 20%, #0d1526 0%, #070b14 70%)",
      }}
      onPointerDown={primeSound}
    >
      {/* cold moonlight shafts */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.10]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(104deg, transparent 0, transparent 54px, rgba(207,228,247,.05) 55px, transparent 56px)",
        }}
      />
      {view.phase === "assassination" ? (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[5]"
          style={{ background: "radial-gradient(75% 75% at 50% 50%, transparent 34%, rgba(161,39,58,.3))" }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}

      <header className="relative z-10 shrink-0 border-b border-[#3c4f6b]/40">
        <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-2 px-3 pb-2 pt-[max(.5rem,env(safe-area-inset-top))] sm:px-6">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className={`${uncial.className} text-base tracking-[0.16em] text-[#dfe8f2] sm:tracking-[0.3em]`}>AVALON</h1>
            <span className="hidden truncate text-[9px] uppercase tracking-[0.22em] text-[#5f7189] sm:inline">
              Quest {ROMAN[view.quest - 1]} · Proposal {Math.min(view.rejects + 1, 5)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => setHistoryOpen(true)} aria-label="Open vote history" className={TOOL_BTN}>
              <Icons.book size={15} />
            </button>
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              aria-label={muted ? "Unmute sounds" : "Mute sounds"}
              className={TOOL_BTN}
            >
              {muted ? <Icons.volumeOff size={15} /> : <Icons.volumeOn size={15} />}
            </button>
            <button
              type="button"
              onClick={() => setMobileLogOpen((open) => !open)}
              aria-label={mobileLogOpen ? "Hide chronicle" : "Show chronicle"}
              aria-expanded={mobileLogOpen}
              className={`${TOOL_BTN} lg:hidden`}
            >
              <Icons.scroll size={15} />
            </button>
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              aria-label="Open Avalon rules"
              className="h-8 min-w-8 shrink-0 border border-[#3c4f6b]/50 px-1 text-[9px] uppercase tracking-[0.18em] text-[#7d94ad] transition-colors hover:border-[#8fb8de]/60 hover:text-[#cfe4f7] sm:px-2.5"
            >
              <span className={`${uncial.className} text-[15px] tracking-normal sm:hidden`} aria-hidden>
                ?
              </span>
              <span className="hidden sm:inline">Rules</span>
            </button>
            <PartyMenu
              className="ml-1 hover:text-[#cfe4f7]"
              style={{ borderRadius: 0, borderColor: "rgba(60,79,107,.5)", color: "#9db1c7" }}
            />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 gap-5 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 xl:gap-6">
        <div ref={playRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <QuestBoard quests={view.quests} current={view.quest} rejects={view.rejects} over={view.phase === "over"} k={boardK} />

          <section className="mt-3 flex shrink-0 items-end justify-between gap-3 border-b border-[#3c4f6b]/40 pb-2.5 lg:mt-4 lg:pb-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] uppercase tracking-[0.3em] text-[#7d94ad]">
                <span>{copy.eyebrow}</span>
                {spectating ? (
                  <span className="border border-[#8fb8de]/40 bg-[#16283f]/70 px-1.5 py-px text-[8.5px] tracking-[0.22em] text-[#8fb8de]">
                    Watching from the gallery
                  </span>
                ) : null}
              </div>
              <h2 className={`${uncial.className} mt-1 text-lg leading-tight text-[#dfe8f2] sm:text-2xl 2xl:text-[28px]`}>
                {copy.title}
              </h2>
              {tight ? null : (
                <p className="mt-1 line-clamp-2 max-w-2xl text-[11px] leading-4 text-[#5f7189] lg:text-[12px] 2xl:text-[13px]">
                  {copy.hint}
                </p>
              )}
            </div>
            <Timer text={clock} urgent={urgent} />
          </section>

          <div className="mt-3 flex min-h-0 flex-1 flex-col lg:mt-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${view.phase}-${view.quest}-${view.rejects}`}
                className="flex min-h-0 flex-1 flex-col"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: EASE }}
              >
                <Stage
                  key={`${view.phase}-${view.quest}-${view.rejects}`}
                  view={view}
                  youId={youId}
                  spectating={spectating}
                  send={move}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {showRole ? (
            <div className="mt-3 shrink-0 lg:hidden">
              <RoleStrip
                view={view}
                youId={youId}
                hidden={cardHidden}
                onToggle={() => setCardHidden((h) => !h)}
                cardW={stripCardW}
              />
            </div>
          ) : null}
        </div>

        <aside className="hidden min-h-0 w-[clamp(290px,24vw,380px)] shrink-0 flex-col gap-4 lg:flex">
          {showRole ? (
            <RolePanel
              view={view}
              youId={youId}
              hidden={cardHidden}
              onToggle={() => setCardHidden((h) => !h)}
              cardW={desktopCardW}
            />
          ) : null}
          <Panel className="flex min-h-0 flex-1 flex-col p-4">
            <div className="flex shrink-0 items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.3em] text-[#7d94ad]">Chronicle</div>
              <span className="font-mono text-[9px] text-[#4d5b70] tabular-nums">{view.log.length}</span>
            </div>
            <div className="scroll-thin mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <ChronicleList log={view.log} />
            </div>
          </Panel>
        </aside>
      </main>

      {/* below desktop the chronicle is a sheet over the table, never a page scroll */}
      <AnimatePresence>
        {mobileLogOpen ? (
          <motion.div
            className="absolute inset-0 z-20 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="absolute inset-0 bg-[#05080f]/70 backdrop-blur-[2px]" onClick={() => setMobileLogOpen(false)} />
            <motion.div
              role="dialog"
              aria-label="Chronicle"
              className="absolute inset-x-0 bottom-0 flex max-h-[72%] flex-col border-t border-[#55627a]/60 bg-[#0b1322] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_60px_rgba(0,0,0,.6)]"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE }}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#3c4f6b]/40 pb-2.5">
                <div className="text-[9px] uppercase tracking-[0.3em] text-[#7d94ad]">
                  Chronicle <span className="ml-1 font-mono text-[#4d5b70]">{view.log.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileLogOpen(false)}
                  aria-label="Close chronicle"
                  className={TOOL_BTN}
                >
                  <Icons.x size={14} />
                </button>
              </div>
              <div className="scroll-thin mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                <ChronicleList log={view.log} />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {voteRevealActive && lastProposal ? (
        <VoteRevealOverlay proposal={lastProposal} players={view.players} reduce={reduceMotion} />
      ) : null}
      {questRevealActive && lastQuestLog?.quest ? (
        <QuestRevealOverlay
          quest={view.quests[lastQuestLog.quest - 1]}
          questNumber={lastQuestLog.quest}
          reduce={reduceMotion}
        />
      ) : null}

      <AvalonRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <VoteHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        proposals={view.proposals}
        players={view.players}
      />
      <AnimatePresence>
        {view.phase === "over" ? (
          <GameOverOverlay
            view={view}
            tallies={party.tallies.avalon ?? {}}
            isHost={isHost}
            youId={youId}
            playAgain={playAgain}
            exitToLobby={exitToLobby}
            reduce={reduceMotion}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
