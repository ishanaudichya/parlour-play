/* Avalon engine fuzz test: deterministic random games with rules, termination
   and privacy invariants asserted at every step, for every viewer.
   Run: npx tsx scripts/simulate-avalon.ts */

import { avalonModule, factionOf } from "../src/lib/games/avalon/index.ts";
import {
  EVIL_COUNTS,
  LOG_CAP,
  TEAM_SIZES,
  type AvalonMove,
  type AvalonPhase,
  type AvalonPlayer,
  type AvalonState,
  type AvalonView,
} from "../src/lib/games/avalon/types.ts";
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

const pick = <T,>(rng: () => number, items: T[]): T => items[Math.floor(rng() * items.length)];

const evilOf = (s: AvalonState) => s.players.filter((p) => factionOf(p.role) === "evil");
const goodOf = (s: AvalonState) => s.players.filter((p) => factionOf(p.role) === "good");

/* ---------------- invariants ---------------- */

function assertRoles(s: AvalonState, count: number, ctx: string) {
  const roles = (role: AvalonPlayer["role"]) => s.players.filter((p) => p.role === role).length;
  if (evilOf(s).length !== EVIL_COUNTS[count])
    fail(`${ctx}: ${evilOf(s).length} evil, expected ${EVIL_COUNTS[count]}`);
  if (goodOf(s).length !== count - EVIL_COUNTS[count]) fail(`${ctx}: wrong good count`);
  if (roles("merlin") !== 1) fail(`${ctx}: expected exactly one Merlin`);
  if (roles("assassin") !== 1) fail(`${ctx}: expected exactly one Assassin`);
  const courtly = count >= 7 ? 1 : 0;
  if (roles("percival") !== courtly) fail(`${ctx}: Percival count wrong for ${count}p`);
  if (roles("morgana") !== courtly) fail(`${ctx}: Morgana count wrong for ${count}p`);
  if (roles("minion") !== EVIL_COUNTS[count] - 1 - courtly) fail(`${ctx}: Minion count wrong`);
  if (roles("servant") !== count - EVIL_COUNTS[count] - 1 - courtly) fail(`${ctx}: Servant count wrong`);
  const assassin = s.players.find((p) => p.role === "assassin")!;
  if (s.assassinId !== assassin.id) fail(`${ctx}: assassinId does not match the Assassin`);
}

function assertResult(s: AvalonState, ctx: string) {
  const result = avalonModule.result(s);
  if (s.phase !== "over") {
    if (result !== null) fail(`${ctx}: result exists before game over`);
    if (s.winner !== null || s.winBy !== null || s.winnerIds.length !== 0)
      fail(`${ctx}: winner fields set before game over`);
    if (avalonModule.isOver!(s)) fail(`${ctx}: isOver true while running`);
    return;
  }
  if (!avalonModule.isOver!(s)) fail(`${ctx}: isOver false when over`);
  if (!s.winner || !s.winBy) fail(`${ctx}: game over without winner/winBy`);
  if (!result) fail(`${ctx}: game over without a module result`);
  const expected = s.players
    .filter((p) => !p.left && factionOf(p.role) === s.winner)
    .map((p) => p.id);
  if (expected.length === 0) fail(`${ctx}: winning faction has no eligible players`);
  if (result.winnerId !== expected[0]) fail(`${ctx}: primary winner mismatch`);
  if (result.winnerIds?.join(",") !== expected.join(","))
    fail(`${ctx}: winnerIds are not exactly the winning faction`);

  // the game may end by these causes and by nothing else
  const wins = s.quests.filter((q) => q.outcome === "success").length;
  const losses = s.quests.filter((q) => q.outcome === "fail").length;
  if (s.winBy === "quests") {
    if (s.winner !== "evil" || losses !== 3) fail(`${ctx}: bad quests ending`);
  } else if (s.winBy === "rejects") {
    if (s.winner !== "evil" || s.rejects !== 5) fail(`${ctx}: bad rejects ending`);
    const last = s.proposals[s.proposals.length - 1];
    const rejectedInQuest = s.proposals.filter((p) => p.quest === last.quest && !p.approved).length;
    if (last.approved || rejectedInQuest !== 5) fail(`${ctx}: rejects ending without 5 rejections`);
  } else if (s.winBy === "assassination") {
    if (wins !== 3) fail(`${ctx}: assassination without three successes`);
    const target = s.players.find((p) => p.id === s.assassinTarget);
    if (!target || factionOf(target.role) !== "good") fail(`${ctx}: assassin hit a non-good target`);
    if (s.winner !== (target.role === "merlin" ? "evil" : "good"))
      fail(`${ctx}: assassination outcome wrong`);
  } else if (s.winBy === "forfeit") {
    const leavers = s.players.filter((p) => p.left);
    if (leavers.length !== 1) fail(`${ctx}: forfeit ending with ${leavers.length} leavers`);
    if (s.winner === factionOf(leavers[0].role)) fail(`${ctx}: leaver's own faction won`);
  } else {
    fail(`${ctx}: unknown winBy ${s.winBy}`);
  }
}

