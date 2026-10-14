/* Pocket Tanks fuzz test: every weapon fired hundreds of times at random over
   random ridges (with the replay re-derived independently from the record),
   then hundreds of whole games at every table size — draft, drives, aims,
   timeouts, walk-outs — plus hardcoded rule cases.
   Run: npx tsx scripts/simulate-tanks.ts */
import {
  applyTanksMove,
  autoDraft,
  forfeitTanks,
  initTanks,
  redactTanks,
  tanksModule,
  tickTanks,
} from "../src/lib/games/tanks/engine";
import { simulateShot, type SimTank } from "../src/lib/games/tanks/sim";
import {
  applyOp,
  CEIL,
  driveTo,
  EDGE,
  FLOOR,
  generateGround,
  NCOL,
  spawnXs,
  tankGround,
  W,
} from "../src/lib/games/tanks/terrain";
import { ARSENAL, MOVES, POOL_SPARE, type Biome, type TanksMove, type TanksState } from "../src/lib/games/tanks/types";
import { WEAPON_IDS, WEAPONS, type WeaponId } from "../src/lib/games/tanks/weapons";
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

const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const BIOMES: Biome[] = ["mesa", "tundra", "ashlands", "lunar"];

function fail(msg: string): never {
  throw new Error(msg);
}

/* ================= the ground ================= */

function checkGround(g: number[], where: string) {
  if (g.length !== NCOL) fail(`${where}: ground has ${g.length} columns`);
  for (let i = 0; i < NCOL; i++) {
    const h = g[i];
    if (!Number.isFinite(h)) fail(`${where}: column ${i} is ${h}`);
    if (h < FLOOR - 1e-9 || h > CEIL + 1e-9) fail(`${where}: column ${i} out of range (${h})`);
    if (Math.abs(h * 10 - Math.round(h * 10)) > 1e-6) fail(`${where}: column ${i} not rounded (${h})`);
  }
}

/* ================= every weapon, at random ================= */

const sizes = { max: 0, weapon: "" as string };
const durs: Record<string, number> = {};
const scored: Record<string, number> = {};

