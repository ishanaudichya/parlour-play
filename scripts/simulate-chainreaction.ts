/* Chain Reaction engine fuzz test: thousands of random games at every table
   size (2–8), plus hardcoded unit assertions for the rules that matter.
   Every cascade the engine reports is re-derived by an INDEPENDENT settler
   written a different way (whole-board functional waves, not in-place
   bursts), so the engine's own physics is never taken on trust.
   Run: npx tsx scripts/simulate-chainreaction.ts */
import {
  applyChainMove,
  chainreactionModule,
  criticalMass,
  forfeitChain,
  initChain,
  legalCells,
  orbsBySeat,
  redactChain,
  tickChain,
} from "../src/lib/games/chainreaction/engine";
import {
  LOG_CAP,
  WAVES_HARD_CAP,
  WAVES_RECORDED,
  type ChainBoard,
  type ChainMove,
  type ChainState,
  type Wave,
} from "../src/lib/games/chainreaction/types";
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

const cloneBoard = (b: ChainBoard): ChainBoard => b.map((c) => ({ ...c }));

const boardsEqual = (a: ChainBoard, b: ChainBoard) =>
  a.length === b.length && a.every((c, i) => c.n === b[i].n && c.owner === b[i].owner);

/* ================= independent cascade settler =================
   Deliberately unlike the engine: each wave is computed as a brand-new board
   from the old one — n' = n − (bursting ? critical : 0) + bursting
   neighbours — instead of bursting cells one at a time in place. */

function nbrs(cols: number, rows: number, i: number): number[] {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const out: number[] = [];
  for (const [dc, dr] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]) {
    const c = col + dc;
    const r = row + dr;
    if (c >= 0 && c < cols && r >= 0 && r < rows) out.push(r * cols + c);
  }
  return out;
}

function independentSettle(
  start: ChainBoard,
  cols: number,
  rows: number,
  seat: number,
  ctx: string
): { board: ChainBoard; waves: Wave[]; bursts: number } {
  let b = cloneBoard(start);
  const waves: Wave[] = [];
  let bursts = 0;
  for (;;) {
    const bursting = b.map((c, i) => c.n >= nbrs(cols, rows, i).length);
    const wave: Wave = [];
    bursting.forEach((x, i) => x && wave.push(i));
    if (wave.length === 0) break;
    b = b.map((c, i) => {
      const inflow = nbrs(cols, rows, i).filter((j) => bursting[j]).length;
      const n = c.n - (bursting[i] ? nbrs(cols, rows, i).length : 0) + inflow;
      if (n < 0) throw new Error(`${ctx}: independent settler went negative`);
      return { n, owner: n === 0 ? null : inflow > 0 ? seat : c.owner };
    });
    waves.push(wave);
    bursts += wave.length;
    if (b.every((c) => c.n === 0 || c.owner === seat)) break;
    if (waves.length > WAVES_HARD_CAP) throw new Error(`${ctx}: independent settler never settled`);
  }
  return { board: b, waves, bursts };
}

/** The engine's reported cascade must match the independent one exactly. */
function verifyCascade(before: ChainBoard, s: ChainState, ctx: string) {
  const lm = s.lastMove;
  if (!lm) throw new Error(`${ctx}: move made but no lastMove`);
  const start = cloneBoard(before);
  const i = lm.row * s.cols + lm.col;
  if (start[i].n !== 0 && start[i].owner !== lm.seat)
    throw new Error(`${ctx}: orb placed on a cell held by seat ${start[i].owner}`);
  start[i] = { n: start[i].n + 1, owner: lm.seat };

  const ind = independentSettle(start, s.cols, s.rows, lm.seat, ctx);
  if (!boardsEqual(ind.board, s.board)) throw new Error(`${ctx}: engine board differs from independent settle`);
  if (ind.waves.length !== lm.totalWaves)
    throw new Error(`${ctx}: engine says ${lm.totalWaves} waves, independent says ${ind.waves.length}`);
  if (ind.bursts !== lm.bursts) throw new Error(`${ctx}: engine says ${lm.bursts} bursts, independent ${ind.bursts}`);
  if (lm.waves.length !== Math.min(lm.totalWaves, WAVES_RECORDED))
    throw new Error(`${ctx}: recorded ${lm.waves.length} waves of ${lm.totalWaves}`);
  for (let k = 0; k < lm.waves.length; k++) {
    if (lm.waves[k].join(",") !== ind.waves[k].join(","))
      throw new Error(`${ctx}: wave ${k} differs: [${lm.waves[k]}] vs [${ind.waves[k]}]`);
  }
}

