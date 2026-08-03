"use client";

/* The Resistance: Avalon — moonlit Camelot. Quest board of stone medallions,
   a round table of seats, simultaneous vote reveals, anonymous quest cards
   and one dagger at the end. */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { QuestBoard } from "./QuestBoard";
import { FlipRoleCard } from "./RoleCard";
import { avalonSfx, mustAct, playAvalonDiff } from "./sfx";

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
}) {
  const content = (
    <>
      <div className="relative">
        <Medallion name={player.name} seat={player.seat} size={42} dim={player.left} />
        {isLeader ? (
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[#d6c389]" title="Quest leader">
            <CircletIcon size={15} />
          </span>
        ) : null}
        {mark ? (
          <span
            className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full border text-[7px] font-bold"
            style={
              mark === "pair"
                ? { borderColor: "#d6c389", background: "#1a2438", color: "#d6c389" }
                : { borderColor: "#e0556d", background: "#3a1020", color: "#e0556d" }
            }
            title={mark === "ally" ? "Fellow minion" : mark === "seen" ? "Seen by Merlin" : "Merlin or Morgana"}
          >
            {mark === "ally" ? "M" : mark === "seen" ? "◆" : "?"}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] font-medium ${player.left ? "text-[#5f6673] line-through" : "text-[#dfe8f2]"}`}>
          {player.name}
          {isYou ? <span className="ml-1 text-[8px] uppercase tracking-widest text-[#7d94ad]">you</span> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[8px] uppercase tracking-[0.16em] text-[#5f7189]">
          <span>{player.left ? "fled" : `seat ${player.seat + 1}`}</span>
          {onTeam ? <span className="text-[#8fb8de]">· party</span> : null}
          {voted ? <span className="text-[#d6c389]">· voted</span> : null}
          {sealed ? <span className="text-[#d6c389]">· sealed</span> : null}
        </div>
      </div>
    </>
  );

  const ring = selected
    ? "border-[#d6c389] bg-[#2a2410]/60 shadow-[0_0_18px_rgba(214,195,137,.22)]"
    : onTeam
      ? "border-[#8fb8de]/80 bg-[#16283f]/70 shadow-[0_0_16px_rgba(143,184,222,.18)]"
      : "border-[#3c4f6b]/45 bg-[#0d1526]/75";

  if (!selectable) {
    return <div className={`flex min-h-[62px] items-center gap-2.5 border px-2.5 py-2 ${ring}`}>{content}</div>;
  }
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Choose ${player.name}`}
      className={`flex min-h-[62px] w-full items-center gap-2.5 border px-2.5 py-2 text-left transition-colors hover:border-[#8fb8de]/70 ${ring}`}
    >
      {content}
    </motion.button>
  );
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

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Players">
        {seats.map((p) => (
          <SeatCard
            key={p.id}
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

      {/* ------------------------- action dock ------------------------- */}
      <div className="mt-4">
        {view.phase === "team" ? (
          picking ? (
            <Panel className="p-4">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.28em] text-[#d6c389]">You wear the circlet</div>
                  <div className="mt-1 text-sm text-[#b9c6d8]">
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
            <div className="border border-[#3c4f6b]/40 bg-black/20 p-4 text-center text-xs text-[#7d94ad]">
              {isLeader
                ? "The proposal is sealed…"
                : `${leaderName} is assembling a party of ${size} for quest ${ROMAN[view.quest - 1]}…`}
            </div>
          )
        ) : null}

        {view.phase === "vote" ? (
          !spectating && !sent && view.yourVote === undefined && !votedSet.has(youId) ? (
            <Panel className="p-4">
              <div className="text-center text-[9px] uppercase tracking-[0.28em] text-[#7d94ad]">
                Place your token · hidden until all are in
              </div>
              <div className="mt-3 flex items-center justify-center gap-6">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.93 }}
                  onClick={() => {
                    setSent(true);
                    avalonSfx("clink");
                    send({ type: "vote", approve: true });
                  }}
                  className="grid h-20 w-20 place-items-center rounded-full border-2 border-[#dfe8f2]/80 text-[10px] font-bold uppercase tracking-[0.14em] text-[#0d1526] shadow-[0_6px_24px_rgba(185,198,216,.25)]"
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
                  className="grid h-20 w-20 place-items-center rounded-full border-2 border-[#e0556d]/80 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f2c9d1] shadow-[0_6px_24px_rgba(224,85,109,.25)]"
                  style={{ background: "radial-gradient(circle at 35% 30%, #a1273a, #3a1020 78%)" }}
                >
                  Reject
                </motion.button>
              </div>
              <div className="mt-3 text-center text-[10px] text-[#5f7189] tabular-nums">
                {votesIn}/{view.players.length} tokens placed
              </div>
            </Panel>
          ) : (
            <div className="border border-[#3c4f6b]/40 bg-black/20 p-4 text-center text-xs text-[#7d94ad] tabular-nums">
              {!spectating && view.yourVote !== undefined
                ? `Your token is on the table — you ${view.yourVote ? "approved" : "refused"}. `
                : "The council votes… "}
              {votesIn}/{view.players.length} tokens placed.
            </div>
          )
        ) : null}

        {view.phase === "quest" ? (
          onTeam && !spectating && !sent && view.yourQuestCard === undefined ? (
            <Panel className="p-4">
              <div className="text-center text-[9px] uppercase tracking-[0.28em] text-[#7d94ad]">
                Play your quest card · only shuffled counts return
              </div>
              <div className="mt-3 flex items-center justify-center gap-4">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    setSent(true);
                    avalonSfx("parchment");
                    send({ type: "quest", success: true });
                  }}
                  className="w-32 border-2 border-[#4a6f8e] px-3 py-4 text-center"
                  style={{ background: "linear-gradient(160deg, #f0e6cd, #d9c9a5)" }}
                >
                  <div className={`${uncial.className} text-sm text-[#2c4a63]`}>Success</div>
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
                    className="w-32 border-2 border-[#7e2231] px-3 py-4 text-center"
                    style={{ background: "linear-gradient(160deg, #f0e6cd, #d9c9a5)" }}
                  >
                    <div className={`${uncial.className} text-sm text-[#7e2231]`}>Fail</div>
                    <div className="mt-1 text-[8px] uppercase tracking-[0.2em] text-[#7e2231]">For Mordred</div>
                  </motion.button>
                ) : (
                  <div className="w-32 border border-dashed border-[#55627a]/40 px-3 py-4 text-center text-[9px] leading-4 text-[#5f7189]">
                    You are sworn to the quest — good cannot play Fail.
                  </div>
                )}
              </div>
              <div className="mt-3 text-center text-[10px] text-[#5f7189] tabular-nums">
                {cardsIn}/{view.team.length} cards returned
              </div>
            </Panel>
          ) : (
            <div className="border border-[#3c4f6b]/40 bg-black/20 p-4 text-center text-xs text-[#7d94ad] tabular-nums">
              {onTeam && !spectating && view.yourQuestCard !== undefined
                ? `Your card is sealed — you played ${view.yourQuestCard ? "Success" : "Fail"}. `
                : "The party rides in silence… "}
              {cardsIn}/{view.team.length} cards returned.
            </div>
          )
        ) : null}

        {view.phase === "assassination" ? (
          isAssassin ? (
            <Panel className="p-4">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.28em] text-[#e0556d]">One throw remains</div>
                  <div className="mt-1 text-sm text-[#b9c6d8]">
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
              className="border border-[#a1273a]/50 bg-[#1c060c]/70 p-5 text-center"
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

function RolePanel({ view, youId, hidden, onToggle }: { view: AvalonView; youId: string; hidden: boolean; onToggle: () => void }) {
  if (!view.yourRole || !view.yourFaction) return null;
  const meta = ROLE_META[view.yourRole];
  const byId = new Map(view.players.map((p) => [p.id, p.name]));
  const you = view.players.find((p) => p.id === youId);
  const variant = you ? you.seat : 0;

  let knowledgeText: string;
  if (view.yourFaction === "evil") {
    const others = (view.knowledge?.evilIds ?? []).filter((id) => id !== youId).map((id) => byId.get(id) ?? id);
    knowledgeText = `Mordred's own: ${others.join(", ")}. Their roles stay veiled, even to you.`;
  } else if (view.yourRole === "merlin") {
    const evils = (view.knowledge?.evilIds ?? []).map((id) => byId.get(id) ?? id);
    knowledgeText = `Mordred's minions are ${evils.join(", ")}. Guard this — the Assassin hunts you.`;
  } else if (view.yourRole === "percival") {
    const pair = (view.knowledge?.merlinCandidates ?? []).map((id) => byId.get(id) ?? id);
    knowledgeText = `One of ${pair.join(" and ")} is Merlin — the other is Morgana.`;
  } else {
    knowledgeText = "You know only your loyalty. Watch the votes; trust is earned.";
  }

  return (
    <Panel className="p-4">
      <div className="text-[9px] uppercase tracking-[0.3em] text-[#7d94ad]">Your sealed role</div>
      <div className="mt-3 flex items-start gap-3">
        <FlipRoleCard role={view.yourRole} variant={variant} w={104} hidden={hidden} onToggle={onToggle} />
        <div className="min-w-0 flex-1">
          <div className={`${uncial.className} text-base leading-5`} style={{ color: meta.color }}>
            {hidden ? "Hidden" : meta.title}
          </div>
          {!hidden ? (
            <p className="mt-1.5 text-[11px] leading-4 text-[#7d94ad]">{meta.blurb}</p>
          ) : (
            <p className="mt-1.5 text-[11px] leading-4 text-[#5f7189]">Tap the card when no one is looking.</p>
          )}
        </div>
      </div>
      {!hidden ? (
        <div
          className="mt-3 border px-3 py-2.5 text-[11px] leading-4"
          style={{
            borderColor: "#b9a97e66",
            background: "linear-gradient(160deg, #efe5cc, #dbcda6)",
            color: "#3a2f1d",
          }}
        >
          <span className={`${uncial.className} mr-1 text-[10px] text-[#6f5f41]`}>You know:</span>
          {knowledgeText}
        </div>
      ) : null}
      <div className="mt-2 text-center text-[8px] uppercase tracking-[0.2em] text-[#4d5b70]">
        Tap the card to flip it face-down
      </div>
    </Panel>
  );
}

/* ------------------------------- screen -------------------------------- */

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
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden text-[#b9c6d8]"
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

      <header className="relative z-10 flex items-center justify-between border-b border-[#3c4f6b]/40 px-3 pb-2 pt-[max(.65rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className={`${uncial.className} text-base tracking-[0.3em] text-[#dfe8f2]`}>AVALON</h1>
          <span className="hidden text-[9px] uppercase tracking-[0.22em] text-[#5f7189] sm:inline">
            Quest {ROMAN[view.quest - 1]} · Proposal {Math.min(view.rejects + 1, 5)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open vote history"
            className="grid h-8 w-8 place-items-center border border-[#3c4f6b]/50 text-[#7d94ad] transition-colors hover:border-[#8fb8de]/60 hover:text-[#cfe4f7]"
          >
            <Icons.book size={15} />
          </button>
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className="grid h-8 w-8 place-items-center border border-[#3c4f6b]/50 text-[#7d94ad] transition-colors hover:border-[#8fb8de]/60 hover:text-[#cfe4f7]"
          >
            {muted ? <Icons.volumeOff size={15} /> : <Icons.volumeOn size={15} />}
          </button>
          <button
            type="button"
            onClick={() => setMobileLogOpen((open) => !open)}
            aria-label={mobileLogOpen ? "Hide chronicle" : "Show chronicle"}
            aria-expanded={mobileLogOpen}
            className="grid h-8 w-8 place-items-center border border-[#3c4f6b]/50 text-[#7d94ad] transition-colors hover:border-[#8fb8de]/60 hover:text-[#cfe4f7] lg:hidden"
          >
            <Icons.scroll size={15} />
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            aria-label="Open Avalon rules"
            className="h-8 border border-[#3c4f6b]/50 px-2.5 text-[9px] uppercase tracking-[0.18em] text-[#7d94ad] transition-colors hover:border-[#8fb8de]/60 hover:text-[#cfe4f7]"
          >
            Rules
          </button>
        </div>
      </header>

      {spectating ? (
        <div className="relative z-10 mx-auto mt-2 w-fit border border-[#8fb8de]/40 bg-[#16283f]/70 px-3 py-1 text-[9px] uppercase tracking-[0.24em] text-[#8fb8de]">
          Watching from the gallery
        </div>
      ) : null}

      <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-4 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <QuestBoard quests={view.quests} current={view.quest} rejects={view.rejects} over={view.phase === "over"} />

          <section className="mb-3 mt-4 flex items-end justify-between border-b border-[#3c4f6b]/40 pb-3">
            <div>
              <div className="text-[9px] uppercase tracking-[0.3em] text-[#7d94ad]">{copy.eyebrow}</div>
              <h2 className={`${uncial.className} mt-1 text-xl text-[#dfe8f2] sm:text-2xl`}>{copy.title}</h2>
              <p className="mt-1 max-w-xl text-[11px] leading-4 text-[#5f7189]">{copy.hint}</p>
            </div>
            <Timer text={clock} urgent={urgent} />
          </section>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${view.phase}-${view.quest}-${view.rejects}`}
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

          {!spectating ? (
            <div className="mt-4 lg:hidden">
              <RolePanel view={view} youId={youId} hidden={cardHidden} onToggle={() => setCardHidden((h) => !h)} />
            </div>
          ) : null}
        </div>

        <aside className="min-w-0">
          {!spectating ? (
            <div className="mb-4 hidden lg:block">
              <RolePanel view={view} youId={youId} hidden={cardHidden} onToggle={() => setCardHidden((h) => !h)} />
            </div>
          ) : null}
          <div className={`${mobileLogOpen ? "block" : "hidden"} lg:block`}>
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-[9px] uppercase tracking-[0.3em] text-[#7d94ad]">Chronicle</div>
                <span className="font-mono text-[9px] text-[#4d5b70] tabular-nums">{view.log.length}</span>
              </div>
              <div className="mt-3 max-h-[30dvh] space-y-2.5 overflow-y-auto pr-1 lg:max-h-[48dvh]" aria-live="polite">
                {[...view.log].reverse().map((entry, index) => (
                  <div
                    key={entry.i}
                    className={`border-l pl-3 ${index === 0 ? "border-[#8fb8de] text-[#b9c6d8]" : "border-[#3c4f6b] text-[#5f7189]"}`}
                  >
                    <div className="text-[11px] leading-4">{logText(entry)}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </aside>
      </main>

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
