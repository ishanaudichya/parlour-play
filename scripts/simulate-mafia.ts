/* Mafia engine fuzz test: play deterministic random games with invariants
   asserted at every step. Run: npx tsx scripts/simulate-mafia.ts */

import { mafiaModule, teamFor } from "../src/lib/games/mafia/index.ts";
import {
  LOG_CAP,
  type MafiaMove,
  type MafiaPhase,
  type MafiaPlayer,
  type MafiaState,
  type MafiaTeam,
  type MafiaView,
} from "../src/lib/games/mafia/types.ts";
import { MoveError, type GamePlayer } from "../src/lib/games/types.ts";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fail = (message: string): never => {
  throw new Error(message);
};

const pick = <T,>(rng: () => number, items: T[]): T =>
  items[Math.floor(rng() * items.length)];

const living = (s: MafiaState): MafiaPlayer[] =>
  s.players.filter((p) => p.alive && !p.left);

function assertRoleDistribution(s: MafiaState, count: number, ctx: string) {
  const roleCount = (role: MafiaPlayer["role"]) =>
    s.players.filter((p) => p.role === role).length;
  const expectedMafia = count >= 7 ? 2 : 1;
  if (roleCount("mafia") !== expectedMafia)
    fail(`${ctx}: ${roleCount("mafia")} Mafia, expected ${expectedMafia}`);
  if (roleCount("detective") !== 1) fail(`${ctx}: expected one Detective`);
  if (roleCount("doctor") !== 1) fail(`${ctx}: expected one Doctor`);
  if (roleCount("villager") !== count - expectedMafia - 2)
    fail(`${ctx}: wrong Villager count`);
}

function assertResult(s: MafiaState, ctx: string) {
  const result = mafiaModule.result(s);
  if (s.phase !== "over") {
    if (result !== null) fail(`${ctx}: result exists before game over`);
    if (s.winner !== null || s.winnerIds.length !== 0)
      fail(`${ctx}: winner fields set before game over`);
    return;
  }

  if (!s.winner) fail(`${ctx}: game over without a winning team`);
  if (!result) fail(`${ctx}: game over without a module result`);
  const expected = s.players
    .filter((p) => !p.left && teamFor(p.role) === s.winner)
    .map((p) => p.id);
  if (expected.length === 0) fail(`${ctx}: winning team has no eligible players`);
  if (result.winnerId !== expected[0])
    fail(`${ctx}: primary winner ${result.winnerId} != ${expected[0]}`);
  if (result.winnerIds?.join(",") !== expected.join(","))
    fail(`${ctx}: winnerIds disagree with the ${s.winner} team`);

  const alive = living(s);
  const mafia = alive.filter((p) => p.role === "mafia").length;
  const town = alive.length - mafia;
  const expectedTeam: MafiaTeam = mafia === 0 ? "town" : "mafia";
  if (s.winner !== expectedTeam)
    fail(`${ctx}: ${s.winner} won with living count Mafia ${mafia}, Town ${town}`);
  if (s.winner === "mafia" && mafia < town)
    fail(`${ctx}: Mafia declared winner before parity`);
}

