/* Ludo engine fuzz test: hundreds of random games at every table size (2–4),
   plus hardcoded unit assertions for the rules that matter — exact count
   into home, captures and safe squares, three sixes, bonus rolls, the
   interchangeable-token auto-move — and an independent check of the board
   geometry the whole thing rests on.
   Run: npx tsx scripts/simulate-ludo.ts */
import {
  HOME_COLUMN,
  HOME_SPOT,
  SAFE_INDEXES,
  STAR_INDEXES,
  START_INDEX,
  TRACK,
  YARD_ORIGIN,
  cellFor,
  colorsFor,
  trackIndex,
  yardSlots,
} from "../src/lib/games/ludo/board";
import {
  applyLudoMove,
  autoPick,
  canMove,
  destination,
  forfeitLudo,
  initLudo,
  ludoModule,
  movableTokens,
  redactLudo,
  tickLudo,
} from "../src/lib/games/ludo/engine";
import {
  HOME_POS,
  LAST_TRACK,
  LOG_CAP,
  MAX_SIXES,
  TOKENS,
  TRACK_LEN,
  type LudoColor,
  type LudoMove,
  type LudoState,
} from "../src/lib/games/ludo/types";
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

/** rng that yields a chosen die face */
const face = (v: number) => () => (v - 0.5) / 6;

/* ================= geometry ================= */

function checkGeometry() {
  if (TRACK.length !== TRACK_LEN) throw new Error(`geometry: ${TRACK.length} track squares`);
  const seen = new Set(TRACK.map(([x, y]) => `${x},${y}`));
  if (seen.size !== TRACK_LEN) throw new Error("geometry: duplicate track squares");
  const inYard = (x: number, y: number) => (x <= 5 || x >= 9) && (y <= 5 || y >= 9);
  const inCentre = (x: number, y: number) => x >= 6 && x <= 8 && y >= 6 && y <= 8;
  for (let i = 0; i < TRACK_LEN; i++) {
    const [x, y] = TRACK[i];
    if (x < 0 || x > 14 || y < 0 || y > 14) throw new Error(`geometry: track ${i} off the board`);
    if (inYard(x, y) || inCentre(x, y)) throw new Error(`geometry: track ${i} (${x},${y}) is not on an arm`);
    const [nx, ny] = TRACK[(i + 1) % TRACK_LEN];
    if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) throw new Error(`geometry: track ${i}→${i + 1} is not a step`);
  }
  // the loop turns the corner of the home exactly four times
  const diagonals = TRACK.filter(([x, y], i) => {
    const [nx, ny] = TRACK[(i + 1) % TRACK_LEN];
    return nx !== x && ny !== y;
  }).length;
  if (diagonals !== 4) throw new Error(`geometry: ${diagonals} diagonal steps, expected 4`);

  const colors: LudoColor[] = ["red", "blue", "yellow", "green"];
  const starts = colors.map((c) => START_INDEX[c]);
  if (starts.join() !== "0,13,26,39") throw new Error("geometry: starts not 13 apart");
  for (const s of starts) if (!SAFE_INDEXES.has(s)) throw new Error(`geometry: start ${s} not safe`);
  for (const s of STAR_INDEXES) {
    if (!SAFE_INDEXES.has(s)) throw new Error(`geometry: star ${s} not safe`);
    if (!starts.some((st) => (st + 8) % TRACK_LEN === s)) throw new Error(`geometry: star ${s} not 8 past a start`);
  }
  if (SAFE_INDEXES.size !== 8) throw new Error("geometry: expected 8 safe squares");

  for (const c of colors) {
    const [sx, sy] = TRACK[START_INDEX[c]];
    const [yx, yy] = YARD_ORIGIN[c];
    // the start square touches its own yard
    const touches = sx >= yx - 1 && sx <= yx + 6 && sy >= yy - 1 && sy <= yy + 6;
    if (!touches) throw new Error(`geometry: ${c} start (${sx},${sy}) is not beside its yard`);
    // the home column: five squares, entered from the last track square, ending at the centre
    const col = HOME_COLUMN[c];
    if (col.length !== 5) throw new Error(`geometry: ${c} home column has ${col.length}`);
    const [ex, ey] = TRACK[trackIndex(c, LAST_TRACK)];
    if (Math.abs(col[0][0] - ex) + Math.abs(col[0][1] - ey) !== 1)
      throw new Error(`geometry: ${c} home column does not start beside its entry square`);
    for (let k = 1; k < 5; k++) {
      if (Math.abs(col[k][0] - col[k - 1][0]) + Math.abs(col[k][1] - col[k - 1][1]) !== 1)
        throw new Error(`geometry: ${c} home column is not straight`);
    }
    const [lx, ly] = col[4];
    if (!inCentre(lx + (lx < 6 ? 1 : lx > 8 ? -1 : 0), ly + (ly < 6 ? 1 : ly > 8 ? -1 : 0)))
      throw new Error(`geometry: ${c} home column does not reach the centre`);
    for (const [x, y] of col) if (seen.has(`${x},${y}`)) throw new Error(`geometry: ${c} home column overlaps the track`);
    if (yardSlots(c).length !== 4) throw new Error(`geometry: ${c} yard slots`);
    for (const [x, y] of yardSlots(c)) if (!inYard(x, y)) throw new Error(`geometry: ${c} yard slot outside yard`);
    const [hx, hy] = HOME_SPOT[c];
    if (!inCentre(Math.floor(hx), Math.floor(hy))) throw new Error(`geometry: ${c} home spot outside the centre`);
    // cellFor agrees with all of the above
    if (cellFor(c, 0) !== TRACK[START_INDEX[c]]) throw new Error(`geometry: cellFor(${c},0)`);
    if (cellFor(c, 51) !== col[0] || cellFor(c, 55) !== col[4]) throw new Error(`geometry: cellFor(${c}, home column)`);
    if (cellFor(c, HOME_POS) !== HOME_SPOT[c]) throw new Error(`geometry: cellFor(${c}, home)`);
  }
  if (colorsFor(2).join() !== "red,yellow" || colorsFor(3).join() !== "red,blue,yellow" || colorsFor(4).length !== 4)
    throw new Error("geometry: colorsFor");
  console.log("geometry: 52-square loop, 8 safe squares, 4 yards and home columns OK");
}

