/* Monopoly Deal engine. All functions are pure apart from mutating the passed
   state; randomness only from `rng`, time only from `now`.

   House rules / simplifications (documented):
   - Once a color has enough properties for a set, ALL cards assigned to that
     color count as the completed set (extra cards are protected with it and
     travel with a Deal Breaker).
   - If a set that carries buildings loses a property (payment / Forced Deal /
     rearrange) so it is no longer complete, its house/hotel slide into the
     owner's bank as money.
   - Rent cards may be banked as money like action cards; property wildcards
     may never be banked. The all-color wild is worth $0 and can never pay.
   - Multi-target demands (Birthday, dual rent) resolve one target at a time,
     each with its own Just Say No window and payment deadline. */

import { MoveError, type GameModule, type GamePlayer } from "../types";
import { buildDeck } from "./deck";
import {
  ACTION_META,
  cardLabel,
  COLOR_META,
  COLORS,
  DISCARD_MS,
  HAND_LIMIT,
  JSN_MS,
  LOG_CAP,
  MONODEAL_MAX_PLAYERS,
  MONODEAL_MIN_PLAYERS,
  PAY_MS,
  PLAYS_PER_TURN,
  ROUND_CAP,
  TURN_MS,
  type MonoCard,
  type MonoColor,
  type MonoDealMove,
  type MonoDealState,
  type MonoDealView,
  type MonoLogEntry,
  type MonoLogKind,
  type MonoPlayer,
  type Pending,
} from "./types";

type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

/* ---------------- helpers ---------------- */

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function log(s: MonoDealState, kind: MonoLogKind, e: Partial<MonoLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

const player = (s: MonoDealState, id: string) => s.players.find((p) => p.id === id);

const mustPlayer = (s: MonoDealState, id: string): MonoPlayer =>
  player(s, id) ?? (err("Unknown player.") as never);

/** players still in the game */
export const activePlayers = (s: MonoDealState): MonoPlayer[] => s.players.filter((p) => !p.left);

/** active players other than `actor`, in seat order starting on the actor's left */
function othersInOrder(s: MonoDealState, actor: MonoPlayer): MonoPlayer[] {
  const n = s.players.length;
  const out: MonoPlayer[] = [];
  for (let i = 1; i < n; i++) {
    const p = s.players[(actor.seat + i) % n];
    if (!p.left) out.push(p);
  }
  return out;
}

export const colorCount = (p: MonoPlayer, color: MonoColor): number =>
  p.table.reduce((a, t) => a + (t.color === color ? 1 : 0), 0);

export const isComplete = (p: MonoPlayer, color: MonoColor): boolean =>
  colorCount(p, color) >= COLOR_META[color].setSize;

export const completedColors = (p: MonoPlayer): MonoColor[] => COLORS.filter((c) => isComplete(p, c));

/** rent owed for `color` at the owner's current count, incl. house/hotel bonuses */
export function rentFor(p: MonoPlayer, color: MonoColor): number {
  const meta = COLOR_META[color];
  const n = colorCount(p, color);
  if (n === 0) return 0;
  let amount = meta.rent[Math.min(n, meta.setSize) - 1];
  for (const b of p.buildings)
    if (b.color === color && b.card.kind === "action")
      amount += b.card.action === "house" ? 3 : 4;
  return amount;
}

export const bankTotal = (p: MonoPlayer): number => p.bank.reduce((a, c) => a + c.value, 0);

export const tableValue = (p: MonoPlayer): number =>
  p.table.reduce((a, t) => a + t.card.value, 0) + p.buildings.reduce((a, b) => a + b.card.value, 0);

export type AssetZone = "bank" | "table" | "building";

export interface Asset {
  card: MonoCard;
  zone: AssetZone;
  value: number;
}

/** everything a player may pay with (bank + table, excluding $0 all-color wilds) */
export function payableAssets(p: MonoPlayer): Asset[] {
  return [
    ...p.bank.map((card): Asset => ({ card, zone: "bank", value: card.value })),
    ...p.table
      .filter((t) => t.card.value > 0)
      .map((t): Asset => ({ card: t.card, zone: "table", value: t.card.value })),
    ...p.buildings.map((b): Asset => ({ card: b.card, zone: "building", value: b.card.value })),
  ];
}

/** who has to act right now (or null when the game is over) */
export function actorNow(s: MonoDealState): string | null {
  if (s.winner) return null;
  if (s.pending) return s.pending.stage === "jsn" ? s.pending.jsnBy : s.pending.targets[0];
  return s.turn;
}

/* ---------------- deck / drawing ---------------- */

function drawCards(s: MonoDealState, p: MonoPlayer, n: number, rng: Rng): number {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (s.deck.length === 0 && s.discard.length > 0) {
      s.deck.push(...s.discard.splice(0));
      shuffle(s.deck, rng);
    }
    const card = s.deck.pop();
    if (!card) break; // every card is in hands/tables — nothing left to draw
    p.hand.push(card);
    drawn++;
  }
  if (drawn > 0) log(s, "draw", { actor: p.name, n: drawn });
  return drawn;
}