/* ================= invariants ================= */

interface Track {
  /** orbs removed from the board by forfeits so far */
  swept: number;
  /** seat of the last mover (or leaver) — for the turn-order check */
  lastSeat: number | null;
}

function nextAliveSeat(s: ChainState, seat: number): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const q = s.players[(seat + k) % n];
    if (q.alive) return q.seat;
  }
  return -1;
}

function assertInvariants(s: ChainState, t: Track, ctx: string) {
  const n = s.players.length;
  const expectSize = n <= 3 ? [6, 8] : n <= 5 ? [7, 9] : [8, 10];
  if (s.cols !== expectSize[0] || s.rows !== expectSize[1])
    throw new Error(`${ctx}: ${n} players on a ${s.cols}×${s.rows} board`);
  if (s.board.length !== s.cols * s.rows) throw new Error(`${ctx}: board has ${s.board.length} cells`);
  s.players.forEach((p, i) => {
    if (p.seat !== i) throw new Error(`${ctx}: seat ${p.seat} at index ${i}`);
  });

  let total = 0;
  for (let i = 0; i < s.board.length; i++) {
    const c = s.board[i];
    if (!Number.isInteger(c.n) || c.n < 0) throw new Error(`${ctx}: cell ${i} holds ${c.n}`);
    if ((c.n === 0) !== (c.owner === null)) throw new Error(`${ctx}: cell ${i} n=${c.n} owner=${c.owner}`);
    if (c.owner !== null && (c.owner < 0 || c.owner >= n)) throw new Error(`${ctx}: cell ${i} owned by seat ${c.owner}`);
    if (s.phase === "play" && c.n >= criticalMass(s.cols, s.rows, i))
      throw new Error(`${ctx}: live board has an unstable cell ${i} (${c.n})`);
    total += c.n;
  }
  if (total !== s.moves - t.swept) throw new Error(`${ctx}: ${total} orbs on board, expected ${s.moves} − ${t.swept}`);

  const orbs = orbsBySeat(s.board, n);
  for (const p of s.players) {
    if (p.left) {
      if (p.alive) throw new Error(`${ctx}: ${p.name} left but is alive`);
      if (orbs[p.seat] !== 0) throw new Error(`${ctx}: ${p.name} left but still holds ${orbs[p.seat]} orbs`);
    } else if (p.alive) {
      if (p.moved && orbs[p.seat] === 0) throw new Error(`${ctx}: ${p.name} is alive, has moved, holds nothing`);
      if (!p.moved && orbs[p.seat] !== 0) throw new Error(`${ctx}: ${p.name} holds orbs before their first move`);
    } else {
      if (!p.moved) throw new Error(`${ctx}: ${p.name} knocked out before their first move`);
      if (orbs[p.seat] !== 0) throw new Error(`${ctx}: ${p.name} is out but holds ${orbs[p.seat]} orbs`);
    }
  }

  const alive = s.players.filter((p) => p.alive);
  if (s.phase === "play") {
    if (alive.length < 2) throw new Error(`${ctx}: playing with ${alive.length} alive`);
    const turnP = s.players.find((p) => p.id === s.turn);
    if (!turnP) throw new Error(`${ctx}: turn on a non-player`);
    if (!turnP.alive) throw new Error(`${ctx}: turn on a dead player`);
    if (s.deadline === null) throw new Error(`${ctx}: no turn deadline while playing`);
    if (s.winner || s.winBy) throw new Error(`${ctx}: an unfinished game is carrying a result`);
    if (t.lastSeat !== null && turnP.seat !== nextAliveSeat(s, t.lastSeat))
      throw new Error(`${ctx}: turn skipped someone (after seat ${t.lastSeat} → ${turnP.seat})`);
    if (legalCells(s.board, turnP.seat).length === 0) throw new Error(`${ctx}: mover has no legal cell`);
  } else {
    if (s.turn !== "") throw new Error(`${ctx}: game over but turn is set`);
    if (s.deadline !== null) throw new Error(`${ctx}: game over but the clock is still armed`);
    if (!s.winner) throw new Error(`${ctx}: over without a winner`);
    if (alive.length !== 1 || alive[0].id !== s.winner)
      throw new Error(`${ctx}: winner ${s.winner} but alive = [${alive.map((p) => p.name)}]`);
    if (s.winBy === "forfeit") {
      if (!s.players.some((p) => p.left)) throw new Error(`${ctx}: forfeit win but nobody left`);
    } else if (s.winBy !== "last_standing") {
      throw new Error(`${ctx}: over with winBy=${s.winBy}`);
    }
  }

  if (s.log.length > LOG_CAP) throw new Error(`${ctx}: log over cap (${s.log.length})`);
  if (s.lastMove) {
    if (s.lastMove.n !== s.moves) throw new Error(`${ctx}: lastMove.n=${s.lastMove.n} but moves=${s.moves}`);
    if (s.lastMove.waves.length > WAVES_RECORDED) throw new Error(`${ctx}: too many waves recorded`);
    const recorded = s.lastMove.waves.reduce((a, w) => a + w.length, 0);
    if (s.lastMove.totalWaves === s.lastMove.waves.length && recorded !== s.lastMove.bursts)
      throw new Error(`${ctx}: bursts=${s.lastMove.bursts} but waves hold ${recorded}`);
  } else if (s.moves !== 0) {
    throw new Error(`${ctx}: ${s.moves} moves but no lastMove`);
  }
}

