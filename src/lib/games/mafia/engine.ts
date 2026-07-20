/* Mafia — a moderator-free social deduction game for one shared room.

   - 6 players: 1 Mafia, Detective, Doctor, 3 Villagers.
   - 7–8 players: 2 Mafia, Detective, Doctor, remaining Villagers.
   - Night actions are simultaneous. Every living Mafia member must choose the
     same target for a kill; disagreement or missing votes means no kill.
   - The Doctor may protect anyone, including themself, but not the same
     person on consecutive nights. The Detective receives a private result.
   - Day votes are secret until resolved. A top tie triggers one runoff;
     another tie means no elimination.
   - Town wins when all Mafia are out. Mafia wins at parity with living Town. */

import { MoveError, type GameModule, type GamePlayer } from "../types";
import { teamFor } from "./meta";
import {
  DAWN_MS,
  DISCUSSION_MS,
  LOG_CAP,
  NIGHT_MS,
  ROLE_REVEAL_MS,
  RUNOFF_MS,
  VOTE_MS,
  type MafiaLogEntry,
  type MafiaLogKind,
  type MafiaMove,
  type MafiaPlayer,
  type MafiaRole,
  type MafiaState,
  type MafiaTeam,
  type MafiaView,
} from "./types";

type Rng = () => number;

const err = (message: string): never => {
  throw new MoveError(message);
};

const hasOwn = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

function log(s: MafiaState, kind: MafiaLogKind, entry: Partial<MafiaLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...entry });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

const living = (s: MafiaState) => s.players.filter((p) => p.alive && !p.left);

function shuffled<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function roleDeck(count: number): MafiaRole[] {
  const mafiaCount = count >= 7 ? 2 : 1;
  return [
    ...Array.from({ length: mafiaCount }, () => "mafia" as const),
    "detective",
    "doctor",
    ...Array.from({ length: count - mafiaCount - 2 }, () => "villager" as const),
  ];
}

function finish(s: MafiaState, team: MafiaTeam) {
  s.phase = "over";
  s.deadline = null;
  s.winner = team;
  s.winnerIds = s.players.filter((p) => !p.left && teamFor(p.role) === team).map((p) => p.id);
  log(s, "win", { team });
}

function checkWin(s: MafiaState): boolean {
  const alive = living(s);
  const mafia = alive.filter((p) => p.role === "mafia").length;
  const town = alive.length - mafia;
  if (mafia === 0) {
    finish(s, "town");
    return true;
  }
  if (mafia >= town) {
    finish(s, "mafia");
    return true;
  }
  return false;
}

function enterNight(s: MafiaState, now: number, incrementDay: boolean) {
  if (incrementDay) s.day += 1;
  s.phase = "night";
  s.deadline = now + NIGHT_MS;
  s.mafiaVotes = {};
  s.doctorTarget = null;
  s.detectiveTarget = null;
  s.votes = {};
  s.runoffTargets = [];
  s.lastElimination = null;
  log(s, "night", { detail: `Night ${s.day}` });
}

function nightActorsDone(s: MafiaState): boolean {
  for (const p of living(s)) {
    if (p.role === "mafia" && !hasOwn(s.mafiaVotes, p.id)) return false;
    if (p.role === "doctor" && s.doctorTarget === null) return false;
    if (p.role === "detective" && s.detectiveTarget === null) return false;
  }
  return true;
}

function resolveNight(s: MafiaState, now: number) {
  if (s.phase !== "night") return;
  s.updatedAt = now;
  const alive = living(s);
  const mafias = alive.filter((p) => p.role === "mafia");
  const choices = mafias.map((p) => s.mafiaVotes[p.id]).filter(Boolean);
  const mafiaTarget =
    choices.length === mafias.length && choices.length > 0 && choices.every((id) => id === choices[0])
      ? choices[0]
      : null;

  const detective = alive.find((p) => p.role === "detective");
  if (detective && s.detectiveTarget) {
    const target = alive.find((p) => p.id === s.detectiveTarget);
    if (target) {
      (s.investigations[detective.id] ??= []).push({
        day: s.day,
        targetId: target.id,
        isMafia: target.role === "mafia",
      });
    }
  }

  const protectedId = s.doctorTarget;
  s.lastProtectedId = protectedId;
  let killedId: string | null = null;
  if (mafiaTarget && mafiaTarget !== protectedId) {
    const victim = alive.find((p) => p.id === mafiaTarget && p.role !== "mafia");
    if (victim) {
      victim.alive = false;
      victim.eliminatedDay = s.day;
      killedId = victim.id;
    }
  }

  s.nightSummary = { day: s.day, killedId, noDeath: killedId === null };
  s.mafiaVotes = {};
  s.doctorTarget = null;
  s.detectiveTarget = null;
  s.phase = "dawn";
  s.deadline = now + DAWN_MS;
  log(s, "dawn", killedId ? { target: s.players.find((p) => p.id === killedId)?.name } : {});
  if (killedId) {
    const victim = s.players.find((p) => p.id === killedId)!;
    log(s, "eliminated", { target: victim.name, role: victim.role });
  } else {
    log(s, "no_death");
  }
  checkWin(s);
}

