"use client";

/* Secret Hitler — a 1930s ministry in letterpress. Aged newsprint, heavy ink,
   vermillion alarms. Two track plates, a rotating placard, sealed dossiers,
   JA!/NEIN! ballots that flip in unison, and ministry orders when the
   fascist track fills. */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PartyMenu } from "@/components/party/PartyMenu";
import { Icons, Medallion } from "@/components/ui";
import {
  getMutedServerSnapshot,
  getMutedSnapshot,
  primeSound,
  setMuted,
  subscribeMuted,
} from "@/lib/client/synthCore";
import { POWER_META } from "@/lib/games/secrethitler/meta";
import type { SecretHitlerView, SHLogEntry, SHPower, SHViewPlayer } from "@/lib/games/secrethitler/types";
import type { GameScreenProps } from "@/lib/party/types";
import {
  EASE,
  FascistBoard,
  HALFTONE,
  INK,
  INK_FADE,
  INK_SOFT,
  LiberalBoard,
  PAPER,
  PolicyBack,
  PolicyTile,
  PRESS_SHADOW_SM,
  SLATE,
  SLATE_DEEP,
  VERM,
  VERM_DARK,
} from "./Boards";
import { FlipDossier, PartyCard } from "./Dossier";
import { oswald, typewriter } from "./font";
import {
  BallotRevealOverlay,
  ChaosOverlay,
  ExecutionOverlay,
  GameOverOverlay,
  HistoryDrawer,
  InkButton,
  InvestigationOverlay,
  RulesModal,
} from "./Overlays";
import { mustAct, playSecretHitlerDiff, shSfx } from "./sfx";
import { clamp, useBox } from "@/lib/client/useBox";

