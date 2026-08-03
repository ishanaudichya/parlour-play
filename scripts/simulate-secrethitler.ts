/* Secret Hitler engine fuzz test: deterministic random games with rules,
   conservation, rotation, term-limit, termination and privacy invariants
   asserted at every step, for every viewer (and a spectator).
   Run: npx tsx scripts/simulate-secrethitler.ts */

import { partyOf, secrethitlerModule } from "../src/lib/games/secrethitler/index.ts";
import {
  FASCIST_COUNTS,
  FASCIST_POLICIES,
  LIBERAL_POLICIES,
  LOG_CAP,
  POWER_TRACK,
  VETO_UNLOCK,
  VIEW_LOG,
  type SecretHitlerMove,
  type SecretHitlerView,
  type SHParty,
  type SHPhase,
  type SHPlayerState,
  type SHState,
} from "../src/lib/games/secrethitler/types.ts";
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
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

const president = (s: SHState) => s.players[s.presidentIdx];
const aliveOf = (s: SHState) => s.players.filter((p) => p.alive);
const fascistTeam = (s: SHState) => s.players.filter((p) => partyOf(p.role) === "fascist");
const hitlerOf = (s: SHState) => s.players.find((p) => p.role === "hitler")!;
const byName = (s: SHState, name: string) => s.players.find((p) => p.name === name)!;

function nextAliveIdx(s: SHState, from: number): number {
  let i = from;
  do i = (i + 1) % s.players.length;
  while (!s.players[i].alive);
  return i;
}

/** Term-limit eligibility recomputed from the driver's shadow government. */
function shadowEligible(s: SHState, lastPres: string | null, lastChan: string | null): SHPlayerState[] {
  const bigTable = aliveOf(s).length > 5;
  return s.players.filter(
    (p) =>
      p.alive &&
      p.id !== president(s).id &&
      p.id !== lastChan &&
      (!bigTable || p.id !== lastPres)
  );
}

/* ------------------------------ invariants ------------------------------ */

function assertRoles(s: SHState, count: number, ctx: string) {
  const roles = (r: SHPlayerState["role"]) => s.players.filter((p) => p.role === r).length;
  if (roles("hitler") !== 1) fail(`${ctx}: expected exactly one Hitler`);
  if (roles("fascist") !== FASCIST_COUNTS[count]) fail(`${ctx}: wrong plain-fascist count`);
  if (roles("liberal") !== count - 1 - FASCIST_COUNTS[count]) fail(`${ctx}: wrong liberal count`);
}

function assertConservation(s: SHState, ctx: string) {
  const tally = (party: SHParty) =>
    s.deck.filter((c) => c === party).length +
    s.discard.filter((c) => c === party).length +
    (s.presidentHand?.filter((c) => c === party).length ?? 0) +
    (s.chancellorHand?.filter((c) => c === party).length ?? 0) +
    (party === "liberal" ? s.liberalTrack : s.fascistTrack);
  if (tally("liberal") !== LIBERAL_POLICIES) fail(`${ctx}: liberal policies not conserved`);
  if (tally("fascist") !== FASCIST_POLICIES) fail(`${ctx}: fascist policies not conserved`);
}

function assertResult(s: SHState, ctx: string) {
  const result = secrethitlerModule.result(s);
  if (s.phase !== "over") {
    if (result !== null) fail(`${ctx}: result exists before game over`);
    if (s.winner !== null || s.winBy !== null || s.winnerIds.length !== 0)
      fail(`${ctx}: winner fields set while running`);
    if (secrethitlerModule.isOver!(s)) fail(`${ctx}: isOver true while running`);
    return;
  }
  if (!secrethitlerModule.isOver!(s)) fail(`${ctx}: isOver false when over`);
  if (!s.winner || !s.winBy || !result) fail(`${ctx}: game over without winner/winBy/result`);
  const expected = s.players.filter((p) => !p.left && partyOf(p.role) === s.winner).map((p) => p.id);
  if (expected.length === 0) fail(`${ctx}: winning team has no eligible players`);
  if (result!.winnerId !== expected[0]) fail(`${ctx}: primary winner mismatch`);
  if (result!.winnerIds?.join(",") !== expected.join(","))
    fail(`${ctx}: winnerIds are not exactly the winning team`);

  // exhaustive & exclusive endings
  if (s.winBy === "policies") {
    if (s.winner === "liberal" && s.liberalTrack !== 5) fail(`${ctx}: liberal policy win without 5`);
    if (s.winner === "fascist" && s.fascistTrack !== 6) fail(`${ctx}: fascist policy win without 6`);
  } else if (s.winBy === "hitler_chancellor") {
    if (s.winner !== "fascist") fail(`${ctx}: hitler_chancellor won by liberals`);
    const chan = s.players.find((p) => p.id === s.chancellorId);
    if (!chan || chan.role !== "hitler") fail(`${ctx}: hitler_chancellor but chancellor is not Hitler`);
    if (s.fascistTrack < 3) fail(`${ctx}: hitler_chancellor before three fascist policies`);
  } else if (s.winBy === "hitler_executed") {
    if (s.winner !== "liberal") fail(`${ctx}: hitler_executed won by fascists`);
    if (hitlerOf(s).alive) fail(`${ctx}: hitler_executed but Hitler lives`);
  } else if (s.winBy === "forfeit") {
    const leavers = s.players.filter((p) => p.left);
    if (leavers.length !== 1) fail(`${ctx}: forfeit ending with ${leavers.length} leavers`);
    if (s.winner === partyOf(leavers[0].role)) fail(`${ctx}: leaver's own team won`);
  } else {
    fail(`${ctx}: unknown winBy ${s.winBy}`);
  }
}

