"use client";

/* Reveal moments and modals: the simultaneous vote flip, the quest-card
   flip with its dramatic pause, the endgame role table, the vote-history
   drawer and the rules scroll. All overlays are presentational — they are
   mounted/unmounted by the screen based on log timestamps. */

import { motion } from "framer-motion";
import { Button, Icons, Modal } from "@/components/ui";
import { FACTION_META, ROLE_META } from "@/lib/games/avalon/meta";
import type { AvalonProposal, AvalonQuest, AvalonView, AvalonViewPlayer } from "@/lib/games/avalon/types";
import { uncial } from "./font";
import { CardBack, RoleCard } from "./RoleCard";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const ROMAN = ["I", "II", "III", "IV", "V"] as const;

const nameOf = (players: AvalonViewPlayer[], id: string) =>
  players.find((p) => p.id === id)?.name ?? "someone";

/* --------------------------- vote reveal ---------------------------- */

function VoteToken({ approve, delay }: { approve: boolean; delay: number }) {
  return (
    <motion.span
      className="grid h-10 w-10 place-items-center rounded-full border-2"
      style={
        approve
          ? {
              borderColor: "#dfe8f2",
              background: "radial-gradient(circle at 35% 30%, #b9c6d8, #5c6d84 75%)",
              color: "#0d1526",
            }
          : {
              borderColor: "#e0556d",
              background: "radial-gradient(circle at 35% 30%, #a1273a, #3a1020 75%)",
              color: "#f2c9d1",
            }
      }
      initial={{ rotateY: 90, opacity: 0, scale: 0.7 }}
      animate={{ rotateY: 0, opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.32, ease: EASE }}
      aria-label={approve ? "approved" : "rejected"}
    >
      {approve ? <Icons.check size={17} /> : <Icons.x size={15} />}
    </motion.span>
  );
}

export function VoteRevealOverlay({
  proposal,
  players,
  reduce,
}: {
  proposal: AvalonProposal;
  players: AvalonViewPlayer[];
  reduce: boolean;
}) {
  const seats = [...players].sort((a, b) => a.seat - b.seat);
  const approves = Object.values(proposal.votes).filter(Boolean).length;
  const refusals = seats.length - approves;
  const stagger = reduce ? 0 : 0.06;
  const base = reduce ? 0 : 0.45;
  const verdictDelay = base + seats.length * stagger + (reduce ? 0 : 0.4);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center p-4">
      <motion.div
        className="w-full max-w-md border border-[#55627a]/70 bg-[#0d1526]/95 p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,.75)] backdrop-blur-sm"
        animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -6] }}
        transition={{ duration: 5, times: [0, 0.07, 0.9, 1], ease: "easeOut" }}
      >
        <div className="text-[9px] uppercase tracking-[0.32em] text-[#7d94ad]">The council speaks</div>
        <div className={`${uncial.className} mt-1 text-lg text-[#dfe8f2]`}>
          Quest {ROMAN[proposal.quest - 1]} · Proposal {proposal.attempt}
        </div>
        <div className="mt-1 text-[10px] text-[#5f7189]">
          {nameOf(players, proposal.leaderId)} proposed: {proposal.team.map((id) => nameOf(players, id)).join(", ")}
        </div>
        <div className="mt-4 flex flex-wrap items-start justify-center gap-x-3 gap-y-2">
          {seats.map((p, i) => (
            <div key={p.id} className="flex w-12 flex-col items-center gap-1">
              <VoteToken approve={proposal.votes[p.id]} delay={base + i * stagger} />
              <span className="w-full truncate text-center text-[8px] uppercase tracking-wider text-[#7d94ad]">
                {p.name}
              </span>
            </div>
          ))}
        </div>
        <motion.div
          className={`${uncial.className} mt-4 text-base tabular-nums`}
          style={{ color: proposal.approved ? "#8fb8de" : "#e0556d" }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: verdictDelay, duration: 0.3, ease: EASE }}
        >
          {proposal.approved ? "The party rides" : "The crown passes"} · {approves}–{refusals}
        </motion.div>
      </motion.div>
    </div>
  );
}

