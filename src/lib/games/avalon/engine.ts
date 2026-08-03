/* The Resistance: Avalon — hidden loyalty, five quests, one dagger.

   - 5p 3 good / 2 evil · 6p 4/2 · 7p 4/3 · 8p 5/3.
   - Always Merlin (good) and the Assassin (evil); Percival and Morgana join
     at 7–8 players. Remaining seats are Loyal Servants / Minions of Mordred.
   - Evil knows the evil roster. Merlin sees the evil roster. Percival sees
     {Merlin, Morgana} as an unlabeled pair. Servants see nothing.
   - Leaders rotate every proposal; all players vote publicly-after-reveal on
     each team; five consecutive rejections in one quest round hand evil the
     game. Quest cards are secret — only shuffled counts are revealed, and
     good players cannot play Fail. Quest 4 needs two Fails at 7–8 players.
   - Three failed quests → evil wins. Three successes → the Assassin picks a
     good player; hitting Merlin steals the game for evil.
   - Forfeit ends the game at once: the leaver's opposing faction wins
     (removing a seat would break the quest math). */

import { MoveError, type GameModule, type GamePlayer } from "../types";
import { factionOf } from "./meta";
import {
  DAGGER_MS,
  EVIL_COUNTS,
  LOG_CAP,
  PROPOSE_MS,
  QUEST_MS,
  TEAM_SIZES,
  VOTE_MS,
  type AvalonFaction,
  type AvalonKnowledge,
  type AvalonLogEntry,
  type AvalonLogKind,
  type AvalonMove,
  type AvalonPlayer,
  type AvalonRole,
  type AvalonState,
  type AvalonView,
  type AvalonWinBy,
} from "./types";

type Rng = () => number;

const err = (message: string): never => {
  throw new MoveError(message);
};

const hasOwn = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

function log(s: AvalonState, kind: AvalonLogKind, entry: Partial<AvalonLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...entry });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function roleDeck(count: number): AvalonRole[] {
  const evil = EVIL_COUNTS[count];
  const courtly = count >= 7; // Percival & Morgana join the table
  const deck: AvalonRole[] = ["merlin", "assassin"];
  if (courtly) deck.push("percival", "morgana");
  while (deck.filter((r) => factionOf(r) === "evil").length < evil) deck.push("minion");
  while (deck.length < count) deck.push("servant");
  return deck;
}

const leader = (s: AvalonState): AvalonPlayer => s.players[s.leaderIdx];

const currentQuest = (s: AvalonState) => s.quests[s.quest - 1];

function finish(s: AvalonState, faction: AvalonFaction, winBy: AvalonWinBy) {
  s.phase = "over";
  s.deadline = null;
  s.team = [];
  s.votes = {}; // pending ballots of an unfinished proposal are never revealed
  s.questCards = {}; // pending quest cards stay secret forever
  s.winner = faction;
  s.winBy = winBy;
  s.winnerIds = s.players.filter((p) => !p.left && factionOf(p.role) === faction).map((p) => p.id);
  log(s, "win", { detail: winBy });
}

function beginTeam(s: AvalonState, now: number) {
  s.phase = "team";
  s.team = [];
  s.votes = {};
  s.deadline = now + PROPOSE_MS;
}

function propose(s: AvalonState, team: string[], now: number) {
  s.updatedAt = now;
  s.team = [...team];
  s.votes = {};
  s.phase = "vote";
  s.deadline = now + VOTE_MS;
  log(s, "propose", { actor: leader(s).name, quest: s.quest });
}

function resolveVotes(s: AvalonState, now: number) {
  s.updatedAt = now;
  const approves = Object.values(s.votes).filter(Boolean).length;
  const approved = approves * 2 > s.players.length; // a tie rejects
  s.proposals.push({
    quest: s.quest,
    attempt: s.rejects + 1,
    leaderId: leader(s).id,
    team: [...s.team],
    votes: { ...s.votes },
    approved,
  });
  log(s, "vote", {
    quest: s.quest,
    approves,
    refusals: s.players.length - approves,
    detail: approved ? "approved" : "rejected",
  });
  s.votes = {};

  if (approved) {
    s.rejects = 0; // the vote track resets whenever a team is approved
    s.phase = "quest";
    s.questCards = {};
    s.deadline = now + QUEST_MS;
    return;
  }

  s.rejects += 1;
  s.leaderIdx = (s.leaderIdx + 1) % s.players.length;
  if (s.rejects >= 5) {
    finish(s, "evil", "rejects"); // chaos in Camelot
    return;
  }
  beginTeam(s, now);
  log(s, "round", { actor: leader(s).name, quest: s.quest });
}

