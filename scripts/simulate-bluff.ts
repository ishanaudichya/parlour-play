/* Bluff engine fuzz test: thousands of random games at every table size
   (2–8) — honest players, liars, eager callers, passers, clocks running out,
   walk-outs — with the whole table re-checked after every step: all 52 cards
   accounted for (hands + pile + set aside), no card in two places, rounds and
   passes consistent, the turn always with someone who can act, and every
   view leaking nothing but your own cards and the last call's. Plus rule
   cases for each part of the Indian rules.
   Run: npx tsx scripts/simulate-bluff.ts */
import { applyBluffMove, bluffModule, byRank, forfeitBluff, initBluff, redactBluff, tickBluff } from "../src/lib/games/bluff/engine";
import { LASTCALL_MS, MAX_PLAY, TURN_MS, type BluffMove, type BluffState, type Card } from "../src/lib/games/bluff/types";
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
const players = (n: number): GamePlayer[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i }));
const card = (id: string): Card => ({ id, r: Number(id.slice(0, -1)), s: id.slice(-1) as Card["s"] });

function rejects(s: BluffState, id: string, mv: BluffMove, why: string) {
  const before = JSON.stringify(s);
  try {
    applyBluffMove(s, id, mv, s.updatedAt + 1, () => 0.5);
  } catch (e) {
    if (!(e instanceof MoveError)) throw e;
    if (JSON.stringify(s) !== before) fail(`refused move changed the state: ${why}`);
    return;
  }
  fail(`accepted: ${why}`);
}

function invariants(s: BluffState, where: string) {
  const seen = new Set<string>();
  const add = (c: Card) => {
    if (seen.has(c.id)) fail(`${where}: ${c.id} in two places`);
    seen.add(c.id);
  };
  for (const p of s.players) {
    p.hand.forEach(add);
    for (let i = 1; i < p.hand.length; i++) if (byRank(p.hand[i - 1], p.hand[i]) > 0) fail(`${where}: ${p.name}'s hand unsorted`);
    if (p.left && p.hand.length) fail(`${where}: a leaver kept cards`);
  }
  for (const pl of s.pile) {
    if (pl.cards.length < 1 || pl.cards.length > MAX_PLAY) fail(`${where}: a play of ${pl.cards.length}`);
    pl.cards.forEach(add);
  }
  if (seen.size + s.burned !== 52) fail(`${where}: ${seen.size} cards in play + ${s.burned} set aside ≠ 52`);
  if ((s.rank === null) !== (s.pile.length === 0)) fail(`${where}: rank ${s.rank} with ${s.pile.length} plays`);
  if (s.pile.length === 0 && s.players.some((p) => p.passed)) fail(`${where}: a pass outlived its round`);
  if (s.phase === "play") {
    const t = s.players.find((p) => p.id === s.turn);
    if (!t || t.left || t.passed) fail(`${where}: turn with ${s.turn}`);
    if (t!.hand.length === 0) fail(`${where}: turn with an empty hand`);
    if (s.players.some((p) => !p.left && p.hand.length === 0)) fail(`${where}: an empty hand outside a last call`);
    const last = s.pile.at(-1);
    if (last && s.players.filter((p) => !p.left && p.seat !== last.seat).every((p) => p.passed)) fail(`${where}: everyone passed but the round goes on`);
    if (s.deadline === null) fail(`${where}: no clock`);
  }
  if (s.phase === "lastcall") {
    const c = s.players.find((p) => p.id === s.turn)!;
    if (c.hand.length !== 0 || s.pile.at(-1)?.seat !== c.seat) fail(`${where}: last call on someone with cards`);
  }
  if (s.phase === "over" && s.winBy === "empty") {
    const w = s.players.find((p) => p.id === s.winner);
    if (!w || w.hand.length !== 0) fail(`${where}: winner holds cards`);
  }
  if (s.log.length > 60) fail(`${where}: log uncapped`);

  // views: your hand, your own plays and the last call — nothing else
  for (const viewer of [...s.players.map((p) => p.id), "spectator"]) {
    const v = redactBluff(s, viewer, s.updatedAt);
    const me = s.players.find((p) => p.id === viewer);
    const allowed = new Set<string>([...(me?.hand ?? []).map((c) => c.id), ...s.pile.filter((pl) => pl.seat === me?.seat).flatMap((pl) => pl.cards.map((c) => c.id)), ...(s.reveal?.cards ?? []).map((c) => c.id)]);
    const json = JSON.stringify({ ...v, reveal: null });
    for (const m of json.matchAll(/"id":"(\d{1,2}[SHDC])"/g)) if (!allowed.has(m[1])) fail(`${where}: ${viewer} can see ${m[1]}`);
    if (v.pileCount !== s.pile.reduce((a, pl) => a + pl.cards.length, 0)) fail(`${where}: pile count`);
    if (v.players.some((q, i) => q.count !== s.players[i].hand.length)) fail(`${where}: hand counts`);
  }
}