/* --------------------------- quest reveal --------------------------- */

function QuestCardFlip({ success, delay }: { success: boolean; delay: number }) {
  return (
    <div style={{ perspective: 700, width: 54, height: 76 }}>
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        initial={{ rotateY: 180 }}
        animate={{ rotateY: 0 }}
        transition={{ delay, duration: 0.45, ease: EASE }}
      >
        <div
          className="absolute inset-0 grid place-items-center rounded-md border"
          style={{
            backfaceVisibility: "hidden",
            background: "linear-gradient(160deg, #f0e6cd, #d9c9a5)",
            borderColor: success ? "#4a6f8e" : "#7e2231",
          }}
        >
          <div className="flex flex-col items-center gap-1">
            <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
              {success ? (
                <g fill="none" stroke="#2c4a63" strokeWidth="1.6">
                  <path d="M6 4 C6 11 8.5 13.6 12 14.2 C15.5 13.6 18 11 18 4 Z" fill="#8fb8de" />
                  <path d="M5 4 H19" strokeLinecap="round" />
                  <path d="M12 14.2 V18 M8 20 Q12 17.6 16 20" strokeLinecap="round" />
                </g>
              ) : (
                <g fill="none" stroke="#7e2231" strokeWidth="1.9" strokeLinecap="round">
                  <path d="M12 2 L10.8 8 L14 10.5 L9.6 13.6 L13.4 16.8 L11 22" />
                  <path d="M4 7 L7.4 9.6 M20 17 L16.8 14.9" opacity="0.75" />
                </g>
              )}
            </svg>
            <span
              className="text-[7px] font-bold uppercase tracking-[0.14em]"
              style={{ color: success ? "#2c4a63" : "#7e2231" }}
            >
              {success ? "Success" : "Fail"}
            </span>
          </div>
        </div>
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          <CardBack kind="neutral" w={54} />
        </div>
      </motion.div>
    </div>
  );
}

export function QuestRevealOverlay({
  quest,
  questNumber,
  reduce,
}: {
  quest: AvalonQuest;
  questNumber: number;
  reduce: boolean;
}) {
  const failed = quest.outcome === "fail";
  const base = reduce ? 0 : 0.5;
  const step = reduce ? 0 : 0.5;
  const pause = reduce ? 0 : 0.85; // the beat before any Fail shows
  const cards = [
    ...Array.from({ length: quest.successes }, (_, i) => ({ success: true, delay: base + i * step })),
    ...Array.from({ length: quest.fails }, (_, i) => ({
      success: false,
      delay: base + quest.successes * step + pause + i * (reduce ? 0 : 0.7),
    })),
  ];
  const verdictDelay = cards.length ? cards[cards.length - 1].delay + (reduce ? 0 : 0.55) : 0.4;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center p-4">
      <motion.div
        className="w-full max-w-md border border-[#55627a]/70 bg-[#0d1526]/95 p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,.75)] backdrop-blur-sm"
        animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -6] }}
        transition={{ duration: 6.3, times: [0, 0.06, 0.92, 1], ease: "easeOut" }}
      >
        <div className="text-[9px] uppercase tracking-[0.32em] text-[#7d94ad]">The cards return</div>
        <div className={`${uncial.className} mt-1 text-lg text-[#dfe8f2]`}>Quest {ROMAN[questNumber - 1]}</div>
        {quest.failsRequired === 2 ? (
          <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-[#d6c389]">Two fails required</div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {cards.map((c, i) => (
            <QuestCardFlip key={i} success={c.success} delay={c.delay} />
          ))}
        </div>
        <motion.div
          className={`${uncial.className} mt-4 text-base tabular-nums`}
          style={{ color: failed ? "#e0556d" : "#8fb8de" }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: verdictDelay, duration: 0.3, ease: EASE }}
        >
          {failed ? "The quest fails" : "The quest succeeds"} · {quest.successes}–{quest.fails}
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ---------------------------- game over ----------------------------- */