function assertInvariants(s: AvalonState, count: number, acceptedFails: number[], ctx: string) {
  if (s.players.length !== count) fail(`${ctx}: player count changed`);
  if (new Set(s.players.map((p) => p.id)).size !== count) fail(`${ctx}: duplicate player id`);
  if (new Set(s.players.map((p) => p.seat)).size !== count) fail(`${ctx}: duplicate seat`);
  assertRoles(s, count, ctx);

  if (s.quest < 1 || s.quest > 5) fail(`${ctx}: quest ${s.quest} out of range`);
  const running = s.phase !== "over";
  if (running && (s.rejects < 0 || s.rejects > 4)) fail(`${ctx}: reject track ${s.rejects}`);
  if (s.leaderIdx < 0 || s.leaderIdx >= count) fail(`${ctx}: leaderIdx out of range`);
  if (s.log.length > LOG_CAP) fail(`${ctx}: log exceeds cap`);
  for (let i = 1; i < s.log.length; i++)
    if (s.log[i].i <= s.log[i - 1].i) fail(`${ctx}: log sequence not increasing`);
  if (running ? s.deadline === null : s.deadline !== null)
    fail(`${ctx}: deadline/phase mismatch`);

  // quest board
  const sizes = TEAM_SIZES[count];
  s.quests.forEach((q, i) => {
    if (q.size !== sizes[i]) fail(`${ctx}: quest ${i + 1} size ${q.size} != ${sizes[i]}`);
    const twoFails = count >= 7 && i === 3;
    if (q.failsRequired !== (twoFails ? 2 : 1))
      fail(`${ctx}: two-fail rule wrong on quest ${i + 1} at ${count}p`);
    if (q.outcome === "pending") {
      if (q.team.length || q.fails || q.successes) fail(`${ctx}: pending quest carries data`);
      return;
    }
    if (q.team.length !== q.size) fail(`${ctx}: resolved quest ${i + 1} team size wrong`);
    if (new Set(q.team).size !== q.team.length) fail(`${ctx}: duplicate id on quest team`);
    if (q.successes + q.fails !== q.size) fail(`${ctx}: quest ${i + 1} card counts wrong`);
    if (q.outcome !== (q.fails >= q.failsRequired ? "fail" : "success"))
      fail(`${ctx}: quest ${i + 1} outcome inconsistent with fails`);
    // good cannot fail — verified independently of the engine's own guard
    const evilOnTeam = q.team.filter((id) => factionOf(s.players.find((p) => p.id === id)!.role) === "evil").length;
    if (q.fails > evilOnTeam) fail(`${ctx}: quest ${i + 1} has ${q.fails} fails but ${evilOnTeam} evil`);
    if (q.fails !== acceptedFails[i])
      fail(`${ctx}: quest ${i + 1} revealed ${q.fails} fails, drivers submitted ${acceptedFails[i]}`);
  });

  // resolved quests form a strict prefix
  const resolved = s.quests.filter((q) => q.outcome !== "pending").length;
  s.quests.forEach((q, i) => {
    if (i < resolved && q.outcome === "pending") fail(`${ctx}: quest gap at ${i + 1}`);
  });
  if (s.phase === "team" || s.phase === "vote" || s.phase === "quest") {
    if (resolved !== s.quest - 1) fail(`${ctx}: ${resolved} resolved but on quest ${s.quest}`);
  } else if (s.phase === "assassination" && resolved !== s.quest) {
    fail(`${ctx}: assassination with unresolved current quest`);
  }

  // team / ballots / cards
  const ids = new Set(s.players.map((p) => p.id));
  if (new Set(s.team).size !== s.team.length) fail(`${ctx}: duplicate on proposed team`);
  for (const id of s.team) if (!ids.has(id)) fail(`${ctx}: unknown id on team`);
  if (s.phase === "vote" || s.phase === "quest") {
    if (s.team.length !== s.quests[s.quest - 1].size) fail(`${ctx}: live team size wrong`);
  } else if (s.team.length) {
    fail(`${ctx}: team lingers in ${s.phase}`);
  }
  for (const id of Object.keys(s.votes)) if (!ids.has(id)) fail(`${ctx}: unknown voter`);
  if (s.phase !== "vote" && Object.keys(s.votes).length) fail(`${ctx}: ballots outside vote phase`);
  for (const id of Object.keys(s.questCards))
    if (!s.team.includes(id)) fail(`${ctx}: quest card from non-member`);
  if (s.phase !== "quest" && Object.keys(s.questCards).length)
    fail(`${ctx}: quest cards outside quest phase`);

  // proposal history: contiguous per quest, attempts 1..k, ≤5, vote math checks
  let lastQuest = 0;
  let attempt = 0;
  s.proposals.forEach((p, i) => {
    if (p.quest < lastQuest) fail(`${ctx}: proposal quests out of order`);
    attempt = p.quest === lastQuest ? attempt + 1 : 1;
    lastQuest = p.quest;
    if (p.attempt !== attempt) fail(`${ctx}: proposal ${i} attempt ${p.attempt} != ${attempt}`);
    if (p.attempt > 5) fail(`${ctx}: sixth proposal in one quest round`);
    if (Object.keys(p.votes).length !== count) fail(`${ctx}: proposal ${i} vote record incomplete`);
    const approves = Object.values(p.votes).filter(Boolean).length;
    if (p.approved !== approves * 2 > count) fail(`${ctx}: proposal ${i} majority math wrong`);
    if (p.team.length !== TEAM_SIZES[count][p.quest - 1]) fail(`${ctx}: proposal ${i} team size`);
    if (!ids.has(p.leaderId)) fail(`${ctx}: proposal ${i} unknown leader`);
    if (p.approved && p.attempt <= 5 && i < s.proposals.length - 1) {
      const next = s.proposals[i + 1];
      if (next.quest === p.quest) fail(`${ctx}: second proposal after approval in quest ${p.quest}`);
    }
  });
  // the reject track mirrors the rejected proposals of the current round
  if (s.phase === "team" || s.phase === "vote") {
    const rejectedHere = s.proposals.filter((p) => p.quest === s.quest && !p.approved).length;
    const approvedHere = s.proposals.filter((p) => p.quest === s.quest && p.approved).length;
    if (rejectedHere !== s.rejects) fail(`${ctx}: reject track ${s.rejects} != ${rejectedHere}`);
    if (approvedHere !== 0) fail(`${ctx}: approved proposal lingers before quest ran`);
  }
  for (let q = 1; q <= 5; q++) {
    const rejected = s.proposals.filter((p) => p.quest === q && !p.approved).length;
    if (rejected > 5) fail(`${ctx}: ${rejected} rejections recorded in quest ${q}`);
    if (rejected === 5 && !(s.phase === "over" && s.winBy === "rejects"))
      fail(`${ctx}: five rejections without evil victory`);
  }

  assertResult(s, ctx);
}