/* ---------------- sets / buildings / win ---------------- */

/** House rule: buildings on a no-longer-complete set slide into the owner's bank. */
function slideBrokenBuildings(s: MonoDealState, p: MonoPlayer) {
  const broken = p.buildings.filter((b) => !isComplete(p, b.color));
  if (broken.length === 0) return;
  p.buildings = p.buildings.filter((b) => isComplete(p, b.color));
  for (const b of broken) {
    p.bank.push(b.card);
    log(s, "slide", { actor: p.name, card: cardLabel(b.card), color: b.color });
  }
}

/** Win at ANY moment: 3 completed sets of different colors. `preferId` is checked first. */
function checkWin(s: MonoDealState, preferId?: string): boolean {
  if (s.winner) return true;
  const active = activePlayers(s);
  const ordered = preferId
    ? [...active.filter((p) => p.id === preferId), ...active.filter((p) => p.id !== preferId)]
    : active;
  for (const p of ordered) {
    if (completedColors(p).length >= 3) {
      s.winner = p.id;
      s.pending = null;
      s.discarding = false;
      s.discardDeadline = null;
      log(s, "win", { actor: p.name });
      return true;
    }
  }
  return false;
}

/* ---------------- turn machinery ---------------- */

function startTurn(s: MonoDealState, pid: string, now: number, rng: Rng) {
  const p = mustPlayer(s, pid);
  s.turn = pid;
  s.playsLeft = PLAYS_PER_TURN;
  s.turnDeadline = now + TURN_MS;
  s.discarding = false;
  s.discardDeadline = null;
  drawCards(s, p, p.hand.length === 0 ? 5 : 2, rng);
}

/** Round cap reached: the highest total table value among active players wins
    (ties → lowest seat). */
function finishByCap(s: MonoDealState) {
  const active = activePlayers(s);
  let best = active[0];
  for (const p of active) if (tableValue(p) > tableValue(best)) best = p;
  s.cappedOut = true;
  s.winner = best.id;
  s.pending = null;
  s.discarding = false;
  s.discardDeadline = null;
  log(s, "cap", { actor: best.name, amount: tableValue(best) });
  log(s, "win", { actor: best.name });
}

function endTurn(s: MonoDealState, now: number, rng: Rng) {
  s.discarding = false;
  s.discardDeadline = null;
  s.turnsTaken++;
  if (s.turnsTaken >= s.capTurns) {
    finishByCap(s);
    return;
  }
  const cur = mustPlayer(s, s.turn);
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const next = s.players[(cur.seat + i) % n];
    if (!next.left) {
      startTurn(s, next.id, now, rng);
      return;
    }
  }
}

/** End-of-turn: enforce the hand limit, then pass the turn. */
function requestEndTurn(s: MonoDealState, me: MonoPlayer, now: number, rng: Rng) {
  if (me.hand.length > HAND_LIMIT) {
    s.discarding = true;
    s.discardDeadline = now + DISCARD_MS;
    return;
  }
  endTurn(s, now, rng);
}

function autoDiscardToLimit(s: MonoDealState, p: MonoPlayer) {
  const n = p.hand.length - HAND_LIMIT;
  if (n <= 0) return;
  const dropped = p.hand.splice(0, n); // oldest cards first
  s.discard.push(...dropped);
  log(s, "discard", { actor: p.name, n });
}

/* ---------------- pending attacks ---------------- */

