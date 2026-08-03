"use client";

/* Reveal moments and modals: the simultaneous ballot flip with its diagonal
   verdict stamp, the chaos riot, executions, the president's private
   investigation result, the endgame dossier wall, the election record
   drawer and the rules broadsheet. All reveal overlays are presentational —
   mounted/unmounted by the screen based on log timestamps. */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import type {
  SecretHitlerView,
  SHElection,
  SHParty,
  SHViewPlayer,
} from "@/lib/games/secrethitler/types";
import {
  EASE,
  HALFTONE,
  INK,
  INK_FADE,
  INK_SOFT,
  PAPER,
  PRESS_SHADOW,
  PolicyTile,
  SLATE,
  SLATE_DEEP,
  VERM,
  VERM_DARK,
} from "./Boards";
import { PartyCard, RolePlate } from "./Dossier";
import { oswald, typewriter } from "./font";

const nameOf = (players: SHViewPlayer[], id: string | null) =>
  players.find((p) => p.id === id)?.name ?? "someone";

/* --------------------------- letterpress button -------------------------- */

export function InkButton({
  children,
  onClick,
  disabled,
  tone = "ink",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "ink" | "verm" | "slate";
  className?: string;
}) {
  const bg = tone === "verm" ? VERM : tone === "slate" ? SLATE : INK;
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { x: 2, y: 2, boxShadow: "0px 0px 0 rgba(28,23,18,0.85)" }}
      onClick={onClick}
      disabled={disabled}
      className={`${oswald.className} border-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-opacity disabled:pointer-events-none disabled:opacity-35 ${className}`}
      style={{ background: bg, color: "#f1e6c8", borderColor: INK, boxShadow: PRESS_SHADOW }}
    >
      {children}
    </motion.button>
  );
}

/* ------------------------------ paper modal ------------------------------ */

export function PaperModal({
  open,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-[#0d0a07]/75 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: 22, opacity: 0, rotate: -0.6 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className={`relative max-h-[88dvh] w-full overflow-y-auto border-2 p-4 sm:p-6 ${wide ? "max-w-2xl" : "max-w-md"}`}
            style={{ background: PAPER, borderColor: INK, boxShadow: "6px 6px 0 rgba(13,10,7,0.7)", color: INK }}
          >
            <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: HALFTONE }} />
            <div className="relative">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------ ballot flip ------------------------------ */

function BallotChit({ ja, delay }: { ja: boolean; delay: number }) {
  return (
    <div style={{ perspective: 500, width: 44, height: 30 }}>
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        initial={{ rotateX: 180 }}
        animate={{ rotateX: 0 }}
        transition={{ delay, duration: 0.3, ease: EASE }}
      >
        <div
          className={`${oswald.className} absolute inset-0 grid place-items-center border-2 text-[12px] font-bold tracking-[0.08em]`}
          style={{
            backfaceVisibility: "hidden",
            background: ja ? "#dde3e3" : "#e8d3c2",
            borderColor: ja ? SLATE_DEEP : VERM_DARK,
            color: ja ? SLATE_DEEP : VERM_DARK,
          }}
        >
          {ja ? "JA!" : "NEIN!"}
        </div>
        <div
          className="absolute inset-0 border-2"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateX(180deg)",
            background: "#d3c093",
            borderColor: INK_SOFT,
          }}
        />
      </motion.div>
    </div>
  );
}