function resolveQuest(s: AvalonState, now: number) {
  s.updatedAt = now;
  const q = currentQuest(s);
  const cards = Object.values(s.questCards);
  q.fails = cards.filter((c) => !c).length;
  q.successes = cards.length - q.fails;
  q.outcome = q.fails >= q.failsRequired ? "fail" : "success";
  q.team = [...s.team];
  s.questCards = {};
  s.team = [];
  log(s, "quest", { quest: s.quest, successes: q.successes, fails: q.fails, detail: q.outcome });

  const won = s.quests.filter((x) => x.outcome === "success").length;
  const lost = s.quests.filter((x) => x.outcome === "fail").length;
  if (lost >= 3) {
    finish(s, "evil", "quests");
    return;
  }
  if (won >= 3) {
    s.phase = "assassination";
    s.deadline = now + DAGGER_MS;
    log(s, "dagger");
    return;
  }

  s.quest += 1;
  s.rejects = 0; // and again at the start of each new quest
  s.leaderIdx = (s.leaderIdx + 1) % s.players.length;
  beginTeam(s, now);
  log(s, "round", { actor: leader(s).name, quest: s.quest });
}

function resolveAssassination(s: AvalonState, target: AvalonPlayer, now: number) {
  s.updatedAt = now;
  s.assassinTarget = target.id;
  log(s, "shot", { target: target.name });
  finish(s, target.role === "merlin" ? "evil" : "good", "assassination");
}

