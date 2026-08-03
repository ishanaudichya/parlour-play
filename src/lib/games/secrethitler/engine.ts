/* Secret Hitler — hidden parties, a poisoned deck and one name that must
   never hold the chancellorship.

   - 5p 3 liberals / 1 fascist + Hitler · 6p 4/1+H · 7p 4/2+H · 8p 5/2+H.
   - Fascists know each other and Hitler; Hitler knows his single fellow
     fascist only at 5–6 players; liberals know nothing.
   - 6 liberal + 11 fascist policies. Five liberal policies win for the
     liberals, six fascist policies for the fascists. Shooting Hitler wins
     instantly for the liberals; electing him Chancellor after three fascist
     policies wins instantly for the fascists.
   - Failed elections advance a three-slot tracker; the third failure enacts
     the top policy by chaos: no power, tracker reset, term limits forgotten.
   - Fascist policies grant presidential powers by slot and player count.
     After the fifth, the Chancellor may move to veto with consent.
   - Forfeit ends the game at once: the leaver's opposing team wins
     (removing a seat would break the role balance). */

import { MoveError, type GameModule, type GamePlayer } from "../types";
import { partyOf } from "./meta";
import {
  CHANCELLOR_MS,
  FASCIST_COUNTS,
  FASCIST_POLICIES,
  FASCIST_SLOTS,
  HITLER_ZONE,
  LIBERAL_POLICIES,
  LIBERAL_SLOTS,
  LOG_CAP,
  NOMINATE_MS,
  PEEK_MS,
  POWER_MS,
  POWER_TRACK,
  PRESIDENT_MS,
  VETO_MS,
  VETO_UNLOCK,
  VIEW_LOG,
  VOTE_MS,
  type SecretHitlerMove,
  type SecretHitlerView,
  type SHKnowledge,
  type SHLogEntry,
  type SHLogKind,
  type SHParty,
  type SHPlayerState,
  type SHRole,
  type SHState,
  type SHWinBy,
} from "./types";

type Rng = () => number;

const err = (message: string): never => {
  throw new MoveError(message);
};

const hasOwn = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

