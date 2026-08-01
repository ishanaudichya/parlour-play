/* Battleship engine fuzz test: play thousands of random games and assert
   invariants — fleet conservation, shot bookkeeping, turn sanity, termination,
   and (most importantly) that redaction NEVER leaks an unhit, unsunk ship cell
   to the opponent or to a spectator.
   Run: npx tsx scripts/simulate-battleship.ts */
import {
  applyBattleshipMove,
  battleshipModule,
  canPlace,
  cellKey,
  fleetCellMap,
  forfeitBattleship,
  initBattleship,
  redactBattleship,
  shipCells,
  tickBattleship,
} from "../src/lib/games/battleship/engine";
import {
  FLEET_CELLS,
  GRID,
  LOG_CAP,
  SHIPS,
  SHIP_LEN,
  type BattleshipMove,
  type BattleshipState,
  type BattleshipView,
  type BSPlayer,
  type Placement,
} from "../src/lib/games/battleship/types";
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

const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

const opponentOf = (s: BattleshipState, id: string) => s.players.find((p) => p.id !== id)!;

/* ---------------- invariants ---------------- */

function assertInvariants(s: BattleshipState, ctx: string) {
  if (s.players.length !== 2) throw new Error(`${ctx}: ${s.players.length} players`);

  for (const p of s.players) {
    const opp = opponentOf(s, p.id);

    // fleet: in-bounds, no overlaps; complete (17 cells) once ready / past placement
    const cells = new Set<number>();
    for (const sp of SHIPS) {
      const pl = p.fleet[sp.id];
      if (!pl) continue;
      for (const c of shipCells(pl, sp.len)) {
        if (c.x < 0 || c.x >= GRID || c.y < 0 || c.y >= GRID)
          throw new Error(`${ctx}: ${p.name} ${sp.id} out of bounds`);
        const k = cellKey(c.x, c.y);
        if (cells.has(k)) throw new Error(`${ctx}: ${p.name} ships overlap at ${c.x},${c.y}`);
        cells.add(k);
      }
    }
    // a locked-in fleet is complete; battle requires both ready (checked below),
    // so completeness during/after battle follows. (a forfeit can end the game
    // mid-placement with a fleet legitimately unfinished)
    if (p.ready) {
      const placed = SHIPS.filter((sp) => p.fleet[sp.id]).length;
      if (placed !== SHIPS.length || cells.size !== FLEET_CELLS)
        throw new Error(`${ctx}: ${p.name} fleet ${placed} ships / ${cells.size} cells`);
    }

    // shots: in-bounds, no duplicates, hit flag === "landed on a ship cell"
    const oppCells = fleetCellMap(opp.fleet);
    const seen = new Set<number>();
    for (const sh of p.shots) {
      if (sh.x < 0 || sh.x >= GRID || sh.y < 0 || sh.y >= GRID)
        throw new Error(`${ctx}: ${p.name} shot out of bounds`);
      const k = cellKey(sh.x, sh.y);
      if (seen.has(k)) throw new Error(`${ctx}: ${p.name} duplicate shot ${sh.x},${sh.y}`);
      seen.add(k);
      if (sh.hit !== oppCells.has(k))
        throw new Error(`${ctx}: ${p.name} hit bookkeeping wrong at ${sh.x},${sh.y}`);
    }
    if (s.phase === "placement" && p.shots.length > 0)
      throw new Error(`${ctx}: shots fired during placement`);
  }

  if (s.phase === "battle") {
    const t = s.players.find((p) => p.id === s.turn);
    if (!t || t.left) throw new Error(`${ctx}: turn on missing/left player`);
    if (!s.turnDeadline) throw new Error(`${ctx}: battle without turn deadline`);
    if (!s.players.every((p) => p.ready)) throw new Error(`${ctx}: battle before both ready`);
  }
  if (s.phase === "over") {
    if (!s.winner || !s.winBy) throw new Error(`${ctx}: over without winner`);
    const w = s.players.find((p) => p.id === s.winner)!;
    if (s.winBy === "sink") {
      const hits = w.shots.filter((sh) => sh.hit).length;
      if (hits !== FLEET_CELLS) throw new Error(`${ctx}: sink win with ${hits} hits`);
      const oppCells = fleetCellMap(opponentOf(s, w.id).fleet);
      const shot = new Set(w.shots.map((sh) => cellKey(sh.x, sh.y)));
      for (const k of oppCells.keys())
        if (!shot.has(k)) throw new Error(`${ctx}: sink win but a ship cell was never shot`);
    } else if (!opponentOf(s, s.winner).left) {
      throw new Error(`${ctx}: forfeit win but loser hasn't left`);
    }
  }
  if (s.log.length > LOG_CAP) throw new Error(`${ctx}: log over cap`);
}

