/* Monopoly Deal engine fuzz: thousands of random games, invariants asserted
   at every step. Run: npx tsx scripts/simulate-monodeal.ts */

import {
  activePlayers,
  buildDeck,
  completedColors,
  greedyPayment,
  isComplete,
  monodealModule,
  payableAssets,
  tableValue,
} from "../src/lib/games/monodeal/index.ts";
import {
  COLOR_META,
  COLORS,
  DECK_SIZE,
  HAND_LIMIT,
  PLAYS_PER_TURN,
  type MonoActionKind,
  type MonoCard,
  type MonoColor,
  type MonoDealMove,
  type MonoDealState,
  type MonoDealView,
  type MonoPlayer,
} from "../src/lib/games/monodeal/types.ts";
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

const fail = (msg: string): never => {
  throw new Error(msg);
};

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffled<T>(rng: () => number, arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ---------------- deck assertions ---------------- */

function assertDeck() {
  const deck = buildDeck();
  if (deck.length !== DECK_SIZE) fail(`deck builds to ${deck.length}, expected ${DECK_SIZE}`);
  const ids = new Set(deck.map((c) => c.id));
  if (ids.size !== DECK_SIZE) fail("deck has duplicate card ids");

  const byKind: Record<string, number> = {};
  for (const c of deck) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  const expectKind = { money: 20, property: 28, wild: 11, action: 34, rent: 13 };
  for (const [k, n] of Object.entries(expectKind))
    if (byKind[k] !== n) fail(`deck ${k} count ${byKind[k]} != ${n}`);

  // one street card per slot of every set
  for (const color of COLORS) {
    const n = deck.filter((c) => c.kind === "property" && c.color === color).length;
    if (n !== COLOR_META[color].setSize) fail(`${color} has ${n} street cards, expected ${COLOR_META[color].setSize}`);
  }
  const actionCounts: Partial<Record<MonoActionKind, number>> = {};
  for (const c of deck)
    if (c.kind === "action") actionCounts[c.action] = (actionCounts[c.action] ?? 0) + 1;
  const expectActions: Record<MonoActionKind, number> = {
    deal_breaker: 2, just_say_no: 3, pass_go: 10, forced_deal: 3, sly_deal: 3,
    debt_collector: 3, birthday: 3, house: 3, hotel: 2, double_rent: 2,
  };
  for (const [a, n] of Object.entries(expectActions))
    if (actionCounts[a as MonoActionKind] !== n) fail(`deck action ${a} count != ${n}`);
  const moneyTotal = deck.filter((c) => c.kind === "money").reduce((s, c) => s + c.value, 0);
  if (moneyTotal !== 57) fail(`money total ${moneyTotal} != 57`);
  const allWilds = deck.filter((c) => c.kind === "wild" && c.colors.length === COLORS.length);
  if (allWilds.length !== 2 || allWilds.some((c) => c.value !== 0)) fail("all-color wilds wrong");
  const wildRents = deck.filter((c) => c.kind === "rent" && c.wild);
  if (wildRents.length !== 3) fail("wild rent count != 3");
}

/* ---------------- per-step invariants ---------------- */

function assertInvariants(s: MonoDealState, ctx: string) {
  // 106 cards conserved across deck + discard + hands + banks + tables + buildings
  const seen = new Set<string>();
  const add = (c: MonoCard, zone: string) => {
    if (seen.has(c.id)) fail(`${ctx}: card ${c.id} duplicated (last seen entering ${zone})`);
    seen.add(c.id);
  };
  for (const c of s.deck) add(c, "deck");
  for (const c of s.discard) add(c, "discard");
  for (const p of s.players) {
    for (const c of p.hand) add(c, "hand");
    for (const c of p.bank) add(c, "bank");
    for (const t of p.table) add(t.card, "table");
    for (const b of p.buildings) add(b.card, "buildings");
  }
  if (seen.size !== DECK_SIZE) fail(`${ctx}: ${seen.size} cards in play, expected ${DECK_SIZE}`);

  for (const p of s.players) {
    for (const c of p.bank) {
      if (c.kind === "property" || c.kind === "wild") fail(`${ctx}: ${p.name} banked a property`);
      if (c.value <= 0) fail(`${ctx}: ${p.name} has a non-positive bank card`);
    }
    for (const t of p.table) {
      if (t.card.kind === "property" && t.card.color !== t.color)
        fail(`${ctx}: street assigned to a foreign color`);
      if (t.card.kind === "wild" && !t.card.colors.includes(t.color))
        fail(`${ctx}: wildcard assigned to a disallowed color`);
      if (t.card.kind !== "property" && t.card.kind !== "wild")
        fail(`${ctx}: non-property on a table`);
    }
    for (const b of p.buildings) {
      if (b.card.kind !== "action" || (b.card.action !== "house" && b.card.action !== "hotel"))
        fail(`${ctx}: non-building in buildings`);
      if (!COLOR_META[b.color].buildable) fail(`${ctx}: building on ${b.color}`);
      if (!isComplete(p, b.color)) fail(`${ctx}: building on an incomplete ${b.color} set (should have slid)`);
    }
    // hand limit is enforced the moment a turn ends
    if (p.id !== s.turn && p.hand.length > HAND_LIMIT)
      fail(`${ctx}: ${p.name} holds ${p.hand.length} cards off-turn`);
    // a forfeited player keeps nothing
    if (p.left && (p.hand.length || p.bank.length || p.table.length || p.buildings.length))
      fail(`${ctx}: ${p.name} left but still holds cards`);
  }

  if (s.playsLeft < 0 || s.playsLeft > PLAYS_PER_TURN) fail(`${ctx}: playsLeft ${s.playsLeft}`);
  if (s.turnsTaken > s.capTurns) fail(`${ctx}: turnsTaken ${s.turnsTaken} > cap ${s.capTurns}`);
  if (!s.players.some((p) => p.id === s.turn)) fail(`${ctx}: turn on unknown player`);
  if (!s.winner) {
    if (activePlayers(s).length < 2) fail(`${ctx}: game running with <2 active players`);
    if (s.players.find((x) => x.id === s.turn)!.left) fail(`${ctx}: turn on a player who left`);
  }

  const p = s.pending;
  if (p) {
    if (s.winner) fail(`${ctx}: pending after win`);
    if (s.discarding) fail(`${ctx}: pending during discard stage`);
    if (p.targets.length === 0) fail(`${ctx}: pending with no targets`);
    if (typeof p.deadline !== "number" || p.deadline <= 0) fail(`${ctx}: pending window has no deadline`);
    if (p.targets.includes(p.actor)) fail(`${ctx}: actor targets self`);
    if (s.players.find((x) => x.id === p.actor)!.left) fail(`${ctx}: pending actor left`);
    for (const id of p.targets)
      if (s.players.find((x) => x.id === id)!.left) fail(`${ctx}: pending targets a player who left`);
    if (p.stage === "jsn" && p.jsnBy !== p.targets[0] && p.jsnBy !== p.actor)
      fail(`${ctx}: jsn decider is neither target nor actor`);
    const isMoney = p.kind === "rent" || p.kind === "birthday" || p.kind === "debt_collector";
    if (isMoney && p.amount <= 0) fail(`${ctx}: money demand of $${p.amount}M`);
    if (!isMoney && p.amount !== 0) fail(`${ctx}: steal with an amount`);
    if (p.stage === "pay") {
      const debtor = s.players.find((x) => x.id === p.targets[0])!;
      if (payableAssets(debtor).length === 0) fail(`${ctx}: pay stage with no payable assets`);
    }
  }
  if (s.discarding) {
    if (s.discardDeadline === null) fail(`${ctx}: discard stage without deadline`);
    const t = s.players.find((x) => x.id === s.turn)!;
    if (t.hand.length <= HAND_LIMIT) fail(`${ctx}: discard stage with ${t.hand.length} cards`);
  }
  if (s.winner) {
    const w = s.players.find((x) => x.id === s.winner)!;
    if (w.left) fail(`${ctx}: winner left the game`);
    const active = activePlayers(s);
    if (active.length === 1) {
      if (active[0].id !== s.winner) fail(`${ctx}: sole remaining player isn't the winner`);
    } else if (!s.cappedOut && completedColors(w).length < 3) {
      fail(`${ctx}: winner has ${completedColors(w).length} sets`);
    }
  }
}

/** completed-set detection must be consistent between engine and view */
function assertViewConsistent(s: MonoDealState, v: MonoDealView, ctx: string) {
  for (const pv of v.players) {
    const counts = new Map<MonoColor, number>();
    for (const t of pv.table) counts.set(t.color, (counts.get(t.color) ?? 0) + 1);
    const recomputed = COLORS.filter((c) => (counts.get(c) ?? 0) >= COLOR_META[c].setSize);
    if (recomputed.join(",") !== pv.completed.join(","))
      fail(`${ctx}: completed sets inconsistent for ${pv.name}: ${pv.completed} vs ${recomputed}`);
  }
}

/** opponent + spectator views must contain no foreign hand cards */
function assertRedaction(s: MonoDealState, now: number, ctx: string) {
  const viewer = s.players[0];
  const own = monodealModule.redact(s, viewer.id, now);
  for (const pv of own.players) {
    if (pv.id === viewer.id) {
      if (!pv.hand || pv.hand.length !== viewer.hand.length) fail(`${ctx}: own hand missing from view`);
    } else if (pv.hand !== undefined) {
      fail(`${ctx}: view for ${viewer.id} leaks ${pv.name}'s hand`);
    }
    if (pv.handCount !== s.players.find((x) => x.id === pv.id)!.hand.length)
      fail(`${ctx}: handCount wrong`);
  }
  assertViewConsistent(s, own, ctx);
  const spec = monodealModule.redact(s, "spectator-zz", now);
  for (const pv of spec.players)
    if (pv.hand !== undefined) fail(`${ctx}: spectator view leaks ${pv.name}'s hand`);
}

/* ---------------- random legal move generation ---------------- */

function randomPayment(s: MonoDealState, rng: () => number): { playerId: string; move: MonoDealMove } {
  const p = s.pending!;
  const debtor = s.players.find((x) => x.id === p.targets[0])!;
  if (rng() < 0.3) {
    return { playerId: debtor.id, move: { type: "pay", cardIds: greedyPayment(debtor, p.amount) } };
  }
  const assets = shuffled(rng, payableAssets(debtor));
  const ids: string[] = [];
  let sum = 0;
  for (const a of assets) {
    ids.push(a.card.id);
    sum += a.value;
    if (sum >= p.amount && rng() < 0.8) break;
  }
  return { playerId: debtor.id, move: { type: "pay", cardIds: ids } };
}

function randomTurnMove(s: MonoDealState, rng: () => number): { playerId: string; move: MonoDealMove } {
  const me = s.players.find((x) => x.id === s.turn)!;
  const others = s.players.filter((x) => x.id !== me.id && !x.left);
  const options: MonoDealMove[] = [{ type: "end_turn" }];

  if (s.playsLeft > 0) {
    const dtrIds = me.hand.filter((c) => c.kind === "action" && c.action === "double_rent").map((c) => c.id);
    for (const card of me.hand) {
      if (card.kind === "money" || card.kind === "rent" || card.kind === "action")
        options.push({ type: "bank", cardId: card.id });
      if (card.kind === "property") options.push({ type: "place", cardId: card.id });
      if (card.kind === "wild") {
        // half the time aim at the color we already hold the most of
        let color = pick(rng, card.colors);
        if (rng() < 0.5) {
          let best = color;
          let bestN = -1;
          for (const c of card.colors) {
            const n = me.table.filter((t) => t.color === c).length;
            if (n > bestN) {
              bestN = n;
              best = c;
            }
          }
          color = best;
        }
        options.push({ type: "place", cardId: card.id, color });
      }
      if (card.kind === "action") {
        switch (card.action) {
          case "pass_go":
            options.push({ type: "play_action", cardId: card.id });
            break;
          case "house": {
            const colors = COLORS.filter(
              (c) =>
                COLOR_META[c].buildable &&
                isComplete(me, c) &&
                !me.buildings.some((b) => b.color === c && b.card.kind === "action" && b.card.action === "house")
            );
            if (colors.length) options.push({ type: "play_action", cardId: card.id, color: pick(rng, colors) });
            break;
          }
          case "hotel": {
            const colors = COLORS.filter(
              (c) =>
                isComplete(me, c) &&
                me.buildings.some((b) => b.color === c && b.card.kind === "action" && b.card.action === "house") &&
                !me.buildings.some((b) => b.color === c && b.card.kind === "action" && b.card.action === "hotel")
            );
            if (colors.length) options.push({ type: "play_action", cardId: card.id, color: pick(rng, colors) });
            break;
          }
          case "debt_collector":
            options.push({ type: "play_action", cardId: card.id, target: pick(rng, others).id });
            break;
          case "birthday":
            options.push({ type: "play_action", cardId: card.id });
            break;
          case "sly_deal": {
            const cands = others.flatMap((t) =>
              t.table.filter((e) => !isComplete(t, e.color)).map((e) => ({ t, e }))
            );
            if (cands.length) {
              const c = pick(rng, cands);
              options.push({ type: "play_action", cardId: card.id, target: c.t.id, targetCardId: c.e.card.id });
            }
            break;
          }
          case "forced_deal": {
            if (me.table.length > 0) {
              const cands = others.flatMap((t) =>
                t.table.filter((e) => !isComplete(t, e.color)).map((e) => ({ t, e }))
              );
              if (cands.length) {
                const c = pick(rng, cands);
                options.push({
                  type: "play_action",
                  cardId: card.id,
                  target: c.t.id,
                  targetCardId: c.e.card.id,
                  myCardId: pick(rng, me.table).card.id,
                });
              }
            }
            break;
          }
          case "deal_breaker": {
            const cands = others.flatMap((t) => completedColors(t).map((color) => ({ t, color })));
            if (cands.length) {
              const c = pick(rng, cands);
              options.push({ type: "play_action", cardId: card.id, target: c.t.id, color: c.color });
            }
            break;
          }
          default:
            break; // just_say_no / double_rent are never lead plays
        }
      }
      if (card.kind === "rent") {
        const owned = COLORS.filter((c) => me.table.some((t) => t.color === c));
        const chargeable = card.wild ? owned : owned.filter((c) => card.colors.includes(c));
        if (chargeable.length) {
          const maxDtr = Math.min(2, dtrIds.length, s.playsLeft - 1);
          const nDtr = maxDtr > 0 && rng() < 0.4 ? 1 + Math.floor(rng() * maxDtr) : 0;
          options.push({
            type: "play_rent",
            cardId: card.id,
            color: pick(rng, chargeable),
            target: card.wild ? pick(rng, others).id : undefined,
            doubleIds: dtrIds.slice(0, nDtr),
          });
        }
      }
    }
    const wilds = me.table.filter((t) => t.card.kind === "wild");
    if (wilds.length > 0 && rng() < 0.25) {
      const n = 1 + Math.floor(rng() * Math.min(2, wilds.length));
      const chosen = shuffled(rng, wilds).slice(0, n);
      options.push({
        type: "rearrange",
        moves: chosen.map((w) => ({
          cardId: w.card.id,
          color: pick(rng, w.card.kind === "wild" ? w.card.colors : [w.color]),
        })),
      });
    }
  }
  return { playerId: me.id, move: pick(rng, options) };
}

function randomMove(s: MonoDealState, rng: () => number): { playerId: string; move: MonoDealMove } {
  const p = s.pending;
  if (p) {
    if (p.stage === "jsn") {
      const decider = s.players.find((x) => x.id === p.jsnBy)!;
      const hasJsn = decider.hand.some((c) => c.kind === "action" && c.action === "just_say_no");
      if (hasJsn && rng() < 0.55) return { playerId: decider.id, move: { type: "jsn" } };
      return { playerId: decider.id, move: { type: "decline" } };
    }
    return randomPayment(s, rng);
  }
  if (s.discarding) {
    const me = s.players.find((x) => x.id === s.turn)!;
    const drop = shuffled(rng, me.hand).slice(0, me.hand.length - HAND_LIMIT);
    return { playerId: me.id, move: { type: "discard", cardIds: drop.map((c) => c.id) } };
  }
  return randomTurnMove(s, rng);
}

const nearestDeadline = (s: MonoDealState): number =>
  s.pending ? s.pending.deadline : s.discarding ? s.discardDeadline! : s.turnDeadline;

/* ---------------- run ---------------- */

assertDeck();

const GAMES = Number(process.env.GAMES ?? 2000);
const STEP_CAP = 60_000;
let totalSteps = 0;
let wins = 0;
let caps = 0;
let forfeitWins = 0;
let forfeits = 0;

for (let g = 0; g < GAMES; g++) {
  const seed = 424_000 + g;
  const rng = mulberry32(seed);
  try {
    const n = 2 + Math.floor(rng() * 4); // 2..5 players
    const players: GamePlayer[] = Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      seat: i,
    }));
    let now = 1_000_000;
    const s = monodealModule.init(players, now, rng) as MonoDealState;
    assertInvariants(s, `seed ${seed} init`);
    // forfeit-heavy games in one half, full-length games in the other,
    // so cap/3-set endings keep coverage too
    const forfeitsEnabled = rng() < 0.5;

    let steps = 0;
    while (!monodealModule.result(s)) {
      if (++steps > STEP_CAP) fail(`seed ${seed}: game did not terminate`);
      now += 400 + Math.floor(rng() * 1800);

      if (forfeitsEnabled && rng() < 0.015 && activePlayers(s).length > 1) {
        // ~1.5% of steps: someone walks out mid-game (never below 1 remaining)
        const leaver = pick(rng, activePlayers(s));
        monodealModule.forfeit(s, leaver.id, now, rng);
        forfeits++;
        if (rng() < 0.3) monodealModule.forfeit(s, leaver.id, now, rng); // must be a no-op
        const remaining = activePlayers(s);
        if (remaining.length === 1) {
          const res = monodealModule.result(s);
          if (!res || res.winnerId !== remaining[0].id)
            fail(`seed ${seed} step ${steps}: forfeit-to-one didn't crown the remaining player`);
        }
      } else if (rng() < 0.05) {
        // force the active window to expire — the engine must always progress
        now = Math.max(now, nearestDeadline(s) + 1);
        if (!monodealModule.tick(s, now, rng))
          fail(`seed ${seed} step ${steps}: tick at an expired deadline did not progress`);
      } else if (monodealModule.tick(s, now, rng)) {
        // an organic timeout fired; that IS this step's event
      } else {
        const mv = randomMove(s, rng);
        try {
          monodealModule.applyMove(s, mv.playerId, mv.move, now, rng);
        } catch (e) {
          if (e instanceof MoveError)
            fail(`seed ${seed} step ${steps}: engine rejected generated move ${JSON.stringify(mv)}: ${e.message}`);
          throw e;
        }
      }

      assertInvariants(s, `seed ${seed} step ${steps}`);
      assertRedaction(s, now, `seed ${seed} step ${steps}`);
    }

    // final verdict checks
    const res = monodealModule.result(s)!;
    const w = s.players.find((x: MonoPlayer) => x.id === res.winnerId)!;
    if (w.left) fail(`seed ${seed}: winner left the game`);
    const active = activePlayers(s);
    if (active.length === 1) {
      forfeitWins++;
      if (active[0].id !== w.id) fail(`seed ${seed}: last player standing isn't the winner`);
    } else if (s.cappedOut) {
      caps++;
      const max = Math.max(...active.map((x: MonoPlayer) => tableValue(x)));
      if (tableValue(w) !== max) fail(`seed ${seed}: cap winner isn't the richest active table`);
    } else {
      wins++;
      const colors = completedColors(w);
      if (colors.length < 3) fail(`seed ${seed}: winner has only ${colors.length} completed sets`);
      if (new Set(colors).size < 3) fail(`seed ${seed}: winner's sets aren't distinct colors`);
    }
    if (s.turnsTaken > s.capTurns) fail(`seed ${seed}: played past the round cap`);
    totalSteps += steps;
  } catch (e) {
    console.error(`FAILED at game ${g} (seed ${seed})`);
    throw e;
  }
}

console.log(
  `OK: ${GAMES} games, avg steps ${(totalSteps / GAMES).toFixed(1)} ` +
    `(3-set wins: ${wins}, round-cap wins: ${caps}, forfeit wins: ${forfeitWins}, forfeits injected: ${forfeits})`
);