function log(s: SHState, kind: SHLogKind, entry: Partial<SHLogEntry> = {}) {
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

const president = (s: SHState): SHPlayerState => s.players[s.presidentIdx];
const aliveCount = (s: SHState) => s.players.filter((p) => p.alive).length;
const alive = (s: SHState) => s.players.filter((p) => p.alive);

function nextAliveIdx(s: SHState, from: number): number {
  let i = from;
  do i = (i + 1) % s.players.length;
  while (!s.players[i].alive);
  return i;
}

/** Whenever fewer than three tiles remain, the discards shuffle back in. */
function ensureDeck(s: SHState, rng: Rng) {
  if (s.deck.length >= 3) return;
  s.deck = shuffled([...s.deck, ...s.discard], rng);
  s.discard = [];
  log(s, "shuffle");
}

/** Lawful chancellor nominees under the current term limits. */
function eligibleChancellors(s: SHState): SHPlayerState[] {
  const pres = president(s);
  const bigTable = aliveCount(s) > 5;
  return s.players.filter(
    (p) =>
      p.alive &&
      p.id !== pres.id &&
      p.id !== s.lastChancellorId &&
      (!bigTable || p.id !== s.lastPresidentId)
  );
}

function finish(s: SHState, team: SHParty, winBy: SHWinBy) {
  s.phase = "over";
  s.deadline = null;
  s.votes = {}; // undelivered ballots are never revealed
  s.nomineeId = null;
  if (s.presidentHand) {
    s.discard.push(...s.presidentHand); // face-down — contents stay secret
    s.presidentHand = null;
  }
  if (s.chancellorHand) {
    s.discard.push(...s.chancellorHand);
    s.chancellorHand = null;
  }
  s.winner = team;
  s.winBy = winBy;
  s.winnerIds = s.players.filter((p) => !p.left && partyOf(p.role) === team).map((p) => p.id);
  log(s, "win", { detail: winBy });
}

function beginNomination(s: SHState, now: number) {
  s.phase = "nomination";
  s.nomineeId = null;
  s.chancellorId = null;
  s.vetoRefused = false;
  s.votes = {};
  s.deadline = now + NOMINATE_MS;
  log(s, "round", {
    actor: president(s).name,
    ...(s.specialFromIdx !== null && { detail: "special" }),
  });
}

function advancePresidency(s: SHState, now: number) {
  if (s.specialFromIdx !== null) {
    // rotation resumes from the seat after the original president
    s.presidentIdx = nextAliveIdx(s, s.specialFromIdx);
    s.specialFromIdx = null;
  } else {
    s.presidentIdx = nextAliveIdx(s, s.presidentIdx);
  }
  beginNomination(s, now);
}

function startElection(s: SHState, nominee: SHPlayerState, now: number) {
  s.nomineeId = nominee.id;
  s.phase = "election";
  s.votes = {};
  s.deadline = now + VOTE_MS;
  log(s, "nominate", { actor: president(s).name, target: nominee.name });
}

/** Place a policy on its track and resolve wins/powers. Chaos grants none. */
function enactPolicy(s: SHState, card: SHParty, chaos: boolean, now: number, rng: Rng) {
  const kind: SHLogKind = chaos ? "chaos" : "enact";
  if (card === "liberal") {
    s.liberalTrack += 1;
    log(s, kind, { detail: "liberal" });
    ensureDeck(s, rng);
    if (s.liberalTrack >= LIBERAL_SLOTS) {
      finish(s, "liberal", "policies");
      return;
    }
  } else {
    s.fascistTrack += 1;
    log(s, kind, { detail: "fascist" });
    ensureDeck(s, rng);
    if (s.fascistTrack >= FASCIST_SLOTS) {
      finish(s, "fascist", "policies");
      return;
    }
    if (!chaos) {
      const power = POWER_TRACK[s.players.length][s.fascistTrack - 1];
      if (power) {
        s.phase = `power_${power}`;
        s.deadline = now + (power === "peek" ? PEEK_MS : POWER_MS);
        log(s, "power", { actor: president(s).name, detail: power });
        return;
      }
    }
  }
  advancePresidency(s, now);
}

/** Third failed election: the top policy is enacted by an angry populace. */
function chaosPolicy(s: SHState, now: number, rng: Rng) {
  s.tracker = 0;
  s.lastPresidentId = null; // all term limits are forgotten
  s.lastChancellorId = null;
  const card = s.deck.shift()!; // deck ≥ 3 between sessions, always safe
  enactPolicy(s, card, true, now, rng);
}

function failedElection(s: SHState, now: number, rng: Rng) {
  s.nomineeId = null;
  s.tracker += 1;
  if (s.tracker >= 3) chaosPolicy(s, now, rng);
  else advancePresidency(s, now);
}

function resolveElection(s: SHState, now: number, rng: Rng) {
  const ja = Object.values(s.votes).filter(Boolean).length;
  const nein = Object.keys(s.votes).length - ja;
  const passed = ja > nein; // a tie fails
  s.elections.push({
    presidentId: president(s).id,
    chancellorId: s.nomineeId!,
    votes: { ...s.votes },
    ja,
    nein,
    passed,
    special: s.specialFromIdx !== null,
  });
  log(s, "ballots", { ja, nein, detail: passed ? "passed" : "failed" });
  s.votes = {};

  if (!passed) {
    failedElection(s, now, rng);
    return;
  }

  s.tracker = 0; // a seated government calms the streets
  s.chancellorId = s.nomineeId;
  s.nomineeId = null;
  s.lastPresidentId = president(s).id;
  s.lastChancellorId = s.chancellorId;

  const chancellor = s.players.find((p) => p.id === s.chancellorId)!;
  if (s.fascistTrack >= HITLER_ZONE && chancellor.role === "hitler") {
    finish(s, "fascist", "hitler_chancellor");
    return;
  }

  ensureDeck(s, rng); // invariant already holds; belt and braces
  s.presidentHand = s.deck.splice(0, 3);
  s.phase = "legislative_president";
  s.deadline = now + PRESIDENT_MS;
}

function presidentDiscards(s: SHState, index: number, now: number) {
  const [card] = s.presidentHand!.splice(index, 1);
  s.discard.push(card); // face-down, content never public
  s.chancellorHand = s.presidentHand;
  s.presidentHand = null;
  s.phase = "legislative_chancellor";
  s.deadline = now + CHANCELLOR_MS;
  log(s, "cards", { actor: president(s).name });
}

function chancellorEnacts(s: SHState, index: number, now: number, rng: Rng) {
  const hand = s.chancellorHand!;
  const [card] = hand.splice(index, 1);
  s.discard.push(...hand);
  s.chancellorHand = null;
  enactPolicy(s, card, false, now, rng);
}

function resolveVeto(s: SHState, agree: boolean, now: number, rng: Rng) {
  if (!agree) {
    s.vetoRefused = true; // the chancellor must now enact
    s.phase = "legislative_chancellor";
    s.deadline = now + CHANCELLOR_MS;
    log(s, "veto_refuse", { actor: president(s).name });
    return;
  }
  s.discard.push(...s.chancellorHand!);
  s.chancellorHand = null;
  log(s, "veto_agree", { actor: president(s).name });
  ensureDeck(s, rng);
  s.tracker += 1; // a veto counts as a failed election
  if (s.tracker >= 3) chaosPolicy(s, now, rng);
  else advancePresidency(s, now);
}

function investigate(s: SHState, target: SHPlayerState) {
  s.investigations.push({
    presidentId: president(s).id,
    targetId: target.id,
    party: partyOf(target.role),
  });
  log(s, "investigate", { actor: president(s).name, target: target.name });
}

function specialElection(s: SHState, target: SHPlayerState, now: number) {
  if (s.specialFromIdx === null) s.specialFromIdx = s.presidentIdx;
  log(s, "special", { actor: president(s).name, target: target.name });
  s.presidentIdx = s.players.findIndex((p) => p.id === target.id);
  beginNomination(s, now);
}

function execute(s: SHState, target: SHPlayerState, now: number) {
  target.alive = false;
  log(s, "execute", { actor: president(s).name, target: target.name });
  if (target.role === "hitler") {
    finish(s, "liberal", "hitler_executed");
    return;
  }
  advancePresidency(s, now);
}

/* -------------------------------- init --------------------------------- */

function roleDeck(count: number): SHRole[] {
  const deck: SHRole[] = ["hitler"];
  for (let i = 0; i < FASCIST_COUNTS[count]; i++) deck.push("fascist");
  while (deck.length < count) deck.push("liberal");
  return deck;
}

function init(players: GamePlayer[], now: number, rng: Rng): SHState {
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const roles = shuffled(roleDeck(seated.length), rng);
  const deck = shuffled<SHParty>(
    [
      ...Array.from({ length: LIBERAL_POLICIES }, (): SHParty => "liberal"),
      ...Array.from({ length: FASCIST_POLICIES }, (): SHParty => "fascist"),
    ],
    rng
  );
  const s: SHState = {
    players: seated.map((p, i) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      role: roles[i],
      alive: true,
      left: false,
    })),
    phase: "nomination",
    deadline: null,
    deck,
    discard: [],
    liberalTrack: 0,
    fascistTrack: 0,
    tracker: 0,
    presidentIdx: Math.floor(rng() * seated.length),
    nomineeId: null,
    chancellorId: null,
    votes: {},
    elections: [],
    lastPresidentId: null,
    lastChancellorId: null,
    presidentHand: null,
    chancellorHand: null,
    vetoRefused: false,
    specialFromIdx: null,
    investigations: [],
    winner: null,
    winnerIds: [],
    winBy: null,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  log(s, "start");
  beginNomination(s, now);
  return s;
}

