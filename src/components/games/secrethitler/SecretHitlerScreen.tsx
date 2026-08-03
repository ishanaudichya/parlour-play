"use client";

/* Secret Hitler — a 1930s ministry in letterpress. Aged newsprint, heavy ink,
   vermillion alarms. Two track plates, a rotating placard, sealed dossiers,
   JA!/NEIN! ballots that flip in unison, and ministry orders when the
   fascist track fills. */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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

function Stamp({ text, tone = "verm" }: { text: string; tone?: "verm" | "slate" | "ink" }) {
  const color = tone === "verm" ? VERM_DARK : tone === "slate" ? SLATE_DEEP : INK;
  return (
    <span
      className={`${oswald.className} inline-block rotate-[-6deg] border-2 px-1 text-[8px] font-bold uppercase leading-4 tracking-[0.12em]`}
      style={{ borderColor: color, color }}
    >
      {text}
    </span>
  );
}

function Placard({ text, tone }: { text: string; tone: "ink" | "slate" }) {
  return (
    <span
      className={`${oswald.className} inline-block px-1.5 text-[8px] font-semibold uppercase leading-4 tracking-[0.16em]`}
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
}) {
  const dead = !player.alive;
  const content = (
    <>
      <div className="relative shrink-0" style={dead ? { filter: "grayscale(1) contrast(0.85)" } : undefined}>
        <Medallion name={player.name} seat={player.seat} size={40} dim={dead || player.left} />
        {dead ? (
          <svg viewBox="0 0 40 40" width={40} height={40} className="absolute inset-0" aria-hidden>
            <path d="M7 7 L33 33 M33 7 L7 33" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
          </svg>
        ) : null}
        {mark ? (
          <span
            className={`${oswald.className} absolute -bottom-1 -right-1 grid place-items-center border text-[8px] font-bold`}
            style={{
              width: 17,
              height: 17,
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
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={`${typewriter.className} truncate text-[12px] ${dead || player.left ? "line-through" : ""}`}
            style={{ color: dead ? INK_FADE : INK }}
          >
            {player.name}
          </span>
          {isYou ? (
            <span className={`${oswald.className} text-[7px] uppercase tracking-[0.2em]`} style={{ color: INK_FADE }}>
              you
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {isPresident && !dead ? <Placard text="President" tone="ink" /> : null}
          {isNominee ? <Placard text="Nominee" tone="slate" /> : null}
          {isChancellor ? <Placard text="Chancellor" tone="slate" /> : null}
          {dead ? <Stamp text="Executed" /> : null}
          {!dead && termLimited ? <Stamp text="Term-limited" /> : null}
          {investigated ? <Stamp text="Investigated" tone="ink" /> : null}
          {voted ? (
            <span className={`${typewriter.className} text-[8px]`} style={{ color: SLATE_DEEP }}>
              ballot in ✓
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  const border = selected
    ? { borderColor: VERM, background: "#eeD9c4", boxShadow: `2px 2px 0 ${VERM_DARK}` }
    : isPresident && !dead
      ? { borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }
      : { borderColor: `${INK}77`, background: dead ? "#ddd3ba" : "#e6dcbf" };

  if (!selectable) {
    return (
      <div className="flex min-h-[58px] items-center gap-2.5 border-2 px-2.5 py-2" style={border}>
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
      className="flex min-h-[58px] w-full items-center gap-2.5 border-2 px-2.5 py-2 text-left"
      style={border}
    >
      {content}
    </motion.button>
  );
}

/* ---------------------- legislative hand (tap-to-pick) ------------------- */

function PolicyHand({
  cards,
  picked,
  onPick,
}: {
  cards: ("liberal" | "fascist")[];
  picked: number | null;
  onPick: (i: number) => void;
}) {
  return (
    <div className="flex items-end justify-center gap-3">
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
          className="w-[104px] shrink-0 border-2 p-1 sm:w-[120px]"
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
      className="relative overflow-hidden border-2 p-5 text-center"
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
      <div className={`${oswald.className} text-base font-semibold uppercase tracking-[0.3em]`} style={{ color: "#e9ddc0" }}>
        The cabinet deliberates…
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        {[
          { label: "President", name: president },
          { label: "Chancellor", name: chancellor },
        ].map((seat) => (
          <div key={seat.label} className="border px-3 py-1.5" style={{ borderColor: "#8a7a5a", background: "#3a2f20" }}>
            <div className={`${oswald.className} text-[7px] uppercase tracking-[0.24em]`} style={{ color: "#b3a077" }}>
              {seat.label}
            </div>
            <div className={`${typewriter.className} text-[11px]`} style={{ color: "#e9ddc0" }}>
              {seat.name}
            </div>
          </div>
        ))}
      </div>
      <div className={`${typewriter.className} mt-3 text-[10px]`} style={{ color: "#b3a077" }}>
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
}: {
  view: SecretHitlerView;
  youId: string;
  spectating: boolean;
  send: (m: unknown) => void;
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
    <div className="border-2 p-4" style={{ borderColor: VERM_DARK, background: "#e8d3ae", boxShadow: PRESS_SHADOW_SM }}>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <div>
          <div className={`${oswald.className} text-[10px] font-bold uppercase tracking-[0.3em]`} style={{ color: VERM_DARK }}>
            Ministry order · {POWER_META[power].title}
          </div>
          <div className={`${typewriter.className} mt-1 text-[11px]`} style={{ color: INK_SOFT }}>
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
      className={`${typewriter.className} border-2 border-dashed p-4 text-center text-[11px]`}
      style={{ borderColor: `${INK}66`, color: INK_SOFT, background: "#e2d6b6" }}
    >
      {text}
    </div>
  );

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Players">
        {seats.map((p) => (
          <SeatCard
            key={p.id}
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

      <div className="mt-4">
        {view.phase === "nomination" ? (
          nominating ? (
            <div className="border-2 p-4" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                <div>
                  <div className={`${oswald.className} text-[10px] font-bold uppercase tracking-[0.3em]`} style={{ color: INK }}>
                    You hold the placard
                  </div>
                  <div className={`${typewriter.className} mt-1 text-[11px]`} style={{ color: INK_SOFT }}>
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
            <div className="border-2 p-4" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
              <div className={`${typewriter.className} text-center text-[10px] tracking-[0.2em]`} style={{ color: INK_SOFT }}>
                GOVERNMENT: {presidentName.toUpperCase()} · {byId.get(view.nomineeId ?? "")?.name.toUpperCase() ?? ""}
              </div>
              <div className="mt-3 flex items-center justify-center gap-5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => {
                    setSent(true);
                    shSfx("stamp");
                    send({ type: "vote", ja: true });
                  }}
                  className={`${oswald.className} w-28 border-2 py-4 text-center text-2xl font-bold tracking-[0.06em]`}
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
                  className={`${oswald.className} w-28 border-2 py-4 text-center text-2xl font-bold tracking-[0.06em]`}
                  style={{ borderColor: VERM_DARK, color: VERM_DARK, background: "#e8d3c2", boxShadow: `3px 3px 0 ${VERM_DARK}` }}
                >
                  NEIN!
                  <div className={`${typewriter.className} mt-1 text-[8px] tracking-[0.2em]`}>AGAINST</div>
                </motion.button>
              </div>
              <div className={`${typewriter.className} mt-3 text-center text-[10px] tabular-nums`} style={{ color: INK_FADE }}>
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
            <div className="border-2 p-4" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
              <div className={`${typewriter.className} text-center text-[10px] tracking-[0.18em]`} style={{ color: INK_SOFT }}>
                SELECT ONE POLICY TO BURN — THE OTHER TWO PASS TO {chancellorName.toUpperCase()}
              </div>
              <div className="mt-3">
                <PolicyHand
                  cards={view.presidentHand}
                  picked={pickedIdx}
                  onPick={(i) => setPickedIdx((prev) => (prev === i ? null : i))}
                />
              </div>
              <div className="mt-4 flex justify-center">
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
            <div className="border-2 p-4" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
              <div className={`${typewriter.className} text-center text-[10px] tracking-[0.18em]`} style={{ color: INK_SOFT }}>
                ENACT ONE POLICY — THE OTHER BURNS{view.vetoRefused ? " · VETO REFUSED, YOU MUST ENACT" : ""}
              </div>
              <div className="mt-3">
                <PolicyHand
                  cards={view.chancellorHand}
                  picked={pickedIdx}
                  onPick={(i) => setPickedIdx((prev) => (prev === i ? null : i))}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
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
            <div className="border-2 p-4" style={{ borderColor: VERM_DARK, background: "#e8d3ae", boxShadow: PRESS_SHADOW_SM }}>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
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
            <div className="border-2 p-4" style={{ borderColor: VERM_DARK, background: "#e8d3ae", boxShadow: PRESS_SHADOW_SM }}>
              <div className={`${typewriter.className} text-center text-[10px] tracking-[0.18em]`} style={{ color: VERM_DARK }}>
                YOUR EYES ONLY — THE NEXT THREE POLICIES, TOP FIRST
              </div>
              <div className="mt-3 flex items-center justify-center gap-3">
                {view.peek.map((card, i) => (
                  <motion.div
                    key={i}
                    className="w-[96px]"
                    initial={{ rotateY: 180, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ delay: 0.25 + i * 0.3, duration: 0.4, ease: EASE }}
                  >
                    <PolicyTile party={card} />
                  </motion.div>
                ))}
              </div>
              <div className="mt-4 flex justify-center">
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

function RolePanel({
  view,
  youId,
  sealed,
  onToggle,
}: {
  view: SecretHitlerView;
  youId: string;
  sealed: boolean;
  onToggle: () => void;
}) {
  if (!view.yourRole || !view.yourParty) return null;
  const byId = new Map(view.players.map((p) => [p.id, p.name]));
  const fellowIds = (view.knowledge?.fascistIds ?? []).filter((id) => id !== youId);

  let knowledgeText: string;
  if (view.yourRole === "hitler") {
    knowledgeText = fellowIds.length
      ? `Your fascist: ${fellowIds.map((id) => byId.get(id) ?? id).join(", ")}. Stay presentable.`
      : "At this table size you know no one. Play the moderate.";
  } else if (view.yourParty === "fascist") {
    const hitlerName = byId.get(view.knowledge?.hitlerId ?? "") ?? "?";
    const others = fellowIds.filter((id) => id !== view.knowledge?.hitlerId).map((id) => byId.get(id) ?? id);
    knowledgeText = `Hitler is ${hitlerName}.${others.length ? ` Fellow fascists: ${others.join(", ")}.` : ""} Protect the name.`;
  } else {
    knowledgeText = "You know nothing. Read the votes; the record never lies twice the same way.";
  }

  return (
    <div className="relative border-2 p-3.5" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
      <div className={`${oswald.className} text-[9px] font-bold uppercase tracking-[0.3em]`} style={{ color: INK_SOFT }}>
        Your dossier
      </div>
      <div className="mt-2.5 flex items-start gap-3">
        <FlipDossier role={view.yourRole} w={100} sealed={sealed} onToggle={onToggle} />
        <div className="min-w-0 flex-1">
          {sealed ? (
            <p className={`${typewriter.className} text-[11px] leading-4`} style={{ color: INK_FADE }}>
              Sealed. Tap the envelope when no one is reading over your shoulder.
            </p>
          ) : (
            <>
              <div className={`${oswald.className} text-base font-bold uppercase tracking-[0.14em]`} style={{ color: view.yourParty === "liberal" ? SLATE_DEEP : VERM_DARK }}>
                {view.yourRole}
              </div>
              <p className={`${typewriter.className} mt-1 text-[10.5px] leading-4`} style={{ color: INK_SOFT }}>
                {knowledgeText}
              </p>
              <div className="mt-2 w-24">
                <PartyCard party={view.yourParty} w={96} />
              </div>
            </>
          )}
        </div>
      </div>
      {!sealed && view.yourInvestigations?.length ? (
        <div className="mt-2.5 border-t-2 pt-2" style={{ borderColor: `${INK}33` }}>
          <div className={`${oswald.className} text-[8px] font-bold uppercase tracking-[0.24em]`} style={{ color: INK_SOFT }}>
            Your investigations
          </div>
          {view.yourInvestigations.map((x) => (
            <div key={x.targetId} className={`${typewriter.className} mt-1 flex justify-between text-[10px]`}>
              <span style={{ color: INK_SOFT }}>{byId.get(x.targetId) ?? x.targetId}</span>
              <b style={{ color: x.party === "liberal" ? SLATE_DEEP : VERM_DARK }}>{x.party.toUpperCase()}</b>
            </div>
          ))}
        </div>
      ) : null}
      <div className={`${typewriter.className} mt-2 text-center text-[8px]`} style={{ color: INK_FADE }}>
        tap the card to {sealed ? "open" : "re-seal"} it
      </div>
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

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
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

      <header
        className="relative z-10 flex items-center justify-between border-b-2 px-3 pb-2 pt-[max(.65rem,env(safe-area-inset-top))] sm:px-6"
        style={{ borderColor: INK }}
      >
        <div className="flex items-baseline gap-3">
          <h1 className={`${oswald.className} text-sm font-bold uppercase tracking-[0.18em] sm:text-base sm:tracking-[0.3em]`}>
            Secret<span style={{ color: VERM }}> Hitler</span>
          </h1>
          <span className={`${typewriter.className} hidden text-[9px] sm:inline`} style={{ color: INK_FADE }}>
            election №{round} · deck {view.deckCount} · discard {view.discardCount}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open the election record"
            className="grid h-8 w-8 place-items-center border-2"
            style={{ borderColor: INK, color: INK_SOFT }}
          >
            <Icons.book size={15} />
          </button>
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className="grid h-8 w-8 place-items-center border-2"
            style={{ borderColor: INK, color: INK_SOFT }}
          >
            {muted ? <Icons.volumeOff size={15} /> : <Icons.volumeOn size={15} />}
          </button>
          <button
            type="button"
            onClick={() => setMobileLogOpen((open) => !open)}
            aria-label={mobileLogOpen ? "Hide the record" : "Show the record"}
            aria-expanded={mobileLogOpen}
            className="grid h-8 w-8 place-items-center border-2 lg:hidden"
            style={{ borderColor: INK, color: INK_SOFT }}
          >
            <Icons.scroll size={15} />
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            aria-label="Open the rules"
            className={`${oswald.className} h-8 border-2 px-2.5 text-[9px] font-semibold uppercase tracking-[0.18em]`}
            style={{ borderColor: INK, color: INK_SOFT }}
          >
            Rules
          </button>
        </div>
      </header>

      {spectating ? (
        <div
          className={`${oswald.className} relative z-10 mx-auto mt-2 w-fit border-2 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.24em]`}
          style={{ borderColor: SLATE, color: SLATE_DEEP, background: "#dde3e3" }}
        >
          Press gallery · observing
        </div>
      ) : null}
      {deceased ? (
        <div
          className={`${oswald.className} relative z-10 mx-auto mt-2 w-fit border-2 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.24em]`}
          style={{ borderColor: INK, color: INK_SOFT, background: "#ddd3ba" }}
        >
          Deceased · you watch in silence, your secret intact
        </div>
      ) : null}

      <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-4 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="grid gap-3 md:grid-cols-2">
            <LiberalBoard enacted={view.liberalTrack} tracker={view.tracker} />
            <FascistBoard enacted={view.fascistTrack} powers={view.powers} vetoUnlocked={view.vetoUnlocked} />
          </div>

          <section className="mb-3 mt-4 flex items-end justify-between gap-3 border-b-2 pb-3" style={{ borderColor: `${INK}55` }}>
            <div>
              <div className={`${typewriter.className} text-[10px] tracking-[0.28em]`} style={{ color: VERM_DARK }}>
                {copy.eyebrow.toUpperCase()}
                {view.specialRound && view.phase !== "over" ? " · SPECIAL ELECTION" : ""}
              </div>
              <h2 className={`${oswald.className} mt-1 text-xl font-bold uppercase leading-none tracking-[0.08em] sm:text-2xl`}>
                {copy.title}
              </h2>
              <p className={`${typewriter.className} mt-1 max-w-xl text-[10.5px] leading-4`} style={{ color: INK_FADE }}>
                {copy.hint}
              </p>
            </div>
            <Timer text={clock} urgent={urgent} />
          </section>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${view.phase}-${view.elections.length}-${view.liberalTrack}-${view.fascistTrack}-${view.tracker}-${view.vetoRefused}`}
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
              />
            </motion.div>
          </AnimatePresence>

          {!spectating && view.yourRole ? (
            <div className="mt-4 lg:hidden">
              <RolePanel view={view} youId={youId} sealed={sealed} onToggle={() => setSealed((h) => !h)} />
            </div>
          ) : null}
        </div>

        <aside className="min-w-0">
          {!spectating && view.yourRole ? (
            <div className="mb-4 hidden lg:block">
              <RolePanel view={view} youId={youId} sealed={sealed} onToggle={() => setSealed((h) => !h)} />
            </div>
          ) : null}
          <div className={`${mobileLogOpen ? "block" : "hidden"} lg:block`}>
            <div className="relative border-2 p-3.5" style={{ borderColor: INK, background: "#e6dcbf", boxShadow: PRESS_SHADOW_SM }}>
              <div className="flex items-center justify-between">
                <div className={`${oswald.className} text-[9px] font-bold uppercase tracking-[0.3em]`} style={{ color: INK_SOFT }}>
                  The record
                </div>
                <span className={`${typewriter.className} text-[9px] tabular-nums`} style={{ color: INK_FADE }}>
                  {view.log.length}
                </span>
              </div>
              <div className="mt-3 max-h-[30dvh] space-y-2.5 overflow-y-auto pr-1 lg:max-h-[46dvh]" aria-live="polite">
                {[...view.log].reverse().map((entry, index) => (
                  <div
                    key={entry.i}
                    className="border-l-2 pl-2.5"
                    style={{ borderColor: index === 0 ? VERM : `${INK}44` }}
                  >
                    <div className={`${typewriter.className} text-[10.5px] leading-4`} style={{ color: index === 0 ? INK : INK_SOFT }}>
                      {logText(entry)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </main>

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
