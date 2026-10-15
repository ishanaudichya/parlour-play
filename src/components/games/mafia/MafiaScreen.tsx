"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PartyMenu } from "@/components/party/PartyMenu";
import { Button, Icons, Medallion, Panel } from "@/components/ui";
import {
  getMutedServerSnapshot,
  getMutedSnapshot,
  primeSound,
  setMuted,
  subscribeMuted,
} from "@/lib/client/synthCore";
import { sfx, type SfxName } from "@/lib/client/sound";
import type { MafiaMove, MafiaView } from "@/lib/games/mafia/types";
import type { GameScreenProps } from "@/lib/party/types";
import { MafiaRulesModal } from "./RulesModal";

type Player = MafiaView["players"][number];
type LogEntry = MafiaView["log"][number];

const PHASE_COPY: Record<MafiaView["phase"], { eyebrow: string; title: string; hint: string }> = {
  role_reveal: {
    eyebrow: "Private dossier",
    title: "Know your part",
    hint: "Commit your role to memory. Never show this screen to the room.",
  },
  night: {
    eyebrow: "The city sleeps",
    title: "Night falls",
    hint: "Special roles act in secret. The town waits for morning.",
  },
  dawn: {
    eyebrow: "First light",
    title: "Dawn report",
    hint: "The night has spoken. Take note of who is missing.",
  },
  discussion: {
    eyebrow: "Open floor",
    title: "Make your case",
    hint: "Question every story. The guilty only need one convincing lie.",
  },
  vote: {
    eyebrow: "Sealed verdict",
    title: "Cast your vote",
    hint: "Choose one living suspect. Ballots stay secret until the verdict.",
  },
  runoff: {
    eyebrow: "Deadlocked jury",
    title: "Final ballot",
    hint: "The vote is tied. Choose between the remaining suspects.",
  },
  over: {
    eyebrow: "Case closed",
    title: "The city knows",
    hint: "The surviving side has claimed the town.",
  },
};

const LOG_SFX: Partial<Record<LogEntry["kind"], SfxName>> = {
  night: "whoosh",
  dawn: "deal",
  no_death: "block",
  vote: "turn",
  runoff: "challenge",
  eliminated: "eliminated",
  left: "lose",
};

const ROLE_META: Record<string, { label: string; glyph: string; accent: string; description: string }> = {
  mafia: {
    label: "Mafia",
    glyph: "M",
    accent: "#b95c5c",
    description: "Choose a victim with your allies. Stay hidden until the Mafia controls the vote.",
  },
  detective: {
    label: "Detective",
    glyph: "D",
    accent: "#85a6be",
    description: "Investigate one living player each night. Your results remain private.",
  },
  doctor: {
    label: "Doctor",
    glyph: "+",
    accent: "#8aae8e",
    description: "Protect one living player each night. A correct choice can stop the killing.",
  },
  villager: {
    label: "Villager",
    glyph: "V",
    accent: "#c3a873",
    description: "You have no night action. Listen closely and help vote out every Mafia member.",
  },
};

function roleMeta(role: string | undefined) {
  const key = role?.toLowerCase() ?? "villager";
  return (
    ROLE_META[key] ?? {
      label: role ? role.replaceAll("_", " ") : "Observer",
      glyph: role?.slice(0, 1).toUpperCase() ?? "?",
      accent: "#c3a873",
      description: role ? "Use your information carefully and play for your team." : "The roles remain hidden from you.",
    }
  );
}

function useServerNow(serverNow: number, skew: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + skew), 250);
    return () => window.clearInterval(id);
  }, [skew]);
  return Math.max(serverNow, now);
}