function startAttack(
  s: MonoDealState,
  now: number,
  fields: Pick<Pending, "kind" | "actor" | "targets" | "amount"> &
    Partial<Pick<Pending, "color" | "targetCardId" | "myCardId">>
) {
  s.pending = {
    ...fields,
    stage: "jsn",
    jsnBy: fields.targets[0],
    jsnDepth: 0,
    deadline: now + JSN_MS,
  };
}

/** Move to the next target; clear the window when everyone is resolved. */
function advanceTarget(s: MonoDealState, now: number) {
  const p = s.pending;
  if (!p) return; // a win already cleared it
  p.targets.shift();
  if (p.targets.length === 0) {
    s.pending = null;
    // give the turn player a fresh clock for their remaining plays
    s.turnDeadline = now + TURN_MS;
  } else {
    p.stage = "jsn";
    p.jsnBy = p.targets[0];
    p.jsnDepth = 0;
    p.deadline = now + JSN_MS;
  }
}

/** The attack lands on the current target (their JSN chain ended in a decline/timeout). */
function resolveAttack(s: MonoDealState, now: number) {
  const p = s.pending!;
  const actor = mustPlayer(s, p.actor);
  const t = mustPlayer(s, p.targets[0]);

  switch (p.kind) {
    case "sly_deal": {
      const i = t.table.findIndex((x) => x.card.id === p.targetCardId);
      if (i < 0) {
        advanceTarget(s, now);
        return;
      }
      const [entry] = t.table.splice(i, 1);
      actor.table.push(entry);
      slideBrokenBuildings(s, t);
      log(s, "steal", { actor: actor.name, target: t.name, card: cardLabel(entry.card), color: entry.color });
      if (checkWin(s, actor.id)) return;
      advanceTarget(s, now);
      return;
    }
    case "forced_deal": {
      const ti = t.table.findIndex((x) => x.card.id === p.targetCardId);
      const mi = actor.table.findIndex((x) => x.card.id === p.myCardId);
      if (ti < 0 || mi < 0) {
        advanceTarget(s, now);
        return;
      }
      const [theirs] = t.table.splice(ti, 1);
      const [mine] = actor.table.splice(mi, 1);
      actor.table.push(theirs);
      t.table.push(mine);
      slideBrokenBuildings(s, t);
      slideBrokenBuildings(s, actor);
      log(s, "swap", { actor: actor.name, target: t.name, card: cardLabel(theirs.card), color: theirs.color });
      if (checkWin(s, actor.id)) return;
      advanceTarget(s, now);
      return;
    }
    case "deal_breaker": {
      const color = p.color!;
      const props = t.table.filter((x) => x.color === color);
      t.table = t.table.filter((x) => x.color !== color);
      actor.table.push(...props);
      const builds = t.buildings.filter((b) => b.color === color);
      t.buildings = t.buildings.filter((b) => b.color !== color);
      actor.buildings.push(...builds);
      slideBrokenBuildings(s, t);
      log(s, "deal_breaker", { actor: actor.name, target: t.name, color, n: props.length });
      if (checkWin(s, actor.id)) return;
      advanceTarget(s, now);
      return;
    }
    default: {
      // money demand: debt_collector / birthday / rent
      const available = payableAssets(t).reduce((a, x) => a + x.value, 0);
      if (available <= 0) {
        log(s, "pay", { actor: t.name, target: actor.name, amount: 0 });
        advanceTarget(s, now);
        return;
      }
      p.stage = "pay";
      p.deadline = now + PAY_MS;
      return;
    }
  }
}

/** The current JSN decider declines (or times out). */
function resolveJsnDecline(s: MonoDealState, now: number) {
  const p = s.pending!;
  if (p.jsnDepth % 2 === 0) {
    // the target let it through — the attack proceeds
    resolveAttack(s, now);
  } else {
    // the actor let the target's Just Say No stand — negated for this target
    advanceTarget(s, now);
  }
}

