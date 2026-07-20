/* UNO engine. Pure apart from mutating the passed state; randomness only from
   `rng`, time only from `now`. State is JSON-serializable. */

import { MoveError, type GamePlayer, type GameResult } from "../types";
import {
  UNO_COLORS,
  UNO_HAND_SIZE,
  UNO_LOG_CAP,
  UNO_MAX_PLAYERS,
  UNO_MIN_PLAYERS,
  UNO_TURN_MS,
  type UnoCard,
  type UnoColor,
  type UnoLogEntry,
  type UnoLogKind,
  type UnoMove,
  type UnoPlayerState,
  type UnoState,
  type UnoSymbol,
  type UnoView,
} from "./types";

export type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

// ---------- deck ----------

/** The full 108-card deck in canonical order (ids c1..c108). */
export function buildDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  let seq = 0;
  const add = (color: UnoColor | null, symbol: UnoSymbol) =>
    cards.push({ id: `c${++seq}`, color, symbol });
  for (const color of UNO_COLORS) {
    add(color, "0");
    for (let n = 1; n <= 9; n++) {
      add(color, String(n) as UnoSymbol);
      add(color, String(n) as UnoSymbol);
    }
    for (const s of ["skip", "reverse", "draw2"] as const) {
      add(color, s);
      add(color, s);
    }
  }
  for (let i = 0; i < 4; i++) {
    add(null, "wild");
    add(null, "wild4");
  }
  return cards; // 4×25 + 8 = 108
}

export const isNumberSymbol = (s: UnoSymbol): boolean => s.length === 1;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** May `card` legally land on `top` given the active color? */
export function isPlayable(card: UnoCard, top: UnoCard, activeColor: UnoColor): boolean {
  if (card.color === null) return true; // wilds always play
  return card.color === activeColor || card.symbol === top.symbol;
}

export const topDiscard = (s: UnoState): UnoCard => s.discard[s.discard.length - 1];

/** Cards the turn player could legally play right now. */
export function playableCards(s: UnoState, p: UnoPlayerState): UnoCard[] {
  const top = topDiscard(s);
  const all = p.hand.filter((c) => isPlayable(c, top, s.activeColor));
  if (s.hasDrawn) return all.filter((c) => c.id === s.drawnCardId);
  return all;
}

// ---------- helpers ----------

const byId = (s: UnoState, id: string) => s.players.find((p) => p.id === id);

/** Players still seated at the table (not forfeited). */
export const activePlayers = (s: UnoState): UnoPlayerState[] => s.players.filter((p) => !p.left);

function log(s: UnoState, ts: number, kind: UnoLogKind, e: Partial<UnoLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts, kind, ...e });
  if (s.log.length > UNO_LOG_CAP) s.log.splice(0, s.log.length - UNO_LOG_CAP);
}

/** The active player `steps` active seats onward from `fromSeat` in the
    current direction — players who left are skipped forever. */
function activeAt(s: UnoState, fromSeat: number, steps: number): UnoPlayerState {
  const n = s.players.length;
  let seat = fromSeat;
  let remaining = steps;
  for (let hops = 0; hops < n * (steps + 1); hops++) {
    seat = (((seat + s.direction) % n) + n) % n;
    if (!s.players[seat].left) {
      remaining--;
      if (remaining <= 0) return s.players[seat];
    }
  }
  // unreachable while ≥1 active player exists
  return activePlayers(s)[0] ?? s.players[fromSeat];
}

export function nextPlayer(s: UnoState): UnoPlayerState {
  return activeAt(s, byId(s, s.turn)!.seat, 1);
}

/** Draw one card, reshuffling the discard (minus its top) when the deck runs dry.
    Returns null only when every other card is held in hands. */
function drawOne(s: UnoState, rng: Rng): UnoCard | null {
  if (s.deck.length === 0) {
    if (s.discard.length <= 1) return null;
    const top = s.discard.pop()!;
    s.deck = shuffle(s.discard, rng);
    s.discard = [top];
  }
  return s.deck.pop() ?? null;
}

/** Give `count` cards to `p` (deck permitting). Returns how many were dealt. */
function giveCards(s: UnoState, p: UnoPlayerState, count: number, rng: Rng): number {
  let got = 0;
  for (let i = 0; i < count; i++) {
    const c = drawOne(s, rng);
    if (!c) break;
    p.hand.push(c);
    got++;
  }
  if (p.hand.length > 1) p.catchable = false; // back above one card
  return got;
}

/** Move the turn `steps` seats onward. Completing an action closes every other
    player's catch window (the actor's own fresh flag survives). */
function advanceTurn(s: UnoState, steps: number, now: number) {
  const actor = byId(s, s.turn)!;
  for (const p of s.players) if (p.id !== actor.id) p.catchable = false;
  s.turn = activeAt(s, actor.seat, steps).id;
  s.hasDrawn = false;
  s.drawnCardId = null;
  s.deadline = now + UNO_TURN_MS;
}

