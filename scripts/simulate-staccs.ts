/* STACCS engine fuzz test: thousands of random games at every table size
   (2–8; two decks from 6), every placement re-checked independently against
   the STACC as it stood, card conservation every step, plus hardcoded rule
   cases for the geometry and every special card.
   Run: npx tsx scripts/simulate-staccs.ts */
import {
  applyStaccsMove,
  boundsFor,
  buildDeck,
  forfeitStaccs,
  initStaccs,
  playable,
  redactStaccs,
  spotsFor,
  staccsModule,
  tickStaccs,
} from "../src/lib/games/staccs/engine";
import { checkPlacement, coverage, onTable, legalSpots, openRotations, BOUNDS_ONE } from "../src/lib/games/staccs/geometry";
import type { BoardCard, Card, StaccsMove, StaccsState, Suit } from "../src/lib/games/staccs/types";
import { MoveError, type GamePlayer } from "../src/lib/games/types";

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
const fail = (m: string): never => {
  throw new Error(m);
};
const pick = <T,>(rng: () => number, a: T[]): T => a[Math.floor(rng() * a.length)];
const players = (n: number): GamePlayer[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i }));

/* ================= invariants ================= */

function invariants(s: StaccsState, where: string) {
  const total = buildDeck(s.decks).length;
  const ids = [...s.draw.map((c) => c.id), ...s.board.map((b) => b.card.id), ...s.players.flatMap((p) => p.hand.map((c) => c.id))];
  if (ids.length !== total) fail(`${where}: ${ids.length} cards, expected ${total}`);
  if (new Set(ids).size !== total) fail(`${where}: duplicate cards`);
  // every placement was legal against the STACC as it stood
  const b = boundsFor(s.decks);
  let lockFrom = 0;
  let dir = 0;
  for (let i = 1; i < s.board.length; i++) {
    const bc = s.board[i];
    const prefix = s.board.slice(0, i);
    const r = checkPlacement(prefix, coverage(prefix), bc.card, bc.v, b, lockFrom, null);
    if (!r.ok) fail(`${where}: board card ${i} (${bc.card.id}) was illegal: ${r.why}`);
    if (bc.card.rank === "W") {
      if (bc.rot === dir) fail(`${where}: wild ${i} didn't turn`);
      lockFrom = i;
      dir = bc.rot;
    } else if (bc.rot !== dir) fail(`${where}: card ${i} is mis-oriented`);
    if (!onTable(bc.v, b)) fail(`${where}: card ${i} off the table`);
  }
  if (s.lockFrom !== lockFrom || s.dir !== dir) fail(`${where}: lock/dir bookkeeping`);
  if (s.phase !== "over") {
    const t = s.players.find((p) => p.id === s.turn);
    if (!t || t.left) fail(`${where}: turn with ${s.turn}`);
    if (s.phase === "give" && (s.give < 1 || s.give > t.hand.length)) fail(`${where}: bad give ${s.give}`);
  }
  for (const p of s.players) {
    if (p.left && p.hand.length) fail(`${where}: leaver kept cards`);
    if (p.catchable && p.hand.length !== 1) fail(`${where}: ${p.name} catchable with ${p.hand.length} cards`);
  }
  if (s.log.length > 60) fail(`${where}: log uncapped`);
}

/* ================= random games ================= */

const stats = { games: 0, out: 0, fewest: 0, forfeit: 0, wilds: 0, counters: 0, combos: 0, catches: 0, gives: 0, aces: 0, zeros: 0, longest: 0, biggest: 0 };