export function BallotRevealOverlay({
  election,
  players,
  reduce,
}: {
  election: SHElection;
  players: SHViewPlayer[];
  reduce: boolean;
}) {
  const voters = [...players].filter((p) => election.votes[p.id] !== undefined).sort((a, b) => a.seat - b.seat);
  const stagger = reduce ? 0 : 0.06;
  const base = reduce ? 0 : 0.45;
  const verdictDelay = base + voters.length * stagger + (reduce ? 0 : 0.45);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center p-4">
      <motion.div
        className="relative w-full max-w-md border-2 p-5 text-center"
        style={{ background: PAPER, borderColor: INK, boxShadow: "6px 6px 0 rgba(13,10,7,0.7)", color: INK }}
        animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -6] }}
        transition={{ duration: 5.1, times: [0, 0.07, 0.9, 1], ease: "easeOut" }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: HALFTONE }} />
        <div className={`${typewriter.className} text-[10px] tracking-[0.2em]`} style={{ color: INK_FADE }}>
          THE HOUSE DIVIDES
        </div>
        <div className={`${oswald.className} mt-1 text-lg font-semibold uppercase tracking-[0.12em]`}>
          {nameOf(players, election.presidentId)} · {nameOf(players, election.chancellorId)}
        </div>
        <div className={`${typewriter.className} mt-0.5 text-[10px]`} style={{ color: INK_SOFT }}>
          president · chancellor-nominee{election.special ? " · special election" : ""}
        </div>
        <div className="mt-4 flex flex-wrap items-start justify-center gap-x-3 gap-y-2">
          {voters.map((p, i) => (
            <div key={p.id} className="flex w-12 flex-col items-center gap-1">
              <BallotChit ja={election.votes[p.id]} delay={base + i * stagger} />
              <span className={`${typewriter.className} w-full truncate text-center text-[8px]`} style={{ color: INK_SOFT }}>
                {p.name}
              </span>
            </div>
          ))}
        </div>
        <motion.div
          className={`${oswald.className} pointer-events-none mx-auto mt-4 w-fit rotate-[-8deg] border-4 px-4 py-1 text-2xl font-bold uppercase tracking-[0.18em]`}
          style={{
            borderColor: election.passed ? SLATE_DEEP : VERM_DARK,
            color: election.passed ? SLATE_DEEP : VERM_DARK,
          }}
          initial={{ opacity: 0, scale: 2.2 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: verdictDelay, duration: 0.22, ease: EASE }}
        >
          {election.passed ? "Elected" : "Rejected"}
          <span className="ml-2 text-base tabular-nums">
            {election.ja}–{election.nein}
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ------------------------------ stamp cards ------------------------------ */

function StampCard({
  eyebrow,
  title,
  tone,
  duration,
  children,
}: {
  eyebrow: string;
  title: string;
  tone: "verm" | "slate";
  duration: number;
  children?: React.ReactNode;
}) {
  const color = tone === "verm" ? VERM_DARK : SLATE_DEEP;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center p-4">
      <motion.div
        className="relative w-full max-w-sm border-2 p-5 text-center"
        style={{ background: PAPER, borderColor: INK, boxShadow: "6px 6px 0 rgba(13,10,7,0.7)", color: INK }}
        animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -6] }}
        transition={{ duration, times: [0, 0.09, 0.88, 1], ease: "easeOut" }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: HALFTONE }} />
        <div className={`${typewriter.className} text-[10px] tracking-[0.2em]`} style={{ color: INK_FADE }}>
          {eyebrow}
        </div>
        <motion.div
          className={`${oswald.className} mx-auto mt-2 w-fit rotate-[-7deg] border-4 px-4 py-1 text-[22px] font-bold uppercase tracking-[0.14em]`}
          style={{ borderColor: color, color }}
          initial={{ opacity: 0, scale: 2 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, duration: 0.22, ease: EASE }}
        >
          {title}
        </motion.div>
        {children}
      </motion.div>
    </div>
  );
}

export function ChaosOverlay({ party }: { party: SHParty }) {
  return (
    <StampCard eyebrow="THREE FAILED GOVERNMENTS — THE MOB RIOTS" title="Chaos" tone="verm" duration={4.4}>
      <div className="mx-auto mt-3 w-24">
        <motion.div initial={{ scale: 1.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.7, duration: 0.3, ease: EASE }}>
          <PolicyTile party={party} />
        </motion.div>
      </div>
      <p className={`${typewriter.className} mt-3 text-[10px] leading-4`} style={{ color: INK_SOFT }}>
        The top policy is enacted. No power is granted. Term limits are forgotten.
      </p>
    </StampCard>
  );
}