/* ---------------- privacy / redaction ---------------- */

const ROLE_TOKENS = ["merlin", "percival", "servant", "assassin", "morgana", "minion"] as const;

function assertView(s: AvalonState, view: AvalonView, viewerId: string, now: number, ctx: string) {
  const me = s.players.find((p) => p.id === viewerId);
  const over = s.phase === "over";
  if (view.youId !== viewerId || view.now !== now) fail(`${ctx}: viewer metadata wrong`);
  if (view.phase !== s.phase || view.quest !== s.quest || view.rejects !== s.rejects)
    fail(`${ctx}: public scalars differ`);
  if (view.leaderId !== s.players[s.leaderIdx].id) fail(`${ctx}: leader differs`);
  if (view.deadline !== s.deadline || view.winner !== s.winner || view.winBy !== s.winBy)
    fail(`${ctx}: public status differs`);
  if (view.players.length !== s.players.length) fail(`${ctx}: player list changed`);
  if (JSON.stringify(view.team) !== JSON.stringify(s.team)) fail(`${ctx}: team differs`);
  if (JSON.stringify(view.quests) !== JSON.stringify(s.quests)) fail(`${ctx}: board differs`);
  if (JSON.stringify(view.proposals) !== JSON.stringify(s.proposals))
    fail(`${ctx}: revealed vote records differ`);
  if (JSON.stringify(view.winnerIds) !== JSON.stringify(s.winnerIds)) fail(`${ctx}: winnerIds differ`);

  // who has acted is public; how is not
  if (JSON.stringify(view.votedIds) !== JSON.stringify(Object.keys(s.votes)))
    fail(`${ctx}: votedIds differ`);
  if (JSON.stringify(view.questSubmittedIds) !== JSON.stringify(Object.keys(s.questCards)))
    fail(`${ctx}: questSubmittedIds differ`);

  // pending secrets: yours alone
  const expectVote = me && Object.prototype.hasOwnProperty.call(s.votes, me.id) ? s.votes[me.id] : undefined;
  if (view.yourVote !== expectVote) fail(`${ctx}: yourVote wrong`);
  const expectCard =
    me && Object.prototype.hasOwnProperty.call(s.questCards, me.id) ? s.questCards[me.id] : undefined;
  if (view.yourQuestCard !== expectCard) fail(`${ctx}: yourQuestCard wrong`);

  // role & dealt knowledge entitlement
  if (!me) {
    if (view.yourRole !== undefined || view.yourFaction !== undefined || view.knowledge !== undefined)
      fail(`${ctx}: spectator received role knowledge`);
    if (view.yourVote !== undefined || view.yourQuestCard !== undefined)
      fail(`${ctx}: spectator received private choices`);
  } else {
    if (view.yourRole !== me.role || view.yourFaction !== factionOf(me.role))
      fail(`${ctx}: own role/faction wrong`);
    let expected: unknown;
    if (factionOf(me.role) === "evil" || me.role === "merlin")
      expected = { evilIds: evilOf(s).map((p) => p.id) };
    else if (me.role === "percival")
      expected = {
        merlinCandidates: s.players.filter((p) => p.role === "merlin" || p.role === "morgana").map((p) => p.id),
      };
    if (JSON.stringify(view.knowledge) !== JSON.stringify(expected))
      fail(`${ctx}: knowledge wrong for ${me.role}`);
  }

  // assassination target & full reveal only once over
  if (!over) {
    if (view.assassinTarget !== null || view.reveal !== null) fail(`${ctx}: early reveal`);
  } else {
    if (view.assassinTarget !== s.assassinTarget) fail(`${ctx}: assassinTarget differs`);
    if (!view.reveal || view.reveal.length !== s.players.length) fail(`${ctx}: reveal incomplete`);
    for (const r of view.reveal) {
      const actual = s.players.find((p) => p.id === r.id);
      if (!actual || r.role !== actual.role || r.faction !== factionOf(actual.role))
        fail(`${ctx}: reveal inconsistent for ${r.id}`);
    }
  }

  // rigorous serialized scan against the entitlement map
  const json = JSON.stringify(view);
  if (json.includes('"questCards"') || json.includes('"assassinId"'))
    fail(`${ctx}: raw secret container leaked`);
  const votesKeys = json.match(/"votes":/g)?.length ?? 0;
  if (votesKeys !== view.proposals.length)
    fail(`${ctx}: a vote record outside the revealed proposals leaked`);
  for (const token of ROLE_TOKENS) {
    const entitled = over || (me && me.role === token);
    if (!entitled && json.includes(`"${token}"`)) fail(`${ctx}: role token "${token}" leaked`);
  }
  for (const faction of ["good", "evil"] as const) {
    const entitled = over || (me && factionOf(me.role) === faction);
    if (!entitled && json.includes(`"${faction}"`)) fail(`${ctx}: faction token "${faction}" leaked`);
  }
}

