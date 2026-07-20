/* Teen Patti engine — one module instance is one SESSION of many hands.

   Rule simplifications (deliberate, documented):
   - ALL-IN: if the required bet exceeds your chips you push all remaining
     chips instead; you stop acting but stay in for the showdown of the WHOLE
     pot (no side pots). A partial all-in does not change the stake.
   - When betting can no longer continue — all, or all but one, of the
     unfolded players are all-in — the hand goes straight to a full showdown
     (this is never worse for the lone remaining actor: showdown costs them
     nothing extra).
   - Multi-way showdown ties: the tied player closest to the dealer's left
     wins. Head-to-head "show" ties: the player who ASKED for the show loses.
   - "see" is allowed at any time while you are unfolded in the hand (even
     all-in), not only on your own turn. It never advances the turn.
   - Session end: only one player can post the boot → they win; hard cap of
     HAND_CAP hands → richest player wins (ties go to the lowest seat).
   - Leaving (forfeit): a departing player is folded on the spot (their bets
     stay in the pot), their remaining chips leave the table (tracked in
     departedChips so conservation stays checkable), and they are never dealt
     in again. If that leaves at most one player able to post the boot once
     the hand is settled, the session ends immediately. */

import { MoveError, type GameModule, type GamePlayer } from "../types";
import { compareHands, rankLabel } from "./ranking";
import {
  BOOT,
  HAND_CAP,
  HAND_OVER_MS,
  LOG_CAP,
  START_CHIPS,
  TURN_MS,
  type Card,
  type CardRank,
  type RevealedHand,
  type Suit,
  type TeenPattiMove,
  type TeenPattiState,
  type TeenPattiView,
  type TPLogEntry,
  type TPLogKind,
  type TPPlayer,
} from "./types";

export type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

function log(s: TeenPattiState, kind: TPLogKind, e: Partial<TPLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

/* ---------------- deck ---------------- */

const SUITS: Suit[] = ["S", "H", "D", "C"];

function freshDeck(rng: Rng): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push({ r: r as CardRank, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/* ---------------- selectors ---------------- */

/** Players still contesting the current hand. */
export const unfolded = (s: TeenPattiState): TPPlayer[] =>
  s.players.filter((p) => p.inHand && !p.folded);

/** Turn-order distance from the dealer's left. */
const relOrder = (s: TeenPattiState, p: TPPlayer): number => {
  const n = s.players.length;
  return (p.seat - s.dealerSeat - 1 + n) % n;
};

function nextActor(s: TeenPattiState, fromSeat: number): TPPlayer | null {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const p = s.players[(fromSeat + k) % n];
    if (p.inHand && !p.folded && !p.allIn) return p;
  }
  return null;
}

/* ---------------- hand resolution ---------------- */

function endHand(
  s: TeenPattiState,
  winner: TPPlayer,
  reason: "fold" | "show" | "showdown",
  revealed: RevealedHand[],
  now: number
) {
  const amount = s.pot;
  winner.chips += amount;
  s.pot = 0;
  s.lastHand = {
    handNo: s.handNo,
    winnerId: winner.id,
    winnerName: winner.name,
    amount,
    reason,
    revealed,
  };
  s.phase = "hand_over";
  s.turn = null;
  s.deadline = now + HAND_OVER_MS;
  log(s, "win_hand", { actor: winner.name, amount });
}

function reveal(contenders: TPPlayer[]): RevealedHand[] {
  return contenders.map((c) => ({
    id: c.id,
    name: c.name,
    cards: c.cards.map((x) => ({ ...x })),
    label: rankLabel(c.cards),
  }));
}

/** Full showdown among the unfolded players; best hand takes the whole pot. */
function showdown(s: TeenPattiState, contenders: TPPlayer[], now: number) {
  const ordered = [...contenders].sort((a, b) => relOrder(s, a) - relOrder(s, b));
  let best = ordered[0];
  for (const c of ordered) {
    if (c !== best && compareHands(c.cards, best.cards) > 0) best = c;
  }
  log(s, "showdown", {
    detail: ordered.map((c) => `${c.name}: ${rankLabel(c.cards)}`).join(" · "),
  });
  endHand(s, best, "showdown", reveal(ordered), now);
}

/** After any turn-consuming action from `fromSeat`: settle or pass the turn. */
function advance(s: TeenPattiState, fromSeat: number, now: number) {
  const alive = unfolded(s);
  if (alive.length === 1) {
    endHand(s, alive[0], "fold", [], now); // last player standing, unrevealed
    return;
  }
  const canAct = alive.filter((p) => !p.allIn);
  if (canAct.length <= 1) {
    showdown(s, alive, now); // betting cannot continue
    return;
  }
  const nxt = nextActor(s, fromSeat)!;
  s.turn = nxt.id;
  s.deadline = now + TURN_MS;
}

/* ---------------- hand / session lifecycle ---------------- */

function richest(s: TeenPattiState): TPPlayer {
  const pool = s.players.filter((p) => !p.left);
  let best = (pool.length ? pool : s.players)[0];
  for (const p of pool) if (p.chips > best.chips) best = p; // ties → lowest seat
  return best;
}

function endSession(s: TeenPattiState, winner: TPPlayer) {
  s.phase = "session_over";
  s.winnerId = winner.id;
  s.turn = null;
  s.deadline = null;
  log(s, "session_over", { actor: winner.name, amount: winner.chips });
}

function startNextHand(s: TeenPattiState, now: number, rng: Rng) {
  s.updatedAt = now;
  for (const p of s.players) {
    if (!p.busted && !p.left && p.chips < BOOT) {
      p.busted = true;
      p.inHand = false;
      p.cards = [];
      log(s, "bust", { actor: p.name });
    }
  }
  const eligible = s.players.filter((p) => !p.busted && !p.left);
  if (s.handNo >= HAND_CAP || eligible.length <= 1) {
    const winner = eligible.length === 1 ? eligible[0] : richest(s);
    endSession(s, winner);
    return;
  }

  s.handNo += 1;
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const p = s.players[(s.dealerSeat + k) % n];
    if (!p.busted && !p.left) {
      s.dealerSeat = p.seat;
      break;
    }
  }
  const deck = freshDeck(rng);
  s.pot = 0;
  s.stake = BOOT;
  for (const p of s.players) {
    p.folded = false;
    p.seen = false;
    p.allIn = false;
    p.betThisHand = 0;
    if (p.busted || p.left) {
      p.inHand = false;
      p.cards = [];
      continue;
    }
    p.inHand = true;
    p.cards = [deck.pop()!, deck.pop()!, deck.pop()!];
    p.chips -= BOOT;
    p.betThisHand = BOOT;
    s.pot += BOOT;
    if (p.chips === 0) p.allIn = true; // boot took their last chips
  }
  log(s, "next_hand", { hand: s.handNo, actor: s.players[s.dealerSeat].name });
  log(s, "boot", { amount: BOOT * eligible.length });
  log(s, "deal", { hand: s.handNo });
  s.phase = "playing";
  advance(s, s.dealerSeat, now); // first actor is dealer+1; may go straight to showdown
}

/* ---------------- module functions ---------------- */

function init(players: GamePlayer[], now: number, rng: Rng): TeenPattiState {
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const s: TeenPattiState = {
    players: seated.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      chips: START_CHIPS,
      cards: [],
      inHand: false,
      folded: false,
      seen: false,
      allIn: false,
      betThisHand: 0,
      busted: false,
      left: false,
    })),
    phase: "hand_over",
    handNo: 0,
    dealerSeat: Math.floor(rng() * seated.length),
    pot: 0,
    stake: BOOT,
    turn: null,
    deadline: null,
    lastHand: null,
    winnerId: null,
    departedChips: 0,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  startNextHand(s, now, rng);
  return s;
}