function assertInvariants(s: SHState, count: number, ctx: string) {
  if (s.players.length !== count) fail(`${ctx}: player count changed`);
  if (new Set(s.players.map((p) => p.id)).size !== count) fail(`${ctx}: duplicate id`);
  assertRoles(s, count, ctx);
  assertConservation(s, ctx);

  if (s.tracker < 0 || s.tracker > 2) fail(`${ctx}: election tracker ${s.tracker} out of 0..2`);
  if (s.liberalTrack < 0 || s.liberalTrack > 5) fail(`${ctx}: liberal track ${s.liberalTrack}`);
  if (s.fascistTrack < 0 || s.fascistTrack > 6) fail(`${ctx}: fascist track ${s.fascistTrack}`);
  const running = s.phase !== "over";
  if (running ? s.deadline === null : s.deadline !== null) fail(`${ctx}: deadline/phase mismatch`);
  if (s.log.length > LOG_CAP) fail(`${ctx}: log exceeds cap`);
  for (let i = 1; i < s.log.length; i++)
    if (s.log[i].i <= s.log[i - 1].i) fail(`${ctx}: log sequence not increasing`);
  if (!s.players[s.presidentIdx]) fail(`${ctx}: presidentIdx out of range`);
  if (running && !president(s).alive) fail(`${ctx}: dead president holds the placard`);
  if (running && !hitlerOf(s).alive) fail(`${ctx}: Hitler dead but game running`);

  // hands exist exactly in their phases
  const presHand = s.phase === "legislative_president";
  if (presHand ? s.presidentHand?.length !== 3 : s.presidentHand !== null)
    fail(`${ctx}: president hand wrong in ${s.phase}`);
  const chanHand = s.phase === "legislative_chancellor" || s.phase === "veto_consent";
  if (chanHand ? s.chancellorHand?.length !== 2 : s.chancellorHand !== null)
    fail(`${ctx}: chancellor hand wrong in ${s.phase}`);

  // nominee / chancellor / ballots scoped to their phases
  if ((s.phase === "election") !== (s.nomineeId !== null)) fail(`${ctx}: nominee/phase mismatch`);
  if (s.nomineeId) {
    const nom = s.players.find((p) => p.id === s.nomineeId);
    if (!nom || !nom.alive || nom.id === president(s).id) fail(`${ctx}: invalid nominee`);
  }
  const inSession =
    chanHand || presHand || s.phase.startsWith("power_");
  if (running && inSession && s.chancellorId === null) fail(`${ctx}: session without a chancellor`);
  if ((s.phase === "nomination" || s.phase === "election") && s.chancellorId !== null)
    fail(`${ctx}: chancellor lingers into ${s.phase}`);
  if (s.phase !== "election" && Object.keys(s.votes).length) fail(`${ctx}: ballots outside election`);
  for (const id of Object.keys(s.votes)) {
    const voter = s.players.find((p) => p.id === id);
    if (!voter || !voter.alive) fail(`${ctx}: ballot from a dead or unknown player`);
  }
  if (s.phase === "election" && Object.keys(s.votes).length >= aliveOf(s).length)
    fail(`${ctx}: full ballot box did not resolve`);

  // the deck is topped up between sessions, so a peek always has three cards
  if ((s.phase === "nomination" || s.phase === "election" || s.phase === "power_peek") && s.deck.length < 3)
    fail(`${ctx}: deck below three between sessions`);
  if (s.vetoRefused && s.phase !== "legislative_chancellor" && running)
    fail(`${ctx}: vetoRefused lingers in ${s.phase}`);

  // election records: math and dead-voter checks
  s.elections.forEach((e, i) => {
    const keys = Object.keys(e.votes);
    const ja = Object.values(e.votes).filter(Boolean).length;
    if (ja !== e.ja || keys.length - ja !== e.nein) fail(`${ctx}: election ${i} tally wrong`);
    if (e.passed !== e.ja > e.nein) fail(`${ctx}: election ${i} majority math wrong`);
    for (const id of keys)
      if (!s.players.some((p) => p.id === id)) fail(`${ctx}: election ${i} unknown voter`);
    if (e.chancellorId === e.presidentId) fail(`${ctx}: election ${i} self-nomination recorded`);
  });

  // investigations: unique targets, never the investigator, correct party
  const targets = s.investigations.map((x) => x.targetId);
  if (new Set(targets).size !== targets.length) fail(`${ctx}: double investigation recorded`);
  for (const x of s.investigations) {
    if (x.presidentId === x.targetId) fail(`${ctx}: self-investigation recorded`);
    const t = s.players.find((p) => p.id === x.targetId);
    if (!t || partyOf(t.role) !== x.party) fail(`${ctx}: investigation result wrong`);
  }

  assertResult(s, ctx);
}

/* ------------------------- privacy / redaction -------------------------- */

const PRIVATE_KEYS = [
  "yourRole",
  "yourParty",
  "knowledge",
  "yourVote",
  "presidentHand",
  "chancellorHand",
  "peek",
  "yourInvestigations",
] as const;

function stripPrivate(view: SecretHitlerView): string {
  const o = JSON.parse(JSON.stringify(view)) as Record<string, unknown>;
  for (const k of PRIVATE_KEYS) delete o[k];
  delete o.youId;
  return JSON.stringify(o);
}