function outcomeBanner(view: AvalonView): { title: string; sub: string } {
  const leaver = view.players.find((p) => p.left);
  switch (view.winBy) {
    case "assassination":
      return view.winner === "evil"
        ? { title: "Merlin falls — evil prevails", sub: "The Assassin's dagger found its mark." }
        : { title: "Merlin endures — good prevails", sub: "The dagger struck a loyal decoy." };
    case "quests":
      return { title: "Three quests lie in ruin", sub: "The Minions of Mordred claim Camelot." };
    case "rejects":
      return { title: "Camelot falls to chaos", sub: "Five refused proposals — Mordred needs no quests." };
    case "forfeit":
      return {
        title: view.winner === "good" ? "Good prevails by concession" : "Evil prevails by concession",
        sub: `${leaver?.name ?? "A player"} abandoned the table; their cause is forfeit.`,
      };
    default:
      return { title: "The tale is told", sub: "" };
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
  view: AvalonView;
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
  let servantVariant = 0;
  const entries = [...view.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const r = reveal.find((x) => x.id === p.id);
      const role = r?.role ?? "servant";
      const variant = role === "servant" ? servantVariant++ : 0;
      return { player: p, role, faction: r?.faction ?? "good", variant };
    });
  const good = entries.filter((e) => e.faction === "good");
  const evil = entries.filter((e) => e.faction === "evil");
  const anyTallies = Object.values(tallies).some((w) => w > 0);

  const group = (label: string, color: string, list: typeof entries, offset: number) => (
    <div>
      <div className="mb-2 text-center text-[9px] uppercase tracking-[0.3em]" style={{ color }}>
        {label}
        {view.winner && FACTION_META[view.winner].title === label ? " · victorious" : ""}
      </div>
      <div className="flex flex-wrap items-start justify-center gap-3">
        {list.map((e, i) => (
          <motion.div
            key={e.player.id}
            className="flex w-[88px] flex-col items-center gap-1"
            initial={reduce ? false : { rotateY: 120, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ delay: reduce ? 0 : 0.3 + (offset + i) * 0.12, duration: 0.45, ease: EASE }}
          >
            <div className="relative">
              <RoleCard role={e.role} variant={e.variant} w={84} />
              {view.assassinTarget === e.player.id ? (
                <span
                  className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-[#e0556d] bg-[#3a1020] text-[#e0556d]"
                  title="Marked by the Assassin"
                >
                  <Icons.swords size={13} />
                </span>
              ) : null}
            </div>
            <span className="w-full truncate text-center text-[10px] text-[#b9c6d8]">
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
      className="fixed inset-0 z-40 overflow-y-auto bg-[#05080f]/94 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="mx-auto my-6 w-full max-w-2xl border border-[#55627a]/60 bg-[#0d1526]/90 p-5 text-center sm:p-8"
        initial={{ y: 24, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="text-[9px] uppercase tracking-[0.34em] text-[#7d94ad]">
          {youWon ? "Your cause triumphs" : "The tale is told"}
        </div>
        <h2
          className={`${uncial.className} mt-2 text-2xl sm:text-3xl`}
          style={{ color: view.winner === "evil" ? "#e0556d" : "#cfe4f7" }}
        >
          {banner.title}
        </h2>
        {banner.sub ? <p className="mt-2 text-xs text-[#7d94ad]">{banner.sub}</p> : null}
        {view.winBy === "assassination" && view.assassinTarget ? (
          <p className="mt-1 text-[11px] text-[#5f7189]">
            The dagger fell upon {nameOf(view.players, view.assassinTarget)}.
          </p>
        ) : null}

        <div className="my-5 h-px bg-gradient-to-r from-transparent via-[#55627a]/70 to-transparent" />
        <div className="space-y-5">
          {group(FACTION_META.good.title, "#8fb8de", good, 0)}
          {group(FACTION_META.evil.title, "#e0556d", evil, good.length)}
        </div>

        {anyTallies ? (
          <div className="mt-6 border-t border-[#55627a]/40 pt-4 text-left">
            <div className="text-[9px] uppercase tracking-[0.3em] text-[#7d94ad]">Avalon victories</div>
            <div className="mt-2 space-y-1.5">
              {view.players
                .map((p) => ({ p, wins: tallies[p.id] ?? 0 }))
                .sort((a, b) => b.wins - a.wins)
                .map(({ p, wins }) => (
                  <div key={p.id} className="flex justify-between text-xs text-[#7d94ad] tabular-nums">
                    <span>{p.name}</span>
                    <span className="text-[#d6c389]">★ {wins}</span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        <div className="my-6 h-px bg-gradient-to-r from-transparent via-[#55627a]/70 to-transparent" />
        {isHost ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="primary" onClick={playAgain} className="sm:min-w-44">
              Ride again
            </Button>
            <Button variant="outline" onClick={exitToLobby} className="sm:min-w-44">
              Back to lobby
            </Button>
          </div>
        ) : (
          <div className="border border-dashed border-[#55627a]/50 px-4 py-3 text-xs text-[#7d94ad]">
            Waiting for the host…
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* -------------------------- vote history ---------------------------- */

export function VoteHistoryDrawer({
  open,
  onClose,
  proposals,
  players,
}: {
  open: boolean;
  onClose: () => void;
  proposals: AvalonProposal[];
  players: AvalonViewPlayer[];
}) {
  return (
    <Modal open={open} onClose={onClose} wide>
      <div className="text-[#b9c6d8]">
        <div className="mb-4 border-b border-[#55627a]/40 pb-3 text-center">
          <div className="text-[9px] uppercase tracking-[0.34em] text-[#7d94ad]">Court record</div>
          <h2 className={`${uncial.className} mt-1 text-xl text-[#dfe8f2]`}>Every proposal, every token</h2>
        </div>
        {proposals.length === 0 ? (
          <p className="py-6 text-center text-xs italic text-[#5f7189]">No proposals have been resolved yet.</p>
        ) : (
          <div className="max-h-[56dvh] space-y-3 overflow-y-auto pr-1">
            {[...proposals].reverse().map((pr, idx) => (
              <div key={proposals.length - idx} className="border border-[#55627a]/35 bg-[#0a111f]/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-[#7d94ad]">
                    Quest {ROMAN[pr.quest - 1]} · Proposal {pr.attempt} · Leader {nameOf(players, pr.leaderId)}
                  </span>
                  <span
                    className="border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.16em]"
                    style={
                      pr.approved
                        ? { borderColor: "#8fb8de77", color: "#8fb8de" }
                        : { borderColor: "#e0556d77", color: "#e0556d" }
                    }
                  >
                    {pr.approved ? "Approved" : "Rejected"}
                  </span>
                </div>
                <div className="mt-1.5 text-[11px] text-[#b9c6d8]">
                  Party: {pr.team.map((id) => nameOf(players, id)).join(", ")}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {[...players]
                    .sort((a, b) => a.seat - b.seat)
                    .map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 text-[10px] text-[#7d94ad]">
                        <span style={{ color: pr.votes[p.id] ? "#8fb8de" : "#e0556d" }}>
                          {pr.votes[p.id] ? "✓" : "✕"}
                        </span>
                        {p.name}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-center">
          <Button variant="outline" onClick={onClose} className="min-w-36">
            Close record
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ rules ------------------------------- */

export function AvalonRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} wide>
      <div className="text-[#b9c6d8]">
        <div className="mb-5 border-b border-[#55627a]/40 pb-4 text-center">
          <div className="text-[9px] uppercase tracking-[0.34em] text-[#7d94ad]">The chronicle of Avalon</div>
          <h2 className={`${uncial.className} mt-2 text-2xl text-[#dfe8f2]`}>How Camelot stands or falls</h2>
        </div>

        <p className="text-sm leading-6 text-[#9db1c7]">
          Good must succeed on <b className="text-[#cfe4f7]">three quests</b>; evil hides among you and needs only to
          fail three — or to sow enough chaos. Loyalties are secret, votes are public once revealed, and quest cards
          are forever anonymous.
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {(Object.keys(ROLE_META) as (keyof typeof ROLE_META)[]).map((role) => (
            <div
              key={role}
              className="border p-3"
              style={{
                borderColor: `${ROLE_META[role].color}44`,
                background: ROLE_META[role].faction === "evil" ? "#2a0c1666" : "#16283f55",
              }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: ROLE_META[role].color }}>
                  {ROLE_META[role].title}
                </h3>
                <span className="text-[8px] uppercase tracking-[0.2em] text-[#5f7189]">
                  {ROLE_META[role].faction}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-[#9db1c7]">{ROLE_META[role].blurb}</p>
            </div>
          ))}
        </div>

        <ol className="mt-5 space-y-2.5 text-[13px] leading-5 text-[#9db1c7]">
          <li>
            <b className="text-[#dfe8f2]">1 · Factions.</b> 5 players: 3 good / 2 evil · 6: 4/2 · 7: 4/3 · 8: 5/3.
            Percival and Morgana join only at 7–8 players. Evil players know each other (but not each other&apos;s
            roles); Merlin sees the evil roster; Percival sees Merlin and Morgana as an unlabeled pair.
          </li>
          <li>
            <b className="text-[#dfe8f2]">2 · Teams.</b> The crown rotates every proposal. The leader picks the exact
            party size shown on the board (5p: 2,3,2,3,3 · 6p: 2,3,4,3,4 · 7p: 2,3,3,4,4 · 8p: 3,4,4,5,5).
          </li>
          <li>
            <b className="text-[#dfe8f2]">3 · Votes.</b> Everyone votes at once; tokens stay hidden until all are in,
            then flip together and go on the public record. A tie rejects.{" "}
            <b className="text-[#e0556d]">Five consecutive rejections in one quest round hand evil the game.</b>
          </li>
          <li>
            <b className="text-[#dfe8f2]">4 · Quests.</b> Party members secretly play Success or Fail — good players{" "}
            <i>cannot</i> play Fail. Only shuffled counts are revealed. One Fail sinks a quest, except the quest
            marked <b className="text-[#d6c389]">II</b> (quest 4 at 7–8 players), which needs two.
          </li>
          <li>
            <b className="text-[#dfe8f2]">5 · The dagger.</b> Three failed quests and evil wins outright. Three
            successes and the Assassin names one good player: hit Merlin and evil steals the game; miss and good
            prevails. Every role is revealed at the end.
          </li>
        </ol>

        <div className="mt-5 space-y-2 border border-[#55627a]/40 bg-black/25 p-3 text-[11px] leading-5 text-[#7d94ad]">
          <p>
            <b className="text-[#9db1c7]">House notes.</b> Optional tabletop roles — Mordred, Oberon and the Lady of
            the Lake — are omitted in this build.
          </p>
          <p>
            Leaving mid-game concedes it: removing a seat would break the quest arithmetic, so the leaver&apos;s
            opposing faction wins immediately and all roles are revealed.
          </p>
          <p>
            The clock never waits: a silent leader gets a random party (leader included), missing votes count as
            Approve, missing quest cards count as Success, and a hesitant Assassin strikes at random.
          </p>
        </div>

        <div className="mt-5 flex justify-center">
          <Button variant="primary" onClick={onClose} className="min-w-40">
            Close the chronicle
          </Button>
        </div>
      </div>
    </Modal>
  );
}