function assertRedaction(s: AvalonState, now: number, ctx: string) {
  assertView(s, avalonModule.redact(s, "spectator-x", now), "spectator-x", now, `${ctx} spectator`);
  for (const p of s.players)
    assertView(s, avalonModule.redact(s, p.id, now), p.id, now, `${ctx} ${p.id}`);
}

/* ---------------- phase progression ---------------- */

const legalTransitions: Record<AvalonPhase, AvalonPhase[]> = {
  team: ["team", "vote", "over"],
  vote: ["vote", "team", "quest", "over"],
  quest: ["quest", "team", "assassination", "over"],
  assassination: ["assassination", "over"],
  over: ["over"],
};

/* ---------------- move policies ---------------- */

type Policy = "random" | "evil-fail" | "good-faith";

function policyMove(
  s: AvalonState,
  policy: Policy,
  rng: () => number,
  grumpy: boolean
): { playerId: string; move: AvalonMove } {
  const evilIds = new Set(evilOf(s).map((p) => p.id));
  if (s.phase === "team") {
    const l = s.players[s.leaderIdx];
    const size = s.quests[s.quest - 1].size;
    let poolIds: string[];
    if (policy === "evil-fail" && evilIds.has(l.id)) {
      // an evil leader smuggles themself plus randoms
      const rest = s.players.filter((p) => p.id !== l.id).map((p) => p.id);
      poolIds = [l.id, ...shuffleIds(rest, rng)];
    } else {
      poolIds = shuffleIds(s.players.map((p) => p.id), rng);
    }
    return { playerId: l.id, move: { type: "propose", team: poolIds.slice(0, size) } };
  }
  if (s.phase === "vote") {
    const pending = s.players.filter((p) => !Object.hasOwn(s.votes, p.id));
    const voter = pick(rng, pending);
    let approve: boolean;
    if (grumpy) approve = rng() < 0.15; // exercise the five-rejection track
    else if (policy === "good-faith") approve = rng() < 0.85;
    else if (policy === "evil-fail" && evilIds.has(voter.id))
      approve = s.team.some((id) => evilIds.has(id));
    else if (policy === "evil-fail") approve = rng() < 0.7;
    else approve = rng() < 0.5;
    return { playerId: voter.id, move: { type: "vote", approve } };
  }
  if (s.phase === "quest") {
    const pending = s.team.filter((id) => !Object.hasOwn(s.questCards, id));
    const actorId = pick(rng, pending);
    let success = true;
    if (evilIds.has(actorId)) {
      if (policy === "evil-fail") success = false;
      else if (policy === "good-faith") success = rng() < 0.7;
      else success = rng() < 0.5;
    }
    return { playerId: actorId, move: { type: "quest", success } };
  }
  // assassination: the assassin cannot know Merlin — pick any good player
  const target = pick(rng, goodOf(s));
  return { playerId: s.assassinId, move: { type: "assassinate", target: target.id } };
}