function assertPublicView(
  s: SHState,
  v: SecretHitlerView,
  lastPres: string | null,
  lastChan: string | null,
  ctx: string
) {
  const over = s.phase === "over";
  if (v.phase !== s.phase || v.deadline !== s.deadline || v.tracker !== s.tracker)
    fail(`${ctx}: public scalars differ`);
  if (v.liberalTrack !== s.liberalTrack || v.fascistTrack !== s.fascistTrack)
    fail(`${ctx}: track state differs`);
  if (v.deckCount !== s.deck.length || v.discardCount !== s.discard.length)
    fail(`${ctx}: pile counts differ`);
  if (v.presidentId !== president(s).id || v.nomineeId !== s.nomineeId || v.chancellorId !== s.chancellorId)
    fail(`${ctx}: government differs`);
  if (v.lastPresidentId !== s.lastPresidentId || v.lastChancellorId !== s.lastChancellorId)
    fail(`${ctx}: term-limit info differs`);
  if (v.aliveCount !== aliveOf(s).length) fail(`${ctx}: aliveCount differs`);
  if (v.vetoUnlocked !== s.fascistTrack >= VETO_UNLOCK) fail(`${ctx}: vetoUnlocked differs`);
  if (v.vetoRefused !== s.vetoRefused) fail(`${ctx}: vetoRefused differs`);
  if (v.specialRound !== (s.specialFromIdx !== null)) fail(`${ctx}: specialRound differs`);
  if (JSON.stringify(v.powers) !== JSON.stringify(POWER_TRACK[s.players.length]))
    fail(`${ctx}: power table differs`);
  if (JSON.stringify(v.votedIds) !== JSON.stringify(Object.keys(s.votes)))
    fail(`${ctx}: votedIds differ`);
  if (JSON.stringify(v.elections) !== JSON.stringify(s.elections)) fail(`${ctx}: elections differ`);
  if (
    JSON.stringify(v.investigated) !==
    JSON.stringify(s.investigations.map((x) => ({ presidentId: x.presidentId, targetId: x.targetId })))
  )
    fail(`${ctx}: public investigation pairs differ`);
  const expectedEligible =
    s.phase === "nomination" ? shadowEligible(s, lastPres, lastChan).map((p) => p.id) : [];
  if (JSON.stringify(v.eligibleIds) !== JSON.stringify(expectedEligible))
    fail(`${ctx}: eligibleIds differ from independent recomputation`);
  if (v.winner !== s.winner || v.winBy !== s.winBy) fail(`${ctx}: outcome differs`);
  if (JSON.stringify(v.winnerIds) !== JSON.stringify(s.winnerIds)) fail(`${ctx}: winnerIds differ`);
  if (over) {
    if (!v.reveal || v.reveal.length !== s.players.length) fail(`${ctx}: reveal incomplete`);
    for (const r of v.reveal) {
      const actual = s.players.find((p) => p.id === r.id);
      if (!actual || r.role !== actual.role || r.party !== partyOf(actual.role))
        fail(`${ctx}: reveal inconsistent`);
    }
  } else if (v.reveal !== null) {
    fail(`${ctx}: reveal before game over`);
  }

  // quoted-token scans of the PUBLIC serialization against exact expectations
  const json = JSON.stringify({ ...v, youId: "x" });
  for (const k of PRIVATE_KEYS) if (json.includes(`"${k}":`)) fail(`${ctx}: private key ${k} on public view`);
  const votesKeys = json.match(/"votes":/g)?.length ?? 0;
  if (votesKeys !== v.elections.length) fail(`${ctx}: a ballot map outside the public record leaked`);
  const hitlerTokens = json.match(/"hitler"/g)?.length ?? 0;
  if (hitlerTokens !== (over ? 1 : 0)) fail(`${ctx}: "hitler" token count ${hitlerTokens}`);
  const viewLog = s.log.slice(-VIEW_LOG);
  const libLogged = viewLog.filter((e) => e.detail === "liberal").length;
  const fasLogged = viewLog.filter((e) => e.detail === "fascist").length;
  const libs = s.players.filter((p) => p.role === "liberal").length;
  const plainFas = s.players.filter((p) => p.role === "fascist").length;
  const expectLib = libLogged + (over ? (s.winner === "liberal" ? 1 : 0) + libs * 2 : 0);
  const expectFas = fasLogged + (over ? (s.winner === "fascist" ? 1 : 0) + plainFas * 2 + 1 : 0);
  const libTokens = json.match(/"liberal"/g)?.length ?? 0;
  const fasTokens = json.match(/"fascist"/g)?.length ?? 0;
  if (libTokens !== expectLib) fail(`${ctx}: "liberal" tokens ${libTokens} != ${expectLib}`);
  if (fasTokens !== expectFas) fail(`${ctx}: "fascist" tokens ${fasTokens} != ${expectFas}`);
}

function assertPrivateView(s: SHState, v: SecretHitlerView, p: SHPlayerState, ctx: string) {
  if (v.yourRole !== p.role || v.yourParty !== partyOf(p.role))
    fail(`${ctx}: own role/party wrong (dead players keep their card)`);

  const entitledKnowledge =
    partyOf(p.role) === "fascist" && (p.role !== "hitler" || s.players.length <= 6);
  const expectedKnowledge = entitledKnowledge
    ? { fascistIds: fascistTeam(s).map((x) => x.id), hitlerId: hitlerOf(s).id }
    : undefined;
  if (JSON.stringify(v.knowledge) !== JSON.stringify(expectedKnowledge))
    fail(`${ctx}: knowledge wrong for ${p.role} at ${s.players.length}p`);

  const expectVote = hasOwn(s.votes, p.id) ? s.votes[p.id] : undefined;
  if (v.yourVote !== expectVote) fail(`${ctx}: yourVote wrong`);

  const isPres = p.id === president(s).id;
  const expectPresHand =
    isPres && s.phase === "legislative_president" ? s.presidentHand : undefined;
  if (JSON.stringify(v.presidentHand) !== JSON.stringify(expectPresHand ?? undefined))
    fail(`${ctx}: presidentHand entitlement wrong`);
  const expectChanHand =
    p.id === s.chancellorId && (s.phase === "legislative_chancellor" || s.phase === "veto_consent")
      ? s.chancellorHand
      : undefined;
  if (JSON.stringify(v.chancellorHand) !== JSON.stringify(expectChanHand ?? undefined))
    fail(`${ctx}: chancellorHand entitlement wrong`);
  const expectPeek = isPres && s.phase === "power_peek" ? s.deck.slice(0, 3) : undefined;
  if (JSON.stringify(v.peek) !== JSON.stringify(expectPeek)) fail(`${ctx}: peek entitlement wrong`);

  const mine = s.investigations
    .filter((x) => x.presidentId === p.id)
    .map((x) => ({ targetId: x.targetId, party: x.party }));
  const expectInv = mine.length ? mine : undefined;
  if (JSON.stringify(v.yourInvestigations) !== JSON.stringify(expectInv))
    fail(`${ctx}: investigation results entitlement wrong`);
}