// ---------- lifecycle ----------

export function init(players: GamePlayer[], now: number, rng: Rng): UnoState {
  if (players.length < UNO_MIN_PLAYERS || players.length > UNO_MAX_PLAYERS)
    throw new Error(`UNO needs ${UNO_MIN_PLAYERS}-${UNO_MAX_PLAYERS} players`);
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const ps: UnoPlayerState[] = seated.map((p, i) => ({
    id: p.id,
    name: p.name,
    seat: i,
    hand: [],
    catchable: false,
    left: false,
  }));
  const s: UnoState = {
    phase: "play",
    players: ps,
    deck: shuffle(buildDeck(), rng),
    discard: [],
    activeColor: "red",
    direction: 1,
    turn: ps[Math.floor(rng() * ps.length)].id,
    hasDrawn: false,
    drawnCardId: null,
    deadline: now + UNO_TURN_MS,
    winner: null,
    log: [],
    logSeq: 0,
  };
  for (let i = 0; i < UNO_HAND_SIZE; i++) for (const p of ps) p.hand.push(s.deck.pop()!);
  // flip the starting discard — action/wild flips go to the bottom of the deck
  // until a number card shows (deterministic house rule)
  let top = s.deck.pop()!;
  while (!isNumberSymbol(top.symbol)) {
    s.deck.unshift(top);
    top = s.deck.pop()!;
  }
  s.discard.push(top);
  s.activeColor = top.color!;
  return s;
}

// ---------- moves ----------

function doPlay(
  s: UnoState,
  p: UnoPlayerState,
  move: { cardId: string; chooseColor?: UnoColor; declareUno?: boolean },
  now: number,
  rng: Rng
) {
  if (s.turn !== p.id) err("It's not your turn.");
  const card = p.hand.find((c) => c.id === move.cardId) ?? (err("That card is not in your hand.") as never);
  if (s.hasDrawn && card.id !== s.drawnCardId)
    err("After drawing you may only play the card you drew.");
  if (!isPlayable(card, topDiscard(s), s.activeColor))
    err("That card doesn't match the color or symbol.");

  let color: UnoColor;
  if (card.color === null) {
    if (!move.chooseColor || !UNO_COLORS.includes(move.chooseColor))
      err("Choose a color for the wild card.");
    color = move.chooseColor!;
  } else {
    color = card.color;
  }

  // -- effects --
  p.hand = p.hand.filter((c) => c.id !== card.id);
  s.discard.push(card);
  s.activeColor = color;

  const kind: UnoLogKind =
    card.symbol === "skip" ||
    card.symbol === "reverse" ||
    card.symbol === "draw2" ||
    card.symbol === "wild" ||
    card.symbol === "wild4"
      ? card.symbol
      : "play";
  const hasVictim = card.symbol === "skip" || card.symbol === "draw2" || card.symbol === "wild4";
  const victim = hasVictim ? activeAt(s, p.seat, 1) : null;
  let dealt = 0;
  if (card.symbol === "draw2") dealt = giveCards(s, victim!, 2, rng);
  if (card.symbol === "wild4") dealt = giveCards(s, victim!, 4, rng);
  log(s, now, kind, {
    actor: p.name,
    target: victim?.name,
    color,
    symbol: card.symbol,
    n: dealt || undefined,
  });

  if (p.hand.length === 1) {
    if (move.declareUno) {
      p.catchable = false;
      log(s, now, "uno", { actor: p.name });
    } else {
      p.catchable = true; // open to a catch until the next action completes
    }
  }

  if (p.hand.length === 0) {
    s.phase = "over";
    s.winner = p.id;
    s.hasDrawn = false;
    s.drawnCardId = null;
    log(s, now, "win", { actor: p.name });
    return;
  }

  if (card.symbol === "reverse") s.direction = s.direction === 1 ? -1 : 1;
  const steps =
    card.symbol === "skip" || card.symbol === "draw2" || card.symbol === "wild4"
      ? 2
      : card.symbol === "reverse" && activePlayers(s).length === 2
        ? 2 // with 2 active players reverse acts as a skip: play again
        : 1;
  advanceTurn(s, steps, now);
}

function doDraw(s: UnoState, p: UnoPlayerState, now: number, rng: Rng) {
  if (s.turn !== p.id) err("It's not your turn.");
  if (s.hasDrawn) err("You already drew this turn — play it or pass.");
  const c = drawOne(s, rng);
  log(s, now, "draw", { actor: p.name, n: c ? 1 : 0 });
  if (!c) {
    // every drawable card is in hands; the turn simply passes
    advanceTurn(s, 1, now);
    return;
  }
  p.hand.push(c);
  if (p.hand.length > 1) p.catchable = false;
  if (isPlayable(c, topDiscard(s), s.activeColor)) {
    s.hasDrawn = true;
    s.drawnCardId = c.id; // may play it now, or pass
  } else {
    advanceTurn(s, 1, now); // not playable: the turn ends
  }
}