function assertInvariants(s: MafiaState, count: number, ctx: string) {
  if (s.players.length !== count) fail(`${ctx}: player count changed`);
  if (new Set(s.players.map((p) => p.id)).size !== count)
    fail(`${ctx}: duplicate player id`);
  if (new Set(s.players.map((p) => p.seat)).size !== count)
    fail(`${ctx}: duplicate seat`);
  if (s.day < 1 || !Number.isInteger(s.day)) fail(`${ctx}: invalid day ${s.day}`);
  if (s.log.length > LOG_CAP) fail(`${ctx}: log exceeds cap`);
  for (let i = 1; i < s.log.length; i++) {
    if (s.log[i].i <= s.log[i - 1].i) fail(`${ctx}: log sequence is not increasing`);
  }
  if (s.log.length && s.logSeq < s.log[s.log.length - 1].i)
    fail(`${ctx}: logSeq trails the log`);

  for (const p of s.players) {
    if (p.left && p.alive) fail(`${ctx}: ${p.id} left but remains alive`);
    if (!p.alive && p.eliminatedDay === null)
      fail(`${ctx}: ${p.id} is dead without an elimination day`);
    if (p.alive && p.eliminatedDay !== null)
      fail(`${ctx}: ${p.id} is alive with an elimination day`);
  }

  const aliveIds = new Set(living(s).map((p) => p.id));
  const playerIds = new Set(s.players.map((p) => p.id));
  if (new Set(s.ready).size !== s.ready.length) fail(`${ctx}: duplicate ready id`);
  for (const id of s.ready) if (!playerIds.has(id)) fail(`${ctx}: unknown ready id ${id}`);
  for (const [id, target] of Object.entries(s.mafiaVotes)) {
    const actor = s.players.find((p) => p.id === id);
    const victim = s.players.find((p) => p.id === target);
    if (!actor || actor.role !== "mafia" || !aliveIds.has(id))
      fail(`${ctx}: invalid Mafia voter ${id}`);
    if (!victim || !aliveIds.has(target) || victim.role === "mafia")
      fail(`${ctx}: invalid Mafia target ${target}`);
  }
  if (s.doctorTarget !== null && !aliveIds.has(s.doctorTarget))
    fail(`${ctx}: doctor targets a dead player`);
  if (s.detectiveTarget !== null && !aliveIds.has(s.detectiveTarget))
    fail(`${ctx}: Detective targets a dead player`);
  for (const [id, target] of Object.entries(s.votes)) {
    if (!aliveIds.has(id)) fail(`${ctx}: dead voter retained in vote map`);
    if (target !== null && !aliveIds.has(target))
      fail(`${ctx}: vote targets a dead player`);
  }
  for (const id of s.runoffTargets)
    if (!aliveIds.has(id)) fail(`${ctx}: runoff includes a dead player`);

  if (s.phase === "over") {
    if (s.deadline !== null) fail(`${ctx}: finished game has a deadline`);
  } else if (s.deadline === null) {
    fail(`${ctx}: ${s.phase} has no deadline`);
  }
  if (s.phase === "night" && s.runoffTargets.length)
    fail(`${ctx}: runoff targets survived into night`);
  assertResult(s, ctx);
}

function assertView(s: MafiaState, view: MafiaView, viewerId: string, now: number, ctx: string) {
  const me = s.players.find((p) => p.id === viewerId);
  if (view.now !== now || view.youId !== viewerId) fail(`${ctx}: wrong viewer metadata`);
  if (view.players.length !== s.players.length) fail(`${ctx}: view player count changed`);
  if (view.phase !== s.phase || view.day !== s.day || view.winner !== s.winner)
    fail(`${ctx}: public state differs from engine state`);

  if (!me) {
    if (view.yourRole !== undefined) fail(`${ctx}: spectator received a role`);
    if (view.mafiaIds.length || Object.keys(view.mafiaVotes).length)
      fail(`${ctx}: spectator received Mafia secrets`);
    if (view.investigationHistory.length || view.yourNightTarget !== undefined)
      fail(`${ctx}: spectator received night secrets`);
    if (view.yourVote !== undefined) fail(`${ctx}: spectator received a private vote`);
  } else {
    if (view.yourRole !== me.role) fail(`${ctx}: player cannot see their own role`);
    if (me.role === "mafia") {
      const expectedMafia = s.players.filter((p) => p.role === "mafia").map((p) => p.id);
      if (view.mafiaIds.join(",") !== expectedMafia.join(","))
        fail(`${ctx}: Mafia teammate list is wrong`);
      if (JSON.stringify(view.mafiaVotes) !== JSON.stringify(s.mafiaVotes))
        fail(`${ctx}: Mafia vote view is wrong`);
    } else if (view.mafiaIds.length || Object.keys(view.mafiaVotes).length) {
      fail(`${ctx}: non-Mafia player received Mafia secrets`);
    }
    if (me.role === "detective") {
      const expected = s.investigations[me.id] ?? [];
      if (JSON.stringify(view.investigationHistory) !== JSON.stringify(expected))
        fail(`${ctx}: Detective history is wrong`);
    } else if (view.investigationHistory.length) {
      fail(`${ctx}: non-Detective received investigation history`);
    }
  }

  for (const vp of view.players) {
    const actual = s.players.find((p) => p.id === vp.id)!;
    const shouldReveal = s.phase === "over" || !actual.alive;
    if (shouldReveal && vp.revealedRole !== actual.role)
      fail(`${ctx}: role for ${actual.id} should be revealed`);
    if (!shouldReveal && vp.revealedRole !== undefined)
      fail(`${ctx}: living role for ${actual.id} leaked`);
  }
}

