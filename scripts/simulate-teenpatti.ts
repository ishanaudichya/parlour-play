/* Teen Patti engine fuzz test: hardcoded ranking unit tests, then thousands of
   random sessions with invariants asserted at every step.
   Run: npx tsx scripts/simulate-teenpatti.ts */

import { teenpattiModule, unfolded } from "../src/lib/games/teenpatti/engine.ts";
import { compareHands, rankLabel } from "../src/lib/games/teenpatti/ranking.ts";
import {
  BOOT,
  HAND_CAP,
  LOG_CAP,
  START_CHIPS,
  type Card,
  type CardRank,
  type Suit,
  type TeenPattiMove,
  type TeenPattiState,
} from "../src/lib/games/teenpatti/types.ts";
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

const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

/* ================= ranking unit tests ================= */

const RANK_OF: Record<string, CardRank> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** h("AS KS QS") → Card[] */
function h(spec: string): Card[] {
  return spec.split(" ").map((cs) => ({ r: RANK_OF[cs[0]], s: cs[1] as Suit }));
}

let rankTests = 0;
function expectCmp(a: string, b: string, want: -1 | 0 | 1) {
  const got = compareHands(h(a), h(b));
  if (got !== want) throw new Error(`ranking: cmp(${a} | ${b}) = ${got}, want ${want}`);
  // antisymmetry for free
  const rev = compareHands(h(b), h(a));
  if (rev !== -want) throw new Error(`ranking: cmp(${b} | ${a}) = ${rev}, want ${-want}`);
  rankTests++;
}
function expectLabel(a: string, want: string) {
  const got = rankLabel(h(a));
  if (got !== want) throw new Error(`ranking: label(${a}) = "${got}", want "${want}"`);
  rankTests++;
}

// sequence ordering: A-K-Q > A-2-3 > K-Q-J > … > 4-3-2 (pure and plain)
expectCmp("AS KS QS", "AH 2H 3H", 1);
expectCmp("AH 2H 3H", "KH QH JH", 1);
expectCmp("AS 2H 3D", "KS QH JD", 1);
expectCmp("KS QH JD", "QD JC TS", 1);
expectCmp("5S 4H 3D", "4H 3D 2S", 1);
expectCmp("4H 3D 2S", "AS 2D 3C", -1);
// category ordering
expectCmp("2S 2H 2D", "AS KS QS", 1); // trail 2s > AKQ pure sequence
expectCmp("AS AH AD", "KS KH KD", 1); // trail aces > trail kings
expectCmp("4S 3S 2S", "AS KH QD", 1); // lowest pure sequence > best plain sequence
expectCmp("4H 3D 2S", "AS KS 9S", 1); // lowest plain sequence > best color
expectCmp("AS KS 9S", "AS AH 2D", 1); // color > pair (aces)
expectCmp("2S 2H 3D", "AS KD JH", 1); // lowest pair > best high card
// within-category comparisons
expectCmp("9S 9H AS", "9D 9C KS", 1); // pair ties break by kicker
expectCmp("AS AH 9D", "KS KH AD", 1); // pair rank before kicker
expectCmp("AS QS 9S", "AH QH 8H", 1); // color: third card decides
expectCmp("AS QS 9S", "AH JH 9H", 1); // color: second card decides
expectCmp("AS KD JH", "AC KH 9D", 1); // high card: third card decides
// exact ties (suits never break ties)
expectCmp("AS KH 9D", "AD KC 9S", 0);
expectCmp("2H 2S AD", "2D 2C AH", 0);
expectCmp("AS KS QS", "AH KH QH", 0); // identical pure sequences, different suits
expectCmp("7S 7H 7D", "7S 7H 7D", 0);
// labels
expectLabel("KS KH KD", "Trail of Kings");
expectLabel("6S 6H 6D", "Trail of Sixes");
expectLabel("AS KS QS", "Pure Sequence, Ace high");
expectLabel("AH 2H 3H", "Pure Sequence, A-2-3");
expectLabel("KS QH JD", "Sequence, King high");
expectLabel("AS 2D 3C", "Sequence, A-2-3");
expectLabel("AS QS 9S", "Color, Ace high");
expectLabel("9S 9H AD", "Pair of Nines");
expectLabel("AS KD JH", "Ace High");

console.log(`ranking: ${rankTests} unit tests passed`);

/* ================= session fuzz ================= */

const { init, applyMove, tick, redact, result, forfeit } = teenpattiModule;