/* ---------------- redaction leak checks ---------------- */

/** Ship cells of `p` that are neither hit nor part of a sunk ship: since a
    sunk ship is fully hit, this is simply "ship cells with no shot on them".
    These must never appear in an opponent's or spectator's view. */
function hiddenCellsOf(s: BattleshipState, p: BSPlayer): Set<number> {
  const shot = new Set(opponentOf(s, p.id).shots.map((sh) => cellKey(sh.x, sh.y)));
  const hidden = new Set<number>();
  for (const k of fleetCellMap(p.fleet).keys()) if (!shot.has(k)) hidden.add(k);
  return hidden;
}

/** Recursively find any {x, y}-bearing object covering a forbidden cell.
    Coordinates are per-board, so callers pass the hidden set of ONE board. */
function deepScan(node: unknown, forbidden: Set<number>, ctx: string) {
  if (Array.isArray(node)) {
    for (const v of node) deepScan(v, forbidden, ctx);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if (typeof o.x === "number" && typeof o.y === "number") {
    const covered =
      (o.dir === "h" || o.dir === "v") && typeof o.len === "number"
        ? shipCells({ x: o.x, y: o.y, dir: o.dir }, o.len)
        : [{ x: o.x, y: o.y }];
    for (const c of covered)
      if (forbidden.has(cellKey(c.x, c.y)))
        throw new Error(`${ctx}: LEAK — hidden ship cell ${c.x},${c.y} in view`);
  }
  for (const v of Object.values(o)) deepScan(v, forbidden, ctx);
}

/** Assert a subtree carries NO coordinate-bearing objects at all. */
function assertNoCoords(node: unknown, ctx: string) {
  if (Array.isArray(node)) {
    for (const v of node) assertNoCoords(v, ctx);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if (typeof o.x === "number" && typeof o.y === "number")
    throw new Error(`${ctx}: unexpected coordinates outside boards/log/lastShot/yourFleet`);
  for (const v of Object.values(o)) assertNoCoords(v, ctx);
}

function assertViewSafe(s: BattleshipState, view: BattleshipView, viewerId: string, ctx: string) {
  const viewer = s.players.find((p) => p.id === viewerId) ?? null;

  // yourFleet: null for spectators; for players it may describe ONLY their own fleet
  if (!viewer && view.yourFleet !== null) throw new Error(`${ctx}: spectator got a fleet`);
  if (viewer) {
    if (!view.yourFleet) throw new Error(`${ctx}: player missing own fleet`);
    for (const ship of view.yourFleet) {
      const pl = viewer.fleet[ship.ship];
      if (ship.placed) {
        if (!pl || pl.x !== ship.x || pl.y !== ship.y || pl.dir !== ship.dir)
          throw new Error(`${ctx}: yourFleet doesn't match viewer's own fleet`);
      } else if (pl) {
        throw new Error(`${ctx}: yourFleet hides a placed ship`);
      }
    }
  }

  // per-board structural checks + a board-scoped deep scan
  for (const p of s.players) {
    const board = view.boards.find((b) => b.playerId === p.id);
    if (!board) throw new Error(`${ctx}: board for ${p.name} missing`);
    const oppShots = new Set(opponentOf(s, p.id).shots.map((sh) => cellKey(sh.x, sh.y)));
    const hidden = hiddenCellsOf(s, p);
    for (const sh of board.shots) {
      if (!oppShots.has(cellKey(sh.x, sh.y))) throw new Error(`${ctx}: phantom shot in view`);
      if (hidden.has(cellKey(sh.x, sh.y))) throw new Error(`${ctx}: LEAK via shot map`);
    }
    for (const sk of board.sunk) {
      const pl = p.fleet[sk.ship];
      if (!pl || pl.x !== sk.x || pl.y !== sk.y || pl.dir !== sk.dir || sk.len !== SHIP_LEN[sk.ship])
        throw new Error(`${ctx}: sunk reveal doesn't match actual placement`);
      for (const c of shipCells(pl, sk.len))
        if (!oppShots.has(cellKey(c.x, c.y)))
          throw new Error(`${ctx}: LEAK — "sunk" ship ${sk.ship} isn't fully hit`);
    }
    // nothing on this board may cover one of its owner's hidden cells
    deepScan(board, hidden, `${ctx} board=${p.id}`);
  }

  // lastShot must be a real fired shot; it lands on the shooter's TARGET board
  if (view.lastShot) {
    const shooter = s.players.find((p) => p.id === view.lastShot!.by);
    if (!shooter) throw new Error(`${ctx}: lastShot by a non-player`);
    const real = shooter.shots.some(
      (sh) => sh.x === view.lastShot!.x && sh.y === view.lastShot!.y && sh.hit === view.lastShot!.hit
    );
    if (!real) throw new Error(`${ctx}: lastShot never happened`);
    const target = opponentOf(s, shooter.id);
    if (hiddenCellsOf(s, target).has(cellKey(view.lastShot.x, view.lastShot.y)))
      throw new Error(`${ctx}: LEAK via lastShot`);
  }

  // log coordinates are shots by `actor` at their opponent's board
  for (const l of view.log) {
    if (typeof l.x !== "number" || typeof l.y !== "number") continue;
    const actor = s.players.find((p) => p.name === l.actor);
    if (!actor) throw new Error(`${ctx}: log shot without a known actor`);
    if (!actor.shots.some((sh) => sh.x === l.x && sh.y === l.y))
      throw new Error(`${ctx}: log shot never happened`);
    if (hiddenCellsOf(s, opponentOf(s, actor.id)).has(cellKey(l.x, l.y)))
      throw new Error(`${ctx}: LEAK via log`);
  }

  // everything else in the view must carry no coordinates whatsoever
  assertNoCoords(
    { ...view, boards: undefined, log: undefined, lastShot: undefined, yourFleet: undefined },
    ctx
  );

  // the spec-letter check: the serialized view must not contain the placement
  // signature of any hidden (unsunk) ship — unless an identical signature is
  // legitimately visible (viewer's own ship or a revealed sunk hull)
  const json = JSON.stringify({ ...view, yourFleet: null });
  const legit = new Set<string>();
  if (viewer)
    for (const sp of SHIPS) {
      const pl = viewer.fleet[sp.id];
      if (pl) legit.add(`"x":${pl.x},"y":${pl.y},"dir":"${pl.dir}"`);
    }
  for (const b of view.boards)
    for (const sk of b.sunk) legit.add(`"x":${sk.x},"y":${sk.y},"dir":"${sk.dir}"`);
  for (const p of s.players) {
    const sunkIds = new Set(
      view.boards.find((b) => b.playerId === p.id)!.sunk.map((sk) => sk.ship)
    );
    for (const sp of SHIPS) {
      const pl = p.fleet[sp.id];
      if (!pl || sunkIds.has(sp.id)) continue;
      const sig = `"x":${pl.x},"y":${pl.y},"dir":"${pl.dir}"`;
      if (!legit.has(sig) && json.includes(sig))
        throw new Error(`${ctx}: LEAK — hidden ${sp.id} signature in serialized view`);
    }
  }
}

function checkViews(s: BattleshipState, now: number, ctx: string) {
  for (const viewerId of [s.players[0].id, s.players[1].id, "spectator"]) {
    assertViewSafe(s, redactBattleship(s, viewerId, now), viewerId, `${ctx} viewer=${viewerId}`);
  }
}

/* ---------------- invalid-move probes ---------------- */

let probeCount = 0;

function expectRejected(s: BattleshipState, playerId: string, move: BattleshipMove, now: number, rng: () => number, ctx: string) {
  const before = JSON.stringify(s);
  let threw = false;
  try {
    applyBattleshipMove(s, playerId, move, now, rng);
  } catch (e) {
    if (!(e instanceof MoveError)) throw e;
    threw = true;
  }
  if (!threw) throw new Error(`${ctx}: invalid move accepted: ${JSON.stringify(move)}`);
  if (JSON.stringify(s) !== before)
    throw new Error(`${ctx}: rejected move mutated state: ${JSON.stringify(move)}`);
  probeCount++;
}

function probeInvalid(s: BattleshipState, now: number, rng: () => number, ctx: string) {
  const p0 = s.players[0];
  const p1 = s.players[1];
  const probes: (() => void)[] = [];

  // universally invalid
  probes.push(() => expectRejected(s, "ghost", { type: "ready" }, now, rng, ctx));
  probes.push(() =>
    expectRejected(s, p0.id, { type: "warp" } as unknown as BattleshipMove, now, rng, ctx)
  );

  if (s.phase === "placement") {
    probes.push(() => expectRejected(s, p0.id, { type: "shoot", x: 0, y: 0 }, now, rng, ctx));
    // out of bounds (or locked-in — either way a MoveError)
    probes.push(() =>
      expectRejected(s, p1.id, { type: "place", shipId: "carrier", x: 7, y: 7, dir: "h" }, now, rng, ctx)
    );
    probes.push(() =>
      expectRejected(s, p0.id, { type: "place", shipId: "destroyer", x: -1, y: 3, dir: "v" }, now, rng, ctx)
    );
    probes.push(() =>
      expectRejected(s, p0.id, { type: "place", shipId: "cruiser", x: 2.5, y: 1, dir: "h" }, now, rng, ctx)
    );
    probes.push(() =>
      expectRejected(
        s,
        p0.id,
        { type: "place", shipId: "submarine", x: 0, y: 0, dir: "x" as "h" }, now, rng, ctx
      )
    );
    // overlap: drop another ship right on top of a placed one
    const withShip = s.players.find((pp) => pp.fleet.carrier && !pp.fleet.battleship && !pp.ready);
    if (withShip) {
      const pl = withShip.fleet.carrier!;
      probes.push(() =>
        expectRejected(s, withShip.id, { type: "place", shipId: "battleship", x: pl.x, y: pl.y, dir: pl.dir }, now, rng, ctx)
      );
    }
    // premature ready
    const incomplete = s.players.find((pp) => !pp.ready && SHIPS.some((sp) => !pp.fleet[sp.id]));
    if (incomplete) probes.push(() => expectRejected(s, incomplete.id, { type: "ready" }, now, rng, ctx));
    // double-ready
    const done = s.players.find((pp) => pp.ready);
    if (done) probes.push(() => expectRejected(s, done.id, { type: "ready" }, now, rng, ctx));
  }

  if (s.phase === "battle") {
    const turnP = s.players.find((pp) => pp.id === s.turn)!;
    const other = opponentOf(s, turnP.id);
    probes.push(() => expectRejected(s, other.id, { type: "shoot", x: 0, y: 0 }, now, rng, ctx));
    probes.push(() => expectRejected(s, turnP.id, { type: "shoot", x: GRID, y: 0 }, now, rng, ctx));
    probes.push(() => expectRejected(s, turnP.id, { type: "shoot", x: 3, y: -2 }, now, rng, ctx));
    probes.push(() =>
      expectRejected(s, turnP.id, { type: "place", shipId: "destroyer", x: 0, y: 0, dir: "h" }, now, rng, ctx)
    );
    probes.push(() => expectRejected(s, turnP.id, { type: "randomize" }, now, rng, ctx));
    probes.push(() => expectRejected(s, turnP.id, { type: "ready" }, now, rng, ctx));
    if (turnP.shots.length > 0) {
      const dup = pick(rng, turnP.shots);
      probes.push(() => expectRejected(s, turnP.id, { type: "shoot", x: dup.x, y: dup.y }, now, rng, ctx));
    }
  }

  pick(rng, probes)();
}

/* ---------------- random legal play ---------------- */

function placementStep(s: BattleshipState, now: number, rng: () => number, placeSteps: number) {
  if (placeSteps > 25 || rng() < 0.12) {
    // let the phase deadline expire — auto-scatter + auto-ready both laggards
    if (!tickBattleship(s, s.placeDeadline! + 1, rng)) throw new Error("placement tick was a no-op");
    return;
  }
  const laggards = s.players.filter((p) => !p.ready);
  const p = pick(rng, laggards);
  const roll = rng();
  if (roll < 0.35) {
    // manual placement at a random legal spot (if one exists for this attempt)
    const sp = pick(rng, SHIPS);
    const pl: Placement = {
      x: Math.floor(rng() * GRID),
      y: Math.floor(rng() * GRID),
      dir: rng() < 0.5 ? "h" : "v",
    };
    if (canPlace(p.fleet, sp.id, pl)) {
      applyBattleshipMove(s, p.id, { type: "place", shipId: sp.id, x: pl.x, y: pl.y, dir: pl.dir }, now, rng);
    } else {
      expectRejected(s, p.id, { type: "place", shipId: sp.id, x: pl.x, y: pl.y, dir: pl.dir }, now, rng, "placement probe");
    }
  } else if (roll < 0.65 || SHIPS.some((sp) => !p.fleet[sp.id])) {
    applyBattleshipMove(s, p.id, { type: "randomize" }, now, rng);
  } else {
    applyBattleshipMove(s, p.id, { type: "ready" }, now, rng);
  }
}

function battleStep(s: BattleshipState, now: number, rng: () => number): boolean {
  // returns true if a timeout auto-shot was fired
  if (rng() < 0.06) {
    if (!tickBattleship(s, s.turnDeadline! + 1, rng)) throw new Error("battle tick was a no-op");
    return true;
  }
  const p = s.players.find((pp) => pp.id === s.turn)!;
  const tried = new Set(p.shots.map((sh) => cellKey(sh.x, sh.y)));
  const untried: { x: number; y: number }[] = [];
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) if (!tried.has(cellKey(x, y))) untried.push({ x, y });
  const c = pick(rng, untried);
  applyBattleshipMove(s, p.id, { type: "shoot", x: c.x, y: c.y }, now, rng);
  return false;
}

/* ---------------- driver ---------------- */

const GAMES = Number(process.env.GAMES ?? 3000);
let totalShots = 0;
let totalSteps = 0;
let sinkWins = 0;
let forfeitWins = 0;
let timeoutShots = 0;

if (battleshipModule.type !== "battleship" || battleshipModule.minPlayers !== 2 || battleshipModule.maxPlayers !== 2)
  throw new Error("module metadata wrong");

for (let g = 0; g < GAMES; g++) {
  const seed = 7000 + g;
  const rng = mulberry32(seed);
  try {
    let now = 1_000_000;
    const players: GamePlayer[] = [
      { id: "p0", name: "Admiral Zero", seat: 0 },
      { id: "p1", name: "Admiral One", seat: 1 },
    ];
    const s = initBattleship(players, now);
    assertInvariants(s, `seed ${seed} start`);
    checkViews(s, now, `seed ${seed} start`);
    if (battleshipModule.result(s) !== null) throw new Error(`seed ${seed}: premature result`);

    // half the games allow rage-quits (~2% of steps); the rest always finish
    const forfeitProb = g % 2 === 0 ? 0.02 : 0;

    let steps = 0;
    let placeSteps = 0;
    while (s.phase !== "over") {
      if (++steps > 400) throw new Error(`seed ${seed}: game did not terminate in 400 steps`);
      now += 1000;

      if (rng() < forfeitProb) {
        const stayers = s.players.filter((p) => !p.left);
        const quitter = pick(rng, stayers);
        forfeitBattleship(s, quitter.id, now);
        if (s.phase !== "over" || s.winner !== opponentOf(s, quitter.id).id || s.winBy !== "forfeit")
          throw new Error(`seed ${seed}: forfeit didn't hand the win over`);
        // forfeit must be a no-op once the game is over
        const after = JSON.stringify(s);
        forfeitBattleship(s, opponentOf(s, quitter.id).id, now + 1);
        forfeitBattleship(s, quitter.id, now + 1);
        if (JSON.stringify(s) !== after) throw new Error(`seed ${seed}: forfeit after game over mutated state`);
      } else if (rng() < 0.08) {
        probeInvalid(s, now, rng, `seed ${seed} step ${steps}`);
      } else if (s.phase === "placement") {
        placeSteps++;
        placementStep(s, now, rng, placeSteps);
      } else {
        if (battleStep(s, now, rng)) timeoutShots++;
      }

      // ticking with time still on the clock must never change anything
      if (s.phase !== "over" && tickBattleship(s, now, rng))
        throw new Error(`seed ${seed} step ${steps}: premature tick fired`);

      assertInvariants(s, `seed ${seed} step ${steps}`);
      checkViews(s, now, `seed ${seed} step ${steps}`);
    }

    // endgame checks: result, winner, serializability round-trip
    const res = battleshipModule.result(s);
    if (!res || res.winnerId !== s.winner) throw new Error(`seed ${seed}: result() mismatch`);
    if (s.winBy === "sink") sinkWins++;
    else forfeitWins++;
    const json = JSON.stringify(s);
    if (JSON.stringify(JSON.parse(json)) !== json) throw new Error(`seed ${seed}: state not JSON-stable`);

    totalShots += s.players[0].shots.length + s.players[1].shots.length;
    totalSteps += steps;
  } catch (e) {
    console.error(`FAILED at game ${g} (seed ${seed})`);
    throw e;
  }
}

console.log(
  `OK: ${GAMES} games, avg ${(totalShots / GAMES).toFixed(1)} shots ` +
    `(${sinkWins} sink wins, ${forfeitWins} forfeits, avg ${(totalSteps / GAMES).toFixed(1)} steps, ` +
    `${timeoutShots} timeout auto-shots, ${probeCount} invalid moves rejected)`
);