/* ================= invariants ================= */

interface Track {
  prevTurn: string;
}

function assertInvariants(s: LudoState, t: Track, ctx: string) {
  const n = s.players.length;
  const colors = colorsFor(n);
  s.players.forEach((p, i) => {
    if (p.seat !== i) throw new Error(`${ctx}: seat ${p.seat} at index ${i}`);
    if (p.color !== colors[i]) throw new Error(`${ctx}: seat ${i} is ${p.color}, expected ${colors[i]}`);
    if (p.tokens.length !== TOKENS) throw new Error(`${ctx}: ${p.name} has ${p.tokens.length} tokens`);
    for (const pos of p.tokens) {
      if (!Number.isInteger(pos) || pos < -1 || pos > HOME_POS) throw new Error(`${ctx}: ${p.name} token at ${pos}`);
    }
    if (p.left && p.tokens.some((x) => x !== -1)) throw new Error(`${ctx}: ${p.name} left but has tokens on the board`);
  });

  // a shared, unsafe square never holds two colours
  const occupants = new Map<number, Set<number>>();
  for (const p of s.players) {
    if (p.left) continue;
    for (const pos of p.tokens) {
      if (pos < 0 || pos > LAST_TRACK) continue;
      const abs = trackIndex(p.color, pos);
      const set = occupants.get(abs) ?? new Set<number>();
      set.add(p.seat);
      occupants.set(abs, set);
    }
  }
  for (const [abs, seats] of occupants) {
    if (seats.size > 1 && !SAFE_INDEXES.has(abs)) throw new Error(`${ctx}: two colours share unsafe square ${abs}`);
  }

  const activeP = s.players.filter((p) => !p.left);
  if (s.phase !== "over") {
    const turnP = s.players.find((p) => p.id === s.turn);
    if (!turnP) throw new Error(`${ctx}: turn on a non-player`);
    if (turnP.left) throw new Error(`${ctx}: turn on a player who left`);
    if (s.deadline === null) throw new Error(`${ctx}: no deadline while playing`);
    if (s.winner || s.winBy) throw new Error(`${ctx}: unfinished game carrying a result`);
    if (activeP.length < 2) throw new Error(`${ctx}: playing with ${activeP.length} players`);
    if (s.sixes < 0 || s.sixes >= MAX_SIXES) throw new Error(`${ctx}: sixes=${s.sixes} while playing`);
    for (const p of s.players) {
      if (!p.left && p.tokens.every((x) => x === HOME_POS)) throw new Error(`${ctx}: ${p.name} is home but the game goes on`);
    }
    if (s.phase === "roll") {
      if (s.die !== null) throw new Error(`${ctx}: die on the table in roll phase`);
      if (s.movable.length) throw new Error(`${ctx}: movable set in roll phase`);
    } else {
      if (s.die === null || s.die < 1 || s.die > 6) throw new Error(`${ctx}: bad die ${s.die} in move phase`);
      const expect = movableTokens(turnP, s.die);
      if (expect.join() !== s.movable.join()) throw new Error(`${ctx}: movable [${s.movable}] ≠ [${expect}]`);
      const distinct = new Set(s.movable.map((i) => turnP.tokens[i]));
      if (distinct.size < 2) throw new Error(`${ctx}: move phase with no real choice (${[...distinct]})`);
    }
    // turn never skips a seated player
    if (t.prevTurn && s.turn !== t.prevTurn) {
      const from = s.players.find((p) => p.id === t.prevTurn)!;
      let q = from;
      for (let k = 1; k <= n; k++) {
        q = s.players[(from.seat + k) % n];
        if (!q.left) break;
      }
      if (q.id !== s.turn) throw new Error(`${ctx}: turn skipped from ${from.name} to ${s.players.find((p) => p.id === s.turn)!.name}`);
    }
  } else {
    if (s.turn !== "") throw new Error(`${ctx}: over but turn set`);
    if (s.deadline !== null) throw new Error(`${ctx}: over but deadline armed`);
    if (s.die !== null || s.movable.length) throw new Error(`${ctx}: over with a die on the table`);
    if (!s.winner) throw new Error(`${ctx}: over without a winner`);
    const w = s.players.find((p) => p.id === s.winner)!;
    if (s.winBy === "home") {
      if (!w.tokens.every((x) => x === HOME_POS)) throw new Error(`${ctx}: home win but tokens ${w.tokens}`);
    } else if (s.winBy === "forfeit") {
      if (s.players.some((p) => p.id !== w.id && !p.left)) throw new Error(`${ctx}: forfeit win with rivals still seated`);
    } else throw new Error(`${ctx}: winBy=${s.winBy}`);
  }

  if (s.log.length > LOG_CAP) throw new Error(`${ctx}: log over cap`);
  if (s.lastRoll && s.lastRoll.n !== s.rolls) throw new Error(`${ctx}: lastRoll.n ≠ rolls`);
  if (s.lastMove && s.lastMove.n !== s.moves) throw new Error(`${ctx}: lastMove.n ≠ moves`);
  if (!s.lastRoll && s.rolls) throw new Error(`${ctx}: rolls without lastRoll`);
  if (s.lastMove) {
    const lm = s.lastMove;
    if (lm.rollN > s.rolls) throw new Error(`${ctx}: lastMove.rollN ahead of rolls`);
    if (destination(lm.from, lm.die) !== lm.to) throw new Error(`${ctx}: lastMove ${lm.from}+${lm.die}≠${lm.to}`);
  }
  t.prevTurn = s.phase === "over" ? "" : s.turn;
}