const PHASE_COPY: Record<SecretHitlerView["phase"], { eyebrow: string; title: string; hint: string }> = {
  nomination: {
    eyebrow: "The rotation",
    title: "Nominate a Chancellor",
    hint: "The President names a Chancellor. Term limits bar the last elected government.",
  },
  election: {
    eyebrow: "The house divides",
    title: "Vote JA! or NEIN!",
    hint: "Ballots stay sealed until every living player has voted — then all flip at once.",
  },
  legislative_president: {
    eyebrow: "The cabinet sits",
    title: "The President discards",
    hint: "Three policies in hand. One burns face-down; two pass to the Chancellor.",
  },
  legislative_chancellor: {
    eyebrow: "The cabinet sits",
    title: "The Chancellor enacts",
    hint: "Two policies remain. One becomes law; the other burns unseen.",
  },
  veto_consent: {
    eyebrow: "Article of veto",
    title: "The President rules",
    hint: "The Chancellor moves to burn both policies. Consent advances the election tracker.",
  },
  power_peek: {
    eyebrow: "Ministry order",
    title: "Policy peek",
    hint: "The President privately examines the top three policies of the deck.",
  },
  power_investigate: {
    eyebrow: "Ministry order",
    title: "Investigate loyalty",
    hint: "The President opens one party file. The result is theirs alone; the act is public.",
  },
  power_special: {
    eyebrow: "Ministry order",
    title: "Special election",
    hint: "The President appoints the next presidential candidate. Rotation resumes afterwards.",
  },
  power_execute: {
    eyebrow: "Ministry order",
    title: "Execution",
    hint: "The President signs one name. The role is never revealed — unless it was Hitler.",
  },
  over: {
    eyebrow: "The record",
    title: "The session ends",
    hint: "Every dossier lies open on the table.",
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

function logText(entry: SHLogEntry): string {
  switch (entry.kind) {
    case "start":
      return "The house convenes. Seventeen policies sit in the deck.";
    case "round":
      return entry.detail === "special"
        ? `${entry.actor ?? "Someone"} takes the placard by special election.`
        : `The placard passes to ${entry.actor ?? "the next seat"}.`;
    case "nominate":
      return `${entry.actor ?? "The President"} nominates ${entry.target ?? "someone"} for Chancellor.`;
    case "ballots":
      return entry.detail === "passed"
        ? `The government is elected, ${entry.ja}–${entry.nein}.`
        : `The government is rejected, ${entry.ja}–${entry.nein}. The tracker advances.`;
    case "cards":
      return `${entry.actor ?? "The President"} passes two policies to the Chancellor.`;
    case "enact":
      return entry.detail === "liberal" ? "A LIBERAL policy is enacted." : "A FASCIST policy is enacted.";
    case "chaos":
      return `The mob riots — the top policy is enacted: ${entry.detail?.toUpperCase()}. Term limits are forgotten.`;
    case "power":
      return `Ministry order: ${POWER_META[(entry.detail as SHPower) ?? "peek"].title}.`;
    case "peeked":
      return `${entry.actor ?? "The President"} has examined the top of the deck.`;
    case "investigate":
      return `${entry.actor ?? "The President"} investigated ${entry.target ?? "someone"}. The file stays sealed.`;
    case "special":
      return `${entry.actor ?? "The President"} appoints ${entry.target ?? "someone"} the next candidate.`;
    case "execute":
      return `${entry.actor ?? "The President"} executed ${entry.target ?? "someone"}.`;
    case "veto":
      return `${entry.actor ?? "The Chancellor"} moves to veto the session.`;
    case "veto_agree":
      return "The President consents — both policies burn, the tracker advances.";
    case "veto_refuse":
      return "The President refuses the veto. The Chancellor must enact.";
    case "shuffle":
      return "The discards shuffle back into the deck.";
    case "timeout":
      if (entry.detail === "nominate") return "The clock chose a lawful nominee.";
      if (entry.detail === "vote") return "The clock cast the missing ballots as NEIN!";
      if (entry.detail === "discard") return "The clock burned a policy for the silent President.";
      if (entry.detail === "enact") return "The clock enacted for the silent Chancellor.";
      if (entry.detail === "veto") return "Silence refuses the veto.";
      return "The clock resolved the ministry order.";
    case "left":
      return `${entry.actor ?? "Someone"} abandoned the table.`;
    case "win":
      return "The record is sealed.";
    default:
      return "The chamber murmurs.";
  }
}

function Timer({ text, urgent }: { text: string | null; urgent: boolean }) {
  if (!text) return null;
  return (
    <div
      className={`${typewriter.className} min-w-[56px] border-2 px-2.5 py-1 text-center text-xs tabular-nums`}
      style={
        urgent
          ? { borderColor: VERM_DARK, color: VERM_DARK, background: "#e8cdbd" }
          : { borderColor: INK, color: INK_SOFT, background: "#e2d6b6", boxShadow: PRESS_SHADOW_SM }
      }
      aria-label={`${text} remaining`}
    >
      {text}
    </div>
  );
}

type Size = "xs" | "sm" | "md" | "lg";

const TAG_TEXT: Record<Size, string> = {
  xs: "text-[7.5px] leading-[13px]",
  sm: "text-[8px] leading-4",
  md: "text-[10px] leading-[18px]",
  lg: "text-[11.5px] leading-5",
};

function Stamp({ text, tone = "verm", size = "sm" }: { text: string; tone?: "verm" | "slate" | "ink"; size?: Size }) {
  const color = tone === "verm" ? VERM_DARK : tone === "slate" ? SLATE_DEEP : INK;
  return (
    <span
      className={`${oswald.className} inline-block rotate-[-6deg] border-2 px-1 font-bold uppercase tracking-[0.12em] ${TAG_TEXT[size]}`}
      style={{ borderColor: color, color }}
    >
      {text}
    </span>
  );
}

function Placard({ text, tone, size = "sm" }: { text: string; tone: "ink" | "slate"; size?: Size }) {
  return (
    <span
      className={`${oswald.className} inline-block px-1.5 font-semibold uppercase tracking-[0.16em] ${TAG_TEXT[size]}`}
      style={{ background: tone === "ink" ? INK : SLATE, color: "#f1e6c8" }}
    >
      {text}
    </span>
  );
}

/* --------------------------------- seats -------------------------------- */

type SeatMark = "fascist" | "hitler" | null;

function SeatCard({
  player,
  isYou,
  isPresident,
  isNominee,
  isChancellor,
  voted,
  termLimited,
  investigated,
  mark,
  selectable,
  selected,
  onSelect,
  rowH,
  narrow,
  style,
}: {
  player: SHViewPlayer;
  isYou: boolean;
  isPresident: boolean;
  isNominee: boolean;
  isChancellor: boolean;
  voted: boolean;
  termLimited: boolean;
  investigated: boolean;
  mark: SeatMark;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  /** the row height the chamber gives this seat — everything inside scales from it */
  rowH: number;
  /** a slim column (three across a phone): tighter padding, smaller tags */
  narrow?: boolean;
  style?: React.CSSProperties;
}) {
  const dead = !player.alive;
  // below 44px a seat folds into a one-line chip; above, it grows in tiers
  const chip = rowH < 44;
  const tier = chip ? 0 : rowH < 78 ? 1 : rowH < 112 ? 2 : rowH < 150 ? 3 : 4;
  const medal = Math.round(clamp(rowH * (chip ? 0.68 : 0.54), 22, 100));
  const badge = Math.round(clamp(medal * 0.4, 13, 28));
  const tag: Size = narrow ? "xs" : (["xs", "sm", "md", "md", "lg"] as const)[tier];
  const nameCls = ["text-[11.5px]", "text-[12.5px]", "text-[15px]", "text-[18px]", "text-[21px]"][tier];
  const youCls = ["", "text-[7.5px]", "text-[9px]", "text-[9px]", "text-[10px]"][tier];
  const pad = narrow ? "gap-1.5 px-1.5" : ["gap-1.5 px-1.5", "gap-2.5 px-2.5", "gap-3.5 px-4", "gap-4 px-5", "gap-5 px-6"][tier];

  // chips keep only the offices, as one-letter placards
  const chipTags = (
    <>
      {isPresident && !dead ? <ChipTag letter="P" title="President" bg={INK} /> : null}
      {isNominee ? <ChipTag letter="N" title="Chancellor nominee" bg={SLATE} /> : null}
      {isChancellor ? <ChipTag letter="C" title="Chancellor" bg={SLATE} /> : null}
      {!dead && termLimited ? <ChipTag letter="T" title="Term-limited" bg={VERM_DARK} /> : null}
      {voted ? (
        <span className={`${typewriter.className} shrink-0 text-[10px]`} style={{ color: SLATE_DEEP }} title="Ballot in">
          ✓
        </span>
      ) : null}
    </>
  );

  const content = (
    <>
      <div className="relative shrink-0" style={dead ? { filter: "grayscale(1) contrast(0.85)" } : undefined}>
        <Medallion name={player.name} seat={player.seat} size={medal} dim={dead || player.left} />
        {dead ? (
          <svg viewBox="0 0 40 40" width={medal} height={medal} className="absolute inset-0" aria-hidden>
            <path d="M7 7 L33 33 M33 7 L7 33" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
          </svg>
        ) : null}
        {mark ? (
          <span
            className={`${oswald.className} absolute -bottom-1 -right-1 grid place-items-center border font-bold`}
            style={{
              width: badge,
              height: badge,
              fontSize: Math.round(badge * 0.5),
              ...(mark === "hitler"
                ? { background: INK, color: "#e05a33", borderColor: VERM }
                : { background: VERM, color: "#f1e6c8", borderColor: VERM_DARK }),
            }}
            title={mark === "hitler" ? "Hitler (known to you)" : "Fellow fascist (known to you)"}
          >
            {mark === "hitler" ? "H" : "F"}
          </span>
        ) : null}
      </div>
      {chip ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span
            className={`${typewriter.className} truncate ${nameCls} ${dead || player.left ? "line-through" : ""}`}
            style={{ color: dead ? INK_FADE : INK }}
          >
            {player.name}
          </span>
          {chipTags}
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span
              className={`${typewriter.className} truncate ${nameCls} ${dead || player.left ? "line-through" : ""}`}
              style={{ color: dead ? INK_FADE : INK }}
            >
              {player.name}
            </span>
            {isYou ? (
              <span className={`${oswald.className} shrink-0 uppercase tracking-[0.2em] ${youCls}`} style={{ color: INK_FADE }}>
                you
              </span>
            ) : null}
          </div>
          <div className={`flex flex-wrap items-center gap-1 ${tier >= 2 ? "mt-1.5" : "mt-0.5"}`}>
            {isPresident && !dead ? <Placard text="President" tone="ink" size={tag} /> : null}
            {isNominee ? <Placard text="Nominee" tone="slate" size={tag} /> : null}
            {isChancellor ? <Placard text="Chancellor" tone="slate" size={tag} /> : null}
            {dead ? <Stamp text="Executed" size={tag} /> : null}
            {!dead && termLimited ? <Stamp text={narrow ? "Term-ltd" : "Term-limited"} size={tag} /> : null}
            {investigated ? <Stamp text={narrow ? "Probed" : "Investigated"} tone="ink" size={tag} /> : null}
            {voted ? (
              <span
                className={`${typewriter.className} ${["", "text-[8.5px]", "text-[10.5px]", "text-[10.5px]", "text-[12px]"][tier]}`}
                style={{ color: SLATE_DEEP }}
              >
                ballot in ✓
              </span>
            ) : null}
          </div>
        </div>
      )}
    </>
  );

  const border = selected
    ? { borderColor: VERM, background: "#eeD9c4", boxShadow: `2px 2px 0 ${VERM_DARK}` }
    : isPresident && !dead
      ? { borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }
      : { borderColor: isYou && chip ? INK_SOFT : `${INK}77`, background: dead ? "#ddd3ba" : "#e6dcbf" };

  if (!selectable) {
    return (
      <div role="listitem" className={`flex min-w-0 items-center border-2 ${chip ? "py-1" : "py-1.5"} ${pad}`} style={{ ...border, ...style }}>
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
      className={`flex w-full min-w-0 items-center border-2 text-left ${chip ? "py-1" : "py-1.5"} ${pad}`}
      style={{ ...border, ...style }}
    >
      {content}
    </motion.button>
  );
}

function ChipTag({ letter, title, bg }: { letter: string; title: string; bg: string }) {
  return (
    <span
      className={`${oswald.className} grid h-[14px] w-[14px] shrink-0 place-items-center text-[8.5px] font-bold leading-none`}
      style={{ background: bg, color: "#f1e6c8" }}
      title={title}
    >
      {letter}
    </span>
  );
}

/** How the chamber lays out in the space it has: columns by width, row
    height by what is left after the plates and the action dock. Seats grow
    with the room (up to half their width), and fold into chips below 44px. */
function seatLayout(w: number, h: number, n: number) {
  const gap = w < 520 ? 6 : w < 1100 ? 10 : 14;
  const fitFor = (cols: number) => {
    const rows = Math.ceil(n / cols);
    const cardW = (w - gap * (cols - 1)) / cols;
    const cap = Math.min(190, cardW * 0.48);
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
  // wider chambers take whichever column count gives the largest seats (ties
  // go to more columns, which keeps rows short and the seats well-shaped)
  let best = fitFor(w < 760 ? 3 : 2);
  for (const cols of [3, 4]) {
    if (cols > n) break;
    const c = fitFor(cols);
    if (c.rowH >= best.rowH - 2) best = c;
  }
  return { gap, ...best };
}

/* ---------------------- legislative hand (tap-to-pick) ------------------- */

function PolicyHand({
  cards,
  picked,
  onPick,
  tight,
}: {
  cards: ("liberal" | "fascist")[];
  picked: number | null;
  onPick: (i: number) => void;
  tight?: boolean;
}) {
  return (
    <div className="flex items-end justify-center gap-2.5 sm:gap-3 lg:gap-4">
      {cards.map((card, i) => (
        <motion.button
          key={i}
          type="button"
          onClick={() => onPick(i)}
          aria-pressed={picked === i}
          aria-label={`${card} policy, card ${i + 1}`}
          initial={{ y: 14, opacity: 0, rotate: (i - (cards.length - 1) / 2) * 3 }}
          animate={{
            y: picked === i ? -10 : 0,
            opacity: 1,
            rotate: picked === i ? 0 : (i - (cards.length - 1) / 2) * 3,
          }}
          transition={{ duration: 0.24, ease: EASE }}
          className={`shrink-0 border-2 p-1 ${tight ? "w-[86px]" : "w-[96px] min-[380px]:w-[104px] sm:w-[120px] lg:w-[148px] 2xl:w-[168px]"}`}
          style={{
            borderColor: picked === i ? VERM : INK,
            background: PAPER,
            boxShadow: picked === i ? `3px 3px 0 ${VERM_DARK}` : PRESS_SHADOW_SM,
          }}
        >
          <PolicyTile party={card} />
        </motion.button>
      ))}
    </div>
  );
}

function Deliberation({ president, chancellor, note }: { president: string; chancellor: string; note: string }) {
  return (
    <motion.div
      className="relative overflow-hidden border-2 p-4 text-center sm:p-5 lg:p-6"
      style={{ borderColor: INK, background: "#241d15", boxShadow: PRESS_SHADOW_SM }}
      animate={{ opacity: [0.92, 1, 0.92] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: HALFTONE }} />
      <div className="pointer-events-none absolute -right-3 -top-4 w-20 rotate-12 opacity-40">
        <PolicyBack />
      </div>
      <div className="pointer-events-none absolute -bottom-5 -left-3 w-20 -rotate-6 opacity-40">
        <PolicyBack />
      </div>
      <div className={`${oswald.className} text-base font-semibold uppercase tracking-[0.3em] lg:text-lg`} style={{ color: "#e9ddc0" }}>
        The cabinet deliberates…
      </div>
      <div className="mt-2.5 flex items-center justify-center gap-3 sm:mt-3">
        {[
          { label: "President", name: president },
          { label: "Chancellor", name: chancellor },
        ].map((seat) => (
          <div key={seat.label} className="border px-3 py-1.5" style={{ borderColor: "#8a7a5a", background: "#3a2f20" }}>
            <div className={`${oswald.className} text-[7px] uppercase tracking-[0.24em]`} style={{ color: "#b3a077" }}>
              {seat.label}
            </div>
            <div className={`${typewriter.className} text-[11px] lg:text-[13px]`} style={{ color: "#e9ddc0" }}>
              {seat.name}
            </div>
          </div>
        ))}
      </div>
      <div className={`${typewriter.className} mt-2.5 text-[10px] sm:mt-3 lg:text-[11px]`} style={{ color: "#b3a077" }}>
        {note}
      </div>
    </motion.div>
  );
}

/* --------------------------------- stage -------------------------------- */

function Stage({
  view,
  youId,
  spectating,
  send,
  tight,
}: {
  view: SecretHitlerView;
  youId: string;
  spectating: boolean;
  send: (m: unknown) => void;
  /** a short phone column: docks drop some air */
  tight: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [sent, setSent] = useState(false);

  const seats = useMemo(() => [...view.players].sort((a, b) => a.seat - b.seat), [view.players]);
  const byId = useMemo(() => new Map(view.players.map((p) => [p.id, p])), [view.players]);
  const knownFascists = useMemo(() => new Set(view.knowledge?.fascistIds ?? []), [view.knowledge]);
  const eligibleSet = useMemo(() => new Set(view.eligibleIds), [view.eligibleIds]);
  const votedSet = useMemo(() => new Set(view.votedIds), [view.votedIds]);
  const investigatedSet = useMemo(
    () => new Set(view.investigated.map((x) => x.targetId)),
    [view.investigated]
  );

  const me = byId.get(youId);
  const acting = !spectating && !!me && me.alive && !me.left;
  const isPresident = acting && view.presidentId === youId;
  const isChancellor = acting && view.chancellorId === youId;
  const presidentName = byId.get(view.presidentId)?.name ?? "the President";
  const chancellorName = byId.get(view.chancellorId ?? "")?.name ?? "the Chancellor";

  const nominating = view.phase === "nomination" && isPresident && !sent;
  const powering =
    isPresident &&
    !sent &&
    (view.phase === "power_investigate" || view.phase === "power_special" || view.phase === "power_execute");

  const seatSelectable = (p: SHViewPlayer): boolean => {
    if (nominating) return eligibleSet.has(p.id);
    if (!powering) return false;
    if (!p.alive || p.id === youId) return false;
    if (view.phase === "power_investigate") return !investigatedSet.has(p.id);
    return true;
  };

  const markFor = (p: SHViewPlayer): SeatMark => {
    if (view.phase === "over" || p.id === youId || !knownFascists.has(p.id)) return null;
    return p.id === view.knowledge?.hitlerId ? "hitler" : "fascist";
  };

  const confirmTarget = picked ? byId.get(picked)?.name ?? "" : "";
  const votesIn = view.votedIds.length;

  const powerDock = (power: SHPower, confirmLabel: string, tone: "verm" | "ink") => (
    <div className="border-2 p-3 sm:p-4" style={{ borderColor: VERM_DARK, background: "#e8d3ae", boxShadow: PRESS_SHADOW_SM }}>
      <div className="flex flex-col items-center gap-2.5 text-center sm:flex-row sm:justify-between sm:gap-3 sm:text-left">
        <div>
          <div className={`${oswald.className} text-[10px] font-bold uppercase tracking-[0.3em]`} style={{ color: VERM_DARK }}>
            Ministry order · {POWER_META[power].title}
          </div>
          <div className={`${typewriter.className} mt-1 text-[11px] lg:text-[12px]`} style={{ color: INK_SOFT }}>
            {POWER_META[power].blurb} Choose a seat above.
          </div>
        </div>
        <InkButton
          tone={tone === "verm" ? "verm" : "ink"}
          disabled={!picked}
          onClick={() => {
            if (!picked) return;
            setSent(true);
            const type =
              power === "investigate" ? "investigate" : power === "special" ? "special_election" : "execute";
            send({ type, target: picked });
          }}
        >
          {picked ? `${confirmLabel} ${confirmTarget}` : confirmLabel}
        </InkButton>
      </div>
    </div>
  );

  const waitingNote = (text: string) => (
    <div
      className={`${typewriter.className} border-2 border-dashed p-3 text-center text-[11px] sm:p-4 lg:text-[12.5px]`}
      style={{ borderColor: `${INK}66`, color: INK_SOFT, background: "#e2d6b6" }}
    >
      {text}
    </div>
  );

  const [chamberRef, chamber] = useBox<HTMLDivElement>();
  const { cols, gap, rowH } = seatLayout(chamber.w, chamber.h, seats.length);
  const narrow = cols >= 3 && chamber.w / cols < 140;
  const lastRowStart = seats.length - (seats.length % cols || cols);
  const orphanOffset = cols - (seats.length - lastRowStart);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={chamberRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div
          className="grid min-h-full content-center"
          style={{ gridTemplateColumns: `repeat(${cols * 2}, minmax(0, 1fr))`, gridAutoRows: rowH, gap }}
          role="list"
          aria-label="Players"
        >
          {seats.map((p, i) => (
            <SeatCard
              key={p.id}
              rowH={rowH}
              narrow={narrow}
              style={{ gridColumn: `${i === lastRowStart && orphanOffset > 0 ? orphanOffset + 1 : "auto"} / span 2` }}
              player={p}
              isYou={p.id === youId}
              isPresident={p.id === view.presidentId && view.phase !== "over"}
              isNominee={p.id === view.nomineeId}
              isChancellor={p.id === view.chancellorId && view.phase !== "over"}
              voted={view.phase === "election" && votedSet.has(p.id)}
              termLimited={
                view.phase === "nomination" &&
                p.alive &&
                p.id !== view.presidentId &&
                !eligibleSet.has(p.id)
              }
              investigated={investigatedSet.has(p.id)}
              mark={markFor(p)}
              selectable={seatSelectable(p)}
              selected={picked === p.id}
              onSelect={() => setPicked((prev) => (prev === p.id ? null : p.id))}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 shrink-0 lg:mt-4">
        {view.phase === "nomination" ? (
          nominating ? (
            <div className="border-2 p-3 sm:p-4" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
              <div className="flex flex-col items-center gap-2.5 text-center sm:flex-row sm:justify-between sm:gap-3 sm:text-left">
                <div>
                  <div className={`${oswald.className} text-[10px] font-bold uppercase tracking-[0.3em]`} style={{ color: INK }}>
                    You hold the placard
                  </div>
                  <div className={`${typewriter.className} mt-1 text-[11px] lg:text-[12px]`} style={{ color: INK_SOFT }}>
                    Nominate a Chancellor. Stamped seats are term-limited.
                  </div>
                </div>
                <InkButton
                  tone="slate"
                  disabled={!picked}
                  onClick={() => {
                    if (!picked) return;
                    setSent(true);
                    send({ type: "nominate", target: picked });
                  }}
                >
                  {picked ? `Nominate ${confirmTarget}` : "Nominate"}
                </InkButton>
              </div>
            </div>
          ) : (
            waitingNote(
              isPresident
                ? "Your nomination is at the printers…"
                : `${presidentName} is choosing a Chancellor…`
            )
          )
        ) : null}

        {view.phase === "election" ? (
          acting && !sent && view.yourVote === undefined && !votedSet.has(youId) ? (
            <div className="border-2 p-3 sm:p-4" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
              <div className={`${typewriter.className} text-center text-[10px] tracking-[0.2em]`} style={{ color: INK_SOFT }}>
                GOVERNMENT: {presidentName.toUpperCase()} · {byId.get(view.nomineeId ?? "")?.name.toUpperCase() ?? ""}
              </div>
              <div className="mt-2.5 flex items-center justify-center gap-5 sm:mt-3 lg:gap-8">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => {
                    setSent(true);
                    shSfx("stamp");
                    send({ type: "vote", ja: true });
                  }}
                  className={`${oswald.className} w-28 border-2 text-center font-bold tracking-[0.06em] lg:w-36 lg:py-5 lg:text-3xl ${tight ? "py-2 text-xl" : "py-3.5 text-2xl sm:py-4"}`}
                  style={{ borderColor: SLATE_DEEP, color: SLATE_DEEP, background: "#dde3e3", boxShadow: `3px 3px 0 ${SLATE_DEEP}` }}
                >
                  JA!
                  <div className={`${typewriter.className} mt-1 text-[8px] tracking-[0.2em]`}>FOR THE GOVERNMENT</div>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => {
                    setSent(true);
                    shSfx("stamp");
                    send({ type: "vote", ja: false });
                  }}
                  className={`${oswald.className} w-28 border-2 text-center font-bold tracking-[0.06em] lg:w-36 lg:py-5 lg:text-3xl ${tight ? "py-2 text-xl" : "py-3.5 text-2xl sm:py-4"}`}
                  style={{ borderColor: VERM_DARK, color: VERM_DARK, background: "#e8d3c2", boxShadow: `3px 3px 0 ${VERM_DARK}` }}
                >
                  NEIN!
                  <div className={`${typewriter.className} mt-1 text-[8px] tracking-[0.2em]`}>AGAINST</div>
                </motion.button>
              </div>
              <div className={`${typewriter.className} mt-2.5 text-center text-[10px] tabular-nums sm:mt-3`} style={{ color: INK_FADE }}>
                {votesIn}/{view.aliveCount} ballots in the box
              </div>
            </div>
          ) : (
            waitingNote(
              `${
                acting && view.yourVote !== undefined
                  ? `Your ballot is sealed — you voted ${view.yourVote ? "JA!" : "NEIN!"}. `
                  : "The house votes… "
              }${votesIn}/${view.aliveCount} ballots in the box.`
            )
          )
        ) : null}

        {view.phase === "legislative_president" ? (
          isPresident && view.presidentHand && !sent ? (
            <div className="border-2 p-3 sm:p-4" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
              <div className={`${typewriter.className} text-center text-[10px] tracking-[0.18em]`} style={{ color: INK_SOFT }}>
                SELECT ONE POLICY TO BURN — THE OTHER TWO PASS TO {chancellorName.toUpperCase()}
              </div>
              <div className="mt-2.5 sm:mt-3">
                <PolicyHand
                  tight={tight}
                  cards={view.presidentHand}
                  picked={pickedIdx}
                  onPick={(i) => setPickedIdx((prev) => (prev === i ? null : i))}
                />
              </div>
              <div className="mt-3 flex justify-center sm:mt-4">
                <InkButton
                  tone="verm"
                  disabled={pickedIdx === null}
                  onClick={() => {
                    if (pickedIdx === null) return;
                    setSent(true);
                    shSfx("paper");
                    send({ type: "discard", index: pickedIdx });
                  }}
                >
                  Burn this policy
                </InkButton>
              </div>
            </div>
          ) : (
            <Deliberation president={presidentName} chancellor={chancellorName} note="The President weighs three policies. Only counts leave this room." />
          )
        ) : null}

        {view.phase === "legislative_chancellor" ? (
          isChancellor && view.chancellorHand && !sent ? (
            <div className="border-2 p-3 sm:p-4" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
              <div className={`${typewriter.className} text-center text-[10px] tracking-[0.18em]`} style={{ color: INK_SOFT }}>
                ENACT ONE POLICY — THE OTHER BURNS{view.vetoRefused ? " · VETO REFUSED, YOU MUST ENACT" : ""}
              </div>
              <div className="mt-2.5 sm:mt-3">
                <PolicyHand
                  tight={tight}
                  cards={view.chancellorHand}
                  picked={pickedIdx}
                  onPick={(i) => setPickedIdx((prev) => (prev === i ? null : i))}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5 sm:mt-4">
                <InkButton
                  tone="slate"
                  disabled={pickedIdx === null}
                  onClick={() => {
                    if (pickedIdx === null) return;
                    setSent(true);
                    send({ type: "enact", index: pickedIdx });
                  }}
                >
                  Enact into law
                </InkButton>
                {view.vetoUnlocked && !view.vetoRefused ? (
                  <InkButton
                    tone="verm"
                    onClick={() => {
                      setSent(true);
                      shSfx("stamp");
                      send({ type: "veto" });
                    }}
                  >
                    Move to veto
                  </InkButton>
                ) : null}
              </div>
            </div>
          ) : (
            <Deliberation president={presidentName} chancellor={chancellorName} note="The Chancellor holds two policies. One will become law." />
          )
        ) : null}

        {view.phase === "veto_consent" ? (
          isPresident && !sent ? (
            <div className="border-2 p-3 sm:p-4" style={{ borderColor: VERM_DARK, background: "#e8d3ae", boxShadow: PRESS_SHADOW_SM }}>
              <div className="flex flex-col items-center gap-2.5 text-center sm:flex-row sm:justify-between sm:gap-3 sm:text-left">
                <div>
                  <div className={`${oswald.className} text-[10px] font-bold uppercase tracking-[0.3em]`} style={{ color: VERM_DARK }}>
                    {chancellorName} moves to veto
                  </div>
                  <div className={`${typewriter.className} mt-1 text-[11px]`} style={{ color: INK_SOFT }}>
                    Consent burns both policies and advances the tracker. Refusal forces the enactment.
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <InkButton
                    tone="verm"
                    onClick={() => {
                      setSent(true);
                      send({ type: "veto_consent", agree: true });
                    }}
                  >
                    Consent
                  </InkButton>
                  <InkButton
                    onClick={() => {
                      setSent(true);
                      send({ type: "veto_consent", agree: false });
                    }}
                  >
                    Refuse
                  </InkButton>
                </div>
              </div>
            </div>
          ) : (
            waitingNote(
              isChancellor
                ? `Your veto lies before ${presidentName}…`
                : `${chancellorName} moves to veto — ${presidentName} must rule.`
            )
          )
        ) : null}

        {view.phase === "power_peek" ? (
          isPresident && view.peek && !sent ? (
            <div className="border-2 p-3 sm:p-4" style={{ borderColor: VERM_DARK, background: "#e8d3ae", boxShadow: PRESS_SHADOW_SM }}>
              <div className={`${typewriter.className} text-center text-[10px] tracking-[0.18em]`} style={{ color: VERM_DARK }}>
                YOUR EYES ONLY — THE NEXT THREE POLICIES, TOP FIRST
              </div>
              <div className="mt-2.5 flex items-center justify-center gap-3 sm:mt-3 lg:gap-4">
                {view.peek.map((card, i) => (
                  <motion.div
                    key={i}
                    className="w-[92px] sm:w-[104px] lg:w-[136px]"
                    initial={{ rotateY: 180, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ delay: 0.25 + i * 0.3, duration: 0.4, ease: EASE }}
                  >
                    <PolicyTile party={card} />
                  </motion.div>
                ))}
              </div>
              <div className="mt-3 flex justify-center sm:mt-4">
                <InkButton
                  onClick={() => {
                    setSent(true);
                    send({ type: "peek_done" });
                  }}
                >
                  Return them face-down
                </InkButton>
              </div>
            </div>
          ) : (
            waitingNote(`${presidentName} examines the top of the deck…`)
          )
        ) : null}

        {view.phase === "power_investigate"
          ? isPresident && !sent
            ? powerDock("investigate", "Open the file on", "ink")
            : waitingNote(`${presidentName} is opening a loyalty file…`)
          : null}
        {view.phase === "power_special"
          ? isPresident && !sent
            ? powerDock("special", "Hand the placard to", "ink")
            : waitingNote(`${presidentName} is appointing the next candidate…`)
          : null}
        {view.phase === "power_execute"
          ? isPresident && !sent
            ? powerDock("execute", "Sign the order:", "verm")
            : waitingNote(`${presidentName} holds an execution order. Hold your breath.`)
          : null}
      </div>
    </div>
  );
}

/* ------------------------------ role sidebar ----------------------------- */

function dossierKnowledge(view: SecretHitlerView, youId: string): string {
  const byId = new Map(view.players.map((p) => [p.id, p.name]));
  const fellowIds = (view.knowledge?.fascistIds ?? []).filter((id) => id !== youId);
  if (view.yourRole === "hitler") {
    return fellowIds.length
      ? `Your fascist: ${fellowIds.map((id) => byId.get(id) ?? id).join(", ")}. Stay presentable.`
      : "At this table size you know no one. Play the moderate.";
  }
  if (view.yourParty === "fascist") {
    const hitlerName = byId.get(view.knowledge?.hitlerId ?? "") ?? "?";
    const others = fellowIds.filter((id) => id !== view.knowledge?.hitlerId).map((id) => byId.get(id) ?? id);
    return `Hitler is ${hitlerName}.${others.length ? ` Fellow fascists: ${others.join(", ")}.` : ""} Protect the name.`;
  }
  return "You know nothing. Read the votes; the record never lies twice the same way.";
}

function Investigations({ view, big }: { view: SecretHitlerView; big?: boolean }) {
  if (!view.yourInvestigations?.length) return null;
  const byId = new Map(view.players.map((p) => [p.id, p.name]));
  return (
    <div className="mt-2.5 border-t-2 pt-2" style={{ borderColor: `${INK}33` }}>
      <div className={`${oswald.className} text-[8px] font-bold uppercase tracking-[0.24em]`} style={{ color: INK_SOFT }}>
        Your investigations
      </div>
      {view.yourInvestigations.map((x) => (
        <div key={x.targetId} className={`${typewriter.className} mt-1 flex justify-between ${big ? "text-[11px]" : "text-[10px]"}`}>
          <span style={{ color: INK_SOFT }}>{byId.get(x.targetId) ?? x.targetId}</span>
          <b style={{ color: x.party === "liberal" ? SLATE_DEEP : VERM_DARK }}>{x.party.toUpperCase()}</b>
        </div>
      ))}
    </div>
  );
}

function RolePanel({
  view,
  youId,
  sealed,
  onToggle,
  cardW,
}: {
  view: SecretHitlerView;
  youId: string;
  sealed: boolean;
  onToggle: () => void;
  cardW: number;
}) {
  if (!view.yourRole || !view.yourParty) return null;
  const roomy = cardW >= 112;

  return (
    <div className="relative shrink-0 border-2 p-3.5" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
      <div className={`${oswald.className} text-[9px] font-bold uppercase tracking-[0.3em]`} style={{ color: INK_SOFT }}>
        Your dossier
      </div>
      <div className="mt-2.5 flex items-start gap-3.5">
        <FlipDossier role={view.yourRole} w={cardW} sealed={sealed} onToggle={onToggle} />
        <div className="min-w-0 flex-1">
          {sealed ? (
            <p className={`${typewriter.className} ${roomy ? "text-[12px] leading-[18px]" : "text-[11px] leading-4"}`} style={{ color: INK_FADE }}>
              Sealed. Tap the envelope when no one is reading over your shoulder.
            </p>
          ) : (
            <>
              <div
                className={`${oswald.className} font-bold uppercase tracking-[0.14em] ${roomy ? "text-lg" : "text-base"}`}
                style={{ color: view.yourParty === "liberal" ? SLATE_DEEP : VERM_DARK }}
              >
                {view.yourRole}
              </div>
              <p
                className={`${typewriter.className} mt-1 ${roomy ? "text-[11.5px] leading-[17px]" : "text-[10.5px] leading-4"}`}
                style={{ color: INK_SOFT }}
              >
                {dossierKnowledge(view, youId)}
              </p>
              <div className="mt-2" style={{ width: roomy ? 116 : 96 }}>
                <PartyCard party={view.yourParty} w={roomy ? 116 : 96} />
              </div>
            </>
          )}
        </div>
      </div>
      {!sealed ? <Investigations view={view} big={roomy} /> : null}
      <div className={`${typewriter.className} mt-2 text-center text-[8.5px]`} style={{ color: INK_FADE }}>
        tap the card to {sealed ? "open" : "re-seal"} it
      </div>
    </div>
  );
}

/** Below the desktop breakpoint the dossier rides in one compact strip under
    the chamber: the envelope (still tap-to-open), the role and what it knows. */
function DossierStrip({
  view,
  youId,
  sealed,
  onToggle,
  cardW,
}: {
  view: SecretHitlerView;
  youId: string;
  sealed: boolean;
  onToggle: () => void;
  cardW: number;
}) {
  if (!view.yourRole || !view.yourParty) return null;
  const roomy = cardW >= 72;
  // on short phones the strip slims down: a smaller envelope, two lines of
  // what you know, and the flip hint folds into the envelope's own tooltip
  const slim = cardW < 50;
  const inv = view.yourInvestigations ?? [];
  const byId = new Map(view.players.map((p) => [p.id, p.name]));
  return (
    <div
      className={`relative shrink-0 border-2 ${slim ? "px-2.5 py-2" : "px-3 py-2.5"}`}
      style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}
    >
      <div className={`flex items-center ${slim ? "gap-2.5" : "gap-3"}`}>
        <FlipDossier role={view.yourRole} w={cardW} sealed={sealed} onToggle={onToggle} />
        <div className="min-w-0 flex-1">
          <div
            className={`${oswald.className} truncate font-bold uppercase tracking-[0.14em] ${roomy ? "text-lg" : slim ? "text-[13px]" : "text-[14px]"}`}
            style={{ color: sealed ? INK_SOFT : view.yourParty === "liberal" ? SLATE_DEEP : VERM_DARK }}
          >
            {sealed ? "Your dossier" : view.yourRole}
          </div>
          <p
            className={`${typewriter.className} mt-0.5 ${slim ? "line-clamp-2" : "line-clamp-3"} ${roomy ? "text-[12px] leading-[17px]" : "text-[10.5px] leading-[15px]"}`}
            style={{ color: sealed ? INK_FADE : INK_SOFT }}
          >
            {sealed
              ? "Sealed. Tap the envelope when no one is reading over your shoulder."
              : `${dossierKnowledge(view, youId)}${
                  inv.length
                    ? ` Files: ${inv.map((x) => `${byId.get(x.targetId) ?? "?"} ${x.party === "liberal" ? "LIB" : "FAS"}`).join(", ")}.`
                    : ""
                }`}
          </p>
          {slim ? null : (
            <div className={`${typewriter.className} mt-0.5 text-[8.5px]`} style={{ color: INK_FADE }}>
              tap the card to {sealed ? "open" : "re-seal"} it
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordList({ log }: { log: SHLogEntry[] }) {
  return (
    <div className="space-y-2.5" aria-live="polite">
      {[...log].reverse().map((entry, index) => (
        <div key={entry.i} className="border-l-2 pl-2.5" style={{ borderColor: index === 0 ? VERM : `${INK}44` }}>
          <div className={`${typewriter.className} text-[11px] leading-4`} style={{ color: index === 0 ? INK : INK_SOFT }}>
            {logText(entry)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- screen -------------------------------- */

export function SecretHitlerScreen({
  view,
  party,
  youId,
  isHost,
  skew,
  spectating,
  move,
  playAgain,
  exitToLobby,
}: GameScreenProps<SecretHitlerView>) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileLogOpen, setMobileLogOpen] = useState(false);
  const [sealed, setSealed] = useState(true);
  const reduceMotion = useReducedMotion() ?? false;
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const now = useServerNow(view.now, skew);
  const clock = formatClock(view.deadline, now);
  const urgent = Boolean(view.deadline && view.deadline - now < 10_000);
  const copy = PHASE_COPY[view.phase];
  const me = view.players.find((p) => p.id === youId);
  const deceased = !!me && !me.alive;

  // the play column's box picks the plate density and the dossier's size
  const [playRef, play] = useBox<HTMLDivElement>();
  const plateSize = play.w && play.w < 640 ? "sm" : play.w >= 1000 && play.h >= 780 ? "lg" : "md";
  const desktopCardW = play.h >= 940 ? 132 : play.h >= 780 ? 116 : 100;
  // short, narrow columns (phones) drop the phase hint and slim the dossier strip
  const tight = play.h > 0 && play.h < 700 && play.w < 700;
  const stripCardW = tight ? 42 : play.w >= 600 && play.h >= 820 ? 84 : 54;
  const showRole = !spectating && !!view.yourRole;

  const prevViewRef = useRef<SecretHitlerView | null>(null);
  useEffect(() => {
    playSecretHitlerDiff(prevViewRef.current, view, youId);
    prevViewRef.current = view;
  }, [view, youId]);

  useEffect(() => {
    document.title = mustAct(view, youId) ? "● Your move — Secret Hitler" : "Secret Hitler";
  }, [view, youId]);

  // reveal moments, gated by log timestamps so late joiners don't replay them
  const { ballotsLog, chaosLog, executeLog, investigateLog } = useMemo(() => {
    const lastOf = (kind: SHLogEntry["kind"]) => [...view.log].reverse().find((l) => l.kind === kind);
    return {
      ballotsLog: lastOf("ballots"),
      chaosLog: lastOf("chaos"),
      executeLog: lastOf("execute"),
      investigateLog: lastOf("investigate"),
    };
  }, [view.log]);

  const lastElection = view.elections.length ? view.elections[view.elections.length - 1] : null;
  const ballotActive = Boolean(
    ballotsLog && lastElection && view.phase !== "over" && now - ballotsLog.ts < 5100
  );
  const chaosOffset = ballotsLog && chaosLog && ballotsLog.ts === chaosLog.ts ? 5100 : 0;
  const chaosActive = Boolean(
    chaosLog &&
      view.phase !== "over" &&
      now - chaosLog.ts >= chaosOffset &&
      now - chaosLog.ts < chaosOffset + 4300
  );
  const executeActive = Boolean(executeLog && view.phase !== "over" && now - executeLog.ts < 3900);
  const invEntry =
    investigateLog &&
    investigateLog.actor === me?.name &&
    view.yourInvestigations?.length &&
    now - investigateLog.ts < 5900
      ? view.yourInvestigations[view.yourInvestigations.length - 1]
      : null;
  const invTargetName = invEntry
    ? view.players.find((p) => p.id === invEntry.targetId)?.name ?? "?"
    : "";

  const round = view.elections.length + 1;
  const toolBtn = "grid h-8 w-8 shrink-0 place-items-center border-2";

  return (
    <div
      className="relative flex h-dvh shrink-0 flex-col overflow-hidden"
      style={{ background: PAPER, color: INK }}
      onPointerDown={primeSound}
    >
      {/* newsprint halftone + press grain */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.06]" style={{ backgroundImage: HALFTONE }} />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent 0 3px, ${INK} 3px 3.5px)`,
        }}
      />
      {view.tracker >= 2 && view.phase !== "over" ? (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[5]"
          style={{ background: `radial-gradient(80% 80% at 50% 50%, transparent 45%, ${VERM}26)` }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}

      <header className="relative z-10 shrink-0 border-b-2" style={{ borderColor: INK }}>
        <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-2 px-3 pb-2 pt-[max(.5rem,env(safe-area-inset-top))] sm:px-6">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1
              className={`${oswald.className} text-[13px] font-bold uppercase leading-none tracking-[0.18em] sm:text-base sm:tracking-[0.3em]`}
            >
              <span className="block sm:inline">Secret</span>
              <span className="block sm:inline" style={{ color: VERM }}>
                <span className="hidden sm:inline"> </span>Hitler
              </span>
            </h1>
            <span className={`${typewriter.className} hidden truncate text-[9.5px] sm:inline`} style={{ color: INK_FADE }}>
              election №{round} · deck {view.deckCount} · discard {view.discardCount}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label="Open the election record"
              className={toolBtn}
              style={{ borderColor: INK, color: INK_SOFT }}
            >
              <Icons.book size={15} />
            </button>
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              aria-label={muted ? "Unmute sounds" : "Mute sounds"}
              className={toolBtn}
              style={{ borderColor: INK, color: INK_SOFT }}
            >
              {muted ? <Icons.volumeOff size={15} /> : <Icons.volumeOn size={15} />}
            </button>
            <button
              type="button"
              onClick={() => setMobileLogOpen((open) => !open)}
              aria-label={mobileLogOpen ? "Hide the record" : "Show the record"}
              aria-expanded={mobileLogOpen}
              className={`${toolBtn} lg:hidden`}
              style={{ borderColor: INK, color: INK_SOFT }}
            >
              <Icons.scroll size={15} />
            </button>
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              aria-label="Open the rules"
              className={`${oswald.className} h-8 min-w-8 shrink-0 border-2 px-1 text-[9px] font-semibold uppercase tracking-[0.18em] sm:px-2.5`}
              style={{ borderColor: INK, color: INK_SOFT }}
            >
              <span className="text-[14px] tracking-normal sm:hidden" aria-hidden>
                ?
              </span>
              <span className="hidden sm:inline">Rules</span>
            </button>
            <PartyMenu
              className="ml-1"
              style={{ borderRadius: 0, borderWidth: 2, borderColor: INK, color: INK, opacity: 1 }}
            />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 gap-5 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 xl:gap-6">
        <div ref={playRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className={`grid shrink-0 md:grid-cols-2 ${plateSize === "sm" ? "gap-2" : plateSize === "lg" ? "gap-4" : "gap-3"}`}>
            <LiberalBoard enacted={view.liberalTrack} tracker={view.tracker} size={plateSize} />
            <FascistBoard enacted={view.fascistTrack} powers={view.powers} vetoUnlocked={view.vetoUnlocked} size={plateSize} />
          </div>

          <section
            className="mt-3 flex shrink-0 items-end justify-between gap-3 border-b-2 pb-2.5 lg:mt-4 lg:pb-3"
            style={{ borderColor: `${INK}55` }}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`${typewriter.className} text-[10px] tracking-[0.28em]`} style={{ color: VERM_DARK }}>
                  {copy.eyebrow.toUpperCase()}
                  {view.specialRound && view.phase !== "over" ? " · SPECIAL ELECTION" : ""}
                </span>
                {spectating ? (
                  <span
                    className={`${oswald.className} border px-1.5 text-[8.5px] font-semibold uppercase leading-4 tracking-[0.2em]`}
                    style={{ borderColor: SLATE, color: SLATE_DEEP, background: "#dde3e3" }}
                  >
                    Press gallery · observing
                  </span>
                ) : null}
                {deceased ? (
                  <span
                    className={`${oswald.className} border px-1.5 text-[8.5px] font-semibold uppercase leading-4 tracking-[0.2em]`}
                    style={{ borderColor: INK, color: INK_SOFT, background: "#ddd3ba" }}
                  >
                    Deceased · you watch in silence
                  </span>
                ) : null}
              </div>
              <h2
                className={`${oswald.className} mt-1 text-xl font-bold uppercase leading-none tracking-[0.08em] sm:text-2xl 2xl:text-[28px]`}
              >
                {copy.title}
              </h2>
              {tight ? null : (
                <p
                  className={`${typewriter.className} mt-1 line-clamp-2 max-w-2xl text-[10.5px] leading-4 lg:text-[11.5px] 2xl:text-[12.5px]`}
                  style={{ color: INK_FADE }}
                >
                  {copy.hint}
                </p>
              )}
            </div>
            <Timer text={clock} urgent={urgent} />
          </section>

          <div className="mt-3 flex min-h-0 flex-1 flex-col lg:mt-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${view.phase}-${view.elections.length}-${view.liberalTrack}-${view.fascistTrack}-${view.tracker}-${view.vetoRefused}`}
                className="flex min-h-0 flex-1 flex-col"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: EASE }}
              >
                <Stage
                  key={`${view.phase}-${view.elections.length}-${view.liberalTrack}-${view.fascistTrack}-${view.tracker}-${view.vetoRefused}`}
                  view={view}
                  youId={youId}
                  spectating={spectating}
                  send={move}
                  tight={tight}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {showRole ? (
            <div className="mt-3 shrink-0 lg:hidden">
              <DossierStrip
                view={view}
                youId={youId}
                sealed={sealed}
                onToggle={() => setSealed((h) => !h)}
                cardW={stripCardW}
              />
            </div>
          ) : null}
        </div>

        <aside className="hidden min-h-0 w-[clamp(290px,24vw,380px)] shrink-0 flex-col gap-4 lg:flex">
          {showRole ? (
            <RolePanel view={view} youId={youId} sealed={sealed} onToggle={() => setSealed((h) => !h)} cardW={desktopCardW} />
          ) : null}
          <div
            className="relative flex min-h-0 flex-1 flex-col border-2 p-3.5"
            style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}
          >
            <div className="flex shrink-0 items-center justify-between">
              <div className={`${oswald.className} text-[9px] font-bold uppercase tracking-[0.3em]`} style={{ color: INK_SOFT }}>
                The record
              </div>
              <span className={`${typewriter.className} text-[9px] tabular-nums`} style={{ color: INK_FADE }}>
                {view.log.length}
              </span>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <RecordList log={view.log} />
            </div>
          </div>
        </aside>
      </main>

      {/* below desktop the record is a sheet over the chamber, never a page scroll */}
      <AnimatePresence>
        {mobileLogOpen ? (
          <motion.div
            className="absolute inset-0 z-20 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="absolute inset-0 bg-[#0d0a07]/55" onClick={() => setMobileLogOpen(false)} />
            <motion.div
              role="dialog"
              aria-label="The record"
              className="absolute inset-x-0 bottom-0 flex max-h-[72%] flex-col border-t-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
              style={{ background: "#e6dcbf", borderColor: INK, boxShadow: "0 -6px 0 rgba(13,10,7,0.35)" }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE }}
            >
              <div className="flex shrink-0 items-center justify-between border-b-2 pb-2.5" style={{ borderColor: `${INK}33` }}>
                <div className={`${oswald.className} text-[10px] font-bold uppercase tracking-[0.3em]`} style={{ color: INK_SOFT }}>
                  The record <span className={`${typewriter.className} ml-1`} style={{ color: INK_FADE }}>{view.log.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileLogOpen(false)}
                  aria-label="Close the record"
                  className={toolBtn}
                  style={{ borderColor: INK, color: INK_SOFT }}
                >
                  <Icons.x size={14} />
                </button>
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                <RecordList log={view.log} />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {ballotActive && lastElection ? (
        <BallotRevealOverlay election={lastElection} players={view.players} reduce={reduceMotion} />
      ) : null}
      {chaosActive && chaosLog ? <ChaosOverlay party={chaosLog.detail === "liberal" ? "liberal" : "fascist"} /> : null}
      {executeActive && executeLog ? <ExecutionOverlay name={executeLog.target ?? "someone"} /> : null}
      {invEntry ? <InvestigationOverlay name={invTargetName} party={invEntry.party} /> : null}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} playerCount={view.players.length} />
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        elections={view.elections}
        players={view.players}
      />
      <AnimatePresence>
        {view.phase === "over" ? (
          <GameOverOverlay
            view={view}
            tallies={party.tallies.secrethitler ?? {}}
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