function formatClock(deadline: number | null | undefined, now: number) {
  if (!deadline) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function logText(entry: LogEntry) {
  const actor = entry.actor ?? "Someone";
  const target = entry.target ?? "someone";
  switch (entry.kind) {
    case "start":
      return "The town has gone quiet.";
    case "night":
      return "Night fell over the town.";
    case "dawn":
      return entry.detail ?? "Morning broke over an uneasy town.";
    case "eliminated":
      return `${target} was eliminated${entry.role ? ` — ${entry.role}` : ""}.`;
    case "no_death":
      return "No one died in the night.";
    case "discussion":
      return "The town opened the floor for discussion.";
    case "vote":
      return "Voting opened.";
    case "runoff":
      return "The verdict was tied. A runoff began.";
    case "win":
      return entry.detail ?? `${entry.team ?? "A team"} won the game.`;
    case "left":
      return `${actor} left the town.`;
    default:
      return entry.detail ?? `${actor} acted.`;
  }
}

function publicSummary(value: unknown, playersById: Map<string, Player>) {
  if (value == null) return null;
  if (typeof value === "string") return playersById.get(value)?.name ?? value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const message = record.detail ?? record.summary ?? record.message;
    if (typeof message === "string") return message;
    const target = record.targetId ?? record.playerId ?? record.victimId;
    const killed = record.killedId;
    if (typeof killed === "string") return `${playersById.get(killed)?.name ?? killed} did not survive the night.`;
    if (record.noDeath === true) return "No one died in the night.";
    if (typeof target === "string") {
      const name = playersById.get(target)?.name ?? target;
      return record.saved === true ? `${name} survived the night.` : `${name} did not survive.`;
    }
  }
  return "The town received a new report.";
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[9px] font-semibold uppercase tracking-[0.3em] text-[#8f897e]">{children}</div>;
}

function Timer({ text, urgent }: { text: string | null; urgent: boolean }) {
  if (!text) return null;
  return (
    <div
      className={`min-w-[58px] border px-2.5 py-1 text-center font-mono text-xs tabular-nums ${
        urgent ? "border-[#a54e4e]/60 bg-[#321719]/60 text-[#efaaaa]" : "border-[#8f7855]/35 bg-black/20 text-[#d7c49e]"
      }`}
      aria-label={`${text} remaining`}
    >
      {text}
    </div>
  );
}

type CardMode = { tile: boolean; med: number };

function PlayerCard({
  player,
  isYou,
  selectable,
  selected,
  voted,
  mafia,
  votes,
  verdict,
  mode,
  onSelect,
}: {
  player: Player;
  isYou: boolean;
  selectable: boolean;
  selected: boolean;
  voted: boolean;
  mafia: boolean;
  votes: number;
  /** the detective's private finding on this player */
  verdict?: "mafia" | "clear";
  mode: CardMode;
  onSelect: () => void;
}) {
  const dead = !player.alive || player.left;
  const { tile, med } = mode;
  const big = tile && med >= 64;
  const huge = tile && med >= 100;
  const medallion = (
    <div className="relative shrink-0">
      <Medallion name={player.name} seat={player.seat} size={med} dim={dead} />
      {dead ? (
        <span
          className={`absolute -bottom-1 -right-1 grid place-items-center rounded-full border border-[#6d6760] bg-[#121416] text-[#aaa39a] ${
            big ? "h-7 w-7" : "h-5 w-5"
          }`}
        >
          <Icons.skull size={big ? 15 : 12} />
        </span>
      ) : null}
    </div>
  );
  const name = (
    <div
      className={`truncate font-medium ${huge ? "text-[22px]" : big ? "text-lg" : tile ? "text-[15px]" : "text-sm"} ${
        dead ? "text-[#6f6d68] line-through" : "text-[#e6dfd2]"
      }`}
    >
      {player.name}
      {isYou ? <span className="ml-1 text-[9px] uppercase tracking-widest text-[#9c8b6a]">you</span> : null}
    </div>
  );
  const meta = (
    <div
      className={`mt-0.5 flex flex-wrap items-center gap-1.5 uppercase tracking-[0.14em] text-[#777873] ${
        huge ? "justify-center text-[10.5px]" : tile ? "justify-center text-[9.5px]" : "text-[9px]"
      }`}
    >
      <span>{player.left ? "left town" : player.alive ? `seat ${player.seat + 1}` : "eliminated"}</span>
      {player.revealedRole ? <span className="text-[#b7a47f]">· {player.revealedRole}</span> : null}
      {mafia && !dead && !isYou ? <span className="text-[#c86b6b]">· ally</span> : null}
    </div>
  );
  const marks = (
    <>
      {verdict ? (
        <span
          className={`border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] ${
            verdict === "mafia"
              ? "border-[#9f4e4e]/50 bg-[#321719]/70 text-[#e39191]"
              : "border-[#5f7f66]/45 bg-[#16241a]/70 text-[#a6c9ab]"
          }`}
          title="Your investigation"
        >
          {verdict === "mafia" ? "mafia" : "clear"}
        </span>
      ) : null}
      {voted ? <span className="text-[8px] uppercase tracking-[0.18em] text-[#bba77e]">voted</span> : null}
      {votes > 0 ? (
        <span className="rounded-full border border-[#984c4c]/35 bg-[#2d1719] px-1.5 py-0.5 text-[9px] text-[#dc8c8c]">
          {votes}
        </span>
      ) : null}
    </>
  );

  const content = tile ? (
    <>
      <div className="absolute right-2 top-2 flex flex-col items-end gap-1">{marks}</div>
      {medallion}
      <div className={`w-full min-w-0 px-1 text-center ${huge ? "mt-4" : "mt-2.5"}`}>
        {name}
        {meta}
      </div>
    </>
  ) : (
    <>
      {medallion}
      <div className="min-w-0 flex-1">
        {name}
        {meta}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">{marks}</div>
    </>
  );

  const shape = tile
    ? "relative flex h-full min-h-0 flex-col items-center justify-center px-2 py-3"
    : "relative flex h-full min-h-[52px] items-center gap-3 px-3 py-2";

  if (!selectable) {
    return (
      <div className={`${shape} border border-[#777064]/20 bg-[#111416]/70 ${dead ? "opacity-60" : ""}`}>{content}</div>
    );
  }

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.985 }}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Choose ${player.name}`}
      className={`${shape} w-full border text-left transition-colors ${
        selected
          ? "border-[#c4a56d]/75 bg-[#3a2b18]/70 shadow-[0_0_22px_rgba(185,151,91,.12)]"
          : "border-[#777064]/25 bg-[#111416]/75 hover:border-[#a28b63]/55 hover:bg-[#181a1b]"
      }`}
    >
      {content}
    </motion.button>
  );
}

/** Measure an element (before paint) and keep the size current. */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((b) => (Math.abs(b.w - r.width) < 1 && Math.abs(b.h - r.height) < 1 ? b : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** Lay the register out to fill its box: as many rows as make the cards
    biggest, portrait tiles when there's height for them, rows when not. */
function registerLayout(w: number, h: number, n: number, gap: number) {
  if (!w || !h) return { cols: w && w < 640 ? 2 : 3, mode: { tile: false, med: 40 } as CardMode, scroll: false };
  let best = { cols: 1, score: -1, cw: w, ch: h };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    if (cols > 1 && Math.ceil(n / (cols - 1)) === rows) continue;
    const cw = (w - (cols - 1) * gap) / cols;
    const ch = (h - (rows - 1) * gap) / rows;
    // a tile reads best near square; a row card wants ~3:1 and at least 52px tall
    const fill = (n / (cols * rows)) ** 1.5; // a full grid beats one with holes
    const score = (ch >= 120 && cw >= 110 ? Math.min(cw, ch * 1.15) : Math.min(cw / 3, ch) * 0.9) * fill;
    if (score > best.score) best = { cols, score, cw, ch };
  }
  const tile = best.ch >= 120 && best.cw >= 110;
  const med = tile
    ? Math.round(Math.max(44, Math.min(124, best.cw * 0.42, best.ch * 0.4)))
    : Math.round(Math.max(30, Math.min(44, best.ch - 18)));
  // too little room for even compact rows: let the register scroll inside itself
  const scroll = !tile && best.ch < 52;
  return { cols: best.cols, mode: { tile, med } as CardMode, scroll };
}

function RoleDossier({
  role,
  mafiaNames,
  investigationCount,
  compact = false,
  large = false,
}: {
  role: string | undefined;
  mafiaNames: string[];
  investigationCount: number;
  /** a single line, for phones — the full brief was read at the reveal */
  compact?: boolean;
  /** the reveal itself: given room to breathe */
  large?: boolean;
}) {
  const meta = roleMeta(role);
  if (compact) {
    return (
      <div className="flex items-center gap-3 border border-[#8d7854]/30 bg-[#101214]/90 px-3 py-2">
        <div
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-semibold"
          style={{ color: meta.accent, borderColor: `${meta.accent}77`, background: `${meta.accent}12` }}
        >
          {meta.glyph}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[8.5px] uppercase tracking-[0.26em] text-[#8f897e]">Your sealed role</div>
          <div className="truncate text-[13px] font-semibold capitalize tracking-[0.1em]" style={{ color: meta.accent }}>
            {meta.label}
            {mafiaNames.length > 0 ? (
              <span className="ml-2 text-[11px] font-normal normal-case tracking-normal text-[#a8a59e]">
                with <span className="text-[#d27c7c]">{mafiaNames.join(", ")}</span>
              </span>
            ) : null}
          </div>
        </div>
        {investigationCount > 0 ? (
          <span className="shrink-0 text-[9px] uppercase tracking-[0.16em] text-[#849bad]">
            {investigationCount} found
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden border border-[#8d7854]/35 bg-[#101214]/90 ${large ? "p-5 sm:p-7" : "p-4"}`}>
      <div className={`absolute rounded-full border border-[#aa8d59]/10 ${large ? "-right-10 -top-14 h-44 w-44" : "-right-8 -top-10 h-28 w-28"}`} />
      <SectionLabel>Your sealed role</SectionLabel>
      <div className={`flex items-center ${large ? "mt-4 gap-5" : "mt-3 gap-3"}`}>
        <div
          className={`grid shrink-0 place-items-center rounded-full border font-semibold ${
            large ? "h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl" : "h-12 w-12 text-lg"
          }`}
          style={{ color: meta.accent, borderColor: `${meta.accent}77`, background: `${meta.accent}12` }}
        >
          {meta.glyph}
        </div>
        <div>
          <div
            className={`font-semibold capitalize tracking-[0.12em] ${large ? "text-2xl sm:text-3xl" : "text-lg"}`}
            style={{ color: meta.accent }}
          >
            {meta.label}
          </div>
          <p className={`mt-1 max-w-xl text-[#a8a59e] ${large ? "text-[13px] leading-6 sm:text-sm" : "text-[12px] leading-5"}`}>
            {meta.description}
          </p>
        </div>
      </div>
      {mafiaNames.length > 0 ? (
        <div className="mt-3 border-t border-[#8d7854]/20 pt-3 text-[11px] text-[#a8a59e]">
          Known associates: <span className="text-[#d27c7c]">{mafiaNames.join(", ")}</span>
        </div>
      ) : null}
      {investigationCount > 0 ? (
        <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-[#849bad]">
          {investigationCount} investigation{investigationCount === 1 ? "" : "s"} recorded
        </div>
      ) : null}
    </div>
  );
}

