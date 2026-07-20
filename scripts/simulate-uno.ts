/* UNO engine fuzz test: play thousands of random games and assert invariants.
   Run: npx tsx scripts/simulate-uno.ts */
import { buildDeck, isPlayable, topDiscard } from "../src/lib/games/uno/engine.ts";
import { unoModule } from "../src/lib/games/uno/index.ts";
import {
  UNO_COLORS,
  UNO_LOG_CAP,
  type UnoCard,
  type UnoMove,
  type UnoState,
} from "../src/lib/games/uno/types.ts";
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

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// canonical per-cardtype counts (color:symbol -> count) and the 108 ids
const SPEC_COUNTS = new Map<string, number>();
const SPEC_IDS = new Set<string>();
for (const c of buildDeck()) {
  const k = `${c.color ?? "wild"}:${c.symbol}`;
  SPEC_COUNTS.set(k, (SPEC_COUNTS.get(k) ?? 0) + 1);
  SPEC_IDS.add(c.id);
}

function allCards(s: UnoState): UnoCard[] {
  return [...s.deck, ...s.discard, ...s.players.flatMap((p) => p.hand)];
}

function assertInvariants(s: UnoState, ctx: string) {
  const cards = allCards(s);
  if (cards.length !== 108) throw new Error(`${ctx}: card count ${cards.length} != 108`);
  const counts = new Map<string, number>();
  const ids = new Set<string>();
  for (const c of cards) {
    const k = `${c.color ?? "wild"}:${c.symbol}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (ids.has(c.id)) throw new Error(`${ctx}: duplicate card id ${c.id}`);
    ids.add(c.id);
    if (!SPEC_IDS.has(c.id)) throw new Error(`${ctx}: unknown card id ${c.id}`);
  }
  for (const [k, n] of SPEC_COUNTS)
    if (counts.get(k) !== n) throw new Error(`${ctx}: ${k} count ${counts.get(k)} != ${n}`);
  if (s.discard.length < 1) throw new Error(`${ctx}: empty discard`);
  if (!UNO_COLORS.includes(s.activeColor)) throw new Error(`${ctx}: bad active color`);
  if (s.log.length > UNO_LOG_CAP) throw new Error(`${ctx}: log over cap (${s.log.length})`);
  const turnP = s.players.find((p) => p.id === s.turn);
  if (!turnP) throw new Error(`${ctx}: turn on missing player ${s.turn}`);
  if (s.phase === "play" && turnP.left) throw new Error(`${ctx}: turn on player who left`);
  if (s.phase === "play" && turnP.hand.length === 0)
    throw new Error(`${ctx}: turn player has an empty hand but game not over`);
  for (const p of s.players) {
    if (p.left && p.hand.length !== 0) throw new Error(`${ctx}: ${p.id} left but holds cards`);
    if (p.left && p.catchable) throw new Error(`${ctx}: ${p.id} left but still catchable`);
  }
  if (s.phase === "over") {
    if (!s.winner) throw new Error(`${ctx}: over without winner`);
    const w = s.players.find((p) => p.id === s.winner)!;
    if (w.left) throw new Error(`${ctx}: winner had left`);
    const forfeitWin = s.players.every((p) => p.id === w.id || p.left);
    if (w.hand.length !== 0 && !forfeitWin)
      throw new Error(`${ctx}: winner holds ${w.hand.length} cards`);
    if (unoModule.result(s)?.winnerId !== s.winner) throw new Error(`${ctx}: result mismatch`);
  } else if (unoModule.result(s) !== null) {
    throw new Error(`${ctx}: result set while playing`);
  }
  if (s.drawnCardId && !turnP.hand.some((c) => c.id === s.drawnCardId))
    throw new Error(`${ctx}: drawnCardId not in turn player's hand`);
}

/** Redacted views must never contain a card id outside viewer's hand + discard. */
function assertNoLeaks(s: UnoState, viewerId: string, now: number, ctx: string) {
  const view = unoModule.redact(s, viewerId, now);
  const viewer = s.players.find((p) => p.id === viewerId);
  if (viewer) {
    if (!view.hand || view.hand.length !== viewer.hand.length)
      throw new Error(`${ctx}: own hand redacted wrong for ${viewerId}`);
  } else if (view.hand !== null) {
    throw new Error(`${ctx}: spectator got a hand`);
  }
  const allowed = new Set<string>(s.discard.map((c) => c.id));
  if (viewer) for (const c of viewer.hand) allowed.add(c.id);
  const json = JSON.stringify(view);
  for (const m of json.matchAll(/"(c\d+)"/g)) {
    if (!allowed.has(m[1])) throw new Error(`${ctx}: view for ${viewerId} leaks card ${m[1]}`);
  }
  for (const p of view.players) {
    if ((p as unknown as { hand?: unknown }).hand !== undefined)
      throw new Error(`${ctx}: player entry carries a hand`);
  }
}

type Gen = { playerId: string; move: UnoMove } | { tick: true };

function randomMove(s: UnoState, rng: () => number): Gen {
  if (rng() < 0.03) return { tick: true }; // exercise timeouts
  const catchables = s.players.filter((p) => p.catchable && !p.left);
  if (catchables.length > 0 && rng() < 0.45) {
    const t = pick(rng, catchables);
    if (rng() < 0.3) return { playerId: t.id, move: { type: "callUno" } };
    const others = s.players.filter((p) => p.id !== t.id && !p.left);
    return { playerId: pick(rng, others).id, move: { type: "catch", target: t.id } };
  }
  const p = s.players.find((x) => x.id === s.turn)!;
  const playWith = (c: UnoCard): Gen => ({
    playerId: p.id,
    move: {
      type: "play",
      cardId: c.id,
      chooseColor: c.color === null ? pick(rng, [...UNO_COLORS]) : undefined,
      // usually declare on the penultimate card; sometimes forget; sometimes
      // declare when it's meaningless (must be ignored by the engine)
      declareUno: p.hand.length === 2 ? rng() < 0.55 : rng() < 0.05,
    },
  });
  if (s.hasDrawn) {
    const drawn = p.hand.find((c) => c.id === s.drawnCardId)!;
    if (rng() < 0.7) return playWith(drawn);
    return { playerId: p.id, move: { type: "pass" } };
  }
  const playable = p.hand.filter((c) => isPlayable(c, topDiscard(s), s.activeColor));
  if (playable.length > 0 && rng() < 0.88) return playWith(pick(rng, playable));
  return { playerId: p.id, move: { type: "draw" } };
}

/** An always-illegal move; the engine must throw MoveError and change nothing. */
function invalidMove(s: UnoState, rng: () => number): { playerId: string; move: UnoMove } | null {
  const p = s.players.find((x) => x.id === s.turn)!;
  const roll = rng();
  if (roll < 0.1) return { playerId: "ghost", move: { type: "draw" } };
  if (roll < 0.2) {
    const gone = s.players.find((x) => x.left);
    if (gone) return { playerId: gone.id, move: { type: "draw" } }; // left players can't move
  }
  if (roll < 0.3) {
    const idle = s.players.filter((x) => x.id !== p.id);
    return { playerId: pick(rng, idle).id, move: { type: "draw" } };
  }
  if (roll < 0.45 && !s.hasDrawn) return { playerId: p.id, move: { type: "pass" } };
  if (roll < 0.6 && s.hasDrawn) return { playerId: p.id, move: { type: "draw" } };
  if (roll < 0.75) {
    const t = s.players.find((x) => !x.catchable && x.id !== p.id);
    if (t) return { playerId: p.id, move: { type: "catch", target: t.id } };
    return null;
  }
  if (roll < 0.9) {
    const not = s.hasDrawn
      ? p.hand.filter((c) => c.id !== s.drawnCardId)
      : p.hand.filter((c) => !isPlayable(c, topDiscard(s), s.activeColor));
    if (not.length === 0) return null;
    const c = pick(rng, not);
    return {
      playerId: p.id,
      move: { type: "play", cardId: c.id, chooseColor: c.color === null ? "red" : undefined },
    };
  }
  const wild = p.hand.find((c) => c.color === null);
  if (wild && !s.hasDrawn)
    return { playerId: p.id, move: { type: "play", cardId: wild.id } }; // missing chooseColor
  const notCatchable = s.players.find((x) => !x.catchable);
  if (notCatchable) return { playerId: notCatchable.id, move: { type: "callUno" } };
  return null;
}

const GAMES = Number(process.env.GAMES ?? 3000);
const MAX_STEPS = 3000;
let totalSteps = 0;
let timeouts = 0;
let catches = 0;
let forfeits = 0;
let forfeitWins = 0;

for (let g = 0; g < GAMES; g++) {
  const seed = 42_000 + g;
  const rng = mulberry32(seed);
  try {
    const n = 2 + Math.floor(rng() * 7); // 2..8 players
    let now = 1_000_000;
    const players: GamePlayer[] = Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      seat: i,
    }));
    const s = unoModule.init(players, now, rng);
    assertInvariants(s, `seed ${seed} init`);
    for (const p of s.players)
      if (p.hand.length !== 7) throw new Error(`seed ${seed}: dealt ${p.hand.length} cards`);
    if (topDiscard(s).color === null || topDiscard(s).symbol.length !== 1)
      throw new Error(`seed ${seed}: starting discard is not a number card`);

    let steps = 0;
    while (s.phase === "play") {
      if (++steps > MAX_STEPS) throw new Error(`seed ${seed}: game did not terminate`);
      now += 500;

      // sprinkle invalid moves: must throw MoveError and leave state untouched
      if (rng() < 0.03) {
        const bad = invalidMove(s, rng);
        if (bad) {
          const before = JSON.stringify(s);
          let threw = false;
          try {
            unoModule.applyMove(s, bad.playerId, bad.move, now, rng);
          } catch (e) {
            if (!(e instanceof MoveError)) throw e;
            threw = true;
          }
          if (!threw)
            throw new Error(`seed ${seed} step ${steps}: invalid move accepted ${JSON.stringify(bad)}`);
          if (JSON.stringify(s) !== before)
            throw new Error(`seed ${seed} step ${steps}: rejected move mutated state`);
        }
      }

      // random forfeits (~1.5% of steps), never below 1 remaining player
      if (rng() < 0.015) {
        const active = s.players.filter((p) => !p.left);
        if (active.length > 1) {
          const leaver = pick(rng, active);
          const lastStanding = active.length === 2 ? active.find((p) => p.id !== leaver.id)! : null;
          unoModule.forfeit(s, leaver.id, now, rng);
          forfeits++;
          if (!leaver.left || leaver.hand.length !== 0 || leaver.catchable)
            throw new Error(`seed ${seed} step ${steps}: forfeit left ${leaver.id} in a bad state`);
          if (lastStanding) {
            // forfeited down to one player: they must win immediately
            if (s.phase !== "over" || s.winner !== lastStanding.id)
              throw new Error(`seed ${seed} step ${steps}: last active player did not win on forfeit`);
            if (unoModule.result(s)?.winnerId !== lastStanding.id)
              throw new Error(`seed ${seed} step ${steps}: result() missed the forfeit win`);
            forfeitWins++;
          }
          // forfeit must be idempotent (also for unknown ids)
          if (rng() < 0.3) {
            const before = JSON.stringify(s);
            unoModule.forfeit(s, leaver.id, now + 1, rng);
            unoModule.forfeit(s, "ghost", now + 1, rng);
            if (JSON.stringify(s) !== before)
              throw new Error(`seed ${seed} step ${steps}: repeated forfeit mutated state`);
          }
          assertInvariants(s, `seed ${seed} step ${steps} forfeit`);
          if (s.phase !== "play") break;
        }
      }

      const gen = randomMove(s, rng);
      if ("tick" in gen) {
        if (unoModule.tick(s, s.deadline - 1, rng))
          throw new Error(`seed ${seed} step ${steps}: tick fired before deadline`);
        if (!unoModule.tick(s, s.deadline + 1, rng))
          throw new Error(`seed ${seed} step ${steps}: tick ignored expired deadline`);
        timeouts++;
      } else {
        if (gen.move.type === "catch") catches++;
        try {
          unoModule.applyMove(s, gen.playerId, gen.move, now, rng);
        } catch (e) {
          if (e instanceof MoveError)
            throw new Error(
              `seed ${seed} step ${steps}: legal generated move rejected ${JSON.stringify(gen)}: ${e.message}`
            );
          throw e;
        }
      }
      assertInvariants(s, `seed ${seed} step ${steps}`);

      // redaction: spectator + one player every step, everyone periodically
      assertNoLeaks(s, "spectator-x", now, `seed ${seed} step ${steps}`);
      assertNoLeaks(s, pick(rng, s.players).id, now, `seed ${seed} step ${steps}`);
      if (steps % 17 === 0)
        for (const p of s.players) assertNoLeaks(s, p.id, now, `seed ${seed} step ${steps}`);
    }
    totalSteps += steps;

    // frozen after the win
    assertInvariants(s, `seed ${seed} end`);
    let frozen = false;
    try {
      unoModule.applyMove(s, s.players[0].id, { type: "draw" }, now + 1, rng);
    } catch (e) {
      if (!(e instanceof MoveError)) throw e;
      frozen = true;
    }
    if (!frozen) throw new Error(`seed ${seed}: move accepted after game over`);
    if (unoModule.tick(s, s.deadline + 60_000, rng))
      throw new Error(`seed ${seed}: tick advanced a finished game`);
  } catch (e) {
    console.error(`FAILED at game ${g} (seed ${seed})`);
    throw e;
  }
}

if (forfeitWins === 0) throw new Error("no forfeit-to-one wins were exercised");

console.log(
  `OK: ${GAMES} games, avg ${(totalSteps / GAMES).toFixed(1)} steps (${timeouts} timeouts, ${catches} catch attempts, ${forfeits} forfeits, ${forfeitWins} forfeit wins)`
);