/* ------------------------------ applyMove ------------------------------ */

function requireTarget(s: SHState, id: unknown): SHPlayerState {
  const target = typeof id === "string" ? s.players.find((p) => p.id === id) : undefined;
  return target ?? err("Choose a player at the table.");
}

function applyMove(s: SHState, playerId: string, move: SecretHitlerMove, now: number, rng: Rng): void {
  const player = s.players.find((p) => p.id === playerId) ?? err("You are not seated at this table.");
  if (player.left) return err("You have left this game.");
  if (s.phase === "over") return err("The game is over.");
  if (!player.alive) return err("The dead cast no votes in this republic.");
  if (!move || typeof move !== "object") return err("Malformed move.");

  switch (move.type) {
    case "nominate": {
      if (s.phase !== "nomination") return err("No chancellor is being nominated.");
      if (player.id !== president(s).id) return err("Only the President nominates.");
      const target = requireTarget(s, move.target);
      if (target.id === player.id) return err("You cannot nominate yourself.");
      if (!target.alive) return err("The dead cannot serve as Chancellor.");
      if (target.id === s.lastChancellorId) return err("Term-limited: they just held the chancellorship.");
      if (aliveCount(s) > 5 && target.id === s.lastPresidentId)
        return err("Term-limited: they just held the presidency.");
      s.updatedAt = now;
      startElection(s, target, now);
      return;
    }
    case "vote": {
      if (s.phase !== "election") return err("No election is underway.");
      if (typeof move.ja !== "boolean") return err("Malformed ballot.");
      if (hasOwn(s.votes, player.id)) return err("Your ballot is already in the box.");
      s.updatedAt = now;
      s.votes[player.id] = move.ja;
      if (Object.keys(s.votes).length === aliveCount(s)) resolveElection(s, now, rng);
      return;
    }
    case "discard": {
      if (s.phase !== "legislative_president") return err("There is no hand to discard from.");
      if (player.id !== president(s).id) return err("Only the President holds these policies.");
      const i = move.index;
      if (!Number.isInteger(i) || i < 0 || i >= (s.presidentHand?.length ?? 0))
        return err("Choose one of your three policies.");
      s.updatedAt = now;
      presidentDiscards(s, i, now);
      return;
    }
    case "enact": {
      if (s.phase !== "legislative_chancellor") return err("There is no policy to enact.");
      if (player.id !== s.chancellorId) return err("Only the Chancellor enacts.");
      const i = move.index;
      if (!Number.isInteger(i) || i < 0 || i >= (s.chancellorHand?.length ?? 0))
        return err("Choose one of your two policies.");
      s.updatedAt = now;
      chancellorEnacts(s, i, now, rng);
      return;
    }
    case "veto": {
      if (s.phase !== "legislative_chancellor") return err("There is no session to veto.");
      if (player.id !== s.chancellorId) return err("Only the Chancellor may move to veto.");
      if (s.fascistTrack < VETO_UNLOCK) return err("The veto power is not yet unlocked.");
      if (s.vetoRefused) return err("The President already refused — you must enact.");
      s.updatedAt = now;
      s.phase = "veto_consent";
      s.deadline = now + VETO_MS;
      log(s, "veto", { actor: player.name });
      return;
    }
    case "veto_consent": {
      if (s.phase !== "veto_consent") return err("No veto is on the table.");
      if (player.id !== president(s).id) return err("Only the President rules on a veto.");
      if (typeof move.agree !== "boolean") return err("Malformed consent.");
      s.updatedAt = now;
      resolveVeto(s, move.agree, now, rng);
      return;
    }
    case "peek_done": {
      if (s.phase !== "power_peek") return err("There is nothing to acknowledge.");
      if (player.id !== president(s).id) return err("Only the President may peek.");
      s.updatedAt = now;
      log(s, "peeked", { actor: player.name });
      advancePresidency(s, now);
      return;
    }
    case "investigate": {
      if (s.phase !== "power_investigate") return err("No investigation is authorized.");
      if (player.id !== president(s).id) return err("Only the President investigates.");
      const target = requireTarget(s, move.target);
      if (target.id === player.id) return err("You cannot investigate yourself.");
      if (!target.alive) return err("The dead keep no party card.");
      if (s.investigations.some((x) => x.targetId === target.id))
        return err("They have already been investigated.");
      s.updatedAt = now;
      investigate(s, target);
      advancePresidency(s, now);
      return;
    }
    case "special_election": {
      if (s.phase !== "power_special") return err("No special election is authorized.");
      if (player.id !== president(s).id) return err("Only the President appoints a candidate.");
      const target = requireTarget(s, move.target);
      if (target.id === player.id) return err("You cannot appoint yourself.");
      if (!target.alive) return err("The dead cannot run for office.");
      s.updatedAt = now;
      specialElection(s, target, now);
      return;
    }
    case "execute": {
      if (s.phase !== "power_execute") return err("No execution is authorized.");
      if (player.id !== president(s).id) return err("Only the President executes.");
      const target = requireTarget(s, move.target);
      if (target.id === player.id) return err("You cannot execute yourself.");
      if (!target.alive) return err("They are already dead.");
      s.updatedAt = now;
      execute(s, target, now);
      return;
    }
    default:
      return err("Unknown move.");
  }
}