function assertRedaction(s: MafiaState, now: number, rng: () => number, ctx: string) {
  assertView(s, mafiaModule.redact(s, "spectator-x", now), "spectator-x", now, `${ctx} spectator`);
  const viewer = pick(rng, s.players);
  assertView(s, mafiaModule.redact(s, viewer.id, now), viewer.id, now, `${ctx} ${viewer.id}`);
  if (s.phase === "over") {
    for (const p of s.players)
      assertView(s, mafiaModule.redact(s, p.id, now), p.id, now, `${ctx} ${p.id}`);
  }
}

const legalTransitions: Record<MafiaPhase, MafiaPhase[]> = {
  role_reveal: ["role_reveal", "night", "over"],
  night: ["night", "dawn", "over"],
  dawn: ["dawn", "discussion", "over"],
  discussion: ["discussion", "vote", "over"],
  vote: ["vote", "runoff", "night", "over"],
  runoff: ["runoff", "night", "over"],
  over: ["over"],
};

function assertProgression(
  beforePhase: MafiaPhase,
  beforeDay: number,
  s: MafiaState,
  ctx: string
) {
  if (!legalTransitions[beforePhase].includes(s.phase))
    fail(`${ctx}: illegal phase transition ${beforePhase} -> ${s.phase}`);
  if (s.day < beforeDay || s.day > beforeDay + 1)
    fail(`${ctx}: day jumped ${beforeDay} -> ${s.day}`);
  if (s.day > beforeDay && !(beforePhase === "vote" || beforePhase === "runoff"))
    fail(`${ctx}: day advanced from ${beforePhase}`);
  if (s.day > beforeDay && s.phase !== "night")
    fail(`${ctx}: new day did not begin at night`);
}

function randomMove(s: MafiaState, rng: () => number): { playerId: string; move: MafiaMove } | null {
  if (s.phase === "role_reveal") {
    const unready = s.players.filter((p) => !p.left && !s.ready.includes(p.id));
    return unready.length
      ? { playerId: pick(rng, unready).id, move: { type: "ready" } }
      : null;
  }

  if (s.phase === "night") {
    const actors = living(s).filter((p) => {
      if (p.role === "mafia") return !Object.hasOwn(s.mafiaVotes, p.id);
      if (p.role === "doctor") return s.doctorTarget === null;
      if (p.role === "detective") return s.detectiveTarget === null;
      return false;
    });
    if (!actors.length) return null;
    const actor = pick(rng, actors);
    let targets: MafiaPlayer[];
    if (actor.role === "mafia") {
      targets = living(s).filter((p) => p.role !== "mafia");
    } else if (actor.role === "doctor") {
      targets = living(s).filter((p) => p.id !== s.lastProtectedId);
    } else {
      targets = living(s).filter((p) => p.id !== actor.id);
    }
    return {
      playerId: actor.id,
      move: { type: "night_target", target: pick(rng, targets).id },
    };
  }

  if (s.phase === "vote" || s.phase === "runoff") {
    const voters = living(s).filter((p) => !Object.hasOwn(s.votes, p.id));
    if (!voters.length) return null;
    const voter = pick(rng, voters);
    const targets = living(s).filter(
      (p) =>
        p.id !== voter.id &&
        (s.phase !== "runoff" || s.runoffTargets.includes(p.id))
    );
    const target = targets.length && rng() > 0.12 ? pick(rng, targets).id : null;
    return { playerId: voter.id, move: { type: "vote", target } };
  }

  return null;
}

function probeDeadPlayer(s: MafiaState, now: number, rng: () => number, ctx: string): boolean {
  const dead = s.players.filter((p) => !p.alive && !p.left);
  if (!dead.length) return false;
  let move: MafiaMove | null = null;
  if (s.phase === "night") {
    const targets = living(s);
    if (targets.length) move = { type: "night_target", target: pick(rng, targets).id };
  } else if (s.phase === "vote" || s.phase === "runoff") {
    move = { type: "vote", target: null };
  }
  if (!move) return false;

  let rejected = false;
  try {
    mafiaModule.applyMove(s, pick(rng, dead).id, move, now, rng);
  } catch (error) {
    if (!(error instanceof MoveError)) throw error;
    rejected = true;
  }
  if (!rejected) fail(`${ctx}: dead player move was accepted`);
  return true;
}