/** Transfer a validated payment from debtor to the pending actor. */
function applyPayment(s: MonoDealState, debtor: MonoPlayer, cardIds: string[], now: number) {
  const p = s.pending!;
  const creditor = mustPlayer(s, p.actor);
  let paid = 0;
  for (const id of cardIds) {
    const bi = debtor.bank.findIndex((c) => c.id === id);
    if (bi >= 0) {
      const [card] = debtor.bank.splice(bi, 1);
      creditor.bank.push(card);
      paid += card.value;
      continue;
    }
    const ti = debtor.table.findIndex((t) => t.card.id === id);
    if (ti >= 0) {
      const [entry] = debtor.table.splice(ti, 1);
      creditor.table.push(entry); // wilds keep their color assignment
      paid += entry.card.value;
      continue;
    }
    const gi = debtor.buildings.findIndex((b) => b.card.id === id);
    if (gi >= 0) {
      const [b] = debtor.buildings.splice(gi, 1);
      creditor.bank.push(b.card); // paid buildings become bank money
      paid += b.card.value;
    }
  }
  slideBrokenBuildings(s, debtor);
  log(s, "pay", { actor: debtor.name, target: creditor.name, amount: paid });
  if (checkWin(s, creditor.id)) return;
  advanceTarget(s, now);
}

/** Greedy auto-payment: bank small-to-large first, then cheapest table cards. */
export function greedyPayment(debtor: MonoPlayer, amount: number): string[] {
  const bank = [...debtor.bank].sort((a, b) => a.value - b.value).map((c): Asset => ({ card: c, zone: "bank", value: c.value }));
  const rest = payableAssets(debtor)
    .filter((a) => a.zone !== "bank")
    .sort((a, b) => a.value - b.value);
  const ids: string[] = [];
  let sum = 0;
  for (const a of [...bank, ...rest]) {
    if (sum >= amount) break;
    ids.push(a.card.id);
    sum += a.value;
  }
  return ids;
}

/* ---------------- plays ---------------- */

function needPlays(s: MonoDealState, n = 1) {
  if (s.playsLeft < n) err(n === 1 ? "No plays left — end your turn." : `That needs ${n} of your 3 plays.`);
}

function takeFromHand(me: MonoPlayer, cardId: string): MonoCard {
  const i = me.hand.findIndex((c) => c.id === cardId);
  if (i < 0) err("That card isn't in your hand.");
  return me.hand.splice(i, 1)[0];
}

function peekHand(me: MonoPlayer, cardId: string): MonoCard {
  return me.hand.find((c) => c.id === cardId) ?? (err("That card isn't in your hand.") as never);
}

function otherPlayer(s: MonoDealState, me: MonoPlayer, id: string | undefined): MonoPlayer {
  if (!id) err("Choose a target.");
  const t = player(s, id!);
  if (!t || t.id === me.id) err("Invalid target.");
  if (t!.left) err("They have left the game.");
  return t!;
}

function doBank(s: MonoDealState, me: MonoPlayer, cardId: string) {
  needPlays(s);
  const card = peekHand(me, cardId);
  if (card.kind === "property" || card.kind === "wild") err("Properties can never be banked.");
  takeFromHand(me, cardId);
  me.bank.push(card);
  s.playsLeft--;
  log(s, "bank", { actor: me.name, card: cardLabel(card), amount: card.value });
}

function doPlace(s: MonoDealState, me: MonoPlayer, cardId: string, color?: MonoColor) {
  needPlays(s);
  const card = peekHand(me, cardId);
  let assigned: MonoColor;
  if (card.kind === "property") {
    assigned = card.color;
  } else if (card.kind === "wild") {
    if (!color) err("Pick a color for the wildcard.");
    if (!card.colors.includes(color!)) err("That wildcard can't be that color.");
    assigned = color!;
  } else {
    return err("Only properties go on the table.");
  }
  takeFromHand(me, cardId);
  me.table.push({ card, color: assigned });
  s.playsLeft--;
  log(s, "property", { actor: me.name, card: cardLabel(card), color: assigned });
  checkWin(s, me.id);
}