/* ================= view checks =================
   Perfect information: every viewer, spectators included, gets the same board. */

function checkViews(s: ChainState, now: number, ctx: string) {
  const viewers = [...s.players.map((p) => p.id), "spectator-1"];
  const stateJson = JSON.stringify(s);
  let canonical = "";
  for (const viewerId of viewers) {
    const v = redactChain(s, viewerId, now);
    if (v.youId !== viewerId) throw new Error(`${ctx}: view.youId is ${v.youId}, not ${viewerId}`);
    if (!boardsEqual(v.board, s.board)) throw new Error(`${ctx}: view board differs from state board`);
    if (v.phase !== s.phase || v.winner !== s.winner || v.moves !== s.moves)
      throw new Error(`${ctx}: view outcome fields out of sync`);
    if (v.cols !== s.cols || v.rows !== s.rows) throw new Error(`${ctx}: view board size out of sync`);
    for (const p of v.players) {
      let orbs = 0;
      let cells = 0;
      for (const c of s.board) {
        if (c.owner !== p.seat) continue;
        orbs += c.n;
        cells += 1;
      }
      if (p.orbs !== orbs) throw new Error(`${ctx}: ${p.name} orbs=${p.orbs}, board says ${orbs}`);
      if (p.cells !== cells) throw new Error(`${ctx}: ${p.name} cells=${p.cells}, board says ${cells}`);
    }
    if ((v.turn === null) !== (s.phase === "over")) throw new Error(`${ctx}: view turn/phase mismatch`);

    const rest = JSON.stringify({ ...v, youId: null });
    if (!canonical) canonical = rest;
    else if (rest !== canonical) throw new Error(`${ctx}: views differ between viewers`);

    // scribbling on a view must never reach back into the state
    v.board[0].n = 99;
    v.board[0].owner = 7;
    v.players[0].orbs = -1;
    if (v.lastMove) {
      v.lastMove.col = -1;
      if (v.lastMove.waves.length) v.lastMove.waves[0].push(999);
    }
  }
  if (JSON.stringify(s) !== stateJson) throw new Error(`${ctx}: a redacted view aliases the state`);
}

/* ================= invalid-move probes ================= */

let probeCount = 0;

function expectRejected(s: ChainState, playerId: string, move: ChainMove, now: number, ctx: string) {
  const before = JSON.stringify(s);
  let threw = false;
  try {
    applyChainMove(s, playerId, move, now);
  } catch (e) {
    if (!(e instanceof MoveError)) throw e;
    threw = true;
  }
  if (!threw) throw new Error(`${ctx}: invalid move accepted: ${JSON.stringify(move)} by ${playerId}`);
  if (JSON.stringify(s) !== before) throw new Error(`${ctx}: rejected move mutated state: ${JSON.stringify(move)}`);
  probeCount++;
}