function fuzzWeapon(w: WeaponId, shots: number, seed: number) {
  const rng = mulberry32(seed);
  let total = 0;
  for (let i = 0; i < shots; i++) {
    const n = 2 + Math.floor(rng() * 3);
    const biome = pick(rng, BIOMES);
    const xs = spawnXs(n, rng);
    const ground = generateGround(biome, xs, rng);
    checkGround(ground, `gen ${biome}`);
    const tanks: SimTank[] = xs.map((x, seat) => ({ seat, x, y: tankGround(ground, x) }));
    const shooter = Math.floor(rng() * n);
    const res = simulateShot({
      ground,
      tanks,
      seats: n,
      shooter,
      weapon: w,
      angle: Math.floor(rng() * 360),
      power: Math.floor(rng() * 101),
      wind: Math.round((rng() * 2 - 1) * 20),
      gravity: biome === "lunar" ? 0.6 : 1,
      rng,
    });
    const where = `${w} shot ${i}`;
    const { rec } = res;

    checkGround(res.ground, where);
    if (rec.dur > 1500 + 400) fail(`${where}: replay too long (${rec.dur} ticks)`);
    durs[w] = Math.max(durs[w] ?? 0, rec.dur);

    // the record replays to the same ridge, op by op
    const replay = ground.slice();
    let lastT = -1;
    for (const e of rec.events) {
      if (!Number.isFinite(e.t) || e.t < 0) fail(`${where}: bad event tick ${e.t}`);
      if (e.t < lastT) fail(`${where}: events out of order`);
      lastT = e.t;
      if (e.t > rec.dur) fail(`${where}: event after the end`);
      if (e.k === "op") applyOp(replay, e.op);
    }
    for (let c = 0; c < NCOL; c++) {
      if (replay[c] !== res.ground[c]) fail(`${where}: replayed ground differs at column ${c} (${replay[c]} vs ${res.ground[c]})`);
    }

    // tracks are well formed
    for (const tr of rec.tracks) {
      if (tr.p.length < 2 || tr.p.length % 2) fail(`${where}: malformed track`);
      if (tr.t1 < tr.t0 || tr.t1 > rec.dur) fail(`${where}: track times ${tr.t0}..${tr.t1}`);
      const regular = Math.floor((tr.t1 - tr.t0) / tr.k) + 1;
      const pts = tr.p.length / 2;
      if (pts > regular + 1 || pts < Math.min(regular, 1)) fail(`${where}: track has ${pts} points for ${regular} samples`);
      if (tr.p.some((v) => !Number.isFinite(v))) fail(`${where}: non-finite track point`);
    }

    // tanks rest on the ground, inside the range, where the record last left them
    for (const t of res.tanks) {
      if (t.x < EDGE - 1e-9 || t.x > W - EDGE + 1e-9) fail(`${where}: tank ${t.seat} off the ridge (${t.x})`);
      const g = tankGround(res.ground, t.x);
      if (Math.abs(g - t.y) > 1e-9) fail(`${where}: tank ${t.seat} floating/buried (${t.y} vs ${g})`);
      const moves = rec.events.filter((e) => e.k === "tank" && e.seat === t.seat);
      const last = moves[moves.length - 1];
      const pre = tanks.find((q) => q.seat === t.seat)!;
      const endX = last && last.k === "tank" ? last.x : pre.x;
      const endY = last && last.k === "tank" ? last.y : pre.y;
      if (Math.abs(endX - t.x) > 1e-9 || Math.abs(endY - t.y) > 1e-9) fail(`${where}: tank ${t.seat} ends at (${t.x},${t.y}) but the record says (${endX},${endY})`);
    }

    // damage events add up
    const taken = Array(n).fill(0);
    for (const e of rec.events) if (e.k === "dmg") {
      if (e.n <= 0 || !Number.isInteger(e.n)) fail(`${where}: bad damage ${e.n}`);
      taken[e.seat] += e.n;
    }
    for (let s = 0; s < n; s++) if (taken[s] !== res.taken[s]) fail(`${where}: damage events ${taken[s]} ≠ taken ${res.taken[s]}`);
    const net = res.delta[shooter];
    const expect = taken.reduce((a, v, s) => a + (s === shooter ? -v : v), 0);
    if (net !== expect) fail(`${where}: shooter net ${net} ≠ ${expect}`);
    if (res.delta.some((d, s) => s !== shooter && d !== 0)) fail(`${where}: someone other than the shooter scored`);
    total += res.dealt;

    const size = JSON.stringify(rec).length;
    if (size > sizes.max) {
      sizes.max = size;
      sizes.weapon = w;
    }
    if (size > 60_000) fail(`${where}: record is ${size} bytes`);
  }
  scored[w] = total / shots;
}

/* ================= whole games ================= */

const players = (n: number): GamePlayer[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i }));

function invariants(s: TanksState, where: string) {
  checkGround(s.ground, where);
  for (const p of s.players) {
    if (p.score < 0) fail(`${where}: ${p.name} score ${p.score}`);
    if (p.moves < 0 || p.moves > MOVES) fail(`${where}: moves ${p.moves}`);
    if (p.angle < 0 || p.angle >= 360 || !Number.isInteger(p.angle) || p.power < 0 || p.power > 100) fail(`${where}: aim out of range`);
    if (!p.left) {
      if (Math.abs(tankGround(s.ground, p.x) - p.y) > 1e-9) fail(`${where}: ${p.name}'s tank is not on the ground`);
      if (p.loaded && !p.arsenal.includes(p.loaded)) fail(`${where}: ${p.name} has ${p.loaded} loaded but not in the arsenal`);
    }
    if (p.left && p.arsenal.length) fail(`${where}: a leaver kept an arsenal`);
  }
  if (s.phase !== "over") {
    const t = s.players.find((p) => p.id === s.turn);
    if (!t || t.left) fail(`${where}: turn is with ${s.turn}`);
    if (s.deadline === null) fail(`${where}: no deadline`);
    if (s.phase === "aim" && t.arsenal.length === 0) fail(`${where}: ${t.name} has the turn with nothing to fire`);
  }
  const shotsLeft = s.players.reduce((a, p) => a + (p.left ? 0 : p.arsenal.length), 0);
  if (s.phase === "aim" && s.totalShots !== s.shots + shotsLeft) fail(`${where}: totalShots ${s.totalShots} ≠ ${s.shots} + ${shotsLeft}`);
  if (s.log.length > 50) fail(`${where}: log not capped`);
  if (JSON.stringify(s).length > 120_000) fail(`${where}: state is ${JSON.stringify(s).length} bytes`);
}

