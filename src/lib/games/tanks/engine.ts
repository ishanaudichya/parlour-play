import { MoveError, type GameModule, type GamePlayer } from "@/lib/games/types";
import { simulateShot, TPS } from "./sim";
import { driveTo, generateGround, spawnXs, tankGround, W } from "./terrain";
import {
  ARSENAL,
  LOG_CAP,
  MAX_WIND,
  MOVES,
  PICK_MS,
  POOL_SPARE,
  TURN_MS,
  type Biome,
  type TankColor,
  type TanksLogEntry,
  type TanksLogKind,
  type TanksMove,
  type TanksPlayer,
  type TanksState,
  type TanksView,
} from "./types";
import { isWeapon, WEAPON_IDS, WEAPONS, type WeaponId } from "./weapons";

export type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

const COLORS: TankColor[] = ["red", "blue", "lime", "gold"];
const BIOMES: Biome[] = ["mesa", "tundra", "ashlands", "lunar"];
/** Grace after a shot's replay before the next player's clock really bites. */
const REPLAY_GRACE_MS = 1500;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ---------------- internals ---------------- */

const player = (s: TanksState, id: string) => s.players.find((p) => p.id === id);
const active = (s: TanksState) => s.players.filter((p) => !p.left);

function log(s: TanksState, kind: TanksLogKind, e: Partial<TanksLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

const who = (p: TanksPlayer) => ({ actor: p.name, player: p.id, seat: p.seat });

function nextWind(s: TanksState, rng: Rng): number {
  if (s.biome === "lunar") return 0;
  return clamp(Math.round(s.wind * 0.35 + (rng() * 2 - 1) * MAX_WIND * 0.85), -MAX_WIND, MAX_WIND);
}

/** Shots still to come, plus those already fired. */
const totalShots = (s: TanksState) => s.shots + s.players.reduce((a, p) => a + (p.left ? 0 : p.arsenal.length), 0);

function finish(s: TanksState) {
  s.phase = "over";
  s.turn = "";
  s.deadline = null;
  const ranked = [...active(s)].sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    s.winner = null;
    s.winBy = null;
    log(s, "draw", { n: ranked[0].score });
    return;
  }
  s.winner = ranked[0].id;
  s.winBy = "score";
  log(s, "win", { ...who(ranked[0]), n: ranked[0].score });
}

/** The next seated player (after `seat`) with something left to fire. */
function nextShooter(s: TanksState, seat: number): TanksPlayer | null {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const q = s.players[(seat + k) % n];
    if (!q.left && q.arsenal.length > 0) return q;
  }
  return null;
}

function passTurn(s: TanksState, fromSeat: number, rng: Rng, extraMs: number) {
  const q = nextShooter(s, fromSeat);
  if (!q) return finish(s);
  s.turn = q.id;
  s.wind = nextWind(s, rng);
  s.deadline = s.updatedAt + extraMs + TURN_MS;
  if (!q.loaded || !q.arsenal.includes(q.loaded)) q.loaded = q.arsenal[0];
}

/* ---------------- draft ---------------- */

function startBattle(s: TanksState, rng: Rng) {
  s.phase = "aim";
  for (const p of s.players) p.loaded = p.arsenal[0] ?? null;
  s.totalShots = totalShots(s);
  log(s, "draft_done");
  const live = active(s).filter((p) => p.arsenal.length > 0);
  if (live.length === 0) return finish(s);
  const first = live[Math.floor(rng() * live.length)];
  s.turn = first.id;
  s.deadline = s.updatedAt + TURN_MS;
}

function advanceDraft(s: TanksState, rng: Rng) {
  for (;;) {
    s.draftIdx++;
    if (s.draftIdx >= s.draftOrder.length) return startBattle(s, rng);
    const q = s.players[s.draftOrder[s.draftIdx]];
    if (!q.left) {
      s.turn = q.id;
      s.deadline = s.updatedAt + PICK_MS;
      return;
    }
  }
}

function doPick(s: TanksState, p: TanksPlayer, w: WeaponId) {
  s.pool.splice(s.pool.indexOf(w), 1);
  p.arsenal.push(w);
  p.drafted.push(w);
  log(s, "pick", { ...who(p), weapon: w });
}

/** The auto-drafter: the hardest hitter left, with a little taste for variety. */
export function autoDraft(s: TanksState, p: TanksPlayer, rng: Rng): WeaponId {
  let best = s.pool[0];
  let bestScore = -Infinity;
  for (const w of s.pool) {
    const m = WEAPONS[w];
    const dup = p.arsenal.some((a) => WEAPONS[a].family === m.family) ? 0.6 : 0;
    const score = m.punch - dup + rng() * 1.2;
    if (score > bestScore) {
      bestScore = score;
      best = w;
    }
  }
  return best;
}

/* ---------------- battle ---------------- */

