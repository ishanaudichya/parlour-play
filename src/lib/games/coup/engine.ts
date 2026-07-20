import { MoveError, type GameModule, type GamePlayer } from "@/lib/games/types";
import {
  ACT_MS,
  ACTION_BLOCKERS,
  ACTION_CLAIM,
  CHARACTERS,
  CHOOSE_MS,
  COIN_CAP,
  type ActionType,
  type CardT,
  type Character,
  type CoupPlayer,
  type CoupState,
  type CoupView,
  type LogEntry,
  type LogKind,
  LOG_CAP,
  type Resume,
  RESPONSE_MS,
} from "./types";

export type Rng = () => number;

export type CoupMove =
  | { move: "action"; action: ActionType; target?: string }
  | { move: "respond"; response: "pass" | "challenge" | "block"; character?: Character }
  | { move: "lose"; cardId: string }
  | { move: "exchange"; keep: string[] };

const err = (msg: string): never => {
  throw new MoveError(msg);
};

// ---------- helpers ----------

export const isAlive = (p: CoupPlayer) => p.cards.length > 0 && p.cards.some((c) => !c.revealed);

const player = (s: CoupState, id: string) => s.players.find((p) => p.id === id);

const alivePlayers = (s: CoupState) => s.players.filter(isAlive);

/** House rule: the treasury lends no one more than COIN_CAP coins. */
const gain = (p: CoupPlayer, n: number) => {
  const take = Math.min(n, COIN_CAP - p.coins);
  p.coins += Math.max(0, take);
  return Math.max(0, take);
};

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function log(s: CoupState, kind: LogKind, e: Partial<LogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

function drawCard(s: CoupState): CardT {
  const ch = s.deck.pop();
  if (!ch) throw new Error("deck empty"); // cannot happen: deck ≥ 3 with ≤ 6 players
  return { id: `c${++s.cardSeq}`, ch, revealed: false };
}

/** Players expected to respond in the current window, excluding those who passed. */
export function responders(s: CoupState): string[] {
  const p = s.pending;
  if (!p) return [];
  let eligible: string[];
  if (p.stage === "action_window") {
    eligible = alivePlayers(s).filter((x) => x.id !== p.actor).map((x) => x.id);
  } else if (p.stage === "block_window") {
    if (p.type === "foreign_aid") {
      eligible = alivePlayers(s).filter((x) => x.id !== p.actor).map((x) => x.id);
    } else {
      const t = p.target ? player(s, p.target) : undefined;
      eligible = t && isAlive(t) ? [t.id] : [];
    }
  } else if (p.stage === "block_challenge_window") {
    eligible = alivePlayers(s).filter((x) => x.id !== p.block!.blocker).map((x) => x.id);
  } else {
    eligible = [];
  }
  return eligible.filter((id) => !p.passed.includes(id));
}

// ---------- lifecycle ----------

export function initCoup(players: GamePlayer[], now: number, rng: Rng): CoupState {
  const s: CoupState = {
    phase: "play",
    players: players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, coins: 2, cards: [] })),
    deck: shuffle(
      CHARACTERS.flatMap((ch) => [ch, ch, ch] as Character[]),
      rng
    ),
    turnPlayer: "",
    pending: null,
    lose: null,
    winner: null,
    log: [],
    logSeq: 0,
    cardSeq: 0,
    updatedAt: now,
  };
  for (const p of s.players) {
    p.cards = [drawCard(s), drawCard(s)];
  }
  const starter = s.players[Math.floor(rng() * s.players.length)];
  s.turnPlayer = starter.id;
  s.actDeadline = now + CHOOSE_MS;
  log(s, "start", { actor: starter.name });
  return s;
}

// ---------- turn / resolution machinery ----------

function endTurn(s: CoupState) {
  const actorId = s.pending?.actor ?? s.turnPlayer;
  s.pending = null;
  s.lose = null;
  s.actDeadline = s.updatedAt + CHOOSE_MS;
  const actor = player(s, actorId)!;
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const next = s.players[(actor.seat + i) % n];
    if (isAlive(next)) {
      s.turnPlayer = next.id;
      return;
    }
  }
}