function playGame(n: number, seed: number): TanksState {
  const rng = mulberry32(seed);
  let now = 1_000_000;
  const s = initTanks(players(n), now, rng);
  const k = ARSENAL[n];
  if (s.pool.length !== n * k + POOL_SPARE) fail(`pool ${s.pool.length}`);
  if (new Set(s.pool).size !== s.pool.length) fail("duplicate weapons in the pool");
  if (s.draftOrder.length !== n * k) fail("draft order length");
  invariants(s, "init");

  let leaver = rng() < 0.15 && n > 2 ? Math.floor(rng() * n) : -1;
  const leaveAt = Math.floor(rng() * 40);
  for (let step = 0; step < 4000 && s.phase !== "over"; step++) {
    now += 500 + Math.floor(rng() * 4000);
    if (leaver >= 0 && step === leaveAt) {
      forfeitTanks(s, `p${leaver}`, now, rng);
      invariants(s, `forfeit step ${step}`);
      leaver = -1;
      continue;
    }
    const p = s.players.find((q) => q.id === s.turn)!;
    // sometimes somebody else tries to act out of turn
    if (rng() < 0.05) {
      const other = s.players.find((q) => q.id !== p.id && !q.left);
      if (other) {
        try {
          applyTanksMove(s, other.id, { type: "fire", angle: 45, power: 50, weapon: "single" }, now, rng);
          fail("out-of-turn move accepted");
        } catch (e) {
          if (!(e instanceof MoveError)) throw e;
        }
      }
    }
    if (rng() < 0.08) {
      // let the clock run out
      now = (s.deadline ?? now) + 1;
      if (!tickTanks(s, now, rng)) fail("expired deadline did not tick");
      invariants(s, `timeout step ${step}`);
      continue;
    }
    let mv: TanksMove;
    if (s.phase === "draft") {
      const r = rng();
      mv = r < 0.05 ? { type: "autodraft" } : { type: "pick", weapon: r < 0.3 ? "random" : r < 0.6 ? autoDraft(s, p, rng) : pick(rng, s.pool) };
    } else {
      const r = rng();
      if (r < 0.15 && p.moves > 0) mv = { type: "drive", dir: rng() < 0.5 ? -1 : 1 };
      else if (r < 0.3) mv = { type: "aim", angle: Math.floor(rng() * 900) - 450, power: Math.floor(rng() * 101), weapon: pick(rng, p.arsenal) };
      else mv = { type: "fire", angle: Math.floor(rng() * 360), power: 20 + Math.floor(rng() * 81), weapon: pick(rng, p.arsenal) };
    }
    try {
      applyTanksMove(s, p.id, mv, now, rng);
    } catch (e) {
      if (!(e instanceof MoveError)) throw e;
      if (mv.type !== "drive") fail(`legal ${mv.type} rejected: ${(e as Error).message}`);
    }
    invariants(s, `step ${step} (${mv.type})`);
    // nobody sees anyone else's power or loaded weapon; your own come through
    const a = redactTanks(s, "p0", now);
    const b = redactTanks(s, "spectator", now);
    for (const q of b.players) if (q.power !== 0 || q.loaded !== null) fail("spectator sees a dialled-in shot");
    for (const q of a.players) {
      const real = s.players.find((x) => x.id === q.id)!;
      if (q.id === "p0" ? q.power !== real.power || q.loaded !== real.loaded : q.power !== 0 || q.loaded !== null) fail("p0's view leaks or loses aim");
      if (q.angle !== real.angle) fail("barrel angle should be public");
    }
  }
  if (s.phase !== "over") fail(`game ${seed} (${n}p) never ended`);
  const live = s.players.filter((p) => !p.left);
  if (live.length > 1) {
    if (s.shots !== s.totalShots) fail(`ended after ${s.shots}/${s.totalShots} shots`);
    if (live.some((p) => p.arsenal.length)) fail("ended with weapons unfired");
    const top = Math.max(...live.map((p) => p.score));
    const leaders = live.filter((p) => p.score === top);
    if (leaders.length > 1) {
      if (s.winner !== null || tanksModule.result(s) !== null) fail("a tie crowned someone");
    } else if (s.winner !== leaders[0].id) fail("the top score did not win");
  }
  if (!tanksModule.isOver!(s)) fail("isOver false at the end");
  return s;
}