function enterDiscussion(s: MafiaState, now: number) {
  s.phase = "discussion";
  s.deadline = now + DISCUSSION_MS;
  log(s, "discussion", { detail: `Day ${s.day}` });
}

function enterVote(s: MafiaState, now: number) {
  s.phase = "vote";
  s.deadline = now + VOTE_MS;
  s.votes = {};
  s.runoffTargets = [];
  log(s, "vote");
}

function allVoted(s: MafiaState): boolean {
  return living(s).every((p) => hasOwn(s.votes, p.id));
}

function eliminate(s: MafiaState, player: MafiaPlayer) {
  player.alive = false;
  player.eliminatedDay = s.day;
  s.lastElimination = player.id;
  log(s, "eliminated", { target: player.name, role: player.role });
}

function resolveVote(s: MafiaState, now: number) {
  if (s.phase !== "vote" && s.phase !== "runoff") return;
  s.updatedAt = now;
  const wasRunoff = s.phase === "runoff";
  const validTargets = new Set(
    living(s)
      .filter((p) => !wasRunoff || s.runoffTargets.includes(p.id))
      .map((p) => p.id)
  );
  const counts: Record<string, number> = {};
  for (const [voterId, targetId] of Object.entries(s.votes)) {
    if (!living(s).some((p) => p.id === voterId) || !targetId || !validTargets.has(targetId)) continue;
    counts[targetId] = (counts[targetId] ?? 0) + 1;
  }

  const highest = Math.max(0, ...Object.values(counts));
  const leaders = highest > 0 ? Object.keys(counts).filter((id) => counts[id] === highest) : [];
  if (!wasRunoff && leaders.length > 1) {
    s.phase = "runoff";
    s.deadline = now + RUNOFF_MS;
    s.runoffTargets = leaders;
    s.votes = {};
    log(s, "runoff", {
      detail: leaders.map((id) => s.players.find((p) => p.id === id)?.name).filter(Boolean).join(" · "),
    });
    return;
  }

  if (leaders.length === 1) {
    const target = living(s).find((p) => p.id === leaders[0]);
    if (target) eliminate(s, target);
  }
  s.votes = {};
  s.runoffTargets = [];
  if (checkWin(s)) return;
  enterNight(s, now, true);
}