function checkWin(s: CoupState): boolean {
  if (s.phase !== "play") return false;
  const alive = alivePlayers(s);
  if (alive.length === 1) {
    const w = alive[0];
    s.phase = "over";
    s.winner = w.id;
    // a game can end mid-exchange (forfeit) — the drawn cards return to the deck
    if (s.pending?.exchangeDrawn) s.deck.push(...s.pending.exchangeDrawn.map((c) => c.ch));
    s.pending = null;
    s.lose = null;
    s.actDeadline = undefined;
    log(s, "win", { actor: w.name });
    return true;
  }
  return false;
}

/**
 * Require `playerId` to surrender an influence, then continue with `resume`.
 * If they hold a single unrevealed card it is flipped automatically.
 */
function setLose(s: CoupState, playerId: string, resume: Resume) {
  const p = player(s, playerId)!;
  const unrevealed = p.cards.filter((c) => !c.revealed);
  if (unrevealed.length === 0) {
    applyResume(s, resume);
    return;
  }
  if (s.pending) s.pending.deadline = undefined;
  if (unrevealed.length === 1) {
    performLose(s, playerId, unrevealed[0].id, resume);
  } else {
    s.lose = { player: playerId, resume };
    s.actDeadline = s.updatedAt + ACT_MS;
  }
}

function performLose(s: CoupState, playerId: string, cardId: string, resume: Resume) {
  const p = player(s, playerId)!;
  const card = p.cards.find((c) => c.id === cardId && !c.revealed)!;
  card.revealed = true;
  s.lose = null;
  s.actDeadline = undefined;
  log(s, "lose_influence", { actor: p.name, ch: card.ch });
  if (!isAlive(p)) {
    log(s, "eliminated", { actor: p.name });
  }
  if (checkWin(s)) return;
  applyResume(s, resume);
}

/** The block stood — action fizzles. Blocked foreign aid pays out income instead. */
function actionBlocked(s: CoupState) {
  log(s, "action_blocked");
  const p = s.pending;
  if (p?.type === "foreign_aid") {
    const actor = player(s, p.actor);
    if (actor && isAlive(actor) && gain(actor, 1) > 0) {
      log(s, "consolation", { actor: actor.name });
    }
  }
  endTurn(s);
}

function applyResume(s: CoupState, resume: Resume) {
  switch (resume) {
    case "end":
    case "cancel":
      endTurn(s);
      return;
    case "blocked":
      actionBlocked(s);
      return;
    case "resolve":
      resolveAction(s);
      return;
    case "proceed":
      afterActionWindow(s);
      return;
  }
}

/** The action's claim survived (all passed, or a challenge failed): move it forward. */
function afterActionWindow(s: CoupState) {
  const p = s.pending!;
  const actor = player(s, p.actor)!;
  switch (p.type) {
    case "tax":
      gain(actor, 3);
      log(s, "tax_resolved", { actor: actor.name });
      endTurn(s);
      return;
    case "exchange": {
      p.exchangeDrawn = [drawCard(s), drawCard(s)];
      p.stage = "exchange";
      p.passed = [];
      p.deadline = undefined;
      s.actDeadline = s.updatedAt + ACT_MS;
      return;
    }
    case "steal":
    case "assassinate": {
      const t = player(s, p.target!);
      if (!t || !isAlive(t)) {
        endTurn(s);
        return;
      }
      p.stage = "block_window";
      p.passed = [];
      p.deadline = s.updatedAt + RESPONSE_MS;
      return;
    }
    default:
      endTurn(s);
  }
}

/** The action goes through unblocked (or its block was exposed as a bluff). */
function resolveAction(s: CoupState) {
  const p = s.pending!;
  const actor = player(s, p.actor)!;
  switch (p.type) {
    case "foreign_aid":
      gain(actor, 2);
      log(s, "foreign_aid_resolved", { actor: actor.name });
      endTurn(s);
      return;
    case "steal": {
      const t = player(s, p.target!);
      if (t && isAlive(t)) {
        // you can only take what you can hold (COIN_CAP house rule)
        const n = Math.min(2, t.coins, COIN_CAP - actor.coins);
        t.coins -= n;
        actor.coins += n;
        log(s, "steal_resolved", { actor: actor.name, target: t.name, n });
      }
      endTurn(s);
      return;
    }
    case "assassinate": {
      const t = player(s, p.target!);
      if (t && isAlive(t)) {
        log(s, "assassinate_hit", { actor: actor.name, target: t.name });
        setLose(s, t.id, "end");
      } else {
        endTurn(s);
      }
      return;
    }
    default:
      endTurn(s);
  }
}

