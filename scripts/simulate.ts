/* Coup engine fuzz test: play thousands of random games and assert invariants.
   Run: npx tsx scripts/simulate.ts */
import {
  applyCoupMove,
  forfeitCoup,
  initCoup,
  isAlive,
  redactCoup,
  responders,
  tickCoup,
  type CoupMove,
} from "../src/lib/games/coup/engine";
import { ACTION_BLOCKERS, CHARACTERS, type ActionType, type Character, type CoupState } from "../src/lib/games/coup/types";
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

function assertInvariants(s: CoupState, ctx: string) {
  const counts: Record<string, number> = {};
  for (const ch of s.deck) counts[ch] = (counts[ch] ?? 0) + 1;
  for (const p of s.players) for (const c of p.cards) counts[c.ch] = (counts[c.ch] ?? 0) + 1;
  if (s.pending?.exchangeDrawn) for (const c of s.pending.exchangeDrawn) counts[c.ch] = (counts[c.ch] ?? 0) + 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total !== 15) throw new Error(`${ctx}: card count ${total} != 15`);
  for (const ch of CHARACTERS)
    if (counts[ch] !== 3) throw new Error(`${ctx}: ${ch} count ${counts[ch]} != 3`);
  for (const p of s.players) {
    if (p.coins < 0) throw new Error(`${ctx}: ${p.name} has ${p.coins} coins`);
    if (p.coins > 10) throw new Error(`${ctx}: ${p.name} holds ${p.coins} coins (cap is 10)`);
    if (!s.pending?.exchangeDrawn && p.cards.length !== 2)
      throw new Error(`${ctx}: ${p.name} has ${p.cards.length} cards`);
  }
  if (s.phase === "over" && !s.winner) throw new Error(`${ctx}: over without winner`);
  if (s.phase === "play" && !s.lose) {
    // (while an influence-loss is owed, the turn may transiently rest on a
    // player who forfeited mid-action — the loss's resume ends their turn)
    const turnP = s.players.find((p) => p.id === s.turnPlayer);
    if (!turnP || !isAlive(turnP)) throw new Error(`${ctx}: turn on dead/missing player`);
  }
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomMoveFor(s: CoupState, rng: () => number): { playerId: string; move: CoupMove } | null {
  // occasionally let a required act (choose / lose / exchange) time out instead
  if (s.actDeadline && rng() < 0.04) {
    tickCoup(s, s.actDeadline + 1, rng);
    return null;
  }
  if (s.lose) {
    const p = s.players.find((x) => x.id === s.lose!.player)!;
    const cards = p.cards.filter((c) => !c.revealed);
    return { playerId: p.id, move: { move: "lose", cardId: pick(rng, cards).id } };
  }
  if (s.pending?.stage === "exchange") {
    const p = s.players.find((x) => x.id === s.pending!.actor)!;
    const hand = p.cards.filter((c) => !c.revealed);
    const pool = [...hand, ...s.pending.exchangeDrawn!];
    const shuffledPool = [...pool].sort(() => rng() - 0.5);
    return {
      playerId: p.id,
      move: { move: "exchange", keep: shuffledPool.slice(0, hand.length).map((c) => c.id) },
    };
  }
  if (s.pending) {
    const resp = responders(s);
    if (resp.length === 0) throw new Error("pending with no responders and no auto-advance");
    if (s.pending.deadline && rng() < 0.05) {
      tickCoup(s, s.pending.deadline + 1, rng);
      return null;
    }
    const pid = pick(rng, resp);
    const stage = s.pending.stage;
    const roll = rng();
    if (stage === "action_window") {
      return { playerId: pid, move: { move: "respond", response: roll < 0.25 ? "challenge" : "pass" } };
    }
    if (stage === "block_window") {
      const blockers = ACTION_BLOCKERS[s.pending.type]!;
      if (roll < 0.35)
        return {
          playerId: pid,
          move: { move: "respond", response: "block", character: pick(rng, blockers) as Character },
        };
      return { playerId: pid, move: { move: "respond", response: "pass" } };
    }
    return { playerId: pid, move: { move: "respond", response: roll < 0.3 ? "challenge" : "pass" } };
  }
  const actor = s.players.find((p) => p.id === s.turnPlayer)!;
  const targets = s.players.filter((p) => isAlive(p) && p.id !== actor.id);
  const options: { action: ActionType; target?: string }[] = [];
  if (actor.coins >= 10) {
    options.push({ action: "coup", target: pick(rng, targets).id });
  } else {
    options.push({ action: "income" }, { action: "foreign_aid" }, { action: "tax" }, { action: "exchange" });
    options.push({ action: "steal", target: pick(rng, targets).id });
    if (actor.coins >= 3) options.push({ action: "assassinate", target: pick(rng, targets).id });
    if (actor.coins >= 7) options.push({ action: "coup", target: pick(rng, targets).id });
  }
  const o = pick(rng, options);
  return { playerId: actor.id, move: { move: "action", action: o.action, target: o.target } };
}

const GAMES = Number(process.env.GAMES ?? 3000);
let totalSteps = 0;

for (let g = 0; g < GAMES; g++) {
  const seed = 1000 + g;
  const rng = mulberry32(seed);
  try {
    const n = 2 + Math.floor(rng() * 5); // 2..6 players
    let now = 1_000_000;
    const players: GamePlayer[] = Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      seat: i,
    }));
    const s = initCoup(players, now, rng);
    assertInvariants(s, `seed ${seed} start`);

    let steps = 0;
    while (s.phase === "play") {
      if (++steps > 5000) throw new Error(`seed ${seed}: game did not terminate`);
      now += 1000;
      // random rage-quits: someone alive walks out mid-anything
      if (rng() < 0.012) {
        const alive = s.players.filter(isAlive);
        if (alive.length > 1) {
          forfeitCoup(s, pick(rng, alive).id, now, rng);
          assertInvariants(s, `seed ${seed} step ${steps} (forfeit)`);
          continue;
        }
      }
      const mv = randomMoveFor(s, rng);
      if (mv) {
        try {
          applyCoupMove(s, mv.playerId, mv.move, now, rng);
        } catch (e) {
          if (e instanceof MoveError)
            throw new Error(`seed ${seed} step ${steps}: illegal generated move ${JSON.stringify(mv)}: ${e.message}`);
          throw e;
        }
      }
      assertInvariants(s, `seed ${seed} step ${steps}`);
      // redaction must never leak other players' unrevealed characters (including to spectators)
      for (const viewer of ["p0", "spectator"]) {
        const view = redactCoup(s, viewer, now);
        for (const p of view.players)
          if (p.id !== viewer)
            for (const c of p.cards)
              if (!c.revealed && c.ch) throw new Error(`seed ${seed}: redaction leak to ${viewer}`);
      }
    }
    totalSteps += steps;
  } catch (e) {
    console.error(`FAILED at game ${g} (seed ${seed})`);
    throw e;
  }
}

console.log(`OK: ${GAMES} games completed, avg ${(totalSteps / GAMES).toFixed(1)} steps/game`);
