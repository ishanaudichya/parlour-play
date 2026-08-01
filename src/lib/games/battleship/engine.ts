import { MoveError, type GameModule, type GamePlayer } from "@/lib/games/types";
import {
  FLEET_CELLS,
  GRID,
  LOG_CAP,
  PLACE_MS,
  SHIPS,
  SHIP_LEN,
  SHIP_NAME,
  TURN_MS,
  type BattleshipMove,
  type BattleshipState,
  type BattleshipView,
  type BSLogEntry,
  type BSLogKind,
  type BSPlayer,
  type Placement,
  type ShipId,
  type SunkShipView,
} from "./types";

export type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

/* ---------------- geometry helpers (shared with UI + fuzz) ---------------- */

export const cellKey = (x: number, y: number) => y * GRID + x;

/** Cells covered by a placement, bow to stern. */
export function shipCells(pl: Placement, len: number): { x: number; y: number }[] {
  return Array.from({ length: len }, (_, i) => ({
    x: pl.x + (pl.dir === "h" ? i : 0),
    y: pl.y + (pl.dir === "v" ? i : 0),
  }));
}

const inBounds = (x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < GRID && y >= 0 && y < GRID;

/** cellKey → ShipId for every placed ship of a fleet. */
export function fleetCellMap(fleet: Partial<Record<ShipId, Placement>>): Map<number, ShipId> {
  const m = new Map<number, ShipId>();
  for (const sp of SHIPS) {
    const pl = fleet[sp.id];
    if (!pl) continue;
    for (const c of shipCells(pl, sp.len)) m.set(cellKey(c.x, c.y), sp.id);
  }
  return m;
}

/** May `shipId` sit at `pl` given the rest of the fleet? (touching ok) */
export function canPlace(
  fleet: Partial<Record<ShipId, Placement>>,
  shipId: ShipId,
  pl: Placement
): boolean {
  if (pl.dir !== "h" && pl.dir !== "v") return false;
  const len = SHIP_LEN[shipId];
  const cells = shipCells(pl, len);
  const last = cells[cells.length - 1];
  if (!inBounds(pl.x, pl.y) || !inBounds(last.x, last.y)) return false;
  const others = new Set<number>();
  for (const sp of SHIPS) {
    if (sp.id === shipId) continue;
    const other = fleet[sp.id];
    if (!other) continue;
    for (const c of shipCells(other, sp.len)) others.add(cellKey(c.x, c.y));
  }
  return cells.every((c) => !others.has(cellKey(c.x, c.y)));
}

/* ---------------- internals ---------------- */

const player = (s: BattleshipState, id: string) => s.players.find((p) => p.id === id);

const opponentOf = (s: BattleshipState, id: string) => s.players.find((p) => p.id !== id)!;

function log(s: BattleshipState, kind: BSLogKind, e: Partial<BSLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

/** Randomly place the given ships (longest first) into a fleet, in place.
    Enumerates every legal spot so success is guaranteed; if a partial manual
    layout has boxed a ship out entirely, the whole fleet is re-scattered. */
function autoPlace(p: BSPlayer, ids: ShipId[], rng: Rng) {
  const order = [...ids].sort((a, b) => SHIP_LEN[b] - SHIP_LEN[a]);
  for (const id of order) {
    const candidates: Placement[] = [];
    for (const dir of ["h", "v"] as const) {
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const pl = { x, y, dir };
          if (canPlace(p.fleet, id, pl)) candidates.push(pl);
        }
      }
    }
    if (candidates.length === 0) {
      // a hand-made partial layout left no room — scatter everything fresh
      p.fleet = {};
      autoPlace(
        p,
        SHIPS.map((sp) => sp.id),
        rng
      );
      return;
    }
    p.fleet[id] = candidates[Math.floor(rng() * candidates.length)];
  }
}

const unplacedShips = (p: BSPlayer): ShipId[] =>
  SHIPS.filter((sp) => !p.fleet[sp.id]).map((sp) => sp.id);

function startBattle(s: BattleshipState, rng: Rng) {
  s.phase = "battle";
  s.placeDeadline = undefined;
  const first = s.players[Math.floor(rng() * s.players.length)];
  s.turn = first.id;
  s.turnDeadline = s.updatedAt + TURN_MS;
  log(s, "battle_start", { actor: first.name });
}

/** Ships of `p` that are fully sunk (every hull cell shot by the opponent). */
function sunkShipsOf(s: BattleshipState, p: BSPlayer): SunkShipView[] {
  const shot = new Set(opponentOf(s, p.id).shots.map((sh) => cellKey(sh.x, sh.y)));
  const out: SunkShipView[] = [];
  for (const sp of SHIPS) {
    const pl = p.fleet[sp.id];
    if (!pl) continue;
    if (shipCells(pl, sp.len).every((c) => shot.has(cellKey(c.x, c.y)))) {
      out.push({ ship: sp.id, name: sp.name, len: sp.len, x: pl.x, y: pl.y, dir: pl.dir });
    }
  }
  return out;
}