/** All required responders passed the current window. */
function windowComplete(s: CoupState) {
  const p = s.pending!;
  if (p.stage === "action_window") {
    afterActionWindow(s);
  } else if (p.stage === "block_window") {
    resolveAction(s);
  } else if (p.stage === "block_challenge_window") {
    actionBlocked(s);
  }
}

function maybeComplete(s: CoupState) {
  if (s.pending && !s.lose && responders(s).length === 0) windowComplete(s);
}

function resolveChallenge(s: CoupState, challengerId: string, rng: Rng) {
  const p = s.pending!;
  const challenger = player(s, challengerId)!;
  const onBlock = p.stage === "block_challenge_window";
  const claimantId = onBlock ? p.block!.blocker : p.actor;
  const claim = onBlock ? p.block!.claim : p.claim!;
  const claimant = player(s, claimantId)!;
  log(s, "challenge", { actor: challenger.name, target: claimant.name, ch: claim });

  const held = claimant.cards.find((c) => !c.revealed && c.ch === claim);
  if (held) {
    // claim proven: card is shuffled back, a replacement drawn, challenger pays
    log(s, "challenge_failed", { actor: claimant.name, target: challenger.name, ch: claim });
    claimant.cards = claimant.cards.filter((c) => c.id !== held.id);
    s.deck.push(held.ch);
    shuffle(s.deck, rng);
    claimant.cards.push(drawCard(s));
    setLose(s, challengerId, onBlock ? "blocked" : "proceed");
  } else {
    // caught bluffing
    log(s, "challenge_success", { actor: challenger.name, target: claimant.name, ch: claim });
    setLose(s, claimantId, onBlock ? "resolve" : "cancel");
  }
}

// ---------- moves ----------

const ACTION_LOG: Record<ActionType, LogKind> = {
  income: "income",
  foreign_aid: "foreign_aid",
  coup: "coup",
  tax: "tax",
  assassinate: "assassinate",
  steal: "steal",
  exchange: "exchange",
};

function submitAction(s: CoupState, actor: CoupPlayer, action: ActionType, targetId?: string) {
  if (s.turnPlayer !== actor.id) err("It's not your turn.");
  if (actor.coins >= 10 && action !== "coup") err("With 10+ coins you must launch a coup.");

  let target: CoupPlayer | undefined;
  if (action === "coup" || action === "assassinate" || action === "steal") {
    if (!targetId) err("Choose a target.");
    target = player(s, targetId!);
    if (!target || !isAlive(target)) err("Invalid target.");
    if (target!.id === actor.id) err("You cannot target yourself.");
  }

  s.actDeadline = undefined;

  switch (action) {
    case "income":
      gain(actor, 1);
      log(s, "income", { actor: actor.name });
      endTurn(s);
      return;
    case "coup":
      if (actor.coins < 7) err("A coup costs 7 coins.");
      actor.coins -= 7;
      log(s, "coup", { actor: actor.name, target: target!.name });
      s.pending = { type: "coup", actor: actor.id, target: target!.id, stage: "block_window", passed: [] };
      setLose(s, target!.id, "end");
      return;
    case "foreign_aid":
      log(s, "foreign_aid", { actor: actor.name });
      s.pending = {
        type: "foreign_aid",
        actor: actor.id,
        stage: "block_window",
        passed: [],
        deadline: s.updatedAt + RESPONSE_MS,
      };
      maybeComplete(s);
      return;
    case "assassinate":
      if (actor.coins < 3) err("Assassination costs 3 coins.");
      actor.coins -= 3; // paid on declaration, never refunded
      break;
    default:
      break;
  }

  // claimed actions: tax / assassinate / steal / exchange
  log(s, ACTION_LOG[action], { actor: actor.name, target: target?.name, ch: ACTION_CLAIM[action] });
  s.pending = {
    type: action,
    actor: actor.id,
    target: target?.id,
    claim: ACTION_CLAIM[action],
    stage: "action_window",
    passed: [],
    deadline: s.updatedAt + RESPONSE_MS,
  };
  maybeComplete(s);
}