function doFire(s: TanksState, p: TanksPlayer, weapon: WeaponId, angle: number, power: number, rng: Rng) {
  const live = active(s);
  const pre = {
    ground: s.ground.slice(),
    tanks: live.map((q) => ({ seat: q.seat, x: q.x, y: q.y })),
    scores: s.players.map((q) => q.score),
  };
  const res = simulateShot({
    ground: s.ground,
    tanks: live.map((q) => ({ seat: q.seat, x: q.x, y: q.y })),
    seats: s.players.length,
    shooter: p.seat,
    weapon,
    angle,
    power,
    wind: s.wind,
    gravity: s.gravity,
    rng,
  });

  s.ground = res.ground;
  for (const t of res.tanks) {
    const q = s.players[t.seat];
    q.x = t.x;
    q.y = t.y;
  }
  for (const q of s.players) {
    q.score = Math.max(0, q.score + res.delta[q.seat]);
    q.taken += res.taken[q.seat];
  }
  p.dealt += res.dealt;
  p.angle = angle;
  p.power = power;
  p.arsenal.splice(p.arsenal.indexOf(weapon), 1);
  p.loaded = p.arsenal[0] ?? null;
  const pts = res.delta[p.seat];
  if (pts > 0 && (!p.best || pts > p.best.pts)) p.best = { weapon, pts };

  s.shots += 1;
  s.beat += 1;
  s.lastShot = { beat: s.beat, seat: p.seat, weapon, angle, power, wind: s.wind, pre, rec: res.rec, pts };

  log(s, "fire", { ...who(p), weapon, n: pts });
  for (const q of s.players) {
    const n = res.taken[q.seat];
    if (!n) continue;
    if (q.seat === p.seat) log(s, "self", { ...who(p), n });
    else log(s, "score", { ...who(p), victim: q.name, n });
  }

  const replayMs = Math.round((res.rec.dur / TPS) * 1000) + REPLAY_GRACE_MS;
  passTurn(s, p.seat, rng, replayMs);
}

/* ---------------- lifecycle ---------------- */