/* --------------------------------- tick -------------------------------- */

const pickFrom = <T,>(rng: Rng, items: T[]): T => items[Math.floor(rng() * items.length)];

function tick(s: SHState, now: number, rng: Rng): boolean {
  if (s.phase === "over" || s.deadline === null || now < s.deadline) return false;
  s.updatedAt = now;

  switch (s.phase) {
    case "nomination": {
      // ≥1 nominee always exists: ≥3 alive, and only two seats can be limited
      const nominee = pickFrom(rng, eligibleChancellors(s));
      log(s, "timeout", { detail: "nominate", actor: president(s).name });
      startElection(s, nominee, now);
      break;
    }
    case "election": {
      const missing = alive(s).filter((p) => !hasOwn(s.votes, p.id));
      if (missing.length) log(s, "timeout", { detail: "vote", nein: missing.length });
      for (const p of missing) s.votes[p.id] = false; // silence refuses
      resolveElection(s, now, rng);
      break;
    }
    case "legislative_president":
      log(s, "timeout", { detail: "discard", actor: president(s).name });
      presidentDiscards(s, Math.floor(rng() * s.presidentHand!.length), now);
      break;
    case "legislative_chancellor":
      log(s, "timeout", { detail: "enact" });
      chancellorEnacts(s, Math.floor(rng() * s.chancellorHand!.length), now, rng);
      break;
    case "veto_consent":
      log(s, "timeout", { detail: "veto" });
      resolveVeto(s, false, now, rng); // silence refuses the veto
      break;
    case "power_peek":
      log(s, "timeout", { detail: "peek" });
      log(s, "peeked", { actor: president(s).name });
      advancePresidency(s, now);
      break;
    case "power_investigate": {
      const options = s.players.filter(
        (p) =>
          p.alive && p.id !== president(s).id && !s.investigations.some((x) => x.targetId === p.id)
      );
      log(s, "timeout", { detail: "investigate" });
      if (options.length) investigate(s, pickFrom(rng, options));
      advancePresidency(s, now);
      break;
    }
    case "power_special": {
      const options = s.players.filter((p) => p.alive && p.id !== president(s).id);
      log(s, "timeout", { detail: "special" });
      specialElection(s, pickFrom(rng, options), now);
      break;
    }
    case "power_execute": {
      const options = s.players.filter((p) => p.alive && p.id !== president(s).id);
      log(s, "timeout", { detail: "execute" });
      execute(s, pickFrom(rng, options), now);
      break;
    }
  }
  return true;
}