function assertInv(s: TeenPattiState, n: number, ctx: string) {
  const die = (msg: string): never => {
    throw new Error(`${ctx}: ${msg}`);
  };
  // chip conservation: chips in play + pot + chips that left with departed players
  const sum = s.players.reduce((a, p) => a + p.chips, 0) + s.pot + s.departedChips;
  if (sum !== START_CHIPS * n) die(`chip sum ${sum} != ${START_CHIPS * n}`);
  if (s.departedChips < 0) die("negative departedChips");
  if (s.pot < 0) die(`pot ${s.pot} < 0`);
  if (s.stake < BOOT) die(`stake ${s.stake} < boot`);
  if (s.handNo > HAND_CAP) die(`handNo ${s.handNo} > cap`);
  if (s.log.length > LOG_CAP) die(`log ${s.log.length} > cap`);
  for (const p of s.players) {
    if (p.chips < 0) die(`${p.name} has ${p.chips} chips`);
    if (p.busted && p.inHand) die(`${p.name} busted but in hand`);
    if (p.inHand && p.cards.length !== 3) die(`${p.name} in hand with ${p.cards.length} cards`);
    if (p.left && p.chips !== 0) die(`left player ${p.name} still holds chips`);
    if (p.left && p.inHand && !p.folded) die(`left player ${p.name} still contests the hand`);
  }
  // no duplicate cards among dealt hands
  const seen = new Set<string>();
  for (const p of s.players)
    for (const c of p.cards) {
      const key = `${c.r}${c.s}`;
      if (seen.has(key)) die(`duplicate card ${key}`);
      seen.add(key);
    }
  if (s.phase === "playing") {
    const t = s.players.find((p) => p.id === s.turn);
    if (!t) die("playing without a turn player");
    else if (!t.inHand || t.folded || t.allIn || t.busted || t.left)
      die(`turn on ineligible ${t.name}`);
    if (!s.deadline) die("playing without a deadline");
    const alive = unfolded(s);
    if (alive.length < 2) die("playing with < 2 unfolded");
    if (alive.filter((p) => !p.allIn).length < 2) die("betting state with < 2 able to act");
  }
  if (s.phase === "session_over" && !s.winnerId) die("session over without winner");
}

function checkRedaction(s: TeenPattiState, n: number, now: number, ctx: string) {
  const viewers = [...s.players.map((p) => p.id), "spectator-x"];
  for (const vid of viewers) {
    const v = redact(s, vid, now);
    const me = s.players.find((p) => p.id === vid);
    if (!me && v.yourCards !== null) throw new Error(`${ctx}: spectator got cards`);
    if (me && me.inHand && !me.seen && v.yourCards !== null)
      throw new Error(`${ctx}: blind player ${vid} can see own cards`);
    if (me && me.inHand && me.seen && !me.busted && v.yourCards?.length !== 3)
      throw new Error(`${ctx}: seen player ${vid} missing cards`);
    // live opponents' hands must NEVER appear anywhere in the players list
    if (JSON.stringify(v.players).includes('"cards"'))
      throw new Error(`${ctx}: player list leaks cards`);
    if (v.now !== now) throw new Error(`${ctx}: view.now missing`);
    if (v.players.length !== n) throw new Error(`${ctx}: player count mismatch`);
  }
}

let totalForfeits = 0;