function shuffleIds(ids: string[], rng: () => number): string[] {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ---------------- invalid-move probes ---------------- */

const probeCounts: Record<string, number> = {};

function expectRejected(s: AvalonState, playerId: string, move: AvalonMove, now: number, rng: () => number, label: string, ctx: string) {
  const snapshot = JSON.stringify(s);
  let rejected = false;
  try {
    avalonModule.applyMove(s, playerId, move, now, rng);
  } catch (error) {
    if (!(error instanceof MoveError)) throw error;
    rejected = true;
  }
  if (!rejected) fail(`${ctx}: illegal move accepted (${label})`);
  if (JSON.stringify(s) !== snapshot) fail(`${ctx}: rejected move mutated state (${label})`);
  probeCounts[label] = (probeCounts[label] ?? 0) + 1;
}

function probeInvalid(s: AvalonState, now: number, rng: () => number, ctx: string) {
  const l = s.players[s.leaderIdx];
  const size = s.quests[s.quest - 1].size;
  const anyone = pick(rng, s.players);
  const ids = s.players.map((p) => p.id);

  expectRejected(s, "ghost-player", { type: "vote", approve: true }, now, rng, "ghost", ctx);
  expectRejected(s, anyone.id, { type: "dance" } as unknown as AvalonMove, now, rng, "unknown-type", ctx);

  if (s.phase === "team") {
    const notLeader = s.players.find((p) => p.id !== l.id)!;
    expectRejected(s, notLeader.id, { type: "propose", team: ids.slice(0, size) }, now, rng, "not-leader", ctx);
    expectRejected(s, l.id, { type: "propose", team: ids.slice(0, size - 1) }, now, rng, "wrong-size", ctx);
    expectRejected(s, l.id, { type: "propose", team: ids.slice(0, size + 1) }, now, rng, "wrong-size", ctx);
    if (size >= 2)
      expectRejected(s, l.id, { type: "propose", team: [ids[0], ids[0], ...ids.slice(1, size - 1)] }, now, rng, "duplicate-team", ctx);
    expectRejected(s, l.id, { type: "propose", team: ["nobody", ...ids.slice(0, size - 1)] }, now, rng, "unknown-member", ctx);
    expectRejected(s, anyone.id, { type: "vote", approve: false }, now, rng, "out-of-phase", ctx);
    expectRejected(s, anyone.id, { type: "quest", success: true }, now, rng, "out-of-phase", ctx);
  } else if (s.phase === "vote") {
    expectRejected(s, l.id, { type: "propose", team: ids.slice(0, size) }, now, rng, "out-of-phase", ctx);
    const voted = s.players.find((p) => Object.hasOwn(s.votes, p.id));
    if (voted) expectRejected(s, voted.id, { type: "vote", approve: rng() < 0.5 }, now, rng, "double-vote", ctx);
    expectRejected(s, s.team[0], { type: "quest", success: true }, now, rng, "out-of-phase", ctx);
  } else if (s.phase === "quest") {
    const outsider = s.players.find((p) => !s.team.includes(p.id));
    if (outsider) expectRejected(s, outsider.id, { type: "quest", success: true }, now, rng, "non-member", ctx);
    const goodPending = s.team.find(
      (id) => factionOf(s.players.find((p) => p.id === id)!.role) === "good" && !Object.hasOwn(s.questCards, id)
    );
    if (goodPending) expectRejected(s, goodPending, { type: "quest", success: false }, now, rng, "good-fail", ctx);
    const submitted = s.team.find((id) => Object.hasOwn(s.questCards, id));
    if (submitted) expectRejected(s, submitted, { type: "quest", success: true }, now, rng, "double-card", ctx);
    expectRejected(s, anyone.id, { type: "vote", approve: true }, now, rng, "out-of-phase", ctx);
  } else if (s.phase === "assassination") {
    const assassin = s.assassinId;
    const notAssassin = s.players.find((p) => p.id !== assassin)!;
    const good = pick(rng, goodOf(s));
    const otherEvil = evilOf(s).find((p) => p.id !== assassin);
    expectRejected(s, notAssassin.id, { type: "assassinate", target: good.id }, now, rng, "not-assassin", ctx);
    if (otherEvil) expectRejected(s, assassin, { type: "assassinate", target: otherEvil.id }, now, rng, "assassinate-evil", ctx);
    expectRejected(s, assassin, { type: "assassinate", target: assassin }, now, rng, "assassinate-self", ctx);
    expectRejected(s, assassin, { type: "assassinate", target: "nobody" }, now, rng, "unknown-target", ctx);
    expectRejected(s, assassin, { type: "propose", team: ids.slice(0, size) }, now, rng, "out-of-phase", ctx);
  }
}

/* ---------------- driver ---------------- */

const parsedGames = Number(process.env.SIM_GAMES ?? 3000);
if (!Number.isInteger(parsedGames) || parsedGames < 1)
  fail(`SIM_GAMES must be a positive integer, got ${process.env.SIM_GAMES}`);
const GAMES = parsedGames;
const STEP_CAP = 600;
const POLICIES: Policy[] = ["random", "evil-fail", "good-faith"];

let totalSteps = 0;
let goodWins = 0;
let evilQuestWins = 0;
let evilRejectWins = 0;
let evilAssassinWins = 0;
let assassinationsResolved = 0;
let forfeitEndings = 0;
const timeoutsByPhase: Record<string, number> = { team: 0, vote: 0, quest: 0, assassination: 0 };

for (let game = 0; game < GAMES; game++) {
  const seed = 940_000 + game;
  const rng = mulberry32(seed);
  try {
    const count = 5 + (game % 4);
    const policy = POLICIES[game % 3];
    const allowForfeit = game % 2 === 0;
    const grumpy = game % 15 === 0; // a table that rejects almost everything
    const players: GamePlayer[] = Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      seat: i,
    }));
    let now = 1_000_000;
    const s = avalonModule.init(players, now, rng) as AvalonState;
    const acceptedFails = [0, 0, 0, 0, 0];
    assertInvariants(s, count, acceptedFails, `seed ${seed} init`);
    assertRedaction(s, now, `seed ${seed} init`);

    let steps = 0;
    while (s.phase !== "over") {
      if (++steps > STEP_CAP) fail(`seed ${seed}: game did not terminate`);
      now += 250 + Math.floor(rng() * 1_250);
      const beforePhase = s.phase;
      const beforeQuest = s.quest;
      const ctx = `seed ${seed} step ${steps}`;

      if (rng() < 0.1) probeInvalid(s, now, rng, ctx);

      if (allowForfeit && rng() < 0.02) {
        const leaver = pick(rng, s.players.filter((p) => !p.left));
        const leaverFaction = factionOf(leaver.role);
        avalonModule.forfeit(s, leaver.id, now, rng);
        if (s.phase !== "over" || s.winBy !== "forfeit") fail(`${ctx}: forfeit did not end the game`);
        if (s.winner !== (leaverFaction === "good" ? "evil" : "good"))
          fail(`${ctx}: forfeit winner is not the opposing faction`);
        const snapshot = JSON.stringify(s);
        avalonModule.forfeit(s, leaver.id, now + 1, rng);
        avalonModule.forfeit(s, "ghost-player", now + 1, rng);
        avalonModule.forfeit(s, pick(rng, s.players).id, now + 1, rng);
        if (JSON.stringify(s) !== snapshot) fail(`${ctx}: forfeit after over mutated state`);
        forfeitEndings++;
      } else if (rng() < 0.16 && !(grumpy && s.phase === "vote")) {
        const deadline = s.deadline;
        if (deadline === null) fail(`${ctx}: running phase without deadline`);
        const snapshot = JSON.stringify(s);
        if (avalonModule.tick(s, deadline - 1, rng)) fail(`${ctx}: tick fired before deadline`);
        if (JSON.stringify(s) !== snapshot) fail(`${ctx}: early tick mutated state`);
        timeoutsByPhase[beforePhase]++;
        if (!avalonModule.tick(s, deadline, rng)) fail(`${ctx}: tick ignored expired deadline`);
        now = deadline;
      } else {
        const generated = policyMove(s, policy, rng, grumpy);
        try {
          avalonModule.applyMove(s, generated.playerId, generated.move, now, rng);
          if (generated.move.type === "quest" && !generated.move.success)
            acceptedFails[beforeQuest - 1]++;
        } catch (error) {
          if (error instanceof MoveError)
            fail(`${ctx}: legal move rejected ${JSON.stringify(generated)}: ${error.message}`);
          throw error;
        }
      }

      if (!legalTransitions[beforePhase].includes(s.phase))
        fail(`${ctx}: illegal transition ${beforePhase} -> ${s.phase}`);
      if (s.quest < beforeQuest || s.quest > beforeQuest + 1) fail(`${ctx}: quest number jumped`);
      assertInvariants(s, count, acceptedFails, ctx);
      assertRedaction(s, now, ctx);
    }

    totalSteps += steps;
    if (s.winner === "good") goodWins++;
    if (s.winBy === "quests") evilQuestWins++;
    else if (s.winBy === "rejects") evilRejectWins++;
    else if (s.winBy === "assassination") {
      assassinationsResolved++;
      if (s.winner === "evil") evilAssassinWins++;
    }

    // finished games are inert
    const result = avalonModule.result(s);
    if (!result) fail(`seed ${seed}: missing final result`);
    expectRejected(s, result.winnerId, { type: "vote", approve: true }, now + 1, rng, "after-over", `seed ${seed}`);
    if (avalonModule.tick(s, now + 10_000_000, rng)) fail(`seed ${seed}: tick advanced a finished game`);
  } catch (error) {
    console.error(`FAILED at game ${game} (seed ${seed})`);
    throw error;
  }
}