/* ================= view checks ================= */

function checkViews(s: LudoState, now: number, ctx: string) {
  const viewers = [...s.players.map((p) => p.id), "spectator-1"];
  const stateJson = JSON.stringify(s);
  let canonical = "";
  for (const viewerId of viewers) {
    const v = redactLudo(s, viewerId, now);
    if (v.youId !== viewerId) throw new Error(`${ctx}: view.youId`);
    if (v.phase !== s.phase || v.winner !== s.winner || v.die !== s.die) throw new Error(`${ctx}: view fields out of sync`);
    v.players.forEach((vp, i) => {
      const p = s.players[i];
      if (vp.tokens.join() !== p.tokens.join()) throw new Error(`${ctx}: view tokens differ`);
      if (vp.home !== p.tokens.filter((x) => x === HOME_POS).length) throw new Error(`${ctx}: view home count`);
      if (vp.inYard !== p.tokens.filter((x) => x < 0).length) throw new Error(`${ctx}: view yard count`);
    });
    if ((v.turn === null) !== (s.phase === "over")) throw new Error(`${ctx}: view turn/phase mismatch`);
    const rest = JSON.stringify({ ...v, youId: null });
    if (!canonical) canonical = rest;
    else if (rest !== canonical) throw new Error(`${ctx}: views differ between viewers`);
    // scribbling on a view must never reach the state
    v.players[0].tokens[0] = 99;
    v.movable.push(9);
    if (v.lastMove) v.lastMove.captured.push({ seat: 9, token: 9, from: 9 });
    if (v.lastRoll) v.lastRoll.value = 99;
  }
  if (JSON.stringify(s) !== stateJson) throw new Error(`${ctx}: a redacted view aliases the state`);
}