function playGame(n: number, seed: number): StaccsState {
  const rng = mulberry32(seed);
  let now = 1_000;
  const s = initStaccs(players(n), now, rng);
  invariants(s, "init");
  if (typeof s.board[0].card.rank !== "number" || (s.board[0].card.rank as number) < 2) fail("bad first card");
  const leaver = n > 2 && rng() < 0.1 ? Math.floor(rng() * n) : -1;
  const leaveAt = Math.floor(rng() * 80);
  let steps = 0;
  for (; steps < 3000 && s.phase !== "over"; steps++) {
    now += 400 + Math.floor(rng() * 3000);
    if (steps === leaveAt && leaver >= 0) {
      forfeitStaccs(s, `p${leaver}`, now);
      invariants(s, `forfeit ${steps}`);
      continue;
    }
    // out-of-turn: someone may catch, someone may call
    for (const q of s.players) {
      if (q.left) continue;
      for (const t of s.players) {
        if (t.catchable && t.id !== q.id && rng() < 0.3) {
          applyStaccsMove(s, q.id, { type: "catch", target: t.id }, now);
          stats.catches++;
        }
      }
      if (q.hand.length === 1 && !q.called && rng() < 0.3) applyStaccsMove(s, q.id, { type: "uhoh" }, now);
    }
    if (s.phase === "over") break;
    const p = s.players.find((q) => q.id === s.turn)!;
    if (rng() < 0.04) {
      now = s.deadline! + 1;
      if (!tickStaccs(s, now)) fail("expired turn did not tick");
      invariants(s, `timeout ${steps}`);
      continue;
    }
    let mv: StaccsMove;
    if (s.phase === "give") {
      mv = { type: "give", cardIds: p.hand.slice(0, s.give).map((c) => c.id) };
      stats.gives++;
    } else {
      const options = p.hand.filter((c) => playable(s, p, c));
      if (s.pending && rng() < 0.15) mv = { type: "take" };
      else if (options.length && rng() < 0.9) {
        const c = pick(rng, options);
        const spot = pick(rng, spotsFor(s, c));
        const place: Extract<StaccsMove, { type: "play" }>["place"] = { cardId: c.id, v: spot.v };
        if (c.rank === "W") {
          place.rot = pick(rng, openRotations(s.board, spot.v, s.dir, boundsFor(s.decks)));
          place.called = pick(rng, ["S", "H", "C", "D"] as Suit[]);
          stats.wilds++;
        }
        if (s.pending && c.rank === s.pending.rank) stats.counters++;
        if (s.combo !== null) stats.combos++;
        if (c.rank === "A") stats.aces++;
        if (c.rank === 0) stats.zeros++;
        mv = { type: "play", place, declare: p.hand.length === 2 && rng() < 0.6 };
      } else if (s.combo !== null) mv = { type: "done" };
      else mv = { type: "draw" };
    }
    try {
      applyStaccsMove(s, p.id, mv, now);
    } catch (e) {
      if (!(e instanceof MoveError)) throw e;
      fail(`legal ${mv.type} rejected: ${(e as Error).message}`);
    }
    invariants(s, `step ${steps} (${mv.type})`);
    if (steps % 7 === 0) {
      const v = redactStaccs(s, "p0", now);
      if (v.hand.length !== s.players[0].hand.length) fail("own hand missing");
      const spec = redactStaccs(s, "nobody", now);
      if (spec.hand.length) fail("spectator sees a hand");
      if (JSON.stringify(spec).includes(`"hand":[{`)) fail("hand leaked");
    }
  }
  if (s.phase !== "over") fail(`game ${seed} (${n}p) never ended`);
  const w = s.players.find((p) => p.id === s.winner);
  if (s.winBy === "out" && w!.hand.length !== 0) fail("winner still holds cards");
  if (!staccsModule.isOver!(s)) fail("isOver false");
  stats.games++;
  if (s.winBy === "out") stats.out++;
  if (s.winBy === "fewest" || s.winner === null) stats.fewest++;
  if (s.winBy === "forfeit") stats.forfeit++;
  stats.longest = Math.max(stats.longest, steps);
  stats.biggest = Math.max(stats.biggest, s.board.length);
  return s;
}

/* ================= rule cases ================= */

const C = (suit: Suit, rank: Card["rank"], id = `${suit}${rank}`): Card => ({ id, suit, rank });
const B = (card: Card, v: [number, number], rot = 0): BoardCard => ({ card, v, rot, by: 0 });