function InvestigationLedger({ view, playersById }: { view: MafiaView; playersById: Map<string, Player> }) {
  if (view.investigationHistory.length === 0) return null;
  return (
    <Panel className="p-4">
      <SectionLabel>Private investigation ledger</SectionLabel>
      <div className="scroll-thin mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
        {view.investigationHistory.map((entry) => (
          <div key={`${entry.day}-${entry.targetId}`} className="flex items-center justify-between border-b border-white/5 pb-2 text-xs">
            <span className="text-[#aaa69d]">
              Day {entry.day} · {playersById.get(entry.targetId)?.name ?? "Unknown"}
            </span>
            <span className={entry.isMafia ? "text-[#df7e7e]" : "text-[#94b99a]"}>
              {entry.isMafia ? "MAFIA" : "NOT MAFIA"}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function GameOver({
  view,
  isHost,
  youId,
  tallies,
  playAgain,
  exitToLobby,
}: {
  view: MafiaView;
  isHost: boolean;
  youId: string;
  tallies: Record<string, number>;
  playAgain: () => void;
  exitToLobby: () => void;
}) {
  const winnerNames = view.winnerIds.map((id) => view.players.find((player) => player.id === id)?.name).filter(Boolean);
  const youWon = view.winnerIds.includes(youId);
  const winner = view.winner ? String(view.winner).replaceAll("_", " ") : "Unknown side";

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#060708]/90 px-4 pb-4 pt-16 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="max-h-[calc(100dvh_-_80px)] w-full max-w-md overflow-y-auto border border-[#9b8359]/45 bg-[#101214] p-6 text-center shadow-[0_24px_90px_rgba(0,0,0,.8)] sm:p-8 lg:max-w-lg lg:p-10"
        initial={{ y: 22, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
      >
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-[#b59b6c]/50 text-[#d8c18f]">
          {youWon ? <Icons.crown size={28} /> : <Icons.skull size={27} />}
        </div>
        <SectionLabel>{youWon ? "You survived the case" : "The case is closed"}</SectionLabel>
        <h2 className="mt-2 text-3xl font-semibold capitalize tracking-[0.1em] text-[#eee3cd]">{winner} win</h2>
        {winnerNames.length > 0 ? <p className="mt-2 text-sm text-[#99958c]">{winnerNames.join(" · ")}</p> : null}

        {Object.values(tallies).some((wins) => wins > 0) ? (
          <div className="mt-5 border-t border-[#8f7855]/25 pt-4 text-left">
            <SectionLabel>Mafia victories</SectionLabel>
            <div className="mt-2 space-y-1.5">
              {view.players
                .map((player) => ({ player, wins: tallies[player.id] ?? 0 }))
                .sort((a, b) => b.wins - a.wins)
                .map(({ player, wins }) => (
                  <div key={player.id} className="flex justify-between text-xs text-[#99958c]">
                    <span>{player.name}</span>
                    <span className="text-[#d8c18f]">★ {wins}</span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        <div className="my-6 h-px bg-gradient-to-r from-transparent via-[#8f7855]/50 to-transparent" />
        {isHost ? (
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={playAgain} className="w-full">
              Reopen the case
            </Button>
            <Button variant="outline" onClick={exitToLobby} className="w-full">
              Return to lobby
            </Button>
          </div>
        ) : (
          <div className="border border-dashed border-[#7d7567]/35 px-4 py-3 text-xs text-[#89867f]">
            Waiting for the host…
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export function MafiaScreen({
  view,
  party,
  youId,
  isHost,
  skew,
  spectating,
  move,
  playAgain,
  exitToLobby,
}: GameScreenProps<MafiaView>) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [readySent, setReadySent] = useState(false);
  const [mobileLogOpen, setMobileLogOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const now = useServerNow(view.now, skew);
  const clock = formatClock(view.deadline, now);
  const urgent = Boolean(view.deadline && view.deadline - now < 10_000);
  const phaseCopy = PHASE_COPY[view.phase];
  const me = view.players.find((player) => player.id === youId);
  const role = view.yourRole?.toLowerCase();
  const playersById = useMemo(() => new Map(view.players.map((player) => [player.id, player])), [view.players]);
  const mafiaSet = useMemo(() => new Set(view.mafiaIds), [view.mafiaIds]);
  const votedSet = useMemo(() => new Set(view.votedIds), [view.votedIds]);
  const runoffSet = useMemo(() => new Set(view.runoffTargets), [view.runoffTargets]);
  const mafiaVoteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const targetId of Object.values(view.mafiaVotes)) counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    return counts;
  }, [view.mafiaVotes]);
  const sortedPlayers = useMemo(() => [...view.players].sort((a, b) => a.seat - b.seat), [view.players]);
  const mafiaNames =
    role === "mafia"
      ? view.mafiaIds
          .filter((id) => id !== youId)
          .map((id) => playersById.get(id)?.name)
          .filter((name): name is string => Boolean(name))
      : [];

  const send = useCallback((nextMove: MafiaMove) => move(nextMove), [move]);
  const previousPhase = useRef(view.phase);
  const lastLogRef = useRef(view.log.at(-1)?.i ?? 0);
  useEffect(() => {
    if (previousPhase.current !== view.phase) {
      setReadySent(false);
      previousPhase.current = view.phase;
    }
  }, [view.phase]);

  useEffect(() => {
    const fresh = view.log.filter((entry) => entry.i > lastLogRef.current);
    for (const entry of fresh) {
      if (entry.kind === "win") sfx(view.winnerIds.includes(youId) ? "win" : "defeat");
      else {
        const cue = LOG_SFX[entry.kind];
        if (cue) sfx(cue);
      }
    }
    lastLogRef.current = view.log.at(-1)?.i ?? lastLogRef.current;
  }, [view.log, view.winnerIds, youId]);

  useEffect(() => {
    document.title = view.phase === "night" && !spectating ? "● Night action — Mafia" : "Mafia";
  }, [spectating, view.phase]);

  const canNightAct = Boolean(
    !spectating && me?.alive && view.phase === "night" && role && role !== "villager",
  );
  const canVote = Boolean(!spectating && me?.alive && (view.phase === "vote" || view.phase === "runoff"));

  const selectable = (player: Player) => {
    if (!player.alive || player.left) return false;
    if (canVote) return player.id !== youId && (view.phase !== "runoff" || runoffSet.has(player.id));
    if (!canNightAct) return false;
    if (role === "mafia") return player.id !== youId && !mafiaSet.has(player.id);
    if (role === "detective") return player.id !== youId;
    if (role === "doctor") return player.id !== view.unavailableNightTarget;
    return true;
  };

  const selectedTarget = canVote ? view.yourVote : canNightAct ? view.yourNightTarget : undefined;
  const latestLog = view.log.at(-1);
  const dawnSummary = publicSummary(view.nightSummary, playersById);
  const elimination = publicSummary(view.lastElimination, playersById);

  const verdicts = useMemo(() => {
    const map = new Map<string, "mafia" | "clear">();
    for (const entry of view.investigationHistory) map.set(entry.targetId, entry.isMafia ? "mafia" : "clear");
    return map;
  }, [view.investigationHistory]);

  // the register fills whatever height the phase panel leaves it
  const [gridRef, gridBox] = useBox<HTMLDivElement>();
  const gridGap = gridBox.w && gridBox.w < 640 ? 8 : 10;
  const reg = registerLayout(gridBox.w, gridBox.h, sortedPlayers.length, gridGap);
  const showDossier = !spectating && view.phase !== "role_reveal" && view.phase !== "over";

  const toolBtn =
    "grid h-8 w-8 place-items-center border border-[#766e61]/30 text-[#99958c] transition-colors hover:border-[#a58b5e]/55 hover:text-[#d6c39d]";

  const record = (
    <>
      <div className="flex items-center justify-between">
        <SectionLabel>Town record</SectionLabel>
        <span className="font-mono text-[9px] text-[#696b68]">{view.log.length} entries</span>
      </div>
      <div className="scroll-thin mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {[...view.log].reverse().map((entry, index) => (
          <div
            key={entry.i}
            className={`border-l pl-3 ${index === 0 ? "border-[#a98c5b] text-[#c9c1b1]" : "border-[#55534e] text-[#84847f]"}`}
          >
            <div className="text-[11.5px] leading-4">{logText(entry)}</div>
            <div className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[#5e605d]">entry {entry.i}</div>
          </div>
        ))}
        {view.log.length === 0 ? <div className="text-xs italic text-[#6e706d]">No testimony yet.</div> : null}
      </div>
      {latestLog ? (
        <div className="mt-4 shrink-0 border-t border-[#8d7854]/20 pt-3 text-[10px] italic leading-4 text-[#85847f]">
          “{logText(latestLog)}”
        </div>
      ) : null}
    </>
  );

  return (
    <div
      className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-[#090b0d] text-[#ded8cc]"
      style={{
        background:
          "radial-gradient(80% 60% at 50% -10%, rgba(166,139,91,.15), transparent 70%), linear-gradient(160deg, #15191b 0%, #090b0d 62%, #070809 100%)",
      }}
      onPointerDown={primeSound}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(112deg, transparent 0, transparent 42px, rgba(255,255,255,.035) 43px, transparent 44px)",
        }}
      />

      {/* the game's own header — above the game-over and log overlays so the
          Parlour menu (invite, sound, end, leave) is reachable in every phase */}
      <header className="relative z-[45] flex shrink-0 items-center justify-between gap-3 border-b border-[#8f7855]/20 bg-[#0b0d0f]/60 px-3 pb-2 pt-[max(.6rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-[0.42em] text-[#e2cfaa]">MAFIA</h1>
          {spectating ? (
            <span className="hidden truncate border border-[#75889a]/35 bg-[#111a21]/75 px-2 py-0.5 text-[8.5px] uppercase tracking-[0.2em] text-[#91aabc] sm:inline">
              Observer
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className={toolBtn}
          >
            {muted ? <Icons.volumeOff size={15} /> : <Icons.volumeOn size={15} />}
          </button>
          <button
            type="button"
            onClick={() => setMobileLogOpen((open) => !open)}
            aria-label={mobileLogOpen ? "Hide event log" : "Show event log"}
            aria-expanded={mobileLogOpen}
            className={`${toolBtn} lg:hidden ${mobileLogOpen ? "border-[#a58b5e]/55 text-[#d6c39d]" : ""}`}
          >
            <Icons.scroll size={15} />
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            aria-label="Open Mafia rules"
            className="grid h-8 min-w-8 place-items-center border border-[#766e61]/30 text-[9px] uppercase tracking-[0.18em] text-[#99958c] transition-colors hover:border-[#a58b5e]/55 hover:text-[#d6c39d] sm:px-2.5"
          >
            <Icons.book size={15} className="sm:hidden" />
            <span className="hidden sm:inline">Rules</span>
          </button>
          <PartyMenu className="ml-1 text-[#d6c39d]" />
        </div>
      </header>

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1560px] flex-1 gap-5 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-4 xl:gap-7">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <section className="mb-3 flex shrink-0 items-end justify-between gap-3 border-b border-[#8d7854]/20 pb-2.5 sm:mb-4 sm:pb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-[#9d8964]">
                {phaseCopy.eyebrow}
                {spectating ? (
                  <span className="border border-[#75889a]/35 bg-[#111a21]/75 px-1.5 py-px text-[8px] tracking-[0.2em] text-[#91aabc] sm:hidden">
                    Observer
                  </span>
                ) : null}
              </div>
              <h2 className="mt-1 text-xl font-medium tracking-[0.05em] text-[#eee5d4] sm:text-3xl xl:text-4xl">
                {phaseCopy.title}
              </h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-[1.45] text-[#898b87] sm:text-[12px] sm:leading-5">
                {phaseCopy.hint}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="text-[9px] uppercase tracking-[0.22em] text-[#777974]">Day {view.day}</span>
              <Timer text={clock} urgent={urgent} />
            </div>
          </section>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view.phase}
              className="shrink-0"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
              transition={{ duration: reduceMotion ? 0 : 0.24 }}
            >
              {view.phase === "role_reveal" ? (
                <div className="mb-3 sm:mb-4">
                  <RoleDossier
                    role={spectating ? undefined : view.yourRole}
                    mafiaNames={mafiaNames}
                    investigationCount={0}
                    large
                  />
                  {!spectating ? (
                    <Button
                      variant="primary"
                      disabled={readySent}
                      onClick={() => {
                        setReadySent(true);
                        send({ type: "ready" });
                      }}
                      className="mt-3 w-full !py-3"
                    >
                      {readySent ? "Dossier sealed" : "I understand my role"}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {view.phase === "night" && canNightAct ? (
                <div className="mb-3 border border-[#5f7180]/30 bg-[#10171d]/65 p-3 text-[11.5px] leading-5 text-[#a8b3bb] sm:mb-4 sm:text-[12.5px]">
                  {view.yourNightTarget
                    ? `Your choice is locked on ${playersById.get(view.yourNightTarget)?.name ?? "a player"}. You may change it before night ends.`
                    : role === "mafia"
                      ? "Choose the Mafia's intended victim. Your allies' current votes are marked."
                      : `Choose one player for your ${role ?? "night"} action.`}
                </div>
              ) : null}

              {view.phase === "night" && !canNightAct ? (
                <div className="mb-3 border border-[#6a6f70]/25 bg-black/20 p-3 text-center text-xs text-[#888b89] sm:mb-4 sm:p-4 sm:text-[13px]">
                  {me?.alive && !spectating ? "You have no action tonight. Keep watch and wait for dawn." : "Night actions are being resolved…"}
                </div>
              ) : null}

              {view.phase === "dawn" ? (
                <Panel className="mb-3 p-4 text-center sm:mb-4 sm:p-6">
                  <Icons.skull size={25} className="mx-auto mb-2 text-[#a45b5b]" />
                  <SectionLabel>Overnight report</SectionLabel>
                  <div className="mt-2 text-lg text-[#ded3bf] sm:text-xl">{dawnSummary ?? "The streets are quiet at first light."}</div>
                  {elimination && elimination !== dawnSummary ? <div className="mt-1 text-xs text-[#98958e]">{elimination}</div> : null}
                </Panel>
              ) : null}

              {view.phase === "discussion" ? (
                <div className="mb-3 border-l-2 border-[#aa8d59]/55 bg-[#151617]/70 px-4 py-3 text-xs leading-5 text-[#aaa69d] sm:mb-4 sm:text-[13px] sm:leading-6">
                  The floor is open. Compare stories aloud, challenge convenient alibis, and watch who rushes the town
                  toward a verdict.
                </div>
              ) : null}

              {(view.phase === "vote" || view.phase === "runoff") && me && !me.alive ? (
                <div className="mb-3 border border-[#715e5e]/30 bg-[#1c1415]/45 p-3 text-center text-xs text-[#9d8989] sm:mb-4">
                  Eliminated players cannot vote.
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>

          <div className="mb-2 flex shrink-0 items-center justify-between">
            <SectionLabel>{canNightAct ? "Choose a target" : canVote ? "Choose a suspect" : "Town register"}</SectionLabel>
            <span className="text-[9px] uppercase tracking-[0.16em] text-[#6f716e]">
              {view.players.filter((player) => player.alive && !player.left).length} alive
            </span>
          </div>

          <div ref={gridRef} className={`relative min-h-0 flex-1 ${reg.scroll ? "scroll-thin overflow-y-auto" : ""}`}>
            <div
              className={`grid ${reg.scroll ? "" : "absolute inset-0"}`}
              style={{
                gap: gridGap,
                gridTemplateColumns: `repeat(${reg.cols}, minmax(0, 1fr))`,
                gridAutoRows: reg.scroll ? "56px" : "1fr",
              }}
            >
              {sortedPlayers.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isYou={player.id === youId}
                  selectable={selectable(player)}
                  selected={selectedTarget === player.id}
                  voted={votedSet.has(player.id)}
                  mafia={role === "mafia" && mafiaSet.has(player.id)}
                  votes={role === "mafia" && view.phase === "night" ? (mafiaVoteCounts.get(player.id) ?? 0) : 0}
                  verdict={role === "detective" ? verdicts.get(player.id) : undefined}
                  mode={reg.mode}
                  onSelect={() =>
                    send(
                      canVote
                        ? { type: "vote", target: player.id }
                        : { type: "night_target", target: player.id },
                    )
                  }
                />
              ))}
            </div>
          </div>

          {canVote ? (
            <Button
              variant="ghost"
              className="mt-2 w-full shrink-0 !border-[#766e61]/30 sm:mt-3"
              onClick={() => send({ type: "vote", target: null })}
            >
              {votedSet.has(youId) && view.yourVote === null ? "Abstention sealed" : "Abstain from this ballot"}
            </Button>
          ) : null}

          {showDossier ? (
            <div className="mt-2 shrink-0 sm:mt-3 lg:hidden">
              <RoleDossier
                role={view.yourRole}
                mafiaNames={mafiaNames}
                investigationCount={view.investigationHistory.length}
                compact
              />
            </div>
          ) : null}
        </main>

        {/* desktop: your brief and the record stay in view beside the town */}
        <aside className="hidden min-h-0 w-[clamp(280px,24vw,360px)] shrink-0 flex-col gap-3 lg:flex">
          {showDossier ? (
            <div className="shrink-0">
              <RoleDossier role={view.yourRole} mafiaNames={mafiaNames} investigationCount={view.investigationHistory.length} />
            </div>
          ) : null}
          {role === "detective" ? (
            <div className="shrink-0">
              <InvestigationLedger view={view} playersById={playersById} />
            </div>
          ) : null}
          <Panel className="flex min-h-0 flex-1 flex-col p-4">{record}</Panel>
        </aside>
      </div>

      {/* phones & tablets: the record (and the detective's ledger) as a sheet */}
      <AnimatePresence>
        {mobileLogOpen ? (
          <>
            <motion.div
              key="log-scrim"
              className="fixed inset-0 z-[43] bg-black/55 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileLogOpen(false)}
            />
            <motion.div
              key="log-sheet"
              className="fixed inset-x-0 bottom-0 z-[44] flex max-h-[72dvh] flex-col gap-3 border-t border-[#8f7855]/30 bg-[#0d0f11]/97 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_60px_rgba(0,0,0,.6)] sm:px-6 lg:hidden"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mx-auto h-1 w-10 shrink-0 rounded-full bg-[#55534e]" aria-hidden />
              {role === "detective" ? (
                <div className="shrink-0">
                  <InvestigationLedger view={view} playersById={playersById} />
                </div>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col p-1">{record}</div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <MafiaRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <AnimatePresence>
        {view.phase === "over" ? (
          <GameOver
            view={view}
            isHost={isHost}
            youId={youId}
            tallies={party.tallies.mafia ?? {}}
            playAgain={playAgain}
            exitToLobby={exitToLobby}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