/* ================= invalid-move probes ================= */

let probeCount = 0;

function expectRejected(s: LudoState, playerId: string, move: LudoMove, now: number, rng: () => number, ctx: string) {
  const before = JSON.stringify(s);
  let threw = false;
  try {
    applyLudoMove(s, playerId, move, now, rng);
  } catch (e) {
    if (!(e instanceof MoveError)) throw e;
    threw = true;
  }
  if (!threw) throw new Error(`${ctx}: invalid move accepted: ${JSON.stringify(move)} by ${playerId}`);
  if (JSON.stringify(s) !== before) throw new Error(`${ctx}: rejected move mutated state`);
  probeCount++;
}

function probeInvalid(s: LudoState, now: number, rng: () => number, ctx: string) {
  const turnP = s.players.find((p) => p.id === s.turn)!;
  const others = s.players.filter((p) => p.id !== turnP.id && !p.left);
  const gone = s.players.filter((p) => p.left);
  const probes: (() => void)[] = [
    () => expectRejected(s, "ghost", { type: "roll" }, now, rng, ctx),
    () => expectRejected(s, turnP.id, { type: "shove" } as unknown as LudoMove, now, rng, ctx),
    () => expectRejected(s, turnP.id, null as unknown as LudoMove, now, rng, ctx),
    () => expectRejected(s, turnP.id, { type: "move", token: -1 }, now, rng, ctx),
    () => expectRejected(s, turnP.id, { type: "move", token: TOKENS }, now, rng, ctx),
    () => expectRejected(s, turnP.id, { type: "move", token: 1.5 }, now, rng, ctx),
    () => expectRejected(s, turnP.id, { type: "move", token: "1" as unknown as number }, now, rng, ctx),
  ];
  if (others.length) {
    probes.push(() => expectRejected(s, pick(rng, others).id, { type: "roll" }, now, rng, ctx));
    probes.push(() => expectRejected(s, pick(rng, others).id, { type: "move", token: 0 }, now, rng, ctx));
  }
  if (gone.length) probes.push(() => expectRejected(s, pick(rng, gone).id, { type: "roll" }, now, rng, ctx));
  if (s.phase === "roll") {
    probes.push(() => expectRejected(s, turnP.id, { type: "move", token: 0 }, now, rng, ctx));
  } else {
    probes.push(() => expectRejected(s, turnP.id, { type: "roll" }, now, rng, ctx));
    const stuck = [0, 1, 2, 3].filter((t) => !s.movable.includes(t));
    if (stuck.length) probes.push(() => expectRejected(s, turnP.id, { type: "move", token: pick(rng, stuck) }, now, rng, ctx));
  }
  pick(rng, probes)();
}

/* ================= unit assertions ================= */

function unitPlayers(n: number): GamePlayer[] {
  return Array.from({ length: n }, (_, i) => ({ id: `u${i}`, name: `Unit ${i}`, seat: i }));
}

function unitGame(n: number): LudoState {
  const s = initLudo(unitPlayers(n), 1_000, () => 0);
  if (s.turn !== "u0") throw new Error("unit: seat 0 should start with rng()=0");
  return s;
}