function assertRedaction(s: SHState, now: number, lastPres: string | null, lastChan: string | null, ctx: string) {
  const spectator = secrethitlerModule.redact(s, "spectator-x", now) as SecretHitlerView;
  if (spectator.youId !== "spectator-x" || spectator.now !== now) fail(`${ctx}: viewer metadata wrong`);
  for (const k of PRIVATE_KEYS)
    if ((spectator as Record<string, unknown>)[k] !== undefined)
      fail(`${ctx}: spectator received private field ${k}`);
  assertPublicView(s, spectator, lastPres, lastChan, `${ctx} spectator`);
  const baseline = stripPrivate(spectator);

  for (const p of s.players) {
    const v = secrethitlerModule.redact(s, p.id, now) as SecretHitlerView;
    if (v.youId !== p.id || v.now !== now) fail(`${ctx} ${p.id}: viewer metadata wrong`);
    assertPrivateView(s, v, p, `${ctx} ${p.id}`);
    // entitlement map: outside the declared private fields, every viewer's
    // serialization is byte-identical to the spectator's
    if (stripPrivate(v) !== baseline) fail(`${ctx} ${p.id}: public part differs from spectator`);
  }
}

/* --------------------------- phase transitions -------------------------- */

const legalTransitions: Record<SHPhase, SHPhase[]> = {
  nomination: ["nomination", "election", "over"],
  election: ["election", "legislative_president", "nomination", "over"],
  legislative_president: ["legislative_president", "legislative_chancellor", "over"],
  legislative_chancellor: [
    "legislative_chancellor",
    "nomination",
    "veto_consent",
    "power_peek",
    "power_investigate",
    "power_special",
    "power_execute",
    "over",
  ],
  veto_consent: ["veto_consent", "legislative_chancellor", "nomination", "over"],
  power_peek: ["power_peek", "nomination", "over"],
  power_investigate: ["power_investigate", "nomination", "over"],
  power_special: ["power_special", "nomination", "over"],
  power_execute: ["power_execute", "nomination", "over"],
  over: ["over"],
};

/* ----------------------------- move policies ---------------------------- */

type Policy = "random" | "fascist-agenda" | "liberal-honest";

function policyMove(s: SHState, policy: Policy, rng: () => number): { playerId: string; move: SecretHitlerMove } {
  const pres = president(s);
  const fasIds = new Set(fascistTeam(s).map((p) => p.id));
  const hitler = hitlerOf(s);

  switch (s.phase) {
    case "nomination": {
      const options = shadowEligible(s, s.lastPresidentId, s.lastChancellorId);
      let target = pick(rng, options);
      if (policy === "fascist-agenda" && fasIds.has(pres.id)) {
        const hitlerOpt = options.find((p) => p.id === hitler.id);
        const fasOpts = options.filter((p) => fasIds.has(p.id));
        if (s.fascistTrack >= 3 && hitlerOpt) target = hitlerOpt;
        else if (fasOpts.length && rng() < 0.8) target = pick(rng, fasOpts);
      }
      return { playerId: pres.id, move: { type: "nominate", target: target.id } };
    }
    case "election": {
      const pending = aliveOf(s).filter((p) => !hasOwn(s.votes, p.id));
      const voter = pick(rng, pending);
      let ja: boolean;
      if (policy === "fascist-agenda")
        ja = fasIds.has(voter.id) ? fasIds.has(s.nomineeId!) || rng() < 0.25 : rng() < 0.6;
      else if (policy === "liberal-honest") ja = rng() < 0.8;
      else ja = rng() < 0.55;
      return { playerId: voter.id, move: { type: "vote", ja } };
    }
    case "legislative_president": {
      const hand = s.presidentHand!;
      let index = Math.floor(rng() * hand.length);
      if (policy === "fascist-agenda" && fasIds.has(pres.id) && hand.includes("liberal"))
        index = hand.indexOf("liberal");
      else if (policy === "liberal-honest" && !fasIds.has(pres.id) && hand.includes("fascist"))
        index = hand.indexOf("fascist");
      return { playerId: pres.id, move: { type: "discard", index } };
    }
    case "legislative_chancellor": {
      const chanId = s.chancellorId!;
      const hand = s.chancellorHand!;
      if (s.fascistTrack >= VETO_UNLOCK && !s.vetoRefused && rng() < 0.3)
        return { playerId: chanId, move: { type: "veto" } };
      let index = Math.floor(rng() * hand.length);
      if (policy === "fascist-agenda" && fasIds.has(chanId) && hand.includes("fascist"))
        index = hand.indexOf("fascist");
      else if (policy === "liberal-honest" && !fasIds.has(chanId) && hand.includes("liberal"))
        index = hand.indexOf("liberal");
      return { playerId: chanId, move: { type: "enact", index } };
    }
    case "veto_consent":
      return { playerId: pres.id, move: { type: "veto_consent", agree: rng() < 0.5 } };
    case "power_peek":
      return { playerId: pres.id, move: { type: "peek_done" } };
    case "power_investigate": {
      const options = s.players.filter(
        (p) => p.alive && p.id !== pres.id && !s.investigations.some((x) => x.targetId === p.id)
      );
      return { playerId: pres.id, move: { type: "investigate", target: pick(rng, options).id } };
    }
    case "power_special": {
      const options = s.players.filter((p) => p.alive && p.id !== pres.id);
      return { playerId: pres.id, move: { type: "special_election", target: pick(rng, options).id } };
    }
    case "power_execute": {
      const options = s.players.filter((p) => p.alive && p.id !== pres.id);
      let target = pick(rng, options);
      if (policy === "fascist-agenda" && fasIds.has(pres.id)) {
        const libs = options.filter((p) => !fasIds.has(p.id));
        if (libs.length) target = pick(rng, libs);
      }
      return { playerId: pres.id, move: { type: "execute", target: target.id } };
    }
    default:
      return fail(`no policy move for phase ${s.phase}`);
  }
}