export function ExecutionOverlay({ name }: { name: string }) {
  return (
    <StampCard eyebrow="BY ORDER OF THE PRESIDENT" title="Executed" tone="verm" duration={4}>
      <div className={`${oswald.className} mt-3 text-lg font-semibold uppercase tracking-[0.2em]`}>{name}</div>
      <p className={`${typewriter.className} mt-2 text-[10px]`} style={{ color: INK_SOFT }}>
        The body is carried out. The party card is burned unread.
      </p>
    </StampCard>
  );
}

/** President's eyes only — the investigation result. */
export function InvestigationOverlay({ name, party }: { name: string; party: SHParty }) {
  return (
    <StampCard eyebrow="LOYALTY INVESTIGATION · YOUR EYES ONLY" title={party === "liberal" ? "Liberal" : "Fascist"} tone={party === "liberal" ? "slate" : "verm"} duration={6}>
      <div className={`${oswald.className} mt-2 text-sm font-semibold uppercase tracking-[0.2em]`}>{name}</div>
      <div className="mx-auto mt-3 w-40">
        <motion.div initial={{ rotateY: 180 }} animate={{ rotateY: 0 }} transition={{ delay: 0.8, duration: 0.5, ease: EASE }}>
          <PartyCard party={party} w={160} />
        </motion.div>
      </div>
      <p className={`${typewriter.className} mt-3 text-[10px]`} style={{ color: INK_SOFT }}>
        Only you have read this file. Lie about it if you must.
      </p>
    </StampCard>
  );
}

/* -------------------------------- game over ------------------------------ */

function outcomeBanner(view: SecretHitlerView): { title: string; sub: string; tone: "slate" | "verm" } {
  const leaver = view.players.find((p) => p.left);
  const liberal = view.winner === "liberal";
  switch (view.winBy) {
    case "policies":
      return liberal
        ? { title: "LIBERALS PREVAIL", sub: "Five liberal policies stand. The republic holds.", tone: "slate" }
        : { title: "FASCISTS SEIZE POWER", sub: "Six fascist policies. The chamber goes dark.", tone: "verm" };
    case "hitler_executed": {
      const hitlerId = view.reveal?.find((r) => r.role === "hitler")?.id ?? null;
      return {
        title: "LIBERALS PREVAIL",
        sub: `${nameOf(view.players, hitlerId)} was Hitler. The bullet found him.`,
        tone: "slate",
      };
    }
    case "hitler_chancellor":
      return {
        title: "FASCISTS SEIZE POWER",
        sub: `Chancellor ${nameOf(view.players, view.chancellorId)} was Hitler all along.`,
        tone: "verm",
      };
    case "forfeit":
      return {
        title: liberal ? "LIBERALS PREVAIL" : "FASCISTS SEIZE POWER",
        sub: `${leaver?.name ?? "A player"} abandoned the table — their cause is conceded.`,
        tone: liberal ? "slate" : "verm",
      };
    default:
      return { title: "THE SESSION ENDS", sub: "", tone: "slate" };
  }
}