/** Put the table in "move" phase for the current player with a given die. */
function arm(s: LudoState, die: number) {
  const p = s.players.find((x) => x.id === s.turn)!;
  s.phase = "move";
  s.die = die;
  s.movable = movableTokens(p, die);
  s.sixes = die === 6 ? 1 : 0;
}

function runUnitTests() {
  // ---- destination: six to leave, exact count home
  if (destination(-1, 6) !== 0 || destination(-1, 3) !== -1) throw new Error("unit destination: yard");
  if (destination(50, 6) !== 56 || destination(53, 3) !== 56) throw new Error("unit destination: home");
  if (destination(51, 6) !== -1 || destination(55, 2) !== -1) throw new Error("unit destination: overshoot");
  if (destination(56, 1) !== -1) throw new Error("unit destination: already home");
  if (!canMove(0, 1) || canMove(56, 6)) throw new Error("unit canMove");

  // ---- a capture on an open square sends the victim home and earns another roll
  {
    const s = unitGame(2); // red vs yellow
    const red = s.players[0];
    const yel = s.players[1];
    red.tokens[0] = 2; // red abs 2
    yel.tokens[0] = (2 - START_INDEX.yellow + TRACK_LEN) % TRACK_LEN - 3; // will be 3 short of abs 2... place victim ON abs 2:
    yel.tokens[0] = (2 - START_INDEX.yellow + TRACK_LEN) % TRACK_LEN; // yellow pos whose abs is 2
    if (trackIndex("yellow", yel.tokens[0]) !== 2) throw new Error("unit capture: setup");
    red.tokens[0] = 0; // two behind
    arm(s, 2);
    applyLudoMove(s, "u0", { type: "move", token: 0 }, 2_000, () => 0);
    if (yel.tokens[0] !== -1) throw new Error("unit capture: victim not sent home");
    if (red.tokens[0] !== 2) throw new Error("unit capture: mover did not land");
    if (!s.lastMove || s.lastMove.bonus !== "capture" || s.lastMove.captured.length !== 1) throw new Error("unit capture: bonus");
    if (s.phase !== "roll" || s.turn !== "u0") throw new Error("unit capture: mover should roll again");
    if (!s.log.some((l) => l.kind === "capture" && l.victim === "Unit 1")) throw new Error("unit capture: no log");
  }

  // ---- no capture on a safe square; both tokens stay, turn passes
  {
    const s = unitGame(2);
    const red = s.players[0];
    const yel = s.players[1];
    yel.tokens[0] = (8 - START_INDEX.yellow + TRACK_LEN) % TRACK_LEN; // yellow on the star at abs 8
    red.tokens[0] = 5;
    arm(s, 3);
    applyLudoMove(s, "u0", { type: "move", token: 0 }, 2_000, () => 0);
    if (yel.tokens[0] < 0) throw new Error("unit safe: victim captured on a safe square");
    if (red.tokens[0] !== 8) throw new Error("unit safe: mover did not land");
    if (s.lastMove!.bonus !== null) throw new Error("unit safe: unexpected bonus");
    if (s.turn !== "u1" || s.phase !== "roll") throw new Error("unit safe: turn should pass");
    // and the yellow start square is safe for yellow even from red
    const s2 = unitGame(2);
    s2.players[1].tokens[1] = 0; // yellow on its own start, abs 26
    s2.players[0].tokens[0] = 24;
    arm(s2, 2);
    applyLudoMove(s2, "u0", { type: "move", token: 0 }, 2_000, () => 0);
    if (s2.players[1].tokens[1] !== 0) throw new Error("unit safe: start square not safe");
  }

  // ---- a stack is no shelter: both victims go home
  {
    const s = unitGame(2);
    const yel = s.players[1];
    const pos = (10 - START_INDEX.yellow + TRACK_LEN) % TRACK_LEN;
    yel.tokens[0] = pos;
    yel.tokens[1] = pos;
    s.players[0].tokens[0] = 9;
    arm(s, 1);
    applyLudoMove(s, "u0", { type: "move", token: 0 }, 2_000, () => 0);
    if (yel.tokens[0] !== -1 || yel.tokens[1] !== -1) throw new Error("unit stack: both should go home");
    if (s.lastMove!.captured.length !== 2) throw new Error("unit stack: captured count");
  }

  // ---- six from the yard: all four yard tokens are interchangeable, so it moves out at once and rolls again
  {
    const s = unitGame(2);
    applyLudoMove(s, "u0", { type: "roll" }, 2_000, face(6));
    if (s.players[0].tokens[0] !== 0) throw new Error("unit six: token did not come out automatically");
    if (s.phase !== "roll" || s.turn !== "u0" || s.sixes !== 1) throw new Error("unit six: should roll again");
    if (s.lastMove!.bonus !== "six") throw new Error("unit six: bonus");
    // a second six: now two distinct choices → wait for the player
    applyLudoMove(s, "u0", { type: "roll" }, 3_000, face(6));
    if (s.phase !== "move" || s.die !== 6 || s.movable.join() !== "0,1,2,3") throw new Error("unit six: expected a real choice");
    applyLudoMove(s, "u0", { type: "move", token: 2 }, 4_000, face(6));
    if (s.players[0].tokens[2] !== 0 || s.phase !== "roll" || s.sixes !== 2) throw new Error("unit six: second token out");
    // third six: turn forfeited, nothing moves
    const before = s.players[0].tokens.join();
    applyLudoMove(s, "u0", { type: "roll" }, 5_000, face(6));
    if (s.players[0].tokens.join() !== before) throw new Error("unit sixes: tokens moved on the third six");
    if (s.turn !== "u1" || s.phase !== "roll" || s.sixes !== 0) throw new Error("unit sixes: turn should pass");
    if (!s.log.some((l) => l.kind === "three_sixes")) throw new Error("unit sixes: no log");
  }

  // ---- no legal move: a 3 with everything in the yard passes; a 6 that can't move rolls again
  {
    const s = unitGame(2);
    applyLudoMove(s, "u0", { type: "roll" }, 2_000, face(3));
    if (s.turn !== "u1" || !s.log.some((l) => l.kind === "no_move")) throw new Error("unit no-move: pass");
    const s2 = unitGame(2);
    s2.players[0].tokens = [56, 56, 56, 52]; // only a 4 fits
    applyLudoMove(s2, "u0", { type: "roll" }, 2_000, face(6));
    if (s2.turn !== "u0" || s2.phase !== "roll") throw new Error("unit no-move: a six keeps the turn");
  }

  // ---- exact count home earns another roll; the fourth token home wins
  {
    const s = unitGame(2);
    s.players[0].tokens = [56, 56, 40, 53];
    arm(s, 3);
    applyLudoMove(s, "u0", { type: "move", token: 3 }, 2_000, () => 0);
    if (s.players[0].tokens[3] !== 56 || s.lastMove!.bonus !== "home") throw new Error("unit home: bonus");
    if (s.phase !== "roll" || s.turn !== "u0") throw new Error("unit home: roll again");
    // the one at 40 cannot use a 5 to overshoot… 40+5=45 fine; give it exactly 16 more via crafted die: just set it to 55
    s.players[0].tokens[2] = 55;
    applyLudoMove(s, "u0", { type: "roll" }, 3_000, face(1)); // single option → auto-move → win
    if (s.phase !== "over" || s.winner !== "u0" || s.winBy !== "home") throw new Error("unit win: not detected");
    if (!ludoModule.isOver!(s) || ludoModule.result(s)?.winnerId !== "u0") throw new Error("unit win: module");
    expectRejected(s, "u1", { type: "roll" }, 4_000, () => 0, "unit win post-game");
  }

  // ---- the interchangeable rule only collapses tokens on the SAME square
  {
    const s = unitGame(2);
    s.players[0].tokens = [10, 10, -1, -1];
    applyLudoMove(s, "u0", { type: "roll" }, 2_000, face(2)); // only the two at 10 can move → same square → auto
    if (s.players[0].tokens[0] !== 12 || s.phase !== "roll" || s.turn !== "u1") throw new Error("unit interchangeable: auto-move");
    const s2 = unitGame(2);
    s2.players[0].tokens = [10, 20, -1, -1];
    applyLudoMove(s2, "u0", { type: "roll" }, 2_000, face(2));
    if (s2.phase !== "move" || s2.movable.join() !== "0,1") throw new Error("unit interchangeable: real choice");
  }

  // ---- forfeit: tokens swept, turn passes, last one standing wins; post-game no-op
  {
    const s = unitGame(3);
    s.players[0].tokens = [5, -1, -1, -1];
    forfeitLudo(s, "u0", 2_000); // on turn
    if (!s.players[0].left || s.players[0].tokens.some((x) => x !== -1)) throw new Error("unit forfeit: sweep");
    if (s.turn !== "u1" || s.phase !== "roll") throw new Error("unit forfeit: turn should pass");
    expectRejected(s, "u0", { type: "roll" }, 2_500, () => 0, "unit forfeit");
    arm(s, 6);
    forfeitLudo(s, "u2", 3_000); // not on turn: table state for u1 untouched
    if (s.phase !== "over" || s.winner !== "u1" || s.winBy !== "forfeit") throw new Error("unit forfeit: walkover");
    const frozen = JSON.stringify(s);
    forfeitLudo(s, "u1", 4_000);
    if (JSON.stringify(s) !== frozen) throw new Error("unit forfeit: post-game mutation");
  }

  // ---- the clock: early tick no-op; expiry rolls; expiry in move phase moves the smart pick
  {
    const s = unitGame(2);
    if (tickLudo(s, s.deadline! - 1, face(6))) throw new Error("unit tick: early");
    if (!tickLudo(s, s.deadline!, face(6))) throw new Error("unit tick: did not fire");
    if (s.rolls !== 1 || s.players[0].tokens[0] !== 0) throw new Error("unit tick: auto roll + move");
    if (!s.log.some((l) => l.kind === "timeout")) throw new Error("unit tick: log");
    s.players[0].tokens = [0, 20, -1, -1];
    s.players[1].tokens[0] = (23 - START_INDEX.yellow + TRACK_LEN) % TRACK_LEN; // yellow sitting at abs 23
    arm(s, 3); // token 1 (20→23) captures; token 0 (0→3) does not
    if (autoPick(s, s.players[0], () => 0) !== 1) throw new Error("unit autoPick: should take the capture");
    if (!tickLudo(s, s.deadline! + 1, () => 0)) throw new Error("unit tick: move phase");
    if (s.players[1].tokens[0] !== -1) throw new Error("unit tick: auto move did not capture");
  }

  console.log("unit assertions: 10 rule / lifecycle cases OK");
}