for (const label of [
  "ghost",
  "unknown-type",
  "not-leader",
  "wrong-size",
  "duplicate-team",
  "unknown-member",
  "out-of-phase",
  "double-vote",
  "non-member",
  "good-fail",
  "double-card",
  "not-assassin",
  "assassinate-evil",
  "assassinate-self",
  "unknown-target",
  "after-over",
]) {
  if (!probeCounts[label]) fail(`probe never exercised: ${label}`);
}
if (forfeitEndings === 0) fail("no forfeits were exercised");
for (const phase of Object.keys(timeoutsByPhase))
  if (timeoutsByPhase[phase] === 0) fail(`no deadline timeout exercised in ${phase}`);
if (!goodWins || !evilQuestWins || !evilRejectWins || !evilAssassinWins)
  fail("a winning path was never exercised");

const totalProbes = Object.values(probeCounts).reduce((a, b) => a + b, 0);
const merlinRate = assassinationsResolved
  ? ((evilAssassinWins / assassinationsResolved) * 100).toFixed(1)
  : "0.0";
console.log(
  `OK: ${GAMES} games, avg ${(totalSteps / GAMES).toFixed(1)} steps ` +
    `(${goodWins} good wins, evil via quests ${evilQuestWins} / rejects ${evilRejectWins} / assassination ${evilAssassinWins}, ` +
    `merlin-shot rate ${merlinRate}% of ${assassinationsResolved} daggers, ${forfeitEndings} forfeit endings, ` +
    `timeouts t/v/q/a ${timeoutsByPhase.team}/${timeoutsByPhase.vote}/${timeoutsByPhase.quest}/${timeoutsByPhase.assassination}, ` +
    `${totalProbes} illegal probes rejected)`
);