function doRearrange(s: MonoDealState, me: MonoPlayer, moves: { cardId: string; color: MonoColor }[]) {
  if (!Array.isArray(moves) || moves.length === 0) err("Nothing to rearrange.");
  needPlays(s);
  const seen = new Set<string>();
  const targets: { entry: { card: MonoCard; color: MonoColor }; color: MonoColor }[] = [];
  for (const m of moves) {
    if (seen.has(m.cardId)) err("Duplicate card in rearrange.");
    seen.add(m.cardId);
    const entry = me.table.find((t) => t.card.id === m.cardId) ?? (err("That card isn't on your table.") as never);
    const wc = entry.card;
    if (wc.kind !== "wild" || !wc.colors.includes(m.color))
      err(wc.kind !== "wild" ? "Only wildcards can change color." : "That wildcard can't be that color.");
    targets.push({ entry, color: m.color });
  }
  for (const t of targets) t.entry.color = t.color;
  s.playsLeft--;
  slideBrokenBuildings(s, me);
  log(s, "rearrange", { actor: me.name, n: moves.length });
  checkWin(s, me.id);
}

function doPlayAction(
  s: MonoDealState,
  me: MonoPlayer,
  move: { cardId: string; target?: string; targetCardId?: string; myCardId?: string; color?: MonoColor },
  now: number,
  rng: Rng
) {
  const card = peekHand(me, move.cardId);
  if (card.kind !== "action") err("That isn't an action card.");
  const action = card.kind === "action" ? card.action : ("pass_go" as const);
  const spend = () => {
    takeFromHand(me, move.cardId);
    s.discard.push(card);
    s.playsLeft--;
  };

  switch (action) {
    case "just_say_no":
      return err("Just Say No is played in response to an action.");
    case "double_rent":
      return err("Play Double The Rent together with a rent card.");
    case "pass_go": {
      needPlays(s);
      spend();
      log(s, "action", { actor: me.name, card: ACTION_META.pass_go.label });
      drawCards(s, me, 2, rng);
      return;
    }
    case "house":
    case "hotel": {
      needPlays(s);
      const color = move.color ?? (err("Choose one of your completed sets.") as never);
      if (!COLOR_META[color].buildable) err("Houses can't go on railroads or utilities.");
      if (!isComplete(me, color)) err("That set isn't complete yet.");
      const hasHouse = me.buildings.some((b) => b.color === color && b.card.kind === "action" && b.card.action === "house");
      const hasHotel = me.buildings.some((b) => b.color === color && b.card.kind === "action" && b.card.action === "hotel");
      if (action === "house" && hasHouse) err("That set already has a house.");
      if (action === "hotel" && !hasHouse) err("Build a house there first.");
      if (action === "hotel" && hasHotel) err("That set already has a hotel.");
      takeFromHand(me, move.cardId);
      me.buildings.push({ card, color });
      s.playsLeft--;
      log(s, "building", { actor: me.name, card: cardLabel(card), color });
      return;
    }
    case "debt_collector": {
      needPlays(s);
      const t = otherPlayer(s, me, move.target);
      spend();
      log(s, "action", { actor: me.name, target: t.name, card: ACTION_META.debt_collector.label, amount: 5 });
      startAttack(s, now, { kind: "debt_collector", actor: me.id, targets: [t.id], amount: 5 });
      return;
    }
    case "birthday": {
      needPlays(s);
      const targets = othersInOrder(s, me).map((p) => p.id);
      spend();
      log(s, "action", { actor: me.name, card: ACTION_META.birthday.label, amount: 2 });
      startAttack(s, now, { kind: "birthday", actor: me.id, targets, amount: 2 });
      return;
    }
    case "sly_deal": {
      needPlays(s);
      const t = otherPlayer(s, me, move.target);
      const entry = t.table.find((x) => x.card.id === move.targetCardId) ?? (err("Pick a property to steal.") as never);
      if (isComplete(t, entry.color)) err("You can't sly a property out of a completed set.");
      spend();
      log(s, "action", { actor: me.name, target: t.name, card: ACTION_META.sly_deal.label });
      startAttack(s, now, {
        kind: "sly_deal",
        actor: me.id,
        targets: [t.id],
        amount: 0,
        targetCardId: entry.card.id,
      });
      return;
    }
    case "forced_deal": {
      needPlays(s);
      const t = otherPlayer(s, me, move.target);
      const theirs = t.table.find((x) => x.card.id === move.targetCardId) ?? (err("Pick a property to take.") as never);
      if (isComplete(t, theirs.color)) err("You can't take from a completed set.");
      const mine = me.table.find((x) => x.card.id === move.myCardId) ?? (err("Pick one of your properties to give.") as never);
      spend();
      log(s, "action", { actor: me.name, target: t.name, card: ACTION_META.forced_deal.label });
      startAttack(s, now, {
        kind: "forced_deal",
        actor: me.id,
        targets: [t.id],
        amount: 0,
        targetCardId: theirs.card.id,
        myCardId: mine.card.id,
      });
      return;
    }
    case "deal_breaker": {
      needPlays(s);
      const t = otherPlayer(s, me, move.target);
      const color = move.color ?? (err("Choose a completed set to steal.") as never);
      if (!isComplete(t, color)) err("That set isn't complete.");
      spend();
      log(s, "action", { actor: me.name, target: t.name, card: ACTION_META.deal_breaker.label, color });
      startAttack(s, now, { kind: "deal_breaker", actor: me.id, targets: [t.id], amount: 0, color });
      return;
    }
  }
}