export function GameOverOverlay({
  view,
  tallies,
  isHost,
  youId,
  playAgain,
  exitToLobby,
  reduce,
}: {
  view: SecretHitlerView;
  tallies: Record<string, number>;
  isHost: boolean;
  youId: string;
  playAgain: () => void;
  exitToLobby: () => void;
  reduce: boolean;
}) {
  const banner = outcomeBanner(view);
  const youWon = view.winnerIds.includes(youId);
  const reveal = view.reveal ?? [];
  const entries = [...view.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({ player: p, entry: reveal.find((r) => r.id === p.id) }));
  const liberals = entries.filter((e) => e.entry?.party === "liberal");
  const fascists = entries.filter((e) => e.entry?.party === "fascist");
  const anyTallies = Object.values(tallies).some((w) => w > 0);
  const color = banner.tone === "verm" ? VERM_DARK : SLATE_DEEP;

  const wall = (label: string, labelColor: string, list: typeof entries, offset: number) => (
    <div>
      <div
        className={`${oswald.className} mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.3em]`}
        style={{ color: labelColor }}
      >
        {label}
        {view.winner === (labelColor === SLATE_DEEP ? "liberal" : "fascist") ? " · victorious" : ""}
      </div>
      <div className="flex flex-wrap items-start justify-center gap-3">
        {list.map((e, i) => (
          <motion.div
            key={e.player.id}
            className="flex w-[86px] flex-col items-center gap-1"
            initial={reduce ? false : { rotateY: 120, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ delay: reduce ? 0 : 0.3 + (offset + i) * 0.12, duration: 0.45, ease: EASE }}
          >
            <div className="relative">
              <RolePlate role={e.entry?.role ?? "liberal"} w={82} />
              {!e.player.alive ? (
                <span
                  className={`${oswald.className} absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-14deg] border-2 px-1 text-[9px] font-bold tracking-[0.14em]`}
                  style={{ borderColor: VERM_DARK, color: VERM_DARK, background: `${PAPER}dd` }}
                >
                  EXECUTED
                </span>
              ) : null}
            </div>
            <span className={`${typewriter.className} w-full truncate text-center text-[10px]`} style={{ color: INK_SOFT }}>
              {e.player.name}
              {e.player.id === youId ? " (you)" : ""}
              {e.player.left ? " · left" : ""}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );

  return (
    <motion.div
      className="fixed inset-0 z-40 overflow-y-auto bg-[#0d0a07]/85 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative mx-auto my-6 w-full max-w-2xl border-2 p-5 text-center sm:p-8"
        style={{ background: PAPER, borderColor: INK, boxShadow: "8px 8px 0 rgba(13,10,7,0.8)", color: INK }}
        initial={{ y: 24, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: HALFTONE }} />
        <div className="relative">
          <div className={`${typewriter.className} text-[10px] tracking-[0.3em]`} style={{ color: INK_FADE }}>
            {youWon ? "YOUR CAUSE CARRIES THE DAY" : "THE RECORD IS SEALED"}
          </div>
          <h2
            className={`${oswald.className} mt-2 text-3xl font-bold uppercase leading-none tracking-[0.1em] sm:text-4xl`}
            style={{ color }}
          >
            {banner.title}
          </h2>
          {banner.sub ? (
            <p className={`${typewriter.className} mt-2 text-[11px]`} style={{ color: INK_SOFT }}>
              {banner.sub}
            </p>
          ) : null}

          <div className="my-5 h-0.5" style={{ background: `${INK}33` }} />
          <div className="space-y-5">
            {wall("The Liberals", SLATE_DEEP, liberals, 0)}
            {wall("The Fascists", VERM_DARK, fascists, liberals.length)}
          </div>

          {anyTallies ? (
            <div className="mt-6 border-t-2 pt-4 text-left" style={{ borderColor: `${INK}33` }}>
              <div className={`${oswald.className} text-[10px] font-semibold uppercase tracking-[0.3em]`} style={{ color: INK_SOFT }}>
                Secret Hitler victories
              </div>
              <div className="mt-2 space-y-1.5">
                {view.players
                  .map((p) => ({ p, wins: tallies[p.id] ?? 0 }))
                  .sort((a, b) => b.wins - a.wins)
                  .map(({ p, wins }) => (
                    <div key={p.id} className={`${typewriter.className} flex justify-between text-[11px] tabular-nums`} style={{ color: INK_SOFT }}>
                      <span>{p.name}</span>
                      <span style={{ color: VERM_DARK }}>★ {wins}</span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          <div className="my-6 h-0.5" style={{ background: `${INK}33` }} />
          {isHost ? (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <InkButton tone={banner.tone === "verm" ? "verm" : "slate"} onClick={playAgain} className="sm:min-w-44">
                Convene again
              </InkButton>
              <InkButton onClick={exitToLobby} className="sm:min-w-44">
                Back to lobby
              </InkButton>
            </div>
          ) : (
            <div className={`${typewriter.className} border-2 border-dashed px-4 py-3 text-[11px]`} style={{ borderColor: `${INK}55`, color: INK_SOFT }}>
              Waiting for the host…
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------- election record --------------------------- */

export function HistoryDrawer({
  open,
  onClose,
  elections,
  players,
}: {
  open: boolean;
  onClose: () => void;
  elections: SHElection[];
  players: SHViewPlayer[];
}) {
  return (
    <PaperModal open={open} onClose={onClose} wide>
      <div className="mb-4 border-b-2 pb-3 text-center" style={{ borderColor: `${INK}44` }}>
        <div className={`${typewriter.className} text-[10px] tracking-[0.3em]`} style={{ color: INK_FADE }}>
          MINISTRY ARCHIVE
        </div>
        <h2 className={`${oswald.className} mt-1 text-xl font-semibold uppercase tracking-[0.14em]`}>
          Every election, every ballot
        </h2>
      </div>
      {elections.length === 0 ? (
        <p className={`${typewriter.className} py-6 text-center text-[11px] italic`} style={{ color: INK_FADE }}>
          No government has faced the house yet.
        </p>
      ) : (
        <div className="max-h-[54dvh] space-y-3 overflow-y-auto pr-1">
          {[...elections].reverse().map((e, idx) => {
            const n = elections.length - idx;
            return (
              <div key={n} className="border-2 p-3" style={{ borderColor: `${INK}55`, background: "#e2d6b6" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`${typewriter.className} text-[10px]`} style={{ color: INK_SOFT }}>
                    №{n} · Pres. {nameOf(players, e.presidentId)} · Chan. {nameOf(players, e.chancellorId)}
                    {e.special ? " · special" : ""}
                  </span>
                  <span
                    className={`${oswald.className} border-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]`}
                    style={
                      e.passed
                        ? { borderColor: SLATE_DEEP, color: SLATE_DEEP }
                        : { borderColor: VERM_DARK, color: VERM_DARK }
                    }
                  >
                    {e.passed ? `Elected ${e.ja}–${e.nein}` : `Rejected ${e.ja}–${e.nein}`}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {[...players]
                    .filter((p) => e.votes[p.id] !== undefined)
                    .sort((a, b) => a.seat - b.seat)
                    .map((p) => (
                      <span key={p.id} className={`${typewriter.className} inline-flex items-center gap-1 text-[10px]`} style={{ color: INK_SOFT }}>
                        <b style={{ color: e.votes[p.id] ? SLATE_DEEP : VERM_DARK }}>
                          {e.votes[p.id] ? "JA" : "NEIN"}
                        </b>
                        {p.name}
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-5 flex justify-center">
        <InkButton onClick={onClose} className="min-w-36">
          Close archive
        </InkButton>
      </div>
    </PaperModal>
  );
}

/* ---------------------------------- rules -------------------------------- */

export function RulesModal({ open, onClose, playerCount }: { open: boolean; onClose: () => void; playerCount: number }) {
  const seven = playerCount >= 7;
  return (
    <PaperModal open={open} onClose={onClose} wide>
      <div className="mb-5 border-b-2 pb-4 text-center" style={{ borderColor: `${INK}44` }}>
        <div className={`${typewriter.className} text-[10px] tracking-[0.3em]`} style={{ color: INK_FADE }}>
          STANDING ORDERS OF THE HOUSE
        </div>
        <h2 className={`${oswald.className} mt-2 text-2xl font-bold uppercase tracking-[0.12em]`}>
          How the republic falls — or holds
        </h2>
      </div>

      <p className="text-[13px] leading-6" style={{ color: INK_SOFT }}>
        Liberals win by enacting <b style={{ color: SLATE_DEEP }}>five liberal policies</b> or by{" "}
        <b style={{ color: SLATE_DEEP }}>executing Hitler</b>. Fascists win with{" "}
        <b style={{ color: VERM_DARK }}>six fascist policies</b> — or instantly, once three fascist policies stand,
        by electing <b style={{ color: VERM_DARK }}>Hitler as Chancellor</b>.
      </p>

      <ol className="mt-4 space-y-2.5 text-[12.5px] leading-5" style={{ color: INK_SOFT }}>
        <li>
          <b style={{ color: INK }}>1 · Parties.</b> 5 players: 3 liberals, 1 fascist + Hitler · 6: 4/1+H · 7: 4/2+H ·
          8: 5/2+H. Fascists know each other and know Hitler. Hitler knows his single fellow fascist only at 5–6
          players. Liberals know nothing. Hitler&apos;s <i>party card</i> reads FASCIST.
        </li>
        <li>
          <b style={{ color: INK }}>2 · Elections.</b> The presidency passes clockwise. The President nominates a
          Chancellor; everyone votes JA! or NEIN! at once, ballots revealed together and archived. A tie fails.{" "}
          <b>Term limits:</b> the last elected Chancellor is always ineligible; the last elected President is also
          ineligible while more than 5 players live.
        </li>
        <li>
          <b style={{ color: INK }}>3 · The tracker.</b> Each failed election fills one of three slots. The third
          fills, the mob riots: the top policy is enacted at once — no power granted, tracker reset,{" "}
          <b>all term limits forgotten</b>.
        </li>
        <li>
          <b style={{ color: INK }}>4 · Legislation.</b> The President draws 3 policies, discards 1 face-down; the
          Chancellor receives 2 and enacts 1. Discards are never shown. Under 3 cards, the deck reshuffles with the
          discards. Everyone else sees only the counts.
        </li>
        <li>
          <b style={{ color: INK }}>5 · Powers ({playerCount} players).</b>{" "}
          {seven ? (
            <>
              Fascist slot 2: <b>Investigate Loyalty</b> (President privately reads a party card; who was investigated
              is public, the result is not). Slot 3: <b>Special Election</b> (President appoints the next candidate;
              rotation then resumes). Slots 4 &amp; 5: <b>Execution</b>.
            </>
          ) : (
            <>
              Fascist slot 3: <b>Policy Peek</b> (President privately sees the top three cards). Slots 4 &amp; 5:{" "}
              <b>Execution</b>.
            </>
          )}{" "}
          The dead never speak, vote, or hold office — and their role stays hidden unless it was Hitler, whose death
          ends the game for the liberals.
        </li>
        <li>
          <b style={{ color: INK }}>6 · Veto.</b> After the fifth fascist policy, the Chancellor may move to veto the
          session. If the President agrees, both policies are discarded and the tracker advances (this can trigger
          chaos). If refused, the Chancellor must enact.
        </li>
      </ol>

      <div className="mt-5 space-y-2 border-2 p-3 text-[11px] leading-5" style={{ borderColor: `${INK}44`, background: "#e2d6b6", color: INK_SOFT }}>
        <p>
          <b style={{ color: INK }}>House notes.</b> Leaving mid-game concedes it: removing a seat would break the
          role balance, so the leaver&apos;s opposing team wins immediately and every dossier is opened.
        </p>
        <p>
          The clock never waits: a silent President gets a random lawful nominee, missing ballots count as NEIN!, a
          silent legislator discards or enacts at random, an unanswered veto is refused, and pending powers resolve
          at random.
        </p>
      </div>

      <div className="mt-5 flex justify-center">
        <InkButton tone="verm" onClick={onClose} className="min-w-40">
          Close the orders
        </InkButton>
      </div>
    </PaperModal>
  );
}