function init(players: GamePlayer[], now: number, rng: Rng): MafiaState {
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const roles = shuffled(roleDeck(seated.length), rng);
  const s: MafiaState = {
    players: seated.map((p, i) => ({
      ...p,
      role: roles[i],
      alive: true,
      left: false,
      eliminatedDay: null,
    })),
    phase: "role_reveal",
    day: 1,
    deadline: now + ROLE_REVEAL_MS,
    ready: [],
    mafiaVotes: {},
    doctorTarget: null,
    detectiveTarget: null,
    lastProtectedId: null,
    investigations: {},
    votes: {},
    runoffTargets: [],
    nightSummary: null,
    lastElimination: null,
    winner: null,
    winnerIds: [],
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  log(s, "start");
  return s;
}

function requirePlayer(s: MafiaState, playerId: string): MafiaPlayer {
  const player = s.players.find((p) => p.id === playerId);
  if (!player) return err("You are not seated in this game.");
  if (player.left) return err("You have left this game.");
  return player;
}

function applyMove(s: MafiaState, playerId: string, move: MafiaMove, now: number): void {
  const player = requirePlayer(s, playerId);
  if (!move || typeof move !== "object") return err("Malformed move.");
  if (s.phase === "over") return err("The game is over.");
  s.updatedAt = now;

  switch (move.type) {
    case "ready": {
      if (s.phase !== "role_reveal") return err("Your role has already been revealed.");
      if (!s.ready.includes(playerId)) s.ready.push(playerId);
      if (s.players.filter((p) => !p.left).every((p) => s.ready.includes(p.id))) enterNight(s, now, false);
      return;
    }
    case "night_target": {
      if (s.phase !== "night") return err("It is not night.");
      if (!player.alive) return err("Eliminated players cannot act.");
      const target = living(s).find((p) => p.id === move.target) ?? err("Choose a living player.");
      if (player.role === "mafia") {
        if (target.role === "mafia") return err("The Mafia cannot target one of their own.");
        s.mafiaVotes[player.id] = target.id;
      } else if (player.role === "doctor") {
        if (target.id === s.lastProtectedId) return err("You cannot protect the same player twice in a row.");
        s.doctorTarget = target.id;
      } else if (player.role === "detective") {
        if (target.id === player.id) return err("Investigate someone else.");
        s.detectiveTarget = target.id;
      } else {
        return err("Villagers sleep through the night.");
      }
      if (nightActorsDone(s)) resolveNight(s, now);
      return;
    }
    case "vote": {
      if (s.phase !== "vote" && s.phase !== "runoff") return err("Voting is not open.");
      if (!player.alive) return err("Eliminated players cannot vote.");
      if (move.target !== null) {
        const target = living(s).find((p) => p.id === move.target) ?? err("Choose a living player.");
        if (target.id === player.id) return err("You cannot vote for yourself.");
        if (s.phase === "runoff" && !s.runoffTargets.includes(target.id))
          return err("Choose one of the tied players.");
      }
      s.votes[player.id] = move.target;
      if (allVoted(s)) resolveVote(s, now);
      return;
    }
    default:
      return err("Unknown move.");
  }
}

function tick(s: MafiaState, now: number): boolean {
  if (s.phase === "over" || !s.deadline || now < s.deadline) return false;
  s.updatedAt = now;
  if (s.phase === "role_reveal") enterNight(s, now, false);
  else if (s.phase === "night") resolveNight(s, now);
  else if (s.phase === "dawn") enterDiscussion(s, now);
  else if (s.phase === "discussion") enterVote(s, now);
  else if (s.phase === "vote" || s.phase === "runoff") resolveVote(s, now);
  return true;
}

function forfeit(s: MafiaState, playerId: string, now: number): void {
  const p = s.players.find((x) => x.id === playerId);
  if (!p || p.left || s.phase === "over") return;
  s.updatedAt = now;
  p.left = true;
  p.alive = false;
  p.eliminatedDay = s.day;
  delete s.mafiaVotes[p.id];
  for (const [id, target] of Object.entries(s.mafiaVotes)) if (target === p.id) delete s.mafiaVotes[id];
  if (p.role === "doctor" || s.doctorTarget === p.id) s.doctorTarget = null;
  if (p.role === "detective" || s.detectiveTarget === p.id) s.detectiveTarget = null;
  delete s.votes[p.id];
  for (const [id, target] of Object.entries(s.votes)) if (target === p.id) s.votes[id] = null;
  s.runoffTargets = s.runoffTargets.filter((id) => id !== p.id);
  log(s, "left", { actor: p.name, role: p.role });
  if (checkWin(s)) return;

  if (s.phase === "role_reveal" && s.players.filter((x) => !x.left).every((x) => s.ready.includes(x.id))) {
    enterNight(s, now, false);
  } else if (s.phase === "night" && nightActorsDone(s)) {
    resolveNight(s, now);
  } else if ((s.phase === "vote" || s.phase === "runoff") && allVoted(s)) {
    resolveVote(s, now);
  }
}

function redact(s: MafiaState, viewerId: string, now: number): MafiaView {
  const me = s.players.find((p) => p.id === viewerId);
  const revealAll = s.phase === "over";
  const isMafia = me?.role === "mafia";
  let yourNightTarget: string | undefined;
  if (me?.role === "mafia") yourNightTarget = s.mafiaVotes[me.id];
  else if (me?.role === "doctor") yourNightTarget = s.doctorTarget ?? undefined;
  else if (me?.role === "detective") yourNightTarget = s.detectiveTarget ?? undefined;

  return {
    phase: s.phase,
    day: s.day,
    deadline: s.deadline,
    youId: viewerId,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      alive: p.alive,
      left: p.left,
      ...((revealAll || !p.alive) && { revealedRole: p.role }),
    })),
    ...(me && { yourRole: me.role }),
    mafiaIds: isMafia ? s.players.filter((p) => p.role === "mafia").map((p) => p.id) : [],
    mafiaVotes: isMafia ? { ...s.mafiaVotes } : {},
    ...(yourNightTarget !== undefined && { yourNightTarget }),
    ...(me?.role === "doctor" && s.lastProtectedId && { unavailableNightTarget: s.lastProtectedId }),
    investigationHistory: me?.role === "detective" ? [...(s.investigations[me.id] ?? [])] : [],
    votedIds: Object.keys(s.votes),
    ...(me && hasOwn(s.votes, me.id) && { yourVote: s.votes[me.id] }),
    runoffTargets: [...s.runoffTargets],
    nightSummary: s.nightSummary ? { ...s.nightSummary } : null,
    lastElimination: s.lastElimination,
    winner: s.winner,
    winnerIds: [...s.winnerIds],
    log: s.log.slice(-60).map((entry) => ({ ...entry })),
    now,
  };
}

function result(s: MafiaState): { winnerId: string; winnerIds: string[] } | null {
  if (s.phase !== "over" || !s.winner || s.winnerIds.length === 0) return null;
  return { winnerId: s.winnerIds[0], winnerIds: [...s.winnerIds] };
}

export const mafiaModule: GameModule<MafiaState, MafiaView, MafiaMove> = {
  type: "mafia",
  minPlayers: 6,
  maxPlayers: 8,
  init,
  applyMove,
  tick,
  redact,
  result,
  forfeit,
};