/* ------------------------------- forfeit ------------------------------- */

function forfeit(s: SHState, playerId: string, now: number): void {
  const p = s.players.find((x) => x.id === playerId);
  if (!p || p.left || s.phase === "over") return;
  s.updatedAt = now;
  p.left = true;
  log(s, "left", { actor: p.name });
  // A missing seat breaks the role balance, so a rage-quit concedes the game.
  finish(s, partyOf(p.role) === "liberal" ? "fascist" : "liberal", "forfeit");
}

/* -------------------------------- redact ------------------------------- */

function knowledgeFor(s: SHState, me: SHPlayerState): SHKnowledge | undefined {
  if (partyOf(me.role) !== "fascist") return undefined;
  if (me.role === "hitler" && s.players.length > 6) return undefined; // Hitler flies blind at 7–8
  return {
    fascistIds: s.players.filter((p) => partyOf(p.role) === "fascist").map((p) => p.id),
    hitlerId: s.players.find((p) => p.role === "hitler")!.id,
  };
}

function redact(s: SHState, viewerId: string, now: number): SecretHitlerView {
  const me = s.players.find((p) => p.id === viewerId);
  const over = s.phase === "over";
  const pres = president(s);
  const isPresident = !!me && me.id === pres.id;
  const isChancellor = !!me && me.id === s.chancellorId;
  const knowledge = me ? knowledgeFor(s, me) : undefined;
  const yourInvestigations = me
    ? s.investigations
        .filter((x) => x.presidentId === me.id)
        .map((x) => ({ targetId: x.targetId, party: x.party }))
    : [];

  return {
    phase: s.phase,
    youId: viewerId,
    now,
    deadline: s.deadline,
    players: s.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, alive: p.alive, left: p.left })),
    aliveCount: aliveCount(s),
    liberalTrack: s.liberalTrack,
    fascistTrack: s.fascistTrack,
    tracker: s.tracker,
    deckCount: s.deck.length,
    discardCount: s.discard.length,
    powers: [...POWER_TRACK[s.players.length]],
    presidentId: pres.id,
    nomineeId: s.nomineeId,
    chancellorId: s.chancellorId,
    lastPresidentId: s.lastPresidentId,
    lastChancellorId: s.lastChancellorId,
    eligibleIds: s.phase === "nomination" ? eligibleChancellors(s).map((p) => p.id) : [],
    votedIds: Object.keys(s.votes),
    elections: s.elections.map((e) => ({ ...e, votes: { ...e.votes } })),
    investigated: s.investigations.map((x) => ({ presidentId: x.presidentId, targetId: x.targetId })),
    vetoUnlocked: s.fascistTrack >= VETO_UNLOCK,
    vetoRefused: s.vetoRefused,
    specialRound: s.specialFromIdx !== null,
    winner: s.winner,
    winnerIds: [...s.winnerIds],
    winBy: s.winBy,
    reveal: over ? s.players.map((p) => ({ id: p.id, role: p.role, party: partyOf(p.role) })) : null,
    log: s.log.slice(-VIEW_LOG).map((entry) => ({ ...entry })),
    // private, entitlement-gated fields — dead players keep their own card
    ...(me && { yourRole: me.role, yourParty: partyOf(me.role) }),
    ...(knowledge && { knowledge }),
    ...(me && hasOwn(s.votes, me.id) && { yourVote: s.votes[me.id] }),
    ...(isPresident &&
      s.phase === "legislative_president" &&
      s.presidentHand && { presidentHand: [...s.presidentHand] }),
    ...(isChancellor &&
      (s.phase === "legislative_chancellor" || s.phase === "veto_consent") &&
      s.chancellorHand && { chancellorHand: [...s.chancellorHand] }),
    ...(isPresident && s.phase === "power_peek" && { peek: s.deck.slice(0, 3) }),
    ...(yourInvestigations.length > 0 && { yourInvestigations }),
  };
}

/* -------------------------------- module ------------------------------- */

function result(s: SHState): { winnerId: string; winnerIds: string[] } | null {
  if (s.phase !== "over" || !s.winner || s.winnerIds.length === 0) return null;
  return { winnerId: s.winnerIds[0], winnerIds: [...s.winnerIds] };
}

export const secrethitlerModule: GameModule<SHState, SecretHitlerView, SecretHitlerMove> = {
  type: "secrethitler",
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