function applyMove(s: TeenPattiState, playerId: string, move: TeenPattiMove, now: number): void {
  s.updatedAt = now;
  const p = s.players.find((x) => x.id === playerId);
  if (!p) return err("You are not seated at this table.");
  if (!move || typeof move !== "object") return err("Malformed move.");
  if (s.phase === "session_over") return err("The session is over.");
  if (s.phase === "hand_over") return err("The next hand is about to be dealt.");
  if (p.left) return err("You have left the table.");
  if (p.busted) return err("You are out of chips this session.");
  if (!p.inHand) return err("You are not in this hand.");
  if (p.folded) return err("You have folded this hand.");

  switch (move.type) {
    case "see": {
      if (p.seen) return err("You have already seen your cards.");
      p.seen = true;
      log(s, "see", { actor: p.name });
      return; // seeing never consumes the turn
    }

    case "fold": {
      if (s.turn !== p.id) return err("It is not your turn.");
      p.folded = true;
      log(s, "fold", { actor: p.name });
      advance(s, p.seat, now);
      return;
    }

    case "bet": {
      if (s.turn !== p.id) return err("It is not your turn.");
      const base = (p.seen ? 2 : 1) * s.stake; // seen players bet double
      const target = move.raise ? base * 2 : base;
      const amt = Math.min(target, p.chips);
      if (amt <= 0) return err("You have no chips left.");
      p.chips -= amt;
      p.betThisHand += amt;
      s.pot += amt;
      if (amt < target) {
        p.allIn = true; // partial all-in: stake unchanged
        log(s, "allin", { actor: p.name, amount: amt });
      } else {
        if (move.raise) s.stake *= 2;
        log(s, move.raise ? "raise" : p.seen ? "chaal" : "blind_bet", {
          actor: p.name,
          amount: amt,
        });
        if (p.chips === 0) {
          p.allIn = true;
          log(s, "allin", { actor: p.name, amount: amt });
        }
      }
      advance(s, p.seat, now);
      return;
    }

    case "show": {
      if (s.turn !== p.id) return err("It is not your turn.");
      const alive = unfolded(s);
      if (alive.length !== 2) return err("Show is only possible when exactly two players remain.");
      const other = alive.find((x) => x.id !== p.id)!;
      const cost = p.seen ? 2 * s.stake : s.stake;
      if (p.chips < cost) return err("Not enough chips for a show — bet all-in instead.");
      p.chips -= cost;
      p.betThisHand += cost;
      s.pot += cost;
      if (p.chips === 0) p.allIn = true;
      log(s, "show", { actor: p.name, target: other.name, amount: cost });
      const cmp = compareHands(p.cards, other.cards);
      const winner = cmp > 0 ? p : other; // on a tie the ASKER loses
      const ordered = [...alive].sort((a, b) => relOrder(s, a) - relOrder(s, b));
      log(s, "showdown", {
        detail: ordered.map((c) => `${c.name}: ${rankLabel(c.cards)}`).join(" · "),
      });
      endHand(s, winner, "show", reveal(ordered), now);
      return;
    }

    default:
      return err("Unknown move.");
  }
}