/* ================= driver ================= */

const GAMES = Number(process.env.GAMES ?? 600);

if (ludoModule.type !== "ludo" || ludoModule.minPlayers !== 2 || ludoModule.maxPlayers !== 4)
  throw new Error("module metadata wrong");

checkGeometry();
runUnitTests();

let homeWins = 0;
let forfeitWins = 0;
let captures = 0;
let threeSixes = 0;
let noMoves = 0;
let timeouts = 0;
let totalSteps = 0;
let longest = 0;
const faces = new Array<number>(7).fill(0);
const byTable = new Map<number, number>();

for (let g = 0; g < GAMES; g++) {
  const seed = 77_000 + g;
  const rng = mulberry32(seed);
  const n = 2 + (g % 3);
  try {
    let now = 1_700_000_000_000;
    const players: GamePlayer[] = Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: ["Rosa", "Bilal", "Yuki", "Gwen"][i],
      seat: i,
    }));
    const s = initLudo(players, now, rng);
    const track: Track = { prevTurn: s.turn };
    assertInvariants(s, track, `seed ${seed} start`);
    checkViews(s, now, `seed ${seed} start`);
    if (ludoModule.result(s) !== null || ludoModule.isOver!(s)) throw new Error(`seed ${seed}: premature result`);

    const mode = g % 3; // 0 plain, 1 rage-quitters, 2 dawdlers
    const forfeitProb = mode === 1 ? 0.002 : 0;
    const timeoutProb = mode === 2 ? 0.25 : 0.05;

    let steps = 0;
    while (s.phase !== "over") {
      if (++steps > 40_000) throw new Error(`seed ${seed}: no termination in 40000 steps`);
      now += 900;
      const roll = rng();
      const rollsBefore = s.rolls;
      const capturesBefore = s.log.filter((l) => l.kind === "capture").length;

      if (roll < forfeitProb) {
        const quitter = pick(rng, s.players.filter((p) => !p.left));
        const seated = s.players.filter((p) => !p.left).length;
        forfeitLudo(s, quitter.id, now);
        if (seated === 2 && (s.phase !== "over" || s.winBy !== "forfeit")) throw new Error(`seed ${seed}: last two → walkover`);
        if (s.phase !== "over" && s.turn === quitter.id) throw new Error(`seed ${seed}: turn stuck on leaver`);
        track.prevTurn = s.phase === "over" ? "" : s.turn; // a leaver's turn hop is checked by the unit test
      } else if (roll < forfeitProb + 0.08) {
        probeInvalid(s, now, rng, `seed ${seed} step ${steps}`);
      } else if (roll < forfeitProb + 0.08 + timeoutProb) {
        if (!tickLudo(s, s.deadline!, rng)) throw new Error(`seed ${seed}: timeout tick no-op`);
        timeouts++;
      } else {
        const me = s.players.find((p) => p.id === s.turn)!;
        if (s.phase === "roll") {
          applyLudoMove(s, me.id, { type: "roll" }, now, rng);
        } else {
          const t = rng() < 0.3 ? autoPick(s, me, rng) : pick(rng, s.movable);
          applyLudoMove(s, me.id, { type: "move", token: t }, now, rng);
        }
      }

      if (s.rolls > rollsBefore && s.lastRoll) faces[s.lastRoll.value]++;
      captures += s.log.filter((l) => l.kind === "capture").length - capturesBefore;
      // (log is capped, but a step adds at most a handful of entries)

      if (s.phase !== "over" && tickLudo(s, now, rng)) throw new Error(`seed ${seed} step ${steps}: premature tick`);
      if (s.phase === "over") {
        const frozen = JSON.stringify(s);
        if (tickLudo(s, now + 10_000_000, rng)) throw new Error(`seed ${seed}: tick changed a finished game`);
        if (JSON.stringify(s) !== frozen) throw new Error(`seed ${seed}: tick mutated a finished game`);
      }
      assertInvariants(s, track, `seed ${seed} step ${steps}`);
      checkViews(s, now, `seed ${seed} step ${steps}`);
    }

    for (const p of s.players) {
      expectRejected(s, p.id, { type: "roll" }, now + 5, rng, `seed ${seed} post-game`);
      expectRejected(s, p.id, { type: "move", token: 0 }, now + 5, rng, `seed ${seed} post-game`);
    }
    const res = ludoModule.result(s);
    if (!res || res.winnerId !== s.winner || !ludoModule.isOver!(s)) throw new Error(`seed ${seed}: result()`);
    if (s.winBy === "home") homeWins++;
    else forfeitWins++;
    threeSixes += s.log.filter((l) => l.kind === "three_sixes").length;
    noMoves += s.log.filter((l) => l.kind === "no_move").length;
    const json = JSON.stringify(s);
    if (JSON.stringify(JSON.parse(json)) !== json) throw new Error(`seed ${seed}: state not JSON-stable`);
    totalSteps += steps;
    longest = Math.max(longest, steps);
    byTable.set(n, (byTable.get(n) ?? 0) + 1);
  } catch (e) {
    console.error(`FAILED at game ${g} (seed ${seed}, ${n} players)`);
    throw e;
  }
}

if (forfeitWins === 0) throw new Error("no walkovers exercised");
if (captures === 0) throw new Error("no captures exercised");
if (threeSixes === 0) throw new Error("no three-sixes exercised");
if (timeouts === 0) throw new Error("no timeouts exercised");
if (faces.slice(1).some((c) => c === 0)) throw new Error("some die face never rolled");

console.log(
  `OK: ${GAMES} games (${[...byTable.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}p×${v}`).join(", ")}), ` +
    `avg ${(totalSteps / GAMES).toFixed(0)} steps (longest ${longest}), ${homeWins} home wins, ${forfeitWins} walkovers, ` +
    `${captures} captures, ${threeSixes} three-sixes, ${noMoves} dead rolls, ${timeouts} timeouts, ` +
    `die faces ${faces.slice(1).join("/")}, ${probeCount} invalid moves rejected`
);