/* --------------------------- invalid-move probes ------------------------- */

const probeCounts: Record<string, number> = {};

function expectRejected(
  s: SHState,
  playerId: string,
  move: SecretHitlerMove,
  now: number,
  rng: () => number,
  label: string,
  ctx: string
) {
  const snapshot = JSON.stringify(s);
  let rejected = false;
  try {
    secrethitlerModule.applyMove(s, playerId, move, now, rng);
  } catch (error) {
    if (!(error instanceof MoveError)) throw error;
    rejected = true;
  }
  if (!rejected) fail(`${ctx}: illegal move accepted (${label})`);
  if (JSON.stringify(s) !== snapshot) fail(`${ctx}: rejected move mutated state (${label})`);
  probeCounts[label] = (probeCounts[label] ?? 0) + 1;
}

const cloneState = (s: SHState): SHState => JSON.parse(JSON.stringify(s)) as SHState;

function probeInvalid(s: SHState, now: number, rng: () => number, ctx: string) {
  const pres = president(s);
  const anyone = pick(rng, aliveOf(s));
  const dead = s.players.find((p) => !p.alive);

  expectRejected(s, "ghost-player", { type: "vote", ja: true }, now, rng, "ghost", ctx);
  expectRejected(s, anyone.id, { type: "salute" } as unknown as SecretHitlerMove, now, rng, "unknown-type", ctx);
  if (dead) expectRejected(s, dead.id, { type: "vote", ja: true }, now, rng, "dead-actor", ctx);

  if (s.phase === "nomination") {
    const notPres = s.players.find((p) => p.alive && p.id !== pres.id)!;
    const someTarget = s.players.find((p) => p.alive && p.id !== notPres.id)!;
    expectRejected(s, notPres.id, { type: "nominate", target: someTarget.id }, now, rng, "not-president-nominate", ctx);
    expectRejected(s, pres.id, { type: "nominate", target: pres.id }, now, rng, "nominate-self", ctx);
    expectRejected(s, pres.id, { type: "nominate", target: "nobody" }, now, rng, "unknown-target", ctx);
    if (dead) expectRejected(s, pres.id, { type: "nominate", target: dead.id }, now, rng, "nominate-dead", ctx);
    const lastChan = s.players.find((p) => p.id === s.lastChancellorId && p.alive && p.id !== pres.id);
    if (lastChan)
      expectRejected(s, pres.id, { type: "nominate", target: lastChan.id }, now, rng, "nominate-last-chancellor", ctx);
    const lastPres = s.players.find(
      (p) =>
        p.id === s.lastPresidentId &&
        p.alive &&
        p.id !== pres.id &&
        p.id !== s.lastChancellorId &&
        aliveOf(s).length > 5
    );
    if (lastPres)
      expectRejected(s, pres.id, { type: "nominate", target: lastPres.id }, now, rng, "nominate-last-president", ctx);
    expectRejected(s, anyone.id, { type: "vote", ja: false }, now, rng, "out-of-phase", ctx);
    expectRejected(s, pres.id, { type: "discard", index: 0 }, now, rng, "out-of-phase", ctx);
    expectRejected(s, pres.id, { type: "execute", target: anyone.id }, now, rng, "out-of-phase", ctx);
  } else if (s.phase === "election") {
    const voted = s.players.find((p) => hasOwn(s.votes, p.id));
    if (voted) expectRejected(s, voted.id, { type: "vote", ja: rng() < 0.5 }, now, rng, "double-vote", ctx);
    expectRejected(s, anyone.id, { type: "vote", ja: "yes" as unknown as boolean }, now, rng, "bad-ballot", ctx);
    expectRejected(s, pres.id, { type: "nominate", target: anyone.id }, now, rng, "out-of-phase", ctx);
    expectRejected(s, pres.id, { type: "enact", index: 0 }, now, rng, "out-of-phase", ctx);
  } else if (s.phase === "legislative_president") {
    const notPres = s.players.find((p) => p.alive && p.id !== pres.id)!;
    expectRejected(s, notPres.id, { type: "discard", index: 0 }, now, rng, "not-president-discard", ctx);
    expectRejected(s, pres.id, { type: "discard", index: 3 }, now, rng, "bad-discard-index", ctx);
    expectRejected(s, pres.id, { type: "discard", index: -1 }, now, rng, "bad-discard-index", ctx);
    expectRejected(s, pres.id, { type: "discard", index: 1.5 }, now, rng, "bad-discard-index", ctx);
    expectRejected(s, pres.id, { type: "enact", index: 0 }, now, rng, "out-of-phase", ctx);
    if (s.chancellorId)
      expectRejected(s, s.chancellorId, { type: "veto" }, now, rng, "out-of-phase", ctx);
  } else if (s.phase === "legislative_chancellor") {
    const chanId = s.chancellorId!;
    const notChan = s.players.find((p) => p.alive && p.id !== chanId)!;
    expectRejected(s, notChan.id, { type: "enact", index: 0 }, now, rng, "not-chancellor-enact", ctx);
    expectRejected(s, chanId, { type: "enact", index: 2 }, now, rng, "bad-enact-index", ctx);
    expectRejected(s, chanId, { type: "enact", index: -1 }, now, rng, "bad-enact-index", ctx);
    expectRejected(s, pres.id, { type: "discard", index: 0 }, now, rng, "out-of-phase", ctx);
    if (s.fascistTrack < VETO_UNLOCK)
      expectRejected(s, chanId, { type: "veto" }, now, rng, "veto-early", ctx);
    else if (s.vetoRefused)
      expectRejected(s, chanId, { type: "veto" }, now, rng, "veto-after-refusal", ctx);
    if (s.fascistTrack >= VETO_UNLOCK && !s.vetoRefused)
      expectRejected(s, pres.id, { type: "veto" }, now, rng, "not-chancellor-veto", ctx);
    expectRejected(s, pres.id, { type: "veto_consent", agree: true }, now, rng, "out-of-phase", ctx);
  } else if (s.phase === "veto_consent") {
    const notPres = s.players.find((p) => p.alive && p.id !== pres.id)!;
    expectRejected(s, notPres.id, { type: "veto_consent", agree: true }, now, rng, "not-president-consent", ctx);
    expectRejected(s, pres.id, { type: "veto_consent", agree: "ok" as unknown as boolean }, now, rng, "bad-consent", ctx);
    expectRejected(s, s.chancellorId!, { type: "enact", index: 0 }, now, rng, "out-of-phase", ctx);
  } else if (s.phase === "power_peek") {
    const notPres = s.players.find((p) => p.alive && p.id !== pres.id)!;
    expectRejected(s, notPres.id, { type: "peek_done" }, now, rng, "not-president-peek", ctx);
    expectRejected(s, pres.id, { type: "investigate", target: notPres.id }, now, rng, "out-of-phase", ctx);
  } else if (s.phase === "power_investigate") {
    const notPres = s.players.find((p) => p.alive && p.id !== pres.id)!;
    expectRejected(s, pres.id, { type: "investigate", target: pres.id }, now, rng, "investigate-self", ctx);
    expectRejected(s, notPres.id, { type: "investigate", target: pres.id }, now, rng, "not-president-power", ctx);
    // states with a prior investigation or a dead subject cannot be reached
    // while this power is pending, so exercise those guards on a clone
    const clone1 = cloneState(s);
    clone1.investigations.push({ presidentId: pres.id, targetId: notPres.id, party: "liberal" });
    expectRejected(clone1, pres.id, { type: "investigate", target: notPres.id }, now, rng, "reinvestigate", ctx);
    const clone2 = cloneState(s);
    clone2.players.find((p) => p.id === notPres.id)!.alive = false;
    expectRejected(clone2, pres.id, { type: "investigate", target: notPres.id }, now, rng, "investigate-dead", ctx);
  } else if (s.phase === "power_special") {
    const notPres = s.players.find((p) => p.alive && p.id !== pres.id)!;
    expectRejected(s, pres.id, { type: "special_election", target: pres.id }, now, rng, "special-self", ctx);
    expectRejected(s, notPres.id, { type: "special_election", target: pres.id }, now, rng, "not-president-power", ctx);
    const clone = cloneState(s);
    clone.players.find((p) => p.id === notPres.id)!.alive = false;
    expectRejected(clone, pres.id, { type: "special_election", target: notPres.id }, now, rng, "special-dead", ctx);
  } else if (s.phase === "power_execute") {
    const notPres = s.players.find((p) => p.alive && p.id !== pres.id)!;
    expectRejected(s, pres.id, { type: "execute", target: pres.id }, now, rng, "execute-self", ctx);
    expectRejected(s, notPres.id, { type: "execute", target: notPres.id }, now, rng, "not-president-power", ctx);
    if (dead) expectRejected(s, pres.id, { type: "execute", target: dead.id }, now, rng, "execute-dead", ctx);
  }
}