const stats = { games: 0, steps: 0, lies: 0, calls: 0, caught: 0, burns: 0, lastcalls: 0, survived: 0, timeouts: 0, walkovers: 0 };

function playGame(n: number, seed: number) {
  const rng = mulberry32(seed);
  let now = 1000;
  const s = initBluff(players(n), now, rng);
  invariants(s, "deal");
  const sizes = s.players.map((p) => p.hand.length);
  if (Math.max(...sizes) - Math.min(...sizes) > 1) fail("uneven deal");
  // a personality each: how often they lie, call and pass
  const liar = s.players.map(() => rng());
  const caller = s.players.map(() => rng() * 0.5);
  const leaver = n > 2 && rng() < 0.15 ? Math.floor(rng() * n) : -1;
  const leaveAt = Math.floor(rng() * 300);
  for (let step = 0; s.phase !== "over"; step++) {
    if (step > 20_000) fail(`game ${seed} never ended`);
    now += 300;
    stats.steps++;
    if (step === leaveAt && leaver >= 0 && !s.players[leaver].left) {
      forfeitBluff(s, `p${leaver}`, now, rng);
      invariants(s, `forfeit ${step}`);
      continue;
    }
    // somebody calls the latest play?
    const last = s.pile.at(-1);
    if (last && !s.players[last.seat].left) {
      const callers = s.players.filter((p) => !p.left && p.seat !== last.seat && rng() < (s.phase === "lastcall" ? caller[p.seat] * 1.5 : caller[p.seat] * 0.35));
      if (callers.length) {
        const c = callers[Math.floor(rng() * callers.length)];
        const before = s.pile.reduce((a, pl) => a + pl.cards.length, 0);
        const wasLast = s.phase === "lastcall";
        applyBluffMove(s, c.id, { type: "call", at: last.seq }, now, rng);
        stats.calls++;
        const r = s.reveal!;
        if (r.seq !== last.seq || r.n !== before) fail("reveal doesn't match the call");
        if (r.honest !== last.cards.every((x) => x.r === r.rank)) fail("call judged wrong");
        if (r.taker !== (r.honest ? c.seat : last.seat)) fail("wrong taker");
        if (!r.honest) stats.caught++;
        if (wasLast && r.honest && s.winner !== s.players[last.seat].id) fail("an honest last play didn't win");
        if (s.phase === "play" && s.turn !== s.players[r.honest ? last.seat : c.seat].id) fail("the call's winner doesn't lead");
        rejects(s, c.id, { type: "call", at: last.seq }, "called a settled play");
        invariants(s, `call ${step}`);
        continue;
      }
    }
    if (s.phase === "lastcall") {
      const claimant = s.turn;
      if (rng() < 0.15) {
        now = s.deadline! + 1;
        tickBluff(s, now, rng);
      } else {
        for (const p of s.players) if (!p.left && p.id !== claimant && s.phase === "lastcall") applyBluffMove(s, p.id, { type: "believe" }, now, rng);
      }
      if (s.phase !== "over" || s.winner !== claimant) fail("an unchallenged last play didn't win");
      stats.survived++;
      invariants(s, `last call ${step}`);
      continue;
    }
    const p = s.players.find((q) => q.id === s.turn)!;
    const other = s.players.find((q) => q.id !== p.id && !q.left)!;
    if (rng() < 0.03) {
      now = s.deadline! + 1;
      if (!tickBluff(s, now, rng)) fail("expired turn did not tick");
      stats.timeouts++;
      invariants(s, `timeout ${step}`);
      continue;
    }
    rejects(s, other.id, { type: "pass" }, "passed out of turn");
    if (s.rank === null) rejects(s, p.id, { type: "pass" }, "passed while leading");
    const pilesBefore = s.pile.length;
    const lastSeat = s.pile.at(-1)?.seat;
    if (s.rank !== null && rng() < 0.3) {
      applyBluffMove(s, p.id, { type: "pass" }, now, rng);
      if (s.pile.length === 0) {
        stats.burns++;
        if (s.players.find((q) => q.id === s.turn)!.seat !== (s.players[lastSeat!].left ? s.players.find((q) => q.id === s.turn)!.seat : lastSeat)) fail("the last to play doesn't lead after a burn");
      } else if (!s.players[p.seat].passed) fail("pass not recorded");
    } else {
      const k = 1 + Math.floor(rng() * Math.min(MAX_PLAY, p.hand.length));
      const rank = s.rank ?? p.hand[Math.floor(rng() * p.hand.length)].r;
      const truthful = p.hand.filter((c) => c.r === rank);
      const lie = rng() < liar[p.seat] || truthful.length === 0;
      const pick = lie ? [...p.hand].sort(() => rng() - 0.5).slice(0, k) : truthful.slice(0, k);
      if (pick.some((c) => c.r !== rank)) stats.lies++;
      if (s.rank !== null) rejects(s, p.id, { type: "play", cards: pick.map((c) => c.id), rank: (rank % 13) + 1 }, "named another rank mid-round");
      rejects(s, p.id, { type: "play", cards: [...pick.map((c) => c.id), pick[0].id] }, "the same card twice");
      applyBluffMove(s, p.id, { type: "play", cards: pick.map((c) => c.id), rank: s.rank === null ? rank : undefined }, now, rng);
      if (s.phase === "lastcall") stats.lastcalls++;
      else if (s.pile.length !== pilesBefore + 1 && s.pile.length !== 0) fail("play didn't land on the pile");
    }
    invariants(s, `step ${step}`);
  }
  if (!bluffModule.isOver!(s)) fail("isOver false");
  if (s.winBy === "forfeit") stats.walkovers++;
  stats.games++;
}