export function initTanks(players: GamePlayer[], now: number, rng: Rng): TanksState {
  const n = players.length;
  const k = ARSENAL[n] ?? 6;
  const biome = BIOMES[Math.floor(rng() * BIOMES.length)];
  const spots = shuffle(spawnXs(n, rng), rng);
  const ground = generateGround(biome, spots, rng);
  const seated: TanksPlayer[] = players.map((p) => {
    const x = spots[p.seat];
    return {
      id: p.id,
      name: p.name,
      seat: p.seat,
      color: COLORS[p.seat % COLORS.length],
      x,
      y: tankGround(ground, x),
      angle: x < W / 2 ? 52 : 128,
      power: 62,
      loaded: null,
      arsenal: [],
      drafted: [],
      moves: MOVES,
      score: 0,
      dealt: 0,
      taken: 0,
      best: null,
      left: false,
    };
  });

  const pool = shuffle([...WEAPON_IDS], rng)
    .slice(0, Math.min(WEAPON_IDS.length, n * k + POOL_SPARE))
    .sort((a, b) => WEAPON_IDS.indexOf(a) - WEAPON_IDS.indexOf(b));

  // snake draft from a random first seat
  const first = Math.floor(rng() * n);
  const seats = Array.from({ length: n }, (_, i) => (first + i) % n);
  const draftOrder: number[] = [];
  for (let r = 0; r < k; r++) draftOrder.push(...(r % 2 === 0 ? seats : [...seats].reverse()));

  const s: TanksState = {
    phase: "draft",
    players: seated,
    biome,
    gravity: biome === "lunar" ? 0.6 : 1,
    wind: 0,
    ground,
    pool,
    draftOrder,
    draftIdx: 0,
    turn: seated[draftOrder[0]].id,
    deadline: now + PICK_MS,
    shots: 0,
    totalShots: n * k,
    beat: 0,
    lastShot: null,
    lastDrive: null,
    winner: null,
    winBy: null,
    startedAt: now,
    scenery: Math.floor(rng() * 1e9),
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  s.wind = nextWind(s, rng);
  log(s, "start", who(seated[draftOrder[0]]));
  return s;
}

export function applyTanksMove(s: TanksState, playerId: string, move: TanksMove, now: number, rng: Rng): void {
  const p = player(s, playerId) ?? (err("You are not in this game.") as never);
  if (s.phase === "over") err("The game is over.");
  if (!move || typeof move !== "object") err("Unknown move.");
  if (p.left) err("You left this game.");
  if (s.turn !== p.id) err("It's not your turn.");

  switch (move.type) {
    case "pick": {
      if (s.phase !== "draft") err("The draft is over.");
      if (!isWeapon(move.weapon) || !s.pool.includes(move.weapon)) err("That weapon isn't on the table.");
      s.updatedAt = now;
      doPick(s, p, move.weapon);
      advanceDraft(s, rng);
      return;
    }
    case "aim": {
      if (s.phase !== "aim") err("Not now.");
      if (!Number.isFinite(move.angle) || !Number.isFinite(move.power)) err("Bad aim.");
      p.angle = clamp(Math.round(move.angle), 0, 180);
      p.power = clamp(Math.round(move.power), 0, 100);
      if (move.weapon !== undefined) {
        if (!isWeapon(move.weapon) || !p.arsenal.includes(move.weapon)) err("You don't have that weapon.");
        p.loaded = move.weapon;
      }
      s.updatedAt = now;
      return;
    }
    case "drive": {
      if (s.phase !== "aim") err("Not now.");
      if (move.dir !== 1 && move.dir !== -1) err("Bad direction.");
      if (p.moves <= 0) err("Your tank is out of fuel.");
      const others = active(s).filter((q) => q.id !== p.id).map((q) => q.x);
      const to = driveTo(s.ground, p.x, move.dir, others);
      if (Math.abs(to - p.x) < 2) err("Can't drive any further that way.");
      s.updatedAt = now;
      const from = p.x;
      p.x = to;
      p.y = tankGround(s.ground, to);
      p.moves -= 1;
      s.beat += 1;
      s.lastDrive = { beat: s.beat, seat: p.seat, from, to };
      log(s, "drive", who(p));
      return;
    }
    case "fire": {
      if (s.phase !== "aim") err("Not now.");
      if (!isWeapon(move.weapon) || !p.arsenal.includes(move.weapon)) err("You don't have that weapon.");
      if (!Number.isFinite(move.angle) || !Number.isFinite(move.power)) err("Bad aim.");
      s.updatedAt = now;
      doFire(s, p, move.weapon, clamp(Math.round(move.angle), 0, 180), clamp(Math.round(move.power), 0, 100), rng);
      return;
    }
    default:
      err("Unknown move.");
  }
}

/** The clock ran out: draft for them, or fire whatever is loaded. */
export function tickTanks(s: TanksState, now: number, rng: Rng): boolean {
  if (s.phase === "over") return false;
  if (s.deadline === null || now < s.deadline) return false;
  const p = player(s, s.turn);
  if (!p) return false;
  s.updatedAt = now;
  log(s, "timeout", who(p));
  if (s.phase === "draft") {
    doPick(s, p, autoDraft(s, p, rng));
    advanceDraft(s, rng);
  } else {
    const w = p.loaded && p.arsenal.includes(p.loaded) ? p.loaded : p.arsenal[0];
    doFire(s, p, w, p.angle, p.power, rng);
  }
  return true;
}

/** A player left the party: their tank is gone and their arsenal with it. */
export function forfeitTanks(s: TanksState, playerId: string, now: number, rng: Rng): void {
  if (s.phase === "over") return;
  const p = player(s, playerId);
  if (!p || p.left) return;

  s.updatedAt = now;
  p.left = true;
  p.arsenal = [];
  p.loaded = null;
  log(s, "left", who(p));

  const live = active(s);
  if (live.length <= 1) {
    if (live.length === 1) {
      s.winner = live[0].id;
      s.winBy = "forfeit";
      log(s, "win", who(live[0]));
    }
    s.phase = "over";
    s.turn = "";
    s.deadline = null;
    return;
  }
  if (s.phase === "draft") {
    // their remaining picks are skipped; the weapons stay on the table
    if (s.turn === p.id) advanceDraft(s, rng);
    return;
  }
  s.totalShots = totalShots(s);
  if (s.turn === p.id) passTurn(s, p.seat, rng, 0);
  else if (!live.some((q) => q.arsenal.length > 0)) finish(s);
}

/* ---------------- redaction ---------------- */

/** Perfect information: everyone (players and spectators alike) sees this. */
export function redactTanks(s: TanksState, viewerId: string, now: number): TanksView {
  return {
    phase: s.phase,
    players: s.players.map((p) => ({ ...p, arsenal: p.arsenal.slice(), drafted: p.drafted.slice(), best: p.best ? { ...p.best } : null })),
    youId: viewerId,
    biome: s.biome,
    gravity: s.gravity,
    wind: s.wind,
    ground: s.ground,
    pool: s.pool.slice(),
    draftOrder: s.draftOrder,
    draftIdx: s.draftIdx,
    turn: s.phase === "over" ? null : s.turn,
    deadline: s.phase === "over" ? null : s.deadline,
    shots: s.shots,
    totalShots: s.totalShots,
    beat: s.beat,
    lastShot: s.lastShot,
    lastDrive: s.lastDrive,
    winner: s.winner,
    winBy: s.winBy,
    startedAt: s.startedAt,
    scenery: s.scenery,
    log: s.log.slice(-30),
    now,
  };
}

/* ---------------- module ---------------- */

export const tanksModule: GameModule<TanksState, TanksView, TanksMove> = {
  type: "tanks",
  minPlayers: 2,
  maxPlayers: 4,
  init: initTanks,
  applyMove: applyTanksMove,
  tick: tickTanks,
  redact: redactTanks,
  /** A level score is a draw — no winner to tally. */
  result: (s) => (s.phase === "over" && s.winner ? { winnerId: s.winner } : null),
  isOver: (s) => s.phase === "over",
  forfeit: (s, playerId, now, rng) => forfeitTanks(s, playerId, now, rng),
};