function submitResponse(
  s: CoupState,
  p: CoupPlayer,
  response: "pass" | "challenge" | "block",
  character: Character | undefined,
  rng: Rng
) {
  const pend = s.pending;
  if (!pend) return err("Nothing to respond to.");
  if (s.lose) err("Waiting for an influence to be surrendered.");
  if (!responders(s).includes(p.id)) err("No response needed from you.");

  if (response === "pass") {
    pend.passed.push(p.id);
    maybeComplete(s);
    return;
  }

  if (response === "challenge") {
    if (pend.stage === "block_challenge_window" || (pend.stage === "action_window" && pend.claim)) {
      resolveChallenge(s, p.id, rng);
      return;
    }
    err("That can't be challenged.");
  }

  // block
  if (pend.stage !== "block_window") err("That can't be blocked right now.");
  const allowed = ACTION_BLOCKERS[pend.type] ?? [];
  if (!character || !allowed.includes(character)) err("Invalid blocking character.");
  pend.block = { blocker: p.id, claim: character! };
  pend.stage = "block_challenge_window";
  pend.passed = [];
  pend.deadline = s.updatedAt + RESPONSE_MS;
  log(s, "block", { actor: p.name, target: player(s, pend.actor)!.name, ch: character });
  maybeComplete(s);
}

function submitExchange(s: CoupState, p: CoupPlayer, keep: string[], rng: Rng) {
  const pend = s.pending;
  if (!pend || pend.stage !== "exchange" || pend.actor !== p.id || !pend.exchangeDrawn)
    return err("No exchange in progress.");
  if (s.lose) err("Waiting for an influence to be surrendered.");
  const hand = p.cards.filter((c) => !c.revealed);
  const pool = [...hand, ...pend.exchangeDrawn];
  const need = hand.length;
  const unique = new Set(keep);
  if (keep.length !== need || unique.size !== need) err(`Keep exactly ${need} card${need > 1 ? "s" : ""}.`);
  const chosen = keep.map((id) => pool.find((c) => c.id === id) ?? (err("Invalid card selection.") as never));
  const returned = pool.filter((c) => !unique.has(c.id));
  p.cards = [...p.cards.filter((c) => c.revealed), ...chosen];
  s.deck.push(...returned.map((c) => c.ch));
  // deck is shuffled so returned cards can't be tracked
  shuffle(s.deck, rng);
  log(s, "exchange_done", { actor: p.name });
  endTurn(s);
}

export function applyCoupMove(s: CoupState, playerId: string, move: CoupMove, now: number, rng: Rng): void {
  s.updatedAt = now;
  const p = player(s, playerId) ?? (err("You are not in this game.") as never);
  if (s.phase !== "play") err("The game is over.");

  switch (move.move) {
    case "action": {
      if (s.pending || s.lose) err("An action is already in progress.");
      if (!isAlive(p)) err("You have been eliminated.");
      submitAction(s, p, move.action, move.target);
      return;
    }
    case "respond": {
      if (!isAlive(p)) err("You have been eliminated.");
      submitResponse(s, p, move.response, move.character, rng);
      return;
    }
    case "lose": {
      if (!s.lose) return err("No influence to surrender.");
      if (s.lose.player !== playerId) err("It isn't you who must surrender.");
      const card = p.cards.find((c) => c.id === move.cardId && !c.revealed);
      if (!card) err("Invalid card.");
      performLose(s, playerId, move.cardId, s.lose.resume);
      return;
    }
    case "exchange": {
      submitExchange(s, p, move.keep, rng);
      return;
    }
    default:
      err("Unknown move.");
  }
}