function cases() {
  const b = BOUNDS_ONE;
  // the three cardinal rules
  {
    const board = [B(C("S", 2), [0, 0])];
    const cov = coverage(board);
    if (!checkPlacement(board, cov, C("S", 9), [-1, -1], b, 0, null).ok) fail("case: same suit on top");
    if (checkPlacement(board, cov, C("H", 9), [-1, -1], b, 0, null).ok) fail("case: wrong suit on top accepted");
    if (!checkPlacement(board, cov, C("H", 2), [1, 0], b, 0, null).ok) fail("case: same number on side");
    if (checkPlacement(board, cov, C("S", 3), [1, 0], b, 0, null).ok) fail("case: suit match on a side accepted");
    if (checkPlacement(board, cov, C("H", 2), [0, 1], b, 0, null).ok) fail("case: number on a face accepted");
    const jb = [B(C("S", "J"), [0, 0])];
    if (!checkPlacement(jb, coverage(jb), C("H", "J"), [0, 1], b, 0, null).ok) fail("case: same letter on face");
    if (checkPlacement(jb, coverage(jb), C("H", "J"), [1, 0], b, 0, null).ok) fail("case: letter on a side accepted");
    if (!checkPlacement(board, cov, C("D", "W"), [-1, -1], b, 0, null).ok) fail("case: wild on any top");
    if (checkPlacement(board, cov, C("D", "W"), [1, 0], b, 0, null).ok) fail("case: wild on a side accepted");
  }
  // every surface it touches must match; partly covered surfaces are off-limits
  {
    // 5♠ at origin, 5♥ on its side; a heart on top of 5♥ also overlaps half
    // of the 5♠'s top — allowed, and that top is then out of play
    const board = [B(C("S", 5), [0, 0]), B(C("H", 5), [1, 0])];
    const cov = coverage(board);
    const r = checkPlacement(board, cov, C("H", 9), [0, -1], b, 0, null);
    if (!r.ok || r.touches.length !== 1) fail(`case: top of the side card (${r.why})`);
    if (checkPlacement(board, cov, C("C", 9), [0, -1], b, 0, null).ok) fail("case: wrong suit on 5♥'s top");
    const after = [...board, B(C("H", 9), [0, -1])];
    if (checkPlacement(after, coverage(after), C("S", 7), [-1, -1], b, 0, null).ok) fail("case: half-covered top still playable");
    // the 5♠'s side is now covered; nothing more goes there
    if (checkPlacement(board, cov, C("C", 5), [1, 0], b, 0, null).ok) fail("case: stacking onto a covered vertex");
    // but the 5♥'s own side is open
    if (!checkPlacement(board, cov, C("C", 5), [2, 0], b, 0, null).ok) fail("case: chain of fives");
  }
  // locked cards and blocked tops
  {
    const board = [B(C("S", 4), [0, 0]), B(C("H", "W"), [-1, -1], 1)];
    board[1].called = "C";
    const cov = coverage(board);
    if (checkPlacement(board, cov, C("S", 4), [1, 0], b, 1, null).ok) fail("case: stacked onto a locked card");
    const legal = legalSpots(board, C("C", 9), b, 1, null);
    if (!legal.length) fail("case: called suit on the wild's top");
    if (legalSpots(board, C("S", 9), b, 1, null).length) fail("case: wrong suit after a wild");
    const z = [B(C("S", 0), [0, 0])];
    if (checkPlacement(z, coverage(z), C("S", 7), [-1, -1], b, 0, 0).ok) fail("case: blocked zero top accepted");
    if (!checkPlacement(z, coverage(z), C("H", 0), [1, 0], b, 0, 0).ok) fail("case: zero's side stays open");
  }
  // the table edge
  {
    const board = [B(C("S", 4), [0, 0])];
    if (checkPlacement(board, coverage(board), C("S", 5), [-14, -14], b, 0, null).ok) fail("case: off the table accepted");
  }
  // special cards through the engine
  const fresh = (hands: Card[][], first: Card = C("S", 5, "first")): StaccsState => {
    const s = initStaccs(players(hands.length), 0, mulberry32(1));
    const all = buildDeck(s.decks);
    const used = new Set([first.id, ...hands.flat().map((c) => c.id)]);
    s.players.forEach((p, i) => (p.hand = hands[i].map((c) => ({ ...c }))));
    s.board = [B(first, [0, 0])];
    s.draw = all.filter((c) => !used.has(c.id) && !hands.flat().some((h) => h.suit === c.suit && h.rank === c.rank) && !(c.suit === first.suit && c.rank === first.rank));
    // keep conservation honest for the cases: pad the pile to the deck size
    s.turn = "p0";
    s.phase = "play";
    s.lockFrom = 0;
    s.dir = 0;
    s.blockedTop = null;
    s.pending = null;
    s.turnNumbers = [5];
    return s;
  };
  // Jack: next draws 1; countering adds up
  {
    const s = fresh([[C("S", "J", "j1"), C("S", 3, "x1"), C("S", 4, "x2")], [C("H", "J", "j2"), C("H", 3, "y1"), C("H", 4, "y2")], [C("D", 3, "z1"), C("D", 4, "z2")]]);
    applyStaccsMove(s, "p0", { type: "play", place: { cardId: "j1", v: [-1, -1] } }, 1);
    if (s.pending?.n !== 1 || s.turn !== "p1") fail("case: jack attack");
    applyStaccsMove(s, "p1", { type: "play", place: { cardId: "j2", v: [-1, 0] } }, 2);
    if (s.pending?.n !== 2 || s.turn !== "p2") fail(`case: jack counter (${s.pending?.n}, ${s.turn})`);
    const before = s.players[2].hand.length;
    applyStaccsMove(s, "p2", { type: "take" }, 3);
    if (s.players[2].hand.length !== before + 2 || s.turn !== "p2") fail("case: taking keeps your turn");
  }
  // Queen: give a card; Ace: go again; wild can't be your last card
  {
    const s = fresh([[C("S", "Q", "q"), C("S", "A", "a"), C("S", 9, "g"), C("D", 8, "keep")], [C("H", 3, "h1")]]);
    applyStaccsMove(s, "p0", { type: "play", place: { cardId: "a", v: [-1, -1] } }, 1);
    if (s.turn !== "p0") fail("case: ace extra turn");
    applyStaccsMove(s, "p0", { type: "play", place: { cardId: "q", v: [-2, -2] } }, 2);
    if (s.phase !== "give" || s.give !== 1) fail("case: queen give phase");
    applyStaccsMove(s, "p0", { type: "give", cardIds: ["g"] }, 3);
    if (s.players[1].hand.length !== 2 || s.turn !== "p1") fail("case: queen handed over");
    // giving away your last card takes you out
    const o = fresh([[C("S", "Q", "q"), C("S", 9, "g")], [C("H", 3, "h1")]]);
    applyStaccsMove(o, "p0", { type: "play", place: { cardId: "q", v: [-1, -1] } }, 1);
    applyStaccsMove(o, "p0", { type: "give", cardIds: ["g"] }, 2);
    if (o.phase !== "over" || o.winner !== "p0") fail("case: queen out");
    const w = fresh([[C("S", "W", "w")], [C("H", 3, "h1")]]);
    try {
      applyStaccsMove(w, "p0", { type: "play", place: { cardId: "w", v: [-1, -1], rot: 2, called: "H" } }, 1);
      fail("case: went out on a wild");
    } catch (e) {
      if (!(e instanceof MoveError)) throw e;
    }
  }
  // UH OH: forget and get caught = draw 3
  {
    const s = fresh([[C("S", 9, "a1"), C("S", 8, "a2")], [C("H", 3, "b1"), C("H", 4, "b2")]]);
    applyStaccsMove(s, "p0", { type: "play", place: { cardId: "a1", v: [-1, -1] } }, 1);
    if (!s.players[0].catchable) fail("case: forgot UH OH but not catchable");
    applyStaccsMove(s, "p1", { type: "catch", target: "p0" }, 2);
    if (s.players[0].hand.length !== 4) fail("case: catch penalty");
    const t = fresh([[C("S", 9, "a1"), C("S", 8, "a2")], [C("H", 3, "b1"), C("H", 4, "b2")]]);
    applyStaccsMove(t, "p0", { type: "play", place: { cardId: "a1", v: [-1, -1] }, declare: true }, 1);
    if (t.players[0].catchable) fail("case: declared but catchable");
  }
  // multiple numbers at once, only for numbers already on the STACC
  {
    const s = fresh([[C("H", 5, "f1"), C("C", 5, "f2"), C("C", 9, "n")], [C("D", 3, "z")]]);
    applyStaccsMove(s, "p0", { type: "play", place: { cardId: "f1", v: [1, 0] } }, 1);
    if (s.combo !== 5 || s.turn !== "p0") fail("case: combo continues");
    applyStaccsMove(s, "p0", { type: "play", place: { cardId: "f2", v: [2, 0] } }, 2);
    if (s.turn !== "p1") fail("case: combo ends when out of fives");
  }
  // zero: blocks the next top, reverses with 3+
  {
    const s = fresh([[C("S", 0, "z0"), C("S", 9, "k")], [C("S", 7, "s7"), C("H", 4, "h4")], [C("D", 3, "d3")]]);
    s.turnNumbers = [5];
    applyStaccsMove(s, "p0", { type: "play", place: { cardId: "z0", v: [-1, -1] } }, 1);
    if (s.order !== -1 || s.turn !== "p2") fail(`case: zero reverses (${s.order}, ${s.turn})`);
    if (s.blockedTop !== 1) fail("case: zero blocks the next top");
  }
}

/* ================= run ================= */

const t0 = Date.now();
cases();
console.log("rule cases ok");
for (const n of [2, 3, 4, 5, 6, 7, 8]) for (let i = 0; i < 300; i++) playGame(n, n * 100_000 + i);
console.log(
  `OK: ${stats.games} games — ${stats.out} gone out, ${stats.fewest} stuck (fewest cards), ${stats.forfeit} walkovers; ` +
    `${stats.wilds} wilds, ${stats.counters} counters, ${stats.combos} combo plays, ${stats.aces} aces, ${stats.zeros} zeros, ${stats.gives} gives, ${stats.catches} catches; ` +
    `longest ${stats.longest} steps, biggest STACC ${stats.biggest} cards`
);
const d = playGame(3, 4242);
const e = playGame(3, 4242);
if (JSON.stringify(d) !== JSON.stringify(e)) fail("not deterministic");
console.log(`all STACCS checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