/** Fire at (x,y). Assumes validity. Handles hit-again, sinking, and the win. */
function doShoot(s: BattleshipState, shooter: BSPlayer, x: number, y: number) {
  const opp = opponentOf(s, shooter.id);
  const targetShip = fleetCellMap(opp.fleet).get(cellKey(x, y)) ?? null;
  const hit = targetShip !== null;
  shooter.shots.push({ x, y, hit });

  let sunk: ShipId | undefined;
  if (targetShip) {
    const shot = new Set(shooter.shots.map((sh) => cellKey(sh.x, sh.y)));
    const pl = opp.fleet[targetShip]!;
    if (shipCells(pl, SHIP_LEN[targetShip]).every((c) => shot.has(cellKey(c.x, c.y)))) {
      sunk = targetShip;
    }
  }

  s.lastShot = { by: shooter.id, x, y, hit, ...(sunk ? { sunk } : {}) };
  log(s, "shot", { actor: shooter.name, x, y, hit });
  if (sunk) log(s, "sunk", { actor: shooter.name, ship: SHIP_NAME[sunk] });

  const totalHits = shooter.shots.reduce((n, sh) => n + (sh.hit ? 1 : 0), 0);
  if (totalHits >= FLEET_CELLS) {
    s.phase = "over";
    s.winner = shooter.id;
    s.winBy = "sink";
    s.turnDeadline = undefined;
    log(s, "win", { actor: shooter.name });
    return;
  }

  // house rule: a hit keeps the gun — a miss passes it
  if (!hit) s.turn = opp.id;
  s.turnDeadline = s.updatedAt + TURN_MS;
}

/* ---------------- lifecycle ---------------- */

export function initBattleship(players: GamePlayer[], now: number): BattleshipState {
  return {
    phase: "placement",
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      ready: false,
      left: false,
      fleet: {},
      shots: [],
    })),
    turn: "",
    placeDeadline: now + PLACE_MS,
    winner: null,
    winBy: null,
    lastShot: null,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
}

export function applyBattleshipMove(
  s: BattleshipState,
  playerId: string,
  move: BattleshipMove,
  now: number,
  rng: Rng
): void {
  const p = player(s, playerId) ?? (err("You are not in this game.") as never);
  if (s.phase === "over") err("The game is over.");

  switch (move.type) {
    case "place": {
      if (s.phase !== "placement") err("Ships can only be positioned before battle.");
      if (p.ready) err("Your fleet is locked in.");
      if (!SHIPS.some((sp) => sp.id === move.shipId)) err("Unknown ship.");
      if (move.dir !== "h" && move.dir !== "v") err("Direction must be 'h' or 'v'.");
      const pl: Placement = { x: move.x, y: move.y, dir: move.dir };
      if (!canPlace(p.fleet, move.shipId, pl)) err("That ship doesn't fit there.");
      s.updatedAt = now;
      p.fleet[move.shipId] = pl; // re-placing an already-placed ship moves it
      return;
    }
    case "randomize": {
      if (s.phase !== "placement") err("Ships can only be positioned before battle.");
      if (p.ready) err("Your fleet is locked in.");
      s.updatedAt = now;
      const missing = unplacedShips(p);
      if (missing.length === 0) {
        // full fleet already down → scatter everything fresh
        p.fleet = {};
        autoPlace(
          p,
          SHIPS.map((sp) => sp.id),
          rng
        );
      } else {
        autoPlace(p, missing, rng);
      }
      return;
    }
    case "ready": {
      if (s.phase !== "placement") err("The battle has already begun.");
      if (p.ready) err("You are already locked in.");
      if (unplacedShips(p).length > 0) err("Place your whole fleet first.");
      s.updatedAt = now;
      p.ready = true;
      log(s, "place_ready", { actor: p.name });
      if (s.players.every((pp) => pp.ready)) startBattle(s, rng);
      return;
    }
    case "shoot": {
      if (s.phase !== "battle") err("Hold fire — the battle hasn't begun.");
      if (s.turn !== p.id) err("It's not your turn.");
      if (!inBounds(move.x, move.y)) err("That's off the grid.");
      if (p.shots.some((sh) => sh.x === move.x && sh.y === move.y))
        err("You already fired at that square.");
      s.updatedAt = now;
      doShoot(s, p, move.x, move.y);
      return;
    }
    default:
      err("Unknown move.");
  }
}