function doPlayRent(
  s: MonoDealState,
  me: MonoPlayer,
  move: { cardId: string; color: MonoColor; target?: string; doubleIds?: string[] },
  now: number
) {
  const card = peekHand(me, move.cardId);
  if (card.kind !== "rent") err("That isn't a rent card.");
  const rent = card.kind === "rent" ? card : (err("") as never);
  const color = move.color ?? (err("Choose a color to charge.") as never);
  if (!rent.wild && !rent.colors.includes(color)) err("That rent card doesn't cover that color.");
  if (colorCount(me, color) === 0) err(`You don't own any ${COLOR_META[color].label} properties.`);

  const doubles = move.doubleIds ?? [];
  if (doubles.length > 2) err("At most two Double The Rent cards.");
  if (new Set(doubles).size !== doubles.length) err("Duplicate Double The Rent card.");
  const dtrCards: MonoCard[] = doubles.map((id) => {
    const c = peekHand(me, id);
    if (c.kind !== "action" || c.action !== "double_rent") err("Only Double The Rent cards can double a rent.");
    return c;
  });
  needPlays(s, 1 + doubles.length);

  let targets: string[];
  if (rent.wild) {
    const t = otherPlayer(s, me, move.target);
    targets = [t.id];
  } else {
    targets = othersInOrder(s, me).map((p) => p.id);
  }

  const amount = rentFor(me, color) * 2 ** doubles.length;
  takeFromHand(me, move.cardId);
  s.discard.push(card);
  for (const c of dtrCards) {
    takeFromHand(me, c.id);
    s.discard.push(c);
  }
  s.playsLeft -= 1 + doubles.length;
  log(s, "rent", { actor: me.name, color, amount, n: doubles.length });
  startAttack(s, now, { kind: "rent", actor: me.id, targets, amount, color });
}

/* ---------------- module surface ---------------- */