/** One random-but-legal step; occasionally exercises timeouts, forfeits and illegal probes. */
function step(s: TeenPattiState, now: number, rng: () => number) {
  // ~1.5% of steps: a random player leaves the party (never the last one)
  if (rng() < 0.015) {
    const remaining = s.players.filter((p) => !p.left);
    if (remaining.length >= 2) {
      const leaver = pick(rng, remaining);
      forfeit(s, leaver.id, now, rng);
      totalForfeits++;
      if (!leaver.left || leaver.chips !== 0) throw new Error("forfeit did not remove the player");
      // forfeit must be a no-op the second time (and for unknown ids)
      const logLen = s.log.length;
      const lastI = s.log[s.log.length - 1]?.i ?? 0;
      forfeit(s, leaver.id, now + 1, rng);
      forfeit(s, "ghost-player", now + 1, rng);
      if (s.log.length !== logLen || (s.log[s.log.length - 1]?.i ?? 0) !== lastI)
        throw new Error("repeated forfeit was not a no-op");
      return;
    }
  }

  if (s.phase === "hand_over") {
    if (rng() < 0.2) {
      if (tick(s, s.deadline! - 1, rng)) throw new Error("tick fired before deadline");
    }
    tick(s, Math.max(now, s.deadline!) + 1, rng);
    return;
  }
  if (s.phase !== "playing") return;

  const turnP = s.players.find((p) => p.id === s.turn)!;

  // occasional timeout → engine must auto-FOLD the on-turn player
  if (rng() < 0.04) {
    const before = turnP.chips;
    tick(s, s.deadline! + 1, rng);
    if (!turnP.folded && s.lastHand?.winnerId !== turnP.id && turnP.chips !== before)
      throw new Error("timeout changed chips of the timed-out player");
    return;
  }

  // occasional illegal probe: left / folded / all-in / off-turn players must be rejected
  if (rng() < 0.05) {
    const illegal =
      s.players.find((p) => p.left) ??
      s.players.find((p) => p.folded && p.inHand) ??
      s.players.find((p) => p.inHand && !p.folded && p.allIn) ??
      s.players.find((p) => p.inHand && !p.folded && p.id !== s.turn);
    if (illegal) {
      const snapshot = illegal.chips + s.pot;
      let threw = false;
      try {
        applyMove(s, illegal.id, { type: "bet" }, now, rng);
      } catch (e) {
        if (!(e instanceof MoveError)) throw e;
        threw = true;
      }
      if (!threw) throw new Error(`illegal actor ${illegal.name} was allowed to bet`);
      if (illegal.chips + s.pot !== snapshot) throw new Error("rejected move mutated chips");
    }
    return;
  }

  // occasional off-turn "see" by a blind unfolded player (legal by design)
  if (rng() < 0.08) {
    const blind = s.players.filter(
      (p) => p.inHand && !p.folded && !p.seen && !p.left && p.id !== s.turn
    );
    if (blind.length) {
      applyMove(s, pick(rng, blind).id, { type: "see" }, now, rng);
      return;
    }
  }

  // the on-turn player acts
  const alive = unfolded(s);
  const showCost = (turnP.seen ? 2 : 1) * s.stake;
  const options: TeenPattiMove[] = [];
  if (!turnP.seen) options.push({ type: "see" }, { type: "see" });
  options.push({ type: "bet" }, { type: "bet" }, { type: "bet" }, { type: "bet", raise: true });
  options.push({ type: "fold" });
  if (alive.length === 2 && turnP.chips >= showCost) options.push({ type: "show" }, { type: "show" });
  applyMove(s, turnP.id, pick(rng, options), now, rng);
}

const SESSIONS = Number(process.env.SESSIONS ?? 2500);
let totalHands = 0;
let totalSteps = 0;

for (let g = 0; g < SESSIONS; g++) {
  const seed = 42_000 + g;
  const rng = mulberry32(seed);
  try {
    const n = 2 + Math.floor(rng() * 7); // 2..8 players
    const players: GamePlayer[] = Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      seat: i,
    }));
    let now = 5_000_000;
    const s = init(players, now, rng);
    assertInv(s, n, `seed ${seed} init`);

    let steps = 0;
    while (!result(s)) {
      if (++steps > 100_000) throw new Error("session did not terminate");
      now += 500 + Math.floor(rng() * 2000);
      try {
        step(s, now, rng);
      } catch (e) {
        if (e instanceof MoveError)
          throw new Error(`illegal generated move at step ${steps}: ${e.message}`);
        throw e;
      }
      assertInv(s, n, `seed ${seed} step ${steps}`);
      checkRedaction(s, n, now, `seed ${seed} step ${steps}`);
    }
    totalSteps += steps;
    totalHands += s.handNo;

    // final result checks: winner is richest (sole-survivor winners are richest too)
    const res = result(s)!;
    const winner = s.players.find((p) => p.id === res.winnerId)!;
    if (winner.left) throw new Error(`winner ${winner.name} had left the table`);
    const maxChips = Math.max(...s.players.map((p) => p.chips));
    const canPost = s.players.filter((p) => p.chips >= BOOT);
    if (winner.chips !== maxChips && !(canPost.length === 1 && canPost[0].id === winner.id))
      throw new Error(`winner ${winner.name} (${winner.chips}) is neither richest nor sole survivor`);
    if (s.handNo > HAND_CAP) throw new Error("exceeded hand cap");
    // moves after the session must be rejected
    let threw = false;
    try {
      applyMove(s, s.players[0].id, { type: "bet" }, now + 1, rng);
    } catch (e) {
      if (!(e instanceof MoveError)) throw e;
      threw = true;
    }
    if (!threw) throw new Error("move accepted after session over");
  } catch (e) {
    console.error(`FAILED at session ${g} (seed ${seed})`);
    throw e;
  }
}

console.log(
  `OK: ${SESSIONS} sessions, avg ${(totalHands / SESSIONS).toFixed(1)} hands/session (${(
    totalSteps / SESSIONS
  ).toFixed(0)} steps/session, ${totalForfeits} forfeits injected)`
);
