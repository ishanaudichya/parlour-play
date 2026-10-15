/* Party layer rules: the lobby's spotlight (the host's pick, shared with every
   screen) and the vote (guests say what they'd like to play; the host still
   deals). Rule cases plus a fuzz of random lobby traffic, re-checking the
   invariants after every move.
   Run: npx tsx scripts/simulate-party.ts */
import { applyPartyMove, createParty, joinParty, redactParty, type Registry } from "../src/lib/party/engine";
import { REGISTRY } from "../src/lib/games/registry";
import type { GameType } from "../src/lib/games/types";
import { MoveError } from "../src/lib/games/types";
import type { PartyMove, PartyState } from "../src/lib/party/types";

const R = REGISTRY as Registry;
const GAMES = Object.keys(R) as GameType[];

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
const ids = (i: number) => ({ playerId: `m${i}`, secret: `s${i}` });

function rejects(s: PartyState, who: string, mv: PartyMove, why: string) {
  try {
    applyPartyMove(s, who, mv, 1, Math.random, R);
  } catch (e) {
    if (e instanceof MoveError) return;
    throw e;
  }
  fail(`accepted: ${why}`);
}

function invariants(s: PartyState, where: string) {
  for (const [id, g] of Object.entries(s.votes ?? {})) {
    if (!s.members.some((m) => m.id === id)) fail(`${where}: vote from a member who left`);
    if (!R[g]) fail(`${where}: vote for an unknown game`);
  }
  if (s.phase === "game" && Object.keys(s.votes ?? {}).length) fail(`${where}: votes survived the deal`);
  if (s.spotlight && !R[s.spotlight.game]) fail(`${where}: spotlight on an unknown game`);
  const v = redactParty(s, s.members[0]?.id ?? "nobody", 1, R);
  if (JSON.stringify(v.votes) !== JSON.stringify(s.votes ?? {})) fail(`${where}: view votes differ`);
}

function cases() {
  const s = createParty("ABCDE", "Alice", ids(0), 1);
  joinParty(s, "Bob", ids(1));
  joinParty(s, "Cara", ids(2));
  // votes: anyone, one each, switchable, retractable
  applyPartyMove(s, "m1", { kind: "party", action: "vote", game: "coup" }, 2, Math.random, R);
  applyPartyMove(s, "m2", { kind: "party", action: "vote", game: "uno" }, 3, Math.random, R);
  applyPartyMove(s, "m2", { kind: "party", action: "vote", game: "coup" }, 4, Math.random, R);
  if (s.votes!.m1 !== "coup" || s.votes!.m2 !== "coup" || Object.keys(s.votes!).length !== 2) fail("case: voting");
  applyPartyMove(s, "m2", { kind: "party", action: "vote", game: null }, 5, Math.random, R);
  if ("m2" in s.votes!) fail("case: taking a vote back");
  rejects(s, "m1", { kind: "party", action: "vote", game: "nope" as GameType }, "vote for an unknown game");
  // the spotlight is the host's alone
  rejects(s, "m1", { kind: "party", action: "spotlight", game: "uno" }, "a guest moved the spotlight");
  applyPartyMove(s, "m0", { kind: "party", action: "spotlight", game: "uno", spin: true }, 6, Math.random, R);
  const n = s.spotlight!.n;
  applyPartyMove(s, "m0", { kind: "party", action: "spotlight", game: "uno", spin: true }, 7, Math.random, R);
  if (s.spotlight!.n !== n + 1 || !s.spotlight!.spin) fail("case: a repeat spin must read as new");
  // the deal clears the vote and spotlights the game being played
  applyPartyMove(s, "m0", { kind: "party", action: "start_game", game: "coup" }, 8, Math.random, R);
  if (Object.keys(s.votes!).length || s.spotlight?.game !== "coup") fail("case: deal resets the vote");
  rejects(s, "m1", { kind: "party", action: "vote", game: "uno" }, "voting mid-game");
  rejects(s, "m0", { kind: "party", action: "spotlight", game: "uno" }, "spotlight mid-game");
  applyPartyMove(s, "m0", { kind: "party", action: "end_game" }, 9, Math.random, R);
  // a leaver's vote goes with them; a leaving host hands the spotlight on
  applyPartyMove(s, "m1", { kind: "party", action: "vote", game: "uno" }, 10, Math.random, R);
  applyPartyMove(s, "m1", { kind: "party", action: "leave" }, 11, Math.random, R);
  if ("m1" in s.votes!) fail("case: leaver's vote kept");
  applyPartyMove(s, "m0", { kind: "party", action: "leave" }, 12, Math.random, R);
  applyPartyMove(s, "m2", { kind: "party", action: "spotlight", game: "dots" }, 13, Math.random, R);
  // parties saved before votes/spotlights existed still load and play
  const old = createParty("OLDIE", "Dan", ids(9), 1) as PartyState;
  delete old.votes;
  delete old.spotlight;
  if (JSON.stringify(redactParty(old, "m9", 1, R).votes) !== "{}" || redactParty(old, "m9", 1, R).spotlight !== null)
    fail("case: legacy party view");
  applyPartyMove(old, "m9", { kind: "party", action: "vote", game: "uno" }, 2, Math.random, R);
}

function fuzz(seed: number) {
  const rng = mulberry32(seed);
  const s = createParty("FUZZY", "P0", ids(0), 1);
  let next = 1;
  for (let step = 0; step < 300; step++) {
    const r = rng();
    const pick = () => GAMES[Math.floor(rng() * GAMES.length)];
    const someone = () => s.members[Math.floor(rng() * s.members.length)].id;
    let mv: PartyMove;
    if (r < 0.12 && s.members.length < 8) {
      joinParty(s, `P${next}`, ids(next));
      next++;
      invariants(s, `join ${step}`);
      continue;
    } else if (r < 0.2 && s.members.length > 1) mv = { kind: "party", action: "leave" };
    else if (r < 0.55) mv = { kind: "party", action: "vote", game: rng() < 0.15 ? null : pick() };
    else if (r < 0.75) mv = { kind: "party", action: "spotlight", game: pick(), spin: rng() < 0.4 };
    else if (r < 0.85) mv = { kind: "party", action: "start_game", game: pick() };
    else mv = { kind: "party", action: "end_game" };
    const who = mv.action === "spotlight" || mv.action === "start_game" || mv.action === "end_game" ? (rng() < 0.8 ? s.hostId : someone()) : someone();
    try {
      applyPartyMove(s, who, mv, step + 2, rng, R);
    } catch (e) {
      if (!(e instanceof MoveError)) throw e;
    }
    invariants(s, `step ${step} (${mv.action})`);
  }
}

const t0 = Date.now();
cases();
console.log("party rule cases ok");
for (let i = 0; i < 400; i++) fuzz(i + 1);
console.log(`OK: 400 lobbies × 300 moves of votes, spotlights, spins, deals and walk-outs in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