function cases() {
  const rng = () => 0.5;
  // a fixed table of three: p0 leads
  const deal = (hands: string[][]): BluffState => {
    const s = initBluff(players(hands.length), 1, rng);
    const used = new Set(hands.flat());
    s.players.forEach((p, i) => (p.hand = hands[i].map(card).sort(byRank)));
    s.burned = 52 - used.size;
    s.turn = "p0";
    invariants(s, "case deal");
    return s;
  };
  let s = deal([["13S", "13H", "2C", "5D"], ["13D", "7S", "8S"], ["13C", "9H", "4H"]]);
  rejects(s, "p1", { type: "play", cards: ["7S"], rank: 7 }, "out of turn");
  rejects(s, "p0", { type: "pass" }, "leader passed");
  rejects(s, "p0", { type: "play", cards: ["13S"] }, "lead without a rank");
  rejects(s, "p0", { type: "play", cards: ["7S"], rank: 7 }, "somebody else's card");
  rejects(s, "p0", { type: "play", cards: [], rank: 7 }, "no cards");
  applyBluffMove(s, "p0", { type: "play", cards: ["13S", "2C"], rank: 13 }, 2, rng); // two Kings (one a lie)
  if (s.turn !== "p1" || s.rank !== 13) fail("case: turn after the lead");
  rejects(s, "p1", { type: "play", cards: ["7S"], rank: 7 }, "a new rank mid-round");
  rejects(s, "p0", { type: "call", at: 1 }, "called their own play");
  applyBluffMove(s, "p1", { type: "pass" }, 3, rng);
  rejects(s, "p1", { type: "play", cards: ["7S"] }, "played after passing");
  // a passed player may still call — and the lie is caught: p0 takes the pile, p1 leads
  applyBluffMove(s, "p1", { type: "call", at: 1 }, 4, rng);
  if (s.reveal?.honest !== false || s.players[0].hand.length !== 4 || s.turn !== "p1" || s.rank !== null || s.players[1].passed) fail("case: caught lie");
  // honest play called: the caller takes it, the player leads
  applyBluffMove(s, "p1", { type: "play", cards: ["13D"], rank: 13 }, 5, rng);
  applyBluffMove(s, "p2", { type: "call", at: 2 }, 6, rng);
  if (s.reveal?.honest !== true || s.players[2].hand.length !== 4 || s.turn !== "p1") fail("case: honest call");
  // a stale call is refused once a newer play is down
  applyBluffMove(s, "p1", { type: "play", cards: ["7S"], rank: 7 }, 7, rng);
  applyBluffMove(s, "p2", { type: "play", cards: ["9H"] }, 8, rng);
  rejects(s, "p0", { type: "call", at: 3 }, "called an older play");
  // everyone else passes: the pile is set aside unseen, the last to play leads
  const burned = s.burned;
  applyBluffMove(s, "p0", { type: "pass" }, 9, rng);
  applyBluffMove(s, "p1", { type: "pass" }, 10, rng);
  if (s.burned !== burned + 2 || s.pile.length !== 0 || s.turn !== "p2" || s.rank !== null) fail("case: all passed");

  // last cards: believed by everyone → a win
  s = deal([["5S"], ["6S", "7S"], ["8S", "9S"]]);
  applyBluffMove(s, "p0", { type: "play", cards: ["5S"], rank: 5 }, 2, rng);
  if (s.phase !== "lastcall" || s.deadline !== 2 + LASTCALL_MS) fail("case: last call opens");
  rejects(s, "p0", { type: "believe" }, "believed themselves");
  rejects(s, "p1", { type: "play", cards: ["6S"] }, "played during a last call");
  applyBluffMove(s, "p1", { type: "believe" }, 3, rng);
  if (s.phase !== "lastcall") fail("case: one belief isn't everyone's");
  applyBluffMove(s, "p2", { type: "believe" }, 4, rng);
  if (s.phase !== "over" || s.winner !== "p0") fail("case: believed last play wins");
  // last cards, honest, called: still a win
  s = deal([["5S"], ["6S"], ["8S"]]);
  applyBluffMove(s, "p0", { type: "play", cards: ["5S"], rank: 5 }, 2, rng);
  applyBluffMove(s, "p2", { type: "call", at: 1 }, 3, rng);
  if (s.winner !== "p0" || s.players[2].hand.length !== 2) fail("case: honest last play called");
  // last cards, a lie, called: they take the pile and play on, the caller leads
  s = deal([["5S"], ["6S"], ["8S"]]);
  applyBluffMove(s, "p0", { type: "play", cards: ["5S"], rank: 9 }, 2, rng);
  applyBluffMove(s, "p1", { type: "call", at: 1 }, 3, rng);
  if (s.phase !== "play" || s.players[0].hand.length !== 1 || s.turn !== "p1") fail("case: caught on the last card");
  // last cards, nobody decides: the clock lets it stand
  s = deal([["5S"], ["6S"], ["8S"]]);
  applyBluffMove(s, "p0", { type: "play", cards: ["5S"], rank: 2 }, 2, rng);
  tickBluff(s, 2 + LASTCALL_MS, rng);
  if (s.winner !== "p0") fail("case: last call timed out");

  // the clock: a leader leads their biggest set honestly; a follower passes
  s = deal([["3S", "3H", "3D", "9C"], ["6S", "7S"], ["8S", "9S"]]);
  tickBluff(s, 1 + TURN_MS, rng);
  if (s.rank !== 3 || s.pile[0].cards.length !== 3 || s.pile[0].cards.some((c) => c.r !== 3)) fail("case: timed-out lead");
  tickBluff(s, s.deadline!, rng);
  if (!s.players[1].passed || s.turn !== "p2") fail("case: timed-out follow");

  // walk-outs: on their turn the turn moves on; the last one standing wins
  s = deal([["3S", "4S"], ["6S", "7S"], ["8S", "9S"]]);
  applyBluffMove(s, "p0", { type: "play", cards: ["3S"], rank: 3 }, 2, rng);
  forfeitBluff(s, "p1", 3, rng);
  if (s.turn !== "p2" || s.players[1].hand.length) fail("case: leaver on turn");
  invariants(s, "case leaver");
  rejects(s, "p2", { type: "call", at: 0 }, "called a play that isn't there");
  forfeitBluff(s, "p0", 4, rng);
  if (s.phase !== "over" || s.winner !== "p2" || s.winBy !== "forfeit") fail("case: walkover");
  // a claimant who walks out on their own last call
  s = deal([["5S"], ["6S"], ["8S"]]);
  applyBluffMove(s, "p0", { type: "play", cards: ["5S"], rank: 5 }, 2, rng);
  forfeitBluff(s, "p0", 3, rng);
  if (s.phase !== "play" || s.pile.length || s.turn !== "p1") fail("case: claimant left mid last call");
  invariants(s, "case claimant left");
}

const t0 = Date.now();
cases();
console.log("rule cases ok");
for (const n of [2, 3, 4, 5, 6, 7, 8]) for (let i = 0; i < 300; i++) playGame(n, n * 10_000 + i);
console.log(
  `OK: ${stats.games} games, ${stats.steps} steps — ${stats.lies} lies, ${stats.calls} calls (${stats.caught} caught), ${stats.burns} piles set aside, ${stats.lastcalls} last calls (${stats.survived} stood), ${stats.timeouts} timeouts, ${stats.walkovers} walkovers`
);
console.log(`all Bluff checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