function init(players: GamePlayer[], now: number, rng: Rng): MonoDealState {
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const s: MonoDealState = {
    players: seated.map((gp) => ({
      id: gp.id,
      name: gp.name,
      seat: gp.seat,
      hand: [],
      bank: [],
      table: [],
      buildings: [],
      left: false,
    })),
    deck: shuffle(buildDeck(), rng),
    discard: [],
    turn: seated[0].id,
    playsLeft: PLAYS_PER_TURN,
    turnDeadline: now + TURN_MS,
    discarding: false,
    discardDeadline: null,
    pending: null,
    turnsTaken: 0,
    capTurns: ROUND_CAP * seated.length,
    winner: null,
    cappedOut: false,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  for (let i = 0; i < 5; i++) for (const p of s.players) p.hand.push(s.deck.pop()!);
  log(s, "start", { actor: s.players[0].name });
  startTurn(s, s.players[0].id, now, rng);
  return s;
}

function applyMove(s: MonoDealState, playerId: string, move: MonoDealMove, now: number, rng: Rng): void {
  s.updatedAt = now;
  if (s.winner) err("The game is over.");
  const me = player(s, playerId) ?? (err("You are not in this game.") as never);
  if (me.left) err("You have left this game.");
  if (!move || typeof move !== "object" || !("type" in move)) err("Bad move.");

  // out-of-turn responses first
  switch (move.type) {
    case "jsn": {
      const p = s.pending ?? (err("There's nothing to say no to.") as never);
      if (p.stage !== "jsn" || p.jsnBy !== playerId) err("It isn't your call.");
      const i = me.hand.findIndex((c) => c.kind === "action" && c.action === "just_say_no");
      if (i < 0) err("You don't have a Just Say No.");
      const [card] = me.hand.splice(i, 1);
      s.discard.push(card);
      p.jsnDepth++;
      p.jsnBy = p.jsnBy === p.targets[0] ? p.actor : p.targets[0];
      p.deadline = now + JSN_MS;
      log(s, "jsn", { actor: me.name, target: player(s, p.jsnBy)?.name });
      return;
    }
    case "decline": {
      const p = s.pending ?? (err("There's nothing to respond to.") as never);
      if (p.stage !== "jsn" || p.jsnBy !== playerId) err("No response needed from you.");
      resolveJsnDecline(s, now);
      return;
    }
    case "pay": {
      const p = s.pending ?? (err("You owe nothing right now.") as never);
      if (p.stage !== "pay" || p.targets[0] !== playerId) err("You owe nothing right now.");
      const ids = move.cardIds;
      if (!Array.isArray(ids)) err("Bad payment.");
      if (new Set(ids).size !== ids.length) err("Duplicate card in payment.");
      const assets = payableAssets(me);
      const byId = new Map(assets.map((a) => [a.card.id, a]));
      let sum = 0;
      for (const id of ids) {
        const a = byId.get(id) ?? (err("You can't pay with that card.") as never);
        sum += a.value;
      }
      if (sum < p.amount && ids.length < assets.length)
        err(`Pay at least $${p.amount}M — or everything you have.`);
      applyPayment(s, me, ids, now);
      return;
    }
    case "discard": {
      if (!s.discarding || s.turn !== playerId) err("You don't need to discard.");
      const need = me.hand.length - HAND_LIMIT;
      const ids = move.cardIds;
      if (!Array.isArray(ids) || ids.length !== need)
        err(`Discard exactly ${need} card${need === 1 ? "" : "s"}.`);
      if (new Set(ids).size !== ids.length) err("Duplicate card in discard.");
      const cards = ids.map((id) => me.hand.find((c) => c.id === id) ?? (err("That card isn't in your hand.") as never));
      me.hand = me.hand.filter((c) => !ids.includes(c.id));
      s.discard.push(...cards);
      log(s, "discard", { actor: me.name, n: need });
      s.discarding = false;
      endTurn(s, now, rng);
      return;
    }
    default:
      break;
  }

  // turn plays
  if (s.pending) err("Waiting for a response first.");
  if (s.turn !== playerId) err("It isn't your turn.");
  if (s.discarding) err("Discard down to 7 cards first.");

  switch (move.type) {
    case "end_turn":
      requestEndTurn(s, me, now, rng);
      return;
    case "bank":
      doBank(s, me, move.cardId);
      return;
    case "place":
      doPlace(s, me, move.cardId, move.color);
      return;
    case "rearrange":
      doRearrange(s, me, move.moves);
      return;
    case "play_action":
      doPlayAction(s, me, move, now, rng);
      return;
    case "play_rent":
      doPlayRent(s, me, move, now);
      return;
    default:
      err("Unknown move.");
  }
}

/** Advance expired deadlines. Returns true if the state changed. */
function tick(s: MonoDealState, now: number, rng: Rng): boolean {
  if (s.winner) return false;

  const p = s.pending;
  if (p) {
    if (now < p.deadline) return false;
    s.updatedAt = now;
    if (p.stage === "jsn") {
      log(s, "timeout", { actor: player(s, p.jsnBy)?.name });
      resolveJsnDecline(s, now);
    } else {
      const debtor = mustPlayer(s, p.targets[0]);
      log(s, "timeout", { actor: debtor.name });
      applyPayment(s, debtor, greedyPayment(debtor, p.amount), now);
    }
    return true;
  }

  if (s.discarding) {
    if (s.discardDeadline === null || now < s.discardDeadline) return false;
    s.updatedAt = now;
    const me = mustPlayer(s, s.turn);
    log(s, "timeout", { actor: me.name });
    autoDiscardToLimit(s, me);
    endTurn(s, now, rng);
    return true;
  }

  if (now < s.turnDeadline) return false;
  s.updatedAt = now;
  const me = mustPlayer(s, s.turn);
  log(s, "timeout", { actor: me.name });
  autoDiscardToLimit(s, me);
  endTurn(s, now, rng);
  return true;
}

function redact(s: MonoDealState, viewerId: string, now: number): MonoDealView {
  const seated = s.players.some((p) => p.id === viewerId);
  const turnPlayer = player(s, s.turn);
  return {
    youId: viewerId,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      handCount: p.hand.length,
      // spectators never see a hand
      hand: seated && p.id === viewerId ? p.hand : undefined,
      bank: p.bank,
      bankTotal: bankTotal(p),
      table: p.table,
      buildings: p.buildings,
      completed: completedColors(p),
      tableValue: tableValue(p),
      left: p.left,
    })),
    turn: s.turn,
    playsLeft: s.playsLeft,
    deckCount: s.deck.length,
    discardTop: s.discard.length > 0 ? s.discard[s.discard.length - 1] : null,
    discardCount: s.discard.length,
    pending: s.pending
      ? {
          kind: s.pending.kind,
          actor: s.pending.actor,
          target: s.pending.targets[0],
          targetsLeft: s.pending.targets.length,
          stage: s.pending.stage,
          amount: s.pending.amount,
          color: s.pending.color,
          targetCardId: s.pending.targetCardId,
          myCardId: s.pending.myCardId,
          jsnBy: s.pending.jsnBy,
          jsnDepth: s.pending.jsnDepth,
          deadline: s.pending.deadline,
        }
      : null,
    discarding:
      s.discarding && turnPlayer
        ? {
            player: s.turn,
            deadline: s.discardDeadline ?? s.turnDeadline,
            mustDrop: Math.max(0, turnPlayer.hand.length - HAND_LIMIT),
          }
        : null,
    turnDeadline: s.turnDeadline,
    winner: s.winner,
    cappedOut: s.cappedOut,
    turnsTaken: s.turnsTaken,
    capTurns: s.capTurns,
    log: s.log.slice(-40),
    now,
  };
}