/**
 * A player left the party. Fold them out of the current hand (their bets stay
 * in the pot), take their chips off the table, and never deal them in again.
 * No-op if they are unknown, already left, or the session is decided.
 */
function forfeit(s: TeenPattiState, playerId: string, now: number): void {
  const p = s.players.find((x) => x.id === playerId);
  if (!p || p.left || s.phase === "session_over") return;
  s.updatedAt = now;
  const wasTurn = s.turn === p.id;
  p.left = true;
  s.departedChips += p.chips; // their chips leave the table with them
  p.chips = 0;
  log(s, "leave", { actor: p.name });

  if (p.inHand && !p.folded) {
    p.folded = true; // everything they bet stays in the pot
    if (s.phase === "playing") {
      const alive = unfolded(s);
      const canAct = alive.filter((x) => !x.allIn);
      // settle the hand if their departure decides it, or hand the turn on if
      // it was theirs; otherwise the current actor keeps the turn undisturbed
      if (alive.length === 1 || canAct.length <= 1 || wasTurn) advance(s, p.seat, now);
    }
  }

  // if the hand is settled (or none was running) and at most one remaining
  // player can post the boot, the session is decided right now
  if (s.phase === "hand_over") {
    const eligible = s.players.filter((x) => !x.left && x.chips >= BOOT);
    if (eligible.length <= 1) endSession(s, eligible[0] ?? richest(s));
  }
}

function tick(s: TeenPattiState, now: number, rng: Rng): boolean {
  if (s.phase === "playing") {
    if (!s.deadline || now < s.deadline || !s.turn) return false;
    const p = s.players.find((x) => x.id === s.turn)!;
    s.updatedAt = now;
    log(s, "timeout", { actor: p.name });
    p.folded = true; // deadlines only ever auto-FOLD, never auto-bet
    log(s, "fold", { actor: p.name });
    advance(s, p.seat, now);
    return true;
  }
  if (s.phase === "hand_over") {
    if (!s.deadline || now < s.deadline) return false;
    startNextHand(s, now, rng);
    return true;
  }
  return false;
}

function redact(s: TeenPattiState, viewerId: string, now: number): TeenPattiView {
  const me = s.players.find((p) => p.id === viewerId);
  return {
    phase: s.phase,
    handNo: s.handNo,
    handCap: HAND_CAP,
    boot: BOOT,
    dealerId: s.players[s.dealerSeat]?.id ?? null,
    pot: s.pot,
    stake: s.stake,
    turn: s.turn,
    deadline: s.deadline,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      chips: p.chips,
      inHand: p.inHand,
      folded: p.folded,
      seen: p.seen,
      allIn: p.allIn,
      betThisHand: p.betThisHand,
      busted: p.busted,
      left: p.left,
    })),
    // your own cards ONLY once you've seen them — blind players stay blind;
    // spectators (me === undefined) get nothing
    yourCards: me && me.inHand && me.seen ? me.cards.map((c) => ({ ...c })) : null,
    lastHand: s.lastHand
      ? {
          ...s.lastHand,
          revealed: s.lastHand.revealed.map((r) => ({
            ...r,
            cards: r.cards.map((c) => ({ ...c })),
          })),
        }
      : null,
    winnerId: s.winnerId,
    log: s.log.slice(-60),
    now,
  };
}

function result(s: TeenPattiState): { winnerId: string } | null {
  return s.phase === "session_over" && s.winnerId ? { winnerId: s.winnerId } : null;
}

export const teenpattiModule: GameModule<TeenPattiState, TeenPattiView, TeenPattiMove> = {
  type: "teenpatti",
  minPlayers: 2,
  maxPlayers: 8,
  init,
  applyMove,
  tick,
  redact,
  result,
  forfeit,
};