const parsedGames = Number(process.env.SIM_GAMES ?? 1500);
if (!Number.isInteger(parsedGames) || parsedGames < 1)
  fail(`SIM_GAMES must be a positive integer, got ${process.env.SIM_GAMES}`);
const GAMES = parsedGames;
const STEP_CAP = 500;

let totalSteps = 0;
let timeouts = 0;
let forfeits = 0;
let deadMoveProbes = 0;
let townWins = 0;
let mafiaWins = 0;

for (let game = 0; game < GAMES; game++) {
  const seed = 730_000 + game;
  const rng = mulberry32(seed);
  try {
    const count = 6 + Math.floor(rng() * 3);
    const players: GamePlayer[] = Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      seat: i,
    }));
    let now = 1_000_000;
    const s = mafiaModule.init(players, now, rng) as MafiaState;
    assertRoleDistribution(s, count, `seed ${seed} init`);
    assertInvariants(s, count, `seed ${seed} init`);
    assertRedaction(s, now, rng, `seed ${seed} init`);

    let steps = 0;
    while (s.phase !== "over") {
      if (++steps > STEP_CAP) fail(`seed ${seed}: game did not terminate`);
      now += 250 + Math.floor(rng() * 1_250);
      const beforePhase = s.phase;
      const beforeDay = s.day;
      const ctx = `seed ${seed} step ${steps}`;

      if (rng() < 0.08 && probeDeadPlayer(s, now, rng, ctx)) deadMoveProbes++;

      const active = living(s);
      if (rng() < 0.008 && active.length > 2) {
        const leaver = pick(rng, active);
        mafiaModule.forfeit(s, leaver.id, now, rng);
        forfeits++;
        const snapshot = JSON.stringify(s);
        mafiaModule.forfeit(s, leaver.id, now + 1, rng);
        mafiaModule.forfeit(s, "ghost-player", now + 1, rng);
        if (JSON.stringify(s) !== snapshot) fail(`${ctx}: repeated forfeit mutated state`);
      } else if (rng() < 0.22 || s.phase === "dawn" || s.phase === "discussion") {
        const deadline = s.deadline;
        if (deadline === null) fail(`${ctx}: cannot tick without deadline`);
        if (mafiaModule.tick(s, deadline - 1, rng))
          fail(`${ctx}: tick fired before deadline`);
        if (!mafiaModule.tick(s, deadline, rng))
          fail(`${ctx}: tick ignored expired deadline`);
        now = deadline;
        timeouts++;
      } else {
        const generated = randomMove(s, rng);
        if (!generated) {
          const deadline = s.deadline;
          if (deadline === null || !mafiaModule.tick(s, deadline, rng))
            fail(`${ctx}: no legal action or progressing deadline`);
          now = deadline;
          timeouts++;
        } else {
          try {
            mafiaModule.applyMove(s, generated.playerId, generated.move, now, rng);
          } catch (error) {
            if (error instanceof MoveError)
              fail(`${ctx}: legal move rejected ${JSON.stringify(generated)}: ${error.message}`);
            throw error;
          }
        }
      }

      assertProgression(beforePhase, beforeDay, s, ctx);
      assertInvariants(s, count, ctx);
      assertRedaction(s, now, rng, ctx);
    }

    totalSteps += steps;
    if (s.winner === "town") townWins++;
    else if (s.winner === "mafia") mafiaWins++;

    const result = mafiaModule.result(s);
    if (!result) fail(`seed ${seed}: missing final result`);
    let rejected = false;
    try {
      mafiaModule.applyMove(s, result.winnerId, { type: "ready" }, now + 1, rng);
    } catch (error) {
      if (!(error instanceof MoveError)) throw error;
      rejected = true;
    }
    if (!rejected) fail(`seed ${seed}: move accepted after game over`);
    if (mafiaModule.tick(s, now + 1_000_000, rng))
      fail(`seed ${seed}: tick advanced a finished game`);
  } catch (error) {
    console.error(`FAILED at game ${game} (seed ${seed})`);
    throw error;
  }
}

if (deadMoveProbes === 0) fail("no illegal dead-player moves were exercised");
if (forfeits === 0) fail("no forfeits were exercised");

console.log(
  `OK: ${GAMES} games, avg ${(totalSteps / GAMES).toFixed(1)} steps ` +
    `(${townWins} town wins, ${mafiaWins} Mafia wins, ${timeouts} deadline ticks, ` +
    `${forfeits} forfeits, ${deadMoveProbes} dead-player moves rejected)`
);