function probeInvalid(s: ChainState, now: number, rng: () => number, ctx: string) {
  const turnP = s.players.find((p) => p.id === s.turn)!;
  const others = s.players.filter((p) => p.id !== turnP.id && p.alive);
  const dead = s.players.filter((p) => !p.alive);
  const legal = legalCells(s.board, turnP.seat);
  const someLegal = legal.length ? legal[0] : 0;
  const lc = { col: someLegal % s.cols, row: Math.floor(someLegal / s.cols) };
  const P = (col: number, row: number): ChainMove => ({ type: "place", col, row });

  const probes: (() => void)[] = [
    () => expectRejected(s, "ghost", P(0, 0), now, ctx),
    () => expectRejected(s, turnP.id, P(-1, 0), now, ctx),
    () => expectRejected(s, turnP.id, P(s.cols, 0), now, ctx),
    () => expectRejected(s, turnP.id, P(0, s.rows), now, ctx),
    () => expectRejected(s, turnP.id, P(0, -1), now, ctx),
    () => expectRejected(s, turnP.id, P(1.5, 0), now, ctx),
    () => expectRejected(s, turnP.id, P(NaN, 0), now, ctx),
    () => expectRejected(s, turnP.id, P("2" as unknown as number, 0), now, ctx),
    () => expectRejected(s, turnP.id, { type: "drop", col: 0, row: 0 } as unknown as ChainMove, now, ctx),
    () => expectRejected(s, turnP.id, null as unknown as ChainMove, now, ctx),
    () => expectRejected(s, turnP.id, { type: "place" } as unknown as ChainMove, now, ctx),
  ];
  if (others.length) probes.push(() => expectRejected(s, pick(rng, others).id, P(lc.col, lc.row), now, ctx));
  if (dead.length) {
    const d = pick(rng, dead);
    const dl = legalCells(s.board, d.seat);
    if (dl.length) probes.push(() => expectRejected(s, d.id, P(dl[0] % s.cols, Math.floor(dl[0] / s.cols)), now, ctx));
  }
  const foreign: number[] = [];
  s.board.forEach((c, i) => c.owner !== null && c.owner !== turnP.seat && foreign.push(i));
  if (foreign.length) {
    const f = pick(rng, foreign);
    probes.push(() => expectRejected(s, turnP.id, P(f % s.cols, Math.floor(f / s.cols)), now, ctx));
  }

  pick(rng, probes)();
}

/* ================= move choosers ================= */

/** Loves a bang: places on a cell one orb short of bursting when it can. */
function greedyCell(s: ChainState, seat: number, rng: () => number): number {
  const legal = legalCells(s.board, seat);
  const hot = legal.filter((i) => s.board[i].n === criticalMass(s.cols, s.rows, i) - 1);
  if (hot.length && rng() < 0.7) return pick(rng, hot);
  const own = legal.filter((i) => s.board[i].owner === seat);
  if (own.length && rng() < 0.6) return pick(rng, own);
  return pick(rng, legal);
}

/* ================= hardcoded unit assertions ================= */

function unitPlayers(n: number): GamePlayer[] {
  return Array.from({ length: n }, (_, i) => ({ id: `u${i}`, name: `Unit ${i}`, seat: i }));
}

/** rng()=0 → seat 0 starts. */
function unitGame(n: number): ChainState {
  const s = initChain(unitPlayers(n), 1_000, () => 0);
  if (s.turn !== "u0") throw new Error("unit: expected seat 0 to start with rng()=0");
  return s;
}

const cellAt = (s: ChainState, col: number, row: number) => s.board[row * s.cols + col];

function play(s: ChainState, id: string, col: number, row: number, now: number) {
  applyChainMove(s, id, { type: "place", col, row }, now);
}