function init(players: GamePlayer[], now: number, rng: Rng): AvalonState {
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const roles = shuffled(roleDeck(seated.length), rng);
  const dealt = seated.map((p, i) => ({ id: p.id, name: p.name, seat: p.seat, role: roles[i], left: false }));
  const s: AvalonState = {
    players: dealt,
    phase: "team",
    quest: 1,
    rejects: 0,
    leaderIdx: Math.floor(rng() * dealt.length),
    deadline: now + PROPOSE_MS,
    team: [],
    votes: {},
    questCards: {},
    quests: TEAM_SIZES[dealt.length].map((size, i) => ({
      size,
      failsRequired: dealt.length >= 7 && i === 3 ? 2 : 1,
      outcome: "pending" as const,
      successes: 0,
      fails: 0,
      team: [],
    })),
    proposals: [],
    assassinId: dealt.find((p) => p.role === "assassin")!.id,
    assassinTarget: null,
    winner: null,
    winnerIds: [],
    winBy: null,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  log(s, "start");
  log(s, "round", { actor: leader(s).name, quest: 1 });
  return s;
}

function requirePlayer(s: AvalonState, playerId: string): AvalonPlayer {
  const player = s.players.find((p) => p.id === playerId);
  if (!player) return err("You are not seated at this table.");
  if (player.left) return err("You have left this game.");
  return player;
}

function applyMove(s: AvalonState, playerId: string, move: AvalonMove, now: number): void {
  const player = requirePlayer(s, playerId);
  if (!move || typeof move !== "object") return err("Malformed move.");
  if (s.phase === "over") return err("The game is over.");

  switch (move.type) {
    case "propose": {
      if (s.phase !== "team") return err("No quest party is being assembled.");
      if (player.id !== leader(s).id) return err("Only the quest leader may propose a team.");
      const team = move.team;
      if (!Array.isArray(team) || team.some((id) => typeof id !== "string"))
        return err("Malformed team.");
      const size = currentQuest(s).size;
      if (team.length !== size) return err(`This quest needs exactly ${size} companions.`);
      if (new Set(team).size !== team.length) return err("No knight may ride twice.");
      for (const id of team)
        if (!s.players.some((p) => p.id === id)) return err("An unknown name is on that list.");
      propose(s, team, now);
      return;
    }
    case "vote": {
      if (s.phase !== "vote") return err("There is no proposal on the table.");
      if (typeof move.approve !== "boolean") return err("Malformed vote.");
      if (hasOwn(s.votes, player.id)) return err("Your token is already on the table.");
      s.updatedAt = now;
      s.votes[player.id] = move.approve;
      if (Object.keys(s.votes).length === s.players.length) resolveVotes(s, now);
      return;
    }
    case "quest": {
      if (s.phase !== "quest") return err("No quest is underway.");
      if (!s.team.includes(player.id)) return err("You are not on this quest.");
      if (typeof move.success !== "boolean") return err("Malformed quest card.");
      if (hasOwn(s.questCards, player.id)) return err("Your card is already sealed.");
      if (!move.success && factionOf(player.role) === "good")
        return err("You are sworn to the quest.");
      s.updatedAt = now;
      s.questCards[player.id] = move.success;
      if (Object.keys(s.questCards).length === s.team.length) resolveQuest(s, now);
      return;
    }
    case "assassinate": {
      if (s.phase !== "assassination") return err("The dagger is not drawn.");
      if (player.id !== s.assassinId) return err("Only the Assassin may strike.");
      const target = s.players.find((p) => p.id === move.target) ?? err("Choose a player at the table.");
      if (factionOf(target.role) === "evil") return err("Strike at the loyal, not your own.");
      resolveAssassination(s, target, now);
      return;
    }
    default:
      return err("Unknown move.");
  }
}

function tick(s: AvalonState, now: number, rng: Rng): boolean {
  if (s.phase === "over" || s.deadline === null || now < s.deadline) return false;
  s.updatedAt = now;

  if (s.phase === "team") {
    // The clock proposes for a silent leader: a random valid team including them.
    const l = leader(s);
    const size = currentQuest(s).size;
    const rest = shuffled(s.players.filter((p) => p.id !== l.id), rng)
      .slice(0, size - 1)
      .map((p) => p.id);
    log(s, "timeout", { actor: l.name, detail: "propose" });
    propose(s, [l.id, ...rest], now);
  } else if (s.phase === "vote") {
    const missing = s.players.filter((p) => !hasOwn(s.votes, p.id));
    if (missing.length) log(s, "timeout", { detail: "vote", refusals: missing.length });
    for (const p of missing) s.votes[p.id] = true; // silence approves
    resolveVotes(s, now);
  } else if (s.phase === "quest") {
    const missing = s.team.filter((id) => !hasOwn(s.questCards, id));
    if (missing.length) log(s, "timeout", { detail: "quest", refusals: missing.length });
    for (const id of missing) s.questCards[id] = true; // stragglers succeed
    resolveQuest(s, now);
  } else if (s.phase === "assassination") {
    const loyal = s.players.filter((p) => factionOf(p.role) === "good");
    const target = loyal[Math.floor(rng() * loyal.length)];
    log(s, "timeout", { detail: "assassinate" });
    resolveAssassination(s, target, now);
  }
  return true;
}

function forfeit(s: AvalonState, playerId: string, now: number): void {
  const p = s.players.find((x) => x.id === playerId);
  if (!p || p.left || s.phase === "over") return;
  s.updatedAt = now;
  p.left = true;
  log(s, "left", { actor: p.name });
  // A missing seat breaks the quest math, so a rage-quit concedes the game:
  // the leaver's opposing faction wins immediately.
  finish(s, factionOf(p.role) === "good" ? "evil" : "good", "forfeit");
}

function knowledgeFor(s: AvalonState, me: AvalonPlayer): AvalonKnowledge | undefined {
  const evilIds = s.players.filter((p) => factionOf(p.role) === "evil").map((p) => p.id);
  if (factionOf(me.role) === "evil") return { evilIds }; // roles not distinguished
  if (me.role === "merlin") return { evilIds };
  if (me.role === "percival") {
    const pair = s.players
      .filter((p) => p.role === "merlin" || p.role === "morgana")
      .map((p) => p.id); // seat order — an unlabeled pair
    return { merlinCandidates: pair };
  }
  return undefined; // Loyal Servants see nothing
}

function redact(s: AvalonState, viewerId: string, now: number): AvalonView {
  const me = s.players.find((p) => p.id === viewerId);
  const over = s.phase === "over";
  const knowledge = me ? knowledgeFor(s, me) : undefined;

  return {
    phase: s.phase,
    youId: viewerId,
    now,
    deadline: s.deadline,
    players: s.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, left: p.left })),
    quest: s.quest,
    quests: s.quests.map((q) => ({ ...q, team: [...q.team] })),
    rejects: s.rejects,
    leaderId: leader(s).id,
    team: [...s.team],
    votedIds: Object.keys(s.votes),
    ...(me && hasOwn(s.votes, me.id) && { yourVote: s.votes[me.id] }),
    questSubmittedIds: Object.keys(s.questCards),
    ...(me && hasOwn(s.questCards, me.id) && { yourQuestCard: s.questCards[me.id] }),
    proposals: s.proposals.map((p) => ({ ...p, team: [...p.team], votes: { ...p.votes } })),
    ...(me && { yourRole: me.role, yourFaction: factionOf(me.role) }),
    ...(knowledge && { knowledge }),
    assassinTarget: over ? s.assassinTarget : null,
    winner: s.winner,
    winnerIds: [...s.winnerIds],
    winBy: s.winBy,
    reveal: over
      ? s.players.map((p) => ({ id: p.id, role: p.role, faction: factionOf(p.role) }))
      : null,
    log: s.log.slice(-80).map((entry) => ({ ...entry })),
  };
}

function result(s: AvalonState): { winnerId: string; winnerIds: string[] } | null {
  if (s.phase !== "over" || !s.winner || s.winnerIds.length === 0) return null;
  return { winnerId: s.winnerIds[0], winnerIds: [...s.winnerIds] };
}

export const avalonModule: GameModule<AvalonState, AvalonView, AvalonMove> = {
  type: "avalon",
  minPlayers: 5,
  maxPlayers: 8,
  init,
  applyMove,
  tick,
  redact,
  result,
  isOver: (s) => s.phase === "over",
  forfeit,
};