function doPass(s: UnoState, p: UnoPlayerState, now: number) {
  if (s.turn !== p.id) err("It's not your turn.");
  if (!s.hasDrawn) err("You must draw a card before passing.");
  log(s, now, "pass", { actor: p.name });
  advanceTurn(s, 1, now);
}

function doCatch(s: UnoState, p: UnoPlayerState, targetId: string, now: number, rng: Rng) {
  const t = byId(s, targetId) ?? (err("No such player.") as never);
  if (t.id === p.id) err("You can't catch yourself — call UNO instead.");
  if (!t.catchable) err(`${t.name} can't be caught right now.`);
  const dealt = giveCards(s, t, 2, rng);
  t.catchable = false;
  log(s, now, "catch", { actor: p.name, target: t.name, n: dealt });
}

function doCallUno(s: UnoState, p: UnoPlayerState, now: number) {
  if (!p.catchable) err("You have nothing to declare.");
  p.catchable = false;
  log(s, now, "uno", { actor: p.name });
}

export function applyMove(s: UnoState, playerId: string, move: UnoMove, now: number, rng: Rng): void {
  if (s.phase !== "play") err("The game is over.");
  const p = byId(s, playerId) ?? (err("You are not in this game.") as never);
  if (p.left) err("You have left this game.");
  switch (move.type) {
    case "play":
      doPlay(s, p, move, now, rng);
      return;
    case "draw":
      doDraw(s, p, now, rng);
      return;
    case "pass":
      doPass(s, p, now);
      return;
    case "catch":
      doCatch(s, p, move.target, now, rng);
      return;
    case "callUno":
      doCallUno(s, p, now);
      return;
    default:
      err("Unknown move.");
  }
}

// ---------- timers ----------

/** Auto-play a safe move once the turn deadline expires: pass if the player
    already drew, otherwise draw one card and end the turn. Never plays cards. */
export function tick(s: UnoState, now: number, rng: Rng): boolean {
  if (s.phase !== "play") return false;
  if (now < s.deadline) return false;
  const p = byId(s, s.turn)!;
  log(s, now, "timeout", { actor: p.name });
  if (!s.hasDrawn) {
    const c = drawOne(s, rng);
    if (c) {
      p.hand.push(c);
      if (p.hand.length > 1) p.catchable = false;
      log(s, now, "draw", { actor: p.name, n: 1 });
    }
  }
  advanceTurn(s, 1, now);
  return true;
}

// ---------- forfeit ----------

/** Remove a player permanently (they left the party). Their hand goes to the
    bottom of the deck, their turn is skipped forever, and the last remaining
    active player wins. No-op if they're already out/absent or the game is over. */
export function forfeit(s: UnoState, playerId: string, now: number, rng: Rng): void {
  if (s.phase !== "play") return;
  const p = byId(s, playerId);
  if (!p || p.left) return;
  const wasTurn = s.turn === p.id;
  p.left = true;
  p.catchable = false;
  if (p.hand.length > 0) {
    // return their cards to the bottom of the deck (shuffled, untrackable)
    s.deck.unshift(...shuffle([...p.hand], rng));
    p.hand = [];
  }
  log(s, now, "leave", { actor: p.name });

  const active = activePlayers(s);
  if (active.length === 1) {
    s.phase = "over";
    s.winner = active[0].id;
    s.hasDrawn = false;
    s.drawnCardId = null;
    log(s, now, "win", { actor: active[0].name });
    return;
  }
  if (wasTurn) {
    // resolve any drawn-pending state and move on; catch windows stay open
    s.turn = activeAt(s, p.seat, 1).id;
    s.hasDrawn = false;
    s.drawnCardId = null;
    s.deadline = now + UNO_TURN_MS;
  }
}

// ---------- redaction ----------

export function redact(s: UnoState, viewerId: string, now: number): UnoView {
  const you = s.players.find((p) => p.id === viewerId);
  return {
    phase: s.phase,
    youId: viewerId,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      cardCount: p.hand.length,
      catchable: p.catchable,
      left: p.left,
    })),
    hand: you ? you.hand.map((c) => ({ ...c })) : null,
    deckCount: s.deck.length,
    discardTop: { ...topDiscard(s) },
    discardTail: s.discard.slice(-3).map((c) => ({ ...c })),
    discardCount: s.discard.length,
    activeColor: s.activeColor,
    direction: s.direction,
    turn: s.turn,
    deadline: s.deadline,
    hasDrawn: s.hasDrawn,
    drawnCardId: s.turn === viewerId ? s.drawnCardId : null,
    winner: s.winner,
    log: s.log.slice(-50),
    now,
  };
}

export function result(s: UnoState): GameResult | null {
  return s.winner ? { winnerId: s.winner } : null;
}