/* --------------------------------- driver -------------------------------- */

const parsedGames = Number(process.env.SIM_GAMES ?? 3000);
if (!Number.isInteger(parsedGames) || parsedGames < 1)
  fail(`SIM_GAMES must be a positive integer, got ${process.env.SIM_GAMES}`);
const GAMES = parsedGames;
const STEP_CAP = 1200;
const POLICIES: Policy[] = ["random", "fascist-agenda", "liberal-honest"];

let totalSteps = 0;
let libPolicyWins = 0;
let libHitlerShot = 0;
let fasPolicyWins = 0;
let fasHitlerChancellor = 0;
let chaosPolicies = 0;
let vetoCalls = 0;
let vetoAgreed = 0;
let forfeitEndings = 0;
const timeoutsByPhase: Record<string, number> = {};

for (let game = 0; game < GAMES; game++) {
  const seed = 770_000 + game;
  const rng = mulberry32(seed);
  try {
    const count = 5 + (game % 4);
    const policy = POLICIES[game % 3];
    const allowForfeit = game % 2 === 0;
    const players: GamePlayer[] = Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      seat: i,
    }));
    let now = 1_000_000;
    const s = secrethitlerModule.init(players, now, rng) as SHState;

    // driver's shadow of publicly-derivable rule state
    let shLastPres: string | null = null;
    let shLastChan: string | null = null;
    let shLib = 0;
    let shFas = 0;
    let shSpecialFrom: number | null = null;
    let prevLogSeq = s.logSeq;
    let lastSpecialTarget: string | null = null;

    assertInvariants(s, count, `seed ${seed} init`);
    assertRedaction(s, now, shLastPres, shLastChan, `seed ${seed} init`);
    if (s.phase !== "nomination") fail(`seed ${seed}: did not open with a nomination`);

    let steps = 0;
    while (s.phase !== "over") {
      if (++steps > STEP_CAP) fail(`seed ${seed}: game did not terminate`);
      now += 250 + Math.floor(rng() * 1_250);
      const ctx = `seed ${seed} step ${steps}`;
      const beforePhase = s.phase;
      const beforeTracker = s.tracker;
      const beforeFas = s.fascistTrack;
      const beforePresidentIdx = s.presidentIdx;
      prevLogSeq = s.logSeq;

      const rare = s.vetoRefused || s.phase.startsWith("power_") || s.phase === "veto_consent";
      if (rare || rng() < 0.18) probeInvalid(s, now, rng, ctx);

      if (allowForfeit && rng() < 0.02) {
        const leaver = pick(rng, s.players.filter((p) => !p.left));
        const leaverParty = partyOf(leaver.role);
        secrethitlerModule.forfeit(s, leaver.id, now, rng);
        if (s.phase !== "over" || s.winBy !== "forfeit") fail(`${ctx}: forfeit did not end the game`);
        if (s.winner !== (leaverParty === "liberal" ? "fascist" : "liberal"))
          fail(`${ctx}: forfeit winner is not the opposing team`);
        const snapshot = JSON.stringify(s);
        secrethitlerModule.forfeit(s, leaver.id, now + 1, rng);
        secrethitlerModule.forfeit(s, "ghost-player", now + 1, rng);
        secrethitlerModule.forfeit(s, pick(rng, s.players).id, now + 1, rng);
        if (JSON.stringify(s) !== snapshot) fail(`${ctx}: forfeit after over mutated state`);
        forfeitEndings++;
      } else if (rng() < 0.15) {
        const deadline = s.deadline;
        if (deadline === null) fail(`${ctx}: running phase without deadline`);
        const snapshot = JSON.stringify(s);
        if (secrethitlerModule.tick(s, deadline - 1, rng)) fail(`${ctx}: tick fired early`);
        if (JSON.stringify(s) !== snapshot) fail(`${ctx}: early tick mutated state`);
        if (!secrethitlerModule.tick(s, deadline, rng)) fail(`${ctx}: tick ignored expired deadline`);
        timeoutsByPhase[beforePhase] = (timeoutsByPhase[beforePhase] ?? 0) + 1;
        now = deadline;
      } else {
        const generated = policyMove(s, policy, rng);
        try {
          secrethitlerModule.applyMove(s, generated.playerId, generated.move, now, rng);
        } catch (error) {
          if (error instanceof MoveError)
            fail(`${ctx}: legal move rejected ${JSON.stringify(generated)}: ${error.message}`);
          throw error;
        }
      }

      if (!legalTransitions[beforePhase].includes(s.phase))
        fail(`${ctx}: illegal transition ${beforePhase} -> ${s.phase}`);

      /* -------- replay the step's public log against the shadow model ----- */
      const fresh = s.log.filter((l) => l.i > prevLogSeq);
      const freshChaos = fresh.some((l) => l.kind === "chaos");
      if (freshChaos && fresh.some((l) => l.kind === "power"))
        fail(`${ctx}: chaos granted a presidential power`);
      for (const entry of fresh) {
        if (entry.kind === "nominate") {
          const nominee = byName(s, entry.target!);
          const legal = shadowEligible(s, shLastPres, shLastChan).some((p) => p.id === nominee.id);
          if (!legal) fail(`${ctx}: term-limit recheck failed for nominee ${nominee.id}`);
        } else if (entry.kind === "ballots") {
          const record = s.elections[s.elections.length - 1];
          if (!record) fail(`${ctx}: ballots log without an election record`);
          if (record.special !== (shSpecialFrom !== null)) fail(`${ctx}: special flag wrong`);
          const aliveIds = aliveOf(s).map((p) => p.id).sort();
          if (JSON.stringify(Object.keys(record.votes).sort()) !== JSON.stringify(aliveIds))
            fail(`${ctx}: election record is not exactly the living players`);
          if (record.passed) {
            const chan = s.players.find((p) => p.id === record.chancellorId)!;
            if (chan.id === shLastChan) fail(`${ctx}: last chancellor re-elected`);
            if (aliveIds.length > 5 && chan.id === shLastPres) fail(`${ctx}: last president re-elected`);
            shLastPres = record.presidentId;
            shLastChan = record.chancellorId;
            if (chan.role === "hitler" && beforeFas >= 3) {
              if (s.phase !== "over" || s.winBy !== "hitler_chancellor")
                fail(`${ctx}: elected Hitler in the zone without a fascist win`);
            } else if (s.phase !== "legislative_president" && s.phase !== "over") {
              fail(`${ctx}: passed election did not open a session`);
            } else if (s.phase === "over" && s.winBy === "hitler_chancellor" && beforeFas < 3) {
              fail(`${ctx}: Hitler-chancellor win before three fascist policies`);
            }
          } else if (beforeTracker === 2 && !freshChaos) {
            fail(`${ctx}: third failed election did not fire chaos`);
          }
        } else if (entry.kind === "chaos") {
          if (beforeTracker !== 2) fail(`${ctx}: chaos fired from tracker ${beforeTracker}`);
          if (s.tracker !== 0) fail(`${ctx}: tracker not reset by chaos`);
          shLastPres = null;
          shLastChan = null;
          if (entry.detail === "liberal") shLib++;
          else shFas++;
          chaosPolicies++;
        } else if (entry.kind === "enact") {
          if (entry.detail === "liberal") {
            shLib++;
          } else {
            shFas++;
            const expectPower = POWER_TRACK[count][shFas - 1];
            if (s.phase !== "over") {
              if (expectPower) {
                if (s.phase !== `power_${expectPower}`)
                  fail(`${ctx}: fascist slot ${shFas} granted ${s.phase}, expected ${expectPower}`);
                if (!fresh.some((l) => l.kind === "power" && l.detail === expectPower))
                  fail(`${ctx}: power log missing`);
              } else if (s.phase !== "nomination") {
                fail(`${ctx}: fascist slot ${shFas} should grant nothing`);
              }
            }
          }
          if (entry.detail === "liberal" && fresh.some((l) => l.kind === "power"))
            fail(`${ctx}: liberal policy granted a power`);
        } else if (entry.kind === "special") {
          if (shSpecialFrom === null) shSpecialFrom = beforePresidentIdx;
          lastSpecialTarget = byName(s, entry.target!).id;
        } else if (entry.kind === "round") {
          if (entry.detail === "special") {
            if (president(s).id !== lastSpecialTarget)
              fail(`${ctx}: special candidate is not the appointee`);
          } else {
            const from = shSpecialFrom ?? beforePresidentIdx;
            if (s.presidentIdx !== nextAliveIdx(s, from))
              fail(`${ctx}: presidency did not rotate to the next living seat`);
            shSpecialFrom = null;
          }
        } else if (entry.kind === "execute") {
          const target = byName(s, entry.target!);
          if (target.alive) fail(`${ctx}: executed player still alive`);
          if (target.role === "hitler" && (s.phase !== "over" || s.winBy !== "hitler_executed"))
            fail(`${ctx}: Hitler shot without a liberal win`);
        } else if (entry.kind === "veto") {
          vetoCalls++;
        } else if (entry.kind === "veto_agree") {
          vetoAgreed++;
        }
      }
      if (s.lastPresidentId !== shLastPres || s.lastChancellorId !== shLastChan)
        fail(`${ctx}: term-limit shadow diverged`);
      if (s.liberalTrack !== shLib || s.fascistTrack !== shFas)
        fail(`${ctx}: track shadow diverged (${shLib}/${shFas})`);
      if (s.specialFromIdx !== shSpecialFrom) fail(`${ctx}: special rotation shadow diverged`);

      assertInvariants(s, count, ctx);
      assertRedaction(s, now, shLastPres, shLastChan, ctx);
    }

    totalSteps += steps;
    if (s.winBy === "policies" && s.winner === "liberal") libPolicyWins++;
    else if (s.winBy === "policies") fasPolicyWins++;
    else if (s.winBy === "hitler_executed") libHitlerShot++;
    else if (s.winBy === "hitler_chancellor") fasHitlerChancellor++;

    // finished games are inert
    const result = secrethitlerModule.result(s);
    if (!result) fail(`seed ${seed}: missing final result`);
    expectRejected(s, result.winnerId, { type: "vote", ja: true }, now + 1, rng, "after-over", `seed ${seed}`);
    if (secrethitlerModule.tick(s, now + 10_000_000, rng)) fail(`seed ${seed}: tick advanced a finished game`);
  } catch (error) {
    console.error(`FAILED at game ${game} (seed ${seed})`);
    throw error;
  }
}