/** Advance expired timers (response windows AND required acts). Returns true if changed. */
export function tickCoup(s: CoupState, now: number, rng: Rng): boolean {
  if (s.phase !== "play") return false;

  // 1. someone dawdling over which influence to surrender → flip their first card
  if (s.lose) {
    if (!s.actDeadline || now < s.actDeadline) return false;
    s.updatedAt = now;
    log(s, "timeout");
    const p = player(s, s.lose.player)!;
    const card = p.cards.find((c) => !c.revealed)!;
    performLose(s, s.lose.player, card.id, s.lose.resume);
    return true;
  }

  // 2. exchange never finished → keep the original hand
  if (s.pending?.stage === "exchange") {
    if (!s.actDeadline || now < s.actDeadline) return false;
    s.updatedAt = now;
    log(s, "timeout");
    const actor = player(s, s.pending.actor)!;
    const keep = actor.cards.filter((c) => !c.revealed).map((c) => c.id);
    submitExchange(s, actor, keep, rng);
    return true;
  }

  // 3. reaction window expired → everyone remaining allows it
  if (s.pending) {
    const d = s.pending.deadline;
    if (!d || now < d) return false;
    s.updatedAt = now;
    log(s, "timeout");
    s.pending.passed.push(...responders(s));
    windowComplete(s);
    return true;
  }

  // 4. player never chose an action → income (forced coup at the cap)
  if (s.actDeadline && now >= s.actDeadline) {
    s.updatedAt = now;
    log(s, "timeout");
    const actor = player(s, s.turnPlayer)!;
    if (actor.coins >= 10) {
      const targets = alivePlayers(s).filter((p) => p.id !== actor.id);
      const target = targets[Math.floor(rng() * targets.length)];
      submitAction(s, actor, "coup", target.id);
    } else {
      submitAction(s, actor, "income");
    }
    return true;
  }
  return false;
}

/** A player left the party mid-game: eliminate them and keep the game moving. */
export function forfeitCoup(s: CoupState, playerId: string, now: number, rng: Rng): void {
  if (s.phase !== "play") return;
  const p = player(s, playerId);
  if (!p || !isAlive(p)) return;
  s.updatedAt = now;
  log(s, "left", { actor: p.name });

  // mid-exchange: their drawn cards go back to the deck
  if (s.pending?.actor === playerId && s.pending.exchangeDrawn) {
    s.deck.push(...s.pending.exchangeDrawn.map((c) => c.ch));
    shuffle(s.deck, rng);
    s.pending.exchangeDrawn = undefined;
  }

  for (const c of p.cards) c.revealed = true;

  // their own pending influence-loss simply continues the action
  let resume: Resume | null = null;
  if (s.lose?.player === playerId) {
    resume = s.lose.resume;
    s.lose = null;
    s.actDeadline = undefined;
  }
  if (checkWin(s)) return;
  if (resume) {
    applyResume(s, resume);
    return;
  }

  const pend = s.pending;
  if (pend) {
    if (pend.actor === playerId) {
      if (s.lose) {
        // someone else still owes an influence for challenging them — they
        // surrender it, then the (now ownerless) action is simply cancelled
        s.lose = { player: s.lose.player, resume: "cancel" };
      } else {
        s.pending = null;
        endTurn(s);
      }
    } else if (pend.block?.blocker === playerId) {
      // the blocker walked out — the block dies and the action resolves
      resolveAction(s);
    } else {
      maybeComplete(s);
    }
  } else if (s.turnPlayer === playerId) {
    endTurn(s);
  }
}

// ---------- redaction ----------

export function redactCoup(s: CoupState, viewerId: string, now: number): CoupView {
  return {
    phase: s.phase,
    youId: viewerId,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      coins: p.coins,
      alive: isAlive(p),
      cards: p.cards.map((c) =>
        c.revealed || p.id === viewerId
          ? { id: c.id, ch: c.ch, revealed: c.revealed }
          : { id: c.id, revealed: false }
      ),
    })),
    deckCount: s.deck.length,
    turn: s.turnPlayer,
    pending: s.pending
      ? {
          type: s.pending.type,
          actor: s.pending.actor,
          target: s.pending.target,
          claim: s.pending.claim,
          stage: s.pending.stage,
          passed: s.pending.passed,
          block: s.pending.block,
          deadline: s.pending.deadline,
          exchangeDrawn:
            s.pending.actor === viewerId && s.pending.exchangeDrawn
              ? s.pending.exchangeDrawn.map((c) => ({ id: c.id, ch: c.ch, revealed: false }))
              : undefined,
        }
      : null,
    lose: s.lose ? { player: s.lose.player } : null,
    actDeadline: s.actDeadline,
    winner: s.winner,
    log: s.log.slice(-60),
    now,
  };
}

// ---------- module ----------

export const coupModule: GameModule<CoupState, CoupView, CoupMove> = {
  type: "coup",
  minPlayers: 2,
  maxPlayers: 6,
  init: initCoup,
  applyMove: applyCoupMove,
  tick: tickCoup,
  redact: redactCoup,
  result: (s) => (s.phase === "over" && s.winner ? { winnerId: s.winner } : null),
  forfeit: forfeitCoup,
};