/** Advance expired deadlines. Returns true if state changed. */
export function tickBattleship(s: BattleshipState, now: number, rng: Rng): boolean {
  if (s.phase === "placement") {
    if (!s.placeDeadline || now < s.placeDeadline) return false;
    s.updatedAt = now;
    log(s, "timeout");
    for (const p of s.players) {
      if (p.ready) continue;
      const missing = unplacedShips(p);
      if (missing.length > 0) autoPlace(p, missing, rng);
      p.ready = true;
      log(s, "place_ready", { actor: p.name });
    }
    startBattle(s, rng);
    return true;
  }

  if (s.phase === "battle") {
    if (!s.turnDeadline || now < s.turnDeadline) return false;
    s.updatedAt = now;
    const p = player(s, s.turn)!;
    log(s, "timeout", { actor: p.name });
    // ONE auto-shot per expiry (a hit re-arms the deadline for the same player)
    const tried = new Set(p.shots.map((sh) => cellKey(sh.x, sh.y)));
    const untried: { x: number; y: number }[] = [];
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) if (!tried.has(cellKey(x, y))) untried.push({ x, y });
    if (untried.length === 0) {
      // unreachable: 100 shots would have sunk all 17 cells long ago
      s.turn = opponentOf(s, p.id).id;
      s.turnDeadline = now + TURN_MS;
      return true;
    }
    const c = untried[Math.floor(rng() * untried.length)];
    doShoot(s, p, c.x, c.y);
    return true;
  }

  return false;
}

/** A player left the party: their opponent wins on the spot. */
export function forfeitBattleship(s: BattleshipState, playerId: string, now: number): void {
  if (s.phase === "over") return;
  const p = player(s, playerId);
  if (!p || p.left) return;
  s.updatedAt = now;
  p.left = true;
  log(s, "left", { actor: p.name });
  const opp = opponentOf(s, playerId);
  s.phase = "over";
  s.winner = opp.id;
  s.winBy = "forfeit";
  s.placeDeadline = undefined;
  s.turnDeadline = undefined;
  log(s, "win", { actor: opp.name });
}

/* ---------------- redaction ---------------- */

export function redactBattleship(
  s: BattleshipState,
  viewerId: string,
  now: number
): BattleshipView {
  const viewer = player(s, viewerId) ?? null;
  const sunkBy = new Map(s.players.map((p) => [p.id, sunkShipsOf(s, p)]));

  return {
    phase: s.phase,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      ready: p.ready,
      left: p.left,
      shipsRemaining: SHIPS.length - sunkBy.get(p.id)!.length,
      shotsFired: p.shots.length,
      hitsLanded: p.shots.reduce((n, sh) => n + (sh.hit ? 1 : 0), 0),
    })),
    turn: s.phase === "battle" ? s.turn : null,
    placeDeadline: s.placeDeadline,
    turnDeadline: s.turnDeadline,
    winner: s.winner,
    winBy: s.winBy,
    boards: s.players.map((p) => ({
      playerId: p.id,
      shots: opponentOf(s, p.id).shots.map((sh) => ({ x: sh.x, y: sh.y, hit: sh.hit })),
      sunk: sunkBy.get(p.id)!,
    })),
    yourFleet: viewer
      ? SHIPS.map((sp) => {
          const pl = viewer.fleet[sp.id];
          if (!pl) return { ship: sp.id, name: sp.name, len: sp.len, placed: false, hits: [], sunk: false };
          const oppShots = new Set(
            opponentOf(s, viewer.id).shots.map((sh) => cellKey(sh.x, sh.y))
          );
          const hits = shipCells(pl, sp.len).map((c) => oppShots.has(cellKey(c.x, c.y)));
          return {
            ship: sp.id,
            name: sp.name,
            len: sp.len,
            placed: true,
            x: pl.x,
            y: pl.y,
            dir: pl.dir,
            hits,
            sunk: hits.every(Boolean),
          };
        })
      : null,
    youReady: viewer?.ready ?? false,
    lastShot: s.lastShot
      ? {
          by: s.lastShot.by,
          x: s.lastShot.x,
          y: s.lastShot.y,
          hit: s.lastShot.hit,
          ...(s.lastShot.sunk ? { sunk: SHIP_NAME[s.lastShot.sunk] } : {}),
        }
      : null,
    log: s.log.slice(-50),
    now,
  };
}

/* ---------------- module ---------------- */

export const battleshipModule: GameModule<BattleshipState, BattleshipView, BattleshipMove> = {
  type: "battleship",
  minPlayers: 2,
  maxPlayers: 2,
  init: initBattleship,
  applyMove: applyBattleshipMove,
  tick: tickBattleship,
  redact: redactBattleship,
  result: (s) => (s.phase === "over" && s.winner ? { winnerId: s.winner } : null),
  forfeit: forfeitBattleship,
};