for (const label of [
  "ghost",
  "unknown-type",
  "dead-actor",
  "not-president-nominate",
  "nominate-self",
  "unknown-target",
  "nominate-dead",
  "nominate-last-chancellor",
  "nominate-last-president",
  "out-of-phase",
  "double-vote",
  "bad-ballot",
  "not-president-discard",
  "bad-discard-index",
  "not-chancellor-enact",
  "bad-enact-index",
  "veto-early",
  "veto-after-refusal",
  "not-chancellor-veto",
  "not-president-consent",
  "bad-consent",
  "not-president-peek",
  "investigate-self",
  "not-president-power",
  "reinvestigate",
  "investigate-dead",
  "special-self",
  "special-dead",
  "execute-self",
  "execute-dead",
  "after-over",
]) {
  if (!probeCounts[label]) fail(`probe never exercised: ${label}`);
}
if (forfeitEndings === 0) fail("no forfeits were exercised");
for (const phase of [
  "nomination",
  "election",
  "legislative_president",
  "legislative_chancellor",
  "veto_consent",
  "power_peek",
  "power_investigate",
  "power_special",
  "power_execute",
]) {
  if (!timeoutsByPhase[phase]) fail(`no deadline timeout exercised in ${phase}`);
}
if (!libPolicyWins || !libHitlerShot || !fasPolicyWins || !fasHitlerChancellor)
  fail("a winning path was never exercised");
if (!chaosPolicies) fail("chaos was never exercised");
if (!vetoAgreed || vetoCalls <= vetoAgreed) fail("veto agree/refuse paths not both exercised");

const totalProbes = Object.values(probeCounts).reduce((a, b) => a + b, 0);
const t = (phase: string) => timeoutsByPhase[phase] ?? 0;
console.log(
  `OK: ${GAMES} games, avg ${(totalSteps / GAMES).toFixed(1)} steps ` +
    `(liberals via policies ${libPolicyWins} / hitler-shot ${libHitlerShot}, ` +
    `fascists via policies ${fasPolicyWins} / hitler-chancellor ${fasHitlerChancellor}, ` +
    `${forfeitEndings} forfeits, ${chaosPolicies} chaos policies, ` +
    `${vetoCalls} vetoes (${vetoAgreed} agreed), ` +
    `timeouts n/e/p/c/v ${t("nomination")}/${t("election")}/${t("legislative_president")}/${t(
      "legislative_chancellor"
    )}/${t("veto_consent")} powers ${t("power_peek")}/${t("power_investigate")}/${t("power_special")}/${t(
      "power_execute"
    )}, ${totalProbes} illegal probes rejected)`
);