function runUnitTests() {
  // ---- geometry: critical mass is corner 2 / edge 3 / interior 4
  {
    const s = unitGame(2); // 6×8
    const cm = (c: number, r: number) => criticalMass(s.cols, s.rows, r * s.cols + c);
    if (cm(0, 0) !== 2 || cm(5, 7) !== 2 || cm(5, 0) !== 2) throw new Error("unit geometry: corner");
    if (cm(3, 0) !== 3 || cm(0, 4) !== 3 || cm(5, 3) !== 3) throw new Error("unit geometry: edge");
    if (cm(2, 3) !== 4 || cm(1, 1) !== 4) throw new Error("unit geometry: interior");
  }

  // ---- corner burst: two orbs in (0,0) send one each to (1,0) and (0,1), converted to the mover
  {
    const s = unitGame(2);
    play(s, "u0", 0, 0, 2_000);
    play(s, "u1", 5, 7, 3_000); // far corner
    play(s, "u0", 0, 0, 4_000);
    if (cellAt(s, 0, 0).n !== 0 || cellAt(s, 0, 0).owner !== null) throw new Error("unit corner: cell did not empty");
    if (cellAt(s, 1, 0).n !== 1 || cellAt(s, 1, 0).owner !== 0) throw new Error("unit corner: (1,0) wrong");
    if (cellAt(s, 0, 1).n !== 1 || cellAt(s, 0, 1).owner !== 0) throw new Error("unit corner: (0,1) wrong");
    if (!s.lastMove || s.lastMove.totalWaves !== 1 || s.lastMove.bursts !== 1) throw new Error("unit corner: cascade bookkeeping");
    if (s.lastMove.waves.length !== 1 || s.lastMove.waves[0][0] !== 0) throw new Error("unit corner: wave not recorded");
    if (s.phase !== "play" || s.turn !== "u1") throw new Error("unit corner: turn did not pass");
  }

  // ---- conversion knocks a player out — but only after they've had a turn
  {
    const s = unitGame(2);
    play(s, "u0", 0, 0, 2_000);
    play(s, "u1", 1, 0, 3_000); // right next door, asking for it
    play(s, "u0", 0, 0, 4_000); // burst converts (1,0)
    if (cellAt(s, 1, 0).owner !== 0 || cellAt(s, 1, 0).n !== 2) throw new Error("unit knockout: (1,0) should be u0 with 2");
    if (s.phase !== "over" || s.winner !== "u0" || s.winBy !== "last_standing") throw new Error("unit knockout: u0 should have won");
    if (!s.players[1].alive === false && s.players[1].moved !== true) throw new Error("unit knockout: u1 flags");
    if (!s.log.some((l) => l.kind === "eliminated" && l.player === "u1" && l.by === "Unit 0")) throw new Error("unit knockout: no log");
    const res = chainreactionModule.result(s);
    if (!res || res.winnerId !== "u0") throw new Error("unit knockout: result() wrong");
    if (!chainreactionModule.isOver!(s)) throw new Error("unit knockout: isOver() false");
  }

  // ---- a player who hasn't moved yet cannot be knocked out (crafted state)
  {
    const s = unitGame(3);
    // seat 0 holds the corner, seat 1 sits beside it, seat 2 has not moved
    cellAt(s, 0, 0).n = 1;
    cellAt(s, 0, 0).owner = 0;
    cellAt(s, 1, 0).n = 1;
    cellAt(s, 1, 0).owner = 1;
    s.moves = 2;
    s.players[0].moved = true;
    s.players[1].moved = true;
    play(s, "u0", 0, 0, 2_000);
    if (s.players[1].alive) throw new Error("unit first-turn: u1 should be out");
    if (!s.players[2].alive) throw new Error("unit first-turn: u2 knocked out before moving");
    if (s.phase !== "play" || s.turn !== "u2") throw new Error("unit first-turn: turn should pass to u2");
  }

  // ---- a two-wave chain: edge cell fed by a corner burst
  {
    const s = unitGame(2);
    // (0,0) corner at 1, (1,0) edge at 2 → placing at (0,0) bursts, pushes (1,0) to 3 → bursts too
    cellAt(s, 0, 0).n = 1;
    cellAt(s, 0, 0).owner = 0;
    cellAt(s, 1, 0).n = 2;
    cellAt(s, 1, 0).owner = 0;
    cellAt(s, 5, 7).n = 1;
    cellAt(s, 5, 7).owner = 1;
    s.moves = 4;
    s.players[0].moved = s.players[1].moved = true;
    play(s, "u0", 0, 0, 2_000);
    // wave 1: (0,0) bursts → (1,0)=3,(0,1)=1. wave 2: (1,0) bursts → (0,0)=1,(2,0)=1,(1,1)=1
    if (!s.lastMove || s.lastMove.totalWaves !== 2 || s.lastMove.bursts !== 2) throw new Error("unit chain: expected two waves");
    if (cellAt(s, 0, 0).n !== 1 || cellAt(s, 1, 0).n !== 0 || cellAt(s, 2, 0).n !== 1 || cellAt(s, 1, 1).n !== 1 || cellAt(s, 0, 1).n !== 1)
      throw new Error("unit chain: final board wrong");
    const total = s.board.reduce((a, c) => a + c.n, 0);
    if (total !== 5) throw new Error(`unit chain: ${total} orbs, expected 5 (conservation)`);
    verifyCascade(
      (() => {
        const b = s.board.map((c) => ({ ...c }));
        // rebuild the pre-move board by hand
        b.forEach((c) => ((c.n = 0), (c.owner = null)));
        b[0] = { n: 1, owner: 0 };
        b[1] = { n: 2, owner: 0 };
        b[7 * 6 + 5] = { n: 1, owner: 1 };
        return b;
      })(),
      s,
      "unit chain"
    );
  }

  // ---- an endless cascade must still terminate: every cell primed, mover owns nearly all
  {
    const s = unitGame(2);
    for (let i = 0; i < s.board.length; i++) s.board[i] = { n: criticalMass(s.cols, s.rows, i) - 1, owner: 0 };
    cellAt(s, 3, 3).owner = 1; // one enemy interior cell, also primed
    s.moves = s.board.reduce((a, c) => a + c.n, 0);
    s.players[0].moved = s.players[1].moved = true;
    play(s, "u0", 0, 0, 2_000);
    if (s.phase !== "over" || s.winner !== "u0") throw new Error("unit endless: mover should own everything and win");
    if (!s.board.every((c) => c.n === 0 || c.owner === 0)) throw new Error("unit endless: enemy orbs survived");
    if (s.lastMove!.totalWaves >= WAVES_HARD_CAP) throw new Error("unit endless: hit the hard cap instead of the ownership stop");
    const total = s.board.reduce((a, c) => a + c.n, 0);
    if (total !== s.moves) throw new Error("unit endless: orbs not conserved");
  }

  // ---- forfeit sweeps orbs, passes the turn, and ends the game at one
  {
    const s = unitGame(3);
    play(s, "u0", 0, 0, 2_000);
    play(s, "u1", 3, 3, 3_000);
    play(s, "u2", 5, 7, 4_000);
    forfeitChain(s, "u0", 5_000); // it was u0's turn
    if (cellAt(s, 0, 0).n !== 0 || cellAt(s, 0, 0).owner !== null) throw new Error("unit forfeit: orbs not swept");
    if (s.phase !== "play" || s.turn !== "u1") throw new Error("unit forfeit: turn should pass to u1");
    if (!s.players[0].left || s.players[0].alive) throw new Error("unit forfeit: flags");
    expectRejected(s, "u0", { type: "place", col: 0, row: 0 }, 5_500, "unit forfeit");
    forfeitChain(s, "u2", 6_000);
    if (s.phase !== "over" || s.winner !== "u1" || s.winBy !== "forfeit") throw new Error("unit forfeit: u1 should win by walkover");
    const frozen = JSON.stringify(s);
    forfeitChain(s, "u1", 7_000);
    forfeitChain(s, "u0", 7_000);
    if (JSON.stringify(s) !== frozen) throw new Error("unit forfeit: post-game forfeit mutated state");
    expectRejected(s, "u1", { type: "place", col: 1, row: 1 }, 7_000, "unit forfeit post-game");
  }

  // ---- the 45 s clock: early tick does nothing, expiry places exactly one orb on a legal cell
  {
    const s = unitGame(2);
    if (tickChain(s, s.deadline! - 1, () => 0.5)) throw new Error("unit tick: fired early");
    if (!tickChain(s, s.deadline!, () => 0.5)) throw new Error("unit tick: did not fire on expiry");
    if (s.moves !== 1) throw new Error("unit tick: timeout did not place exactly one orb");
    if (s.turn !== "u1") throw new Error("unit tick: turn did not pass after the auto-place");
    if (s.deadline === null) throw new Error("unit tick: deadline was not re-armed");
    if (!s.log.some((l) => l.kind === "timeout")) throw new Error("unit tick: no timeout log entry");
    if (!s.players[0].moved) throw new Error("unit tick: auto-place should count as the first move");
  }

  // ---- you cannot place on someone else's cell, nor out of turn
  {
    const s = unitGame(2);
    play(s, "u0", 2, 2, 2_000);
    expectRejected(s, "u0", { type: "place", col: 2, row: 2 }, 2_500, "unit legality (out of turn)");
    expectRejected(s, "u1", { type: "place", col: 2, row: 2 }, 2_500, "unit legality (foreign cell)");
    play(s, "u1", 2, 3, 3_000);
    play(s, "u0", 2, 2, 4_000); // stacking on your own is fine
    if (cellAt(s, 2, 2).n !== 2) throw new Error("unit legality: stacking failed");
  }

  // ---- board sizes scale with the table
  for (const [n, cols, rows] of [
    [2, 6, 8],
    [3, 6, 8],
    [4, 7, 9],
    [5, 7, 9],
    [6, 8, 10],
    [8, 8, 10],
  ]) {
    const s = initChain(unitPlayers(n), 1, () => 0);
    if (s.cols !== cols || s.rows !== rows) throw new Error(`unit size: ${n} players → ${s.cols}×${s.rows}`);
  }

  console.log("unit assertions: 10 rule / lifecycle cases OK");
}