/** A player left the party mid-game. Their assets go to the discard pile,
    their turns are skipped forever, and any window waiting on them resolves. */
function forfeit(s: MonoDealState, playerId: string, now: number, rng: Rng): void {
  const p = player(s, playerId);
  if (!p || p.left || s.winner) return; // no-op when already out / game over
  s.updatedAt = now;
  p.left = true;

  // every card they held returns to the discard pile (conservation holds)
  const dumped = p.hand.length + p.bank.length + p.table.length + p.buildings.length;
  s.discard.push(...p.hand.splice(0), ...p.bank.splice(0));
  s.discard.push(...p.table.splice(0).map((t) => t.card));
  s.discard.push(...p.buildings.splice(0).map((b) => b.card));
  log(s, "forfeit", { actor: p.name, n: dumped });

  // resolve any pending window involving them
  const pend = s.pending;
  if (pend) {
    if (pend.actor === playerId) {
      // the demand leaves with its owner
      s.pending = null;
    } else if (pend.targets.includes(playerId)) {
      const wasCurrent = pend.targets[0] === playerId;
      pend.targets = pend.targets.filter((id) => id !== playerId);
      if (pend.targets.length === 0) {
        s.pending = null;
        s.turnDeadline = now + TURN_MS;
      } else if (wasCurrent) {
        // fresh window for the next target in the queue
        pend.stage = "jsn";
        pend.jsnBy = pend.targets[0];
        pend.jsnDepth = 0;
        pend.deadline = now + JSN_MS;
      }
    }
  }

  // last player standing wins immediately
  const active = activePlayers(s);
  if (active.length === 1) {
    s.winner = active[0].id;
    s.pending = null;
    s.discarding = false;
    s.discardDeadline = null;
    log(s, "win", { actor: active[0].name });
    return;
  }

  // if it was their turn, move straight on to the next active player
  if (s.turn === playerId) {
    s.discarding = false;
    s.discardDeadline = null;
    endTurn(s, now, rng);
  }
}

export const monodealModule: GameModule<MonoDealState, MonoDealView, MonoDealMove> = {
  type: "monodeal",
  minPlayers: MONODEAL_MIN_PLAYERS,
  maxPlayers: MONODEAL_MAX_PLAYERS,
  init,
  applyMove,
  tick,
  redact,
  result: (s) => (s.winner ? { winnerId: s.winner } : null),
  forfeit,
};