/* ================= rule cases ================= */

function flat(h = 200): number[] {
  return Array(NCOL).fill(h);
}

function cases() {
  const rng = mulberry32(7);
  // a direct hit scores the full damage, a self-hit costs it
  {
    const g = flat();
    const tanks = [{ seat: 0, x: 300, y: 200 }, { seat: 1, x: 600, y: 200 }];
    // fire nearly straight down onto the neighbour: put the shooter right next to them
    const res = simulateShot({ ground: g, tanks: [{ seat: 0, x: 560, y: 200 }, { seat: 1, x: 600, y: 200 }], seats: 2, shooter: 0, weapon: "single", angle: 75, power: 22, wind: 0, gravity: 1, rng });
    if (res.delta[0] <= 0 || res.taken[1] <= 0) fail(`case: lob onto the neighbour scored ${res.delta[0]}`);
    const self = simulateShot({ ground: g, tanks, seats: 2, shooter: 0, weapon: "single", angle: 90, power: 30, wind: 0, gravity: 1, rng });
    if (self.taken[0] <= 0 || self.delta[0] !== -self.taken[0]) fail(`case: straight up should come down on yourself (${self.taken[0]}, ${self.delta[0]})`);
  }
  // straight down from a ledge hits the ground under you
  {
    const res = simulateShot({ ground: flat(), tanks: [{ seat: 0, x: 300, y: 200 }, { seat: 1, x: 900, y: 200 }], seats: 2, shooter: 0, weapon: "single", angle: 270, power: 40, wind: 0, gravity: 1, rng });
    if (res.taken[0] <= 0) fail("case: firing straight down should hurt the shooter");
  }
  const shot = (weapon: WeaponId, angle: number, power: number, ground = flat(), tanks = [{ seat: 0, x: 200, y: 200 }, { seat: 1, x: 900, y: 200 }], r = rng) =>
    simulateShot({ ground, tanks, seats: 2, shooter: 0, weapon, angle, power, wind: 0, gravity: 1, rng: r });
  const lob = [{ seat: 0, x: 560, y: 200 }, { seat: 1, x: 600, y: 200 }];
  // the dirt and utility weapons never score — not even dropped right on a tank
  for (const w of ["tracer", "dirtmover", "magicwall", "dirtslinger", "dirtball", "mountainmover"] as WeaponId[]) {
    const res = shot(w, 75, 22, flat(), lob);
    if (res.dealt || res.taken.some((t) => t)) fail(`case: ${w} did damage`);
  }
  // no fall damage: a Mountain Mover under a tank drops it for free
  {
    const res = shot("mountainmover", 75, 22, flat(), lob);
    if (!res.rec.events.some((e) => e.k === "tank" && e.seat === 1 && e.how === "fall")) fail("case: mountain mover didn't drop the tank");
    if (res.taken[1] !== 0) fail("case: falling hurt");
  }
  // spreads fire the right number of bullets
  if (shot("three", 45, 70).rec.tracks.length !== 3) fail("case: 3 Shot");
  if (shot("five", 45, 70).rec.tracks.length !== 5) fail("case: 5 Shot");
  if (shot("tommygun", 45, 70).rec.tracks.length !== 15) fail("case: Tommy Gun");
  // the tracer marks five landings, labelled by angle change
  {
    const marks = shot("tracer", 45, 70).rec.events.filter((e) => e.k === "mark");
    const labels = marks.map((m) => (m.k === "mark" ? m.label : "")).sort();
    if (labels.join(",") !== ["+1", "+2", "-1", "-2", "0"].sort().join(",")) fail(`case: tracer marks ${labels}`);
  }
  // the jackhammer goes off six times: the landing and five bounces straight up
  {
    const booms = shot("jackhammer", 45, 70).rec.events.filter((e) => e.k === "boom").length;
    if (booms !== 6) fail(`case: jackhammer went off ${booms} times`);
  }
  // pile driver digs a deep, narrow hole
  {
    const res = shot("piledriver", 45, 70);
    if (Math.min(...res.ground) > 200 - 70) fail(`case: pile driver hole only ${200 - Math.min(...res.ground)} deep`);
  }
  // magic wall and dirtball build
  if (Math.max(...shot("magicwall", 45, 60).ground) < 330) fail("case: magic wall built nothing");
  if (Math.max(...shot("dirtball", 45, 60).ground) < 250) fail("case: dirtball built nothing");
  // the sniper rifle: no blast, big points, and the tank goes flying
  {
    const res = shot("sniper", 75, 18, flat(), lob);
    const hit = res.taken[1];
    if (hit && (hit !== 60 || Math.abs(res.tanks[1].x - 600) < 30)) fail(`case: sniper hit for ${hit}, tank at ${res.tanks[1].x}`);
    // across the field, some power lands it
    let any = false;
    for (let p = 30; p <= 100 && !any; p++) any = shot("sniper", 30, p).taken[1] === 60;
    if (!any) fail("case: sniper never connects");
  }
  // homing missile: some power that would overshoot still drops onto the tank
  {
    let hits = 0;
    for (let p = 40; p <= 100; p += 2) if (shot("homingmissile", 45, p).taken[1] > 0) hits++;
    let plain = 0;
    for (let p = 40; p <= 100; p += 2) if (shot("single", 45, p).taken[1] > 0) plain++;
    if (hits <= plain) fail(`case: homing missile (${hits}) no better than a single shot (${plain})`);
  }
  // ground hog goes through a hill and comes out the far side
  {
    const g = flat(120);
    for (let i = 230; i < 300; i++) g[i] = 330;
    const res = shot("groundhog", 20, 60, g, [{ seat: 0, x: 200, y: 120 }, { seat: 1, x: 1000, y: 120 }]);
    const booms = res.rec.events.filter((e) => e.k === "boom" && e.fx === "fire");
    if (!booms.some((b) => b.k === "boom" && b.x >= 598)) fail(`case: ground hog didn't emerge past the hill (${booms.map((b) => (b.k === "boom" ? b.x : 0))})`);
  }
  // the homing worm surfaces under the tank
  {
    let hits = 0;
    for (let p = 40; p <= 80; p += 4) if (shot("homingworm", 40, p).taken[1] >= 30) hits++;
    if (!hits) fail("case: homing worm never found the tank");
  }
  // zapper zaps from the air
  {
    let zaps = 0;
    for (let p = 40; p <= 100; p += 3) if (shot("zapper", 45, p).rec.events.some((e) => e.k === "beam" && e.fx === "zap")) zaps++;
    if (!zaps) fail("case: zapper never zapped");
  }
  // spider spins silk at the nearest tank
  if (!shot("spider", 75, 22, flat(), lob).rec.events.some((e) => e.k === "beam" && e.fx === "web")) fail("case: spider spun no web");
  // driving stops at cliffs and never rams another tank
  {
    const g = flat(100);
    for (let i = 160; i < NCOL; i++) g[i] = 260;
    const to = driveTo(g, 280, 1, []);
    if (to > 316) fail(`case: drove up a cliff to ${to}`);
    const blocked = driveTo(flat(), 300, 1, [340]);
    if (blocked > 311) fail(`case: drove into a tank (${blocked})`);
  }
  // random picks and auto-drafting
  {
    let now = 0;
    const s = initTanks(players(2), now, rng);
    const other = s.players.find((q) => q.id !== s.turn)!;
    applyTanksMove(s, other.id, { type: "autodraft" }, ++now, rng); // out of turn is fine
    let guard = 0;
    while (s.phase === "draft" && guard++ < 50) {
      const p = s.players.find((q) => q.id === s.turn)!;
      if (p.id === other.id) fail("case: an auto-drafter was asked to pick");
      applyTanksMove(s, p.id, { type: "pick", weapon: "random" }, ++now, rng);
    }
    if (s.phase !== "aim" || s.players.some((p) => p.arsenal.length !== ARSENAL[2])) fail("case: random draft didn't fill the arsenals");
  }
  // a whole game: draft fills arsenals, a tie is a draw
  {
    let now = 0;
    const s = initTanks(players(2), now, rng);
    while (s.phase === "draft") {
      const p = s.players.find((q) => q.id === s.turn)!;
      applyTanksMove(s, p.id, { type: "pick", weapon: s.pool[0] }, ++now, rng);
    }
    if (s.players.some((p) => p.arsenal.length !== ARSENAL[2])) fail("case: arsenals not filled");
    if (s.pool.length !== POOL_SPARE) fail("case: pool not drained");
    // fire every weapon straight down into the bedrock beside nobody
    for (const p of s.players) {
      p.x = p.seat === 0 ? 100 : 1100;
      p.y = tankGround(s.ground, p.x);
    }
    let guard = 0;
    while (s.phase === "aim" && guard++ < 100) {
      const p = s.players.find((q) => q.id === s.turn)!;
      for (const q of s.players) q.score = 0;
      applyTanksMove(s, p.id, { type: "fire", angle: p.seat === 0 ? 180 : 0, power: 100, weapon: p.arsenal[0] }, ++now, () => 0.5);
      for (const q of s.players) q.score = 0; // force the level score
    }
    if (s.phase !== "over") fail("case: game did not end");
  }
  // timeout fires what is loaded
  {
    let now = 0;
    const s = initTanks(players(2), now, rng);
    while (s.phase === "draft") {
      now = s.deadline! + 1;
      tickTanks(s, now, rng);
    }
    const p = s.players.find((q) => q.id === s.turn)!;
    const loaded = p.arsenal[p.arsenal.length - 1];
    applyTanksMove(s, p.id, { type: "aim", angle: 70, power: 40, weapon: loaded }, ++now, rng);
    now = s.deadline! + 1;
    tickTanks(s, now, rng);
    if (s.lastShot?.weapon !== loaded || s.lastShot.angle !== 70 || s.lastShot.power !== 40) fail("case: timeout fired the wrong thing");
  }
  // walking out of a two-player game hands it over
  {
    const s = initTanks(players(2), 0, rng);
    forfeitTanks(s, "p0", 1, rng);
    if (s.phase !== "over" || s.winner !== "p1" || s.winBy !== "forfeit") fail("case: walkover");
    forfeitTanks(s, "p1", 2, rng);
    if (s.winner !== "p1") fail("case: forfeit after the end changed the result");
  }
  // bad moves bounce
  {
    const s = initTanks(players(3), 0, rng);
    const p = s.players.find((q) => q.id === s.turn)!;
    for (const mv of [
      { type: "pick", weapon: "nope" },
      { type: "fire", angle: 10, power: 10, weapon: s.pool[0] },
      { type: "drive", dir: 1 },
      { type: "teleport" },
    ] as unknown as TanksMove[]) {
      try {
        applyTanksMove(s, p.id, mv, 1, rng);
        fail(`case: accepted ${JSON.stringify(mv)}`);
      } catch (e) {
        if (!(e instanceof MoveError)) throw e;
      }
    }
  }
  // the engine is deterministic
  {
    const a = playGame(3, 4242);
    const b = playGame(3, 4242);
    if (JSON.stringify(a) !== JSON.stringify(b)) fail("case: same seed, different game");
  }
}

/* ================= run ================= */

const t0 = Date.now();
WEAPON_IDS.forEach((w, i) => fuzzWeapon(w, 220, 1000 + i));
console.log(`weapons: ${WEAPON_IDS.length} × 220 random shots ok — largest record ${sizes.max} B (${sizes.weapon})`);
console.log(
  "  avg dealt / longest replay: " +
    WEAPON_IDS.map((w) => `${w} ${scored[w].toFixed(1)}/${((durs[w] ?? 0) / 60).toFixed(1)}s`).join(", ")
);
cases();
console.log("rule cases ok");
let games = 0;
for (const n of [2, 3, 4]) {
  for (let i = 0; i < 120; i++) {
    playGame(n, n * 10_000 + i);
    games++;
  }
}
console.log(`games: ${games} full games (2–4 players) ok`);
void WEAPONS;
console.log(`all Pocket Tanks checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