/** The alive seat whose "next alive" is `seat` — inverse of the engine's turn step. */
function prevAliveSeat(s: ChainState, seat: number): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const q = s.players[(seat - k + n) % n];
    if (q.alive) return q.seat;
  }
  return seat;
}

/* ================= driver ================= */

const GAMES = Number(process.env.GAMES ?? 3000);

if (
  chainreactionModule.type !== "chainreaction" ||
  chainreactionModule.minPlayers !== 2 ||
  chainreactionModule.maxPlayers !== 8
)
  throw new Error("module metadata wrong");

runUnitTests();

let lastStanding = 0;
let forfeitWins = 0;
let timeouts = 0;
let totalMoves = 0;
let totalSteps = 0;
let longestCascade = 0;
let biggestBurst = 0;
let knockouts = 0;
let truncatedReplays = 0;
const byTable = new Map<number, number>();

for (let g = 0; g < GAMES; g++) {
  const seed = 91_000 + g;
  const rng = mulberry32(seed);
  const n = 2 + (g % 7); // 2..8 players
  try {
    let now = 1_700_000_000_000;
    const players: GamePlayer[] = Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: ["Ada", "Bram", "Cleo", "Dev", "Esme", "Fitz", "Gita", "Huxley"][i],
      seat: i,
    }));
    const s = initChain(players, now, rng);
    const track: Track = { swept: 0, lastSeat: null };

    assertInvariants(s, track, `seed ${seed} start`);
    checkViews(s, now, `seed ${seed} start`);
    if (chainreactionModule.result(s) !== null) throw new Error(`seed ${seed}: premature result`);
    if (chainreactionModule.isOver!(s)) throw new Error(`seed ${seed}: premature isOver`);

    // three flavours: greedy pyromaniacs, rage-quitters, plain random
    const mode = g % 3;
    const forfeitProb = mode === 1 ? 0.015 : 0;

    let steps = 0;
    while (s.phase !== "over") {
      if (++steps > 4000) throw new Error(`seed ${seed}: no termination in 4000 steps`);
      now += 700;

      const roll = rng();
      const before = cloneBoard(s.board);
      const orbsBefore = orbsBySeat(s.board, n);

      if (roll < forfeitProb) {
        const candidates = s.players.filter((p) => !p.left);
        const quitter = pick(rng, candidates);
        const wasAlive = quitter.alive;
        const aliveBefore = s.players.filter((p) => p.alive).length;
        forfeitChain(s, quitter.id, now);
        track.swept += orbsBefore[quitter.seat];
        if (!quitter.left || quitter.alive) throw new Error(`seed ${seed}: leaver flags wrong`);
        if (wasAlive && aliveBefore === 2 && (s.phase !== "over" || s.winBy !== "forfeit"))
          throw new Error(`seed ${seed}: last two → forfeit should end the game`);
        if (!wasAlive && s.phase !== "play") throw new Error(`seed ${seed}: a knocked-out player leaving ended the game`);
        if (s.phase === "play" && s.turn === quitter.id) throw new Error(`seed ${seed}: turn stuck on the leaver`);
        if (before.some((c, i) => c.owner === quitter.seat && s.board[i].n !== 0))
          throw new Error(`seed ${seed}: leaver's orbs not swept`);
        if (s.phase === "play") {
          // the player on turn is, by construction, the next alive after whoever
          // we record here — so the generic turn-order check stays meaningful
          const turnP = s.players.find((p) => p.id === s.turn)!;
          track.lastSeat = prevAliveSeat(s, turnP.seat);
        }
      } else if (roll < forfeitProb + 0.08) {
        probeInvalid(s, now, rng, `seed ${seed} step ${steps}`);
      } else if (roll < forfeitProb + 0.14) {
        const mover = s.players.find((p) => p.id === s.turn)!;
        if (!tickChain(s, s.deadline!, rng)) throw new Error(`seed ${seed}: timeout tick no-op`);
        timeouts++;
        verifyCascade(before, s, `seed ${seed} step ${steps} (timeout)`);
        track.lastSeat = mover.seat;
      } else {
        const me = s.players.find((p) => p.id === s.turn)!;
        const i = mode === 0 ? greedyCell(s, me.seat, rng) : pick(rng, legalCells(s.board, me.seat));
        applyChainMove(s, me.id, { type: "place", col: i % s.cols, row: Math.floor(i / s.cols) }, now);
        verifyCascade(before, s, `seed ${seed} step ${steps}`);
        track.lastSeat = me.seat;
      }

      if (s.lastMove) {
        longestCascade = Math.max(longestCascade, s.lastMove.totalWaves);
        biggestBurst = Math.max(biggestBurst, s.lastMove.bursts);
        if (s.lastMove.totalWaves > s.lastMove.waves.length) truncatedReplays++;
      }

      // ticking with time still on the clock must never change anything
      if (s.phase === "play" && tickChain(s, now, rng)) throw new Error(`seed ${seed} step ${steps}: premature tick fired`);
      if (s.phase === "over") {
        const frozen = JSON.stringify(s);
        if (tickChain(s, now + 10_000_000, rng)) throw new Error(`seed ${seed}: tick changed a finished game`);
        if (JSON.stringify(s) !== frozen) throw new Error(`seed ${seed}: tick mutated a finished game`);
      }

      assertInvariants(s, track, `seed ${seed} step ${steps}`);
      checkViews(s, now, `seed ${seed} step ${steps}`);
    }

    // after the game: every further move is rejected, from everyone
    for (const p of s.players) {
      expectRejected(s, p.id, { type: "place", col: 0, row: 0 }, now + 5, `seed ${seed} post-game`);
    }

    const res = chainreactionModule.result(s);
    if (!chainreactionModule.isOver!(s)) throw new Error(`seed ${seed}: isOver false after the game`);
    if (!res || res.winnerId !== s.winner) throw new Error(`seed ${seed}: result() mismatch`);
    if (s.winBy === "last_standing") lastStanding++;
    else forfeitWins++;
    knockouts += s.players.filter((p) => !p.alive && !p.left).length;

    const json = JSON.stringify(s);
    if (JSON.stringify(JSON.parse(json)) !== json) throw new Error(`seed ${seed}: state not JSON-stable`);

    totalMoves += s.moves;
    totalSteps += steps;
    byTable.set(n, (byTable.get(n) ?? 0) + 1);
  } catch (e) {
    console.error(`FAILED at game ${g} (seed ${seed}, ${n} players)`);
    throw e;
  }
}

if (forfeitWins === 0) throw new Error("no forfeit wins were exercised");
if (timeouts === 0) throw new Error("no timeout auto-places were exercised");
if (knockouts === 0) throw new Error("no knockouts were exercised");
if (longestCascade < 5) throw new Error("no long cascades were exercised");

console.log(
  `OK: ${GAMES} games (${[...byTable.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}p×${v}`).join(", ")}), ` +
    `avg ${(totalMoves / GAMES).toFixed(1)} orbs placed, ${lastStanding} last-standing wins, ${forfeitWins} walkovers, ` +
    `${knockouts} knockouts, longest cascade ${longestCascade} waves, biggest ${biggestBurst} bursts, ` +
    `${truncatedReplays} replays truncated, ${timeouts} timeouts, avg ${(totalSteps / GAMES).toFixed(1)} steps, ` +
    `${probeCount} invalid moves rejected`
);
