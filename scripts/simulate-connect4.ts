/* Four in a Row engine fuzz test: thousands of random games, plus a set of
   hardcoded win-detection unit assertions. Everything the engine claims about
   a win or a draw is re-derived here by an INDEPENDENT full-board scanner, so
   the engine's own line-finder is never taken on trust.
   Run: npx tsx scripts/simulate-connect4.ts */
import {
  applyConnect4Move,
  connect4Module,
  dropRow,
  forfeitConnect4,
  initConnect4,
  openColumns,
  redactConnect4,
  tickConnect4,
} from "../src/lib/games/connect4/engine";
import {
  CELLS,
  COLS,
  LOG_CAP,
  ROWS,
  type Board,
  type Cell,
  type Connect4Move,
  type Connect4State,
  type Coord,
  type Disc,
} from "../src/lib/games/connect4/types";
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

const opponentOf = (s: Connect4State, id: string) => s.players.find((p) => p.id !== id)!;

const cloneBoard = (b: Board): Board => b.map((col) => col.slice());

/* ================= independent win scanner =================
   Deliberately written differently from the engine: a brute-force sweep over
   every start cell × every direction, checking four cells at a time. */

const SCAN_DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Every distinct 4-window of same-coloured discs on the board. */
function scanAllLines(board: Board): { color: Disc; cells: Coord[] }[] {
  const found: { color: Disc; cells: Coord[] }[] = [];
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const color = board[col][row];
      if (!color) continue;
      for (const [dc, dr] of SCAN_DIRS) {
        const cells: Coord[] = [];
        for (let k = 0; k < 4; k++) {
          const c = col + dc * k;
          const r = row + dr * k;
          if (c < 0 || c >= COLS || r < 0 || r >= ROWS) break;
          if (board[c][r] !== color) break;
          cells.push({ col: c, row: r });
        }
        if (cells.length === 4) found.push({ color, cells });
      }
    }
  }
  return found;
}

const hasAnyLine = (board: Board) => scanAllLines(board).length > 0;

/** Independently verify the engine's declared winning line. */
function verifyWinningLine(board: Board, line: Coord[], color: Disc, ctx: string) {
  if (line.length < 4) throw new Error(`${ctx}: winning line has only ${line.length} cells`);
  for (const c of line) {
    if (c.col < 0 || c.col >= COLS || c.row < 0 || c.row >= ROWS)
      throw new Error(`${ctx}: winning line cell off the board`);
    if (board[c.col][c.row] !== color)
      throw new Error(`${ctx}: winning line cell ${c.col},${c.row} is not ${color}`);
  }
  // strictly ascending by col-then-row, and evenly spaced along one axis
  const dc = line[1].col - line[0].col;
  const dr = line[1].row - line[0].row;
  if (!SCAN_DIRS.some(([a, b]) => a === dc && b === dr))
    throw new Error(`${ctx}: winning line direction ${dc},${dr} is not an axis`);
  for (let k = 1; k < line.length; k++) {
    if (line[k].col - line[k - 1].col !== dc || line[k].row - line[k - 1].row !== dr)
      throw new Error(`${ctx}: winning line is not contiguous`);
  }
  // and the independent scanner must agree that this exact run is a win
  const key = line
    .slice(0, 4)
    .map((c) => `${c.col},${c.row}`)
    .join("|");
  const matched = scanAllLines(board).some(
    (l) => l.color === color && l.cells.map((c) => `${c.col},${c.row}`).join("|") === key
  );
  if (!matched) throw new Error(`${ctx}: independent scan does not confirm the winning line`);
}

/* ================= invariants ================= */

interface Track {
  firstId: string;
  /** snapshot of the previous step's board, to catch discs changing/vanishing */
  prev: Board;
}

function assertInvariants(s: Connect4State, t: Track, ctx: string) {
  if (s.players.length !== 2) throw new Error(`${ctx}: ${s.players.length} players`);
  if (s.players[0].color !== "red" || s.players[1].color !== "yellow")
    throw new Error(`${ctx}: seat colours wrong`);

  // board shape + legal cell values
  if (s.board.length !== COLS) throw new Error(`${ctx}: board has ${s.board.length} columns`);
  const count: Record<string, number> = { red: 0, yellow: 0 };
  for (let col = 0; col < COLS; col++) {
    const column = s.board[col];
    if (column.length !== ROWS) throw new Error(`${ctx}: column ${col} has ${column.length} rows`);
    let sawEmpty = false;
    for (let row = 0; row < ROWS; row++) {
      const cell: Cell = column[row];
      if (cell !== null && cell !== "red" && cell !== "yellow")
        throw new Error(`${ctx}: illegal cell value ${JSON.stringify(cell)} at ${col},${row}`);
      // gravity: nothing may float above a gap
      if (cell === null) sawEmpty = true;
      else {
        if (sawEmpty) throw new Error(`${ctx}: floating disc at ${col},${row}`);
        count[cell]++;
      }
      // discs never un-drop or change colour
      const was = t.prev[col][row];
      if (was !== null && was !== cell)
        throw new Error(`${ctx}: cell ${col},${row} changed from ${was} to ${cell}`);
    }
  }

  const total = count.red + count.yellow;
  if (total !== s.moves) throw new Error(`${ctx}: ${total} discs but moves=${s.moves}`);
  if (total > CELLS) throw new Error(`${ctx}: ${total} discs on a ${CELLS}-cell board`);
  if (Math.abs(count.red - count.yellow) > 1)
    throw new Error(`${ctx}: disc counts ${count.red}/${count.yellow} differ by more than 1`);

  // the first mover always holds the equal-or-larger pile
  const firstColor = s.players.find((p) => p.id === t.firstId)!.color;
  const firstCount = firstColor === "red" ? count.red : count.yellow;
  const otherCount = total - firstCount;
  if (firstCount !== otherCount && firstCount !== otherCount + 1)
    throw new Error(`${ctx}: first mover has ${firstCount}, opponent ${otherCount}`);

  // per-player disc bookkeeping in the redacted view is checked in checkViews

  if (s.phase === "play") {
    const expectTurn = total % 2 === 0 ? t.firstId : opponentOf(s, t.firstId).id;
    if (s.turn !== expectTurn) throw new Error(`${ctx}: turn is ${s.turn}, expected ${expectTurn}`);
    if (!s.players.some((p) => p.id === s.turn)) throw new Error(`${ctx}: turn on a non-player`);
    if (s.players.some((p) => p.left)) throw new Error(`${ctx}: still playing with a departed player`);
    if (s.deadline === null) throw new Error(`${ctx}: no turn deadline while playing`);
    if (s.winner || s.winBy || s.draw || s.winningLine)
      throw new Error(`${ctx}: an unfinished game is carrying a result`);
    // the engine must never miss a win: no line may exist on a live board
    if (hasAnyLine(s.board)) throw new Error(`${ctx}: a four-in-a-row was left undetected`);
    if (openColumns(s.board).length === 0) throw new Error(`${ctx}: full board still in play`);
  } else {
    if (s.turn !== "") throw new Error(`${ctx}: game over but turn is set`);
    if (s.deadline !== null) throw new Error(`${ctx}: game over but the clock is still armed`);
    if (s.draw && s.winner) throw new Error(`${ctx}: a draw with a winner`);
    if (!s.draw && !s.winner) throw new Error(`${ctx}: over with neither draw nor winner`);

    if (s.winBy === "connect") {
      if (!s.winningLine) throw new Error(`${ctx}: connect win without a line`);
      const w = s.players.find((p) => p.id === s.winner)!;
      verifyWinningLine(s.board, s.winningLine, w.color, ctx);
    } else if (s.winBy === "forfeit") {
      if (s.winningLine) throw new Error(`${ctx}: forfeit win carrying a line`);
      if (!opponentOf(s, s.winner!).left) throw new Error(`${ctx}: forfeit win but nobody left`);
    } else if (s.draw) {
      if (s.winBy !== null) throw new Error(`${ctx}: a draw with winBy=${s.winBy}`);
      if (s.winningLine) throw new Error(`${ctx}: a draw carrying a line`);
      if (total !== CELLS) throw new Error(`${ctx}: draw declared with only ${total} discs`);
      if (openColumns(s.board).length !== 0) throw new Error(`${ctx}: draw with open columns`);
      if (hasAnyLine(s.board)) throw new Error(`${ctx}: draw declared on a board that HAS a line`);
    } else {
      throw new Error(`${ctx}: over with winBy=${s.winBy}`);
    }
  }

  if (s.log.length > LOG_CAP) throw new Error(`${ctx}: log over cap (${s.log.length})`);
  if (s.lastDrop) {
    const ld = s.lastDrop;
    if (s.board[ld.col][ld.row] !== ld.color)
      throw new Error(`${ctx}: lastDrop doesn't match the board`);
    if (ld.n !== s.moves) throw new Error(`${ctx}: lastDrop.n=${ld.n} but moves=${s.moves}`);
  } else if (s.moves !== 0) {
    throw new Error(`${ctx}: ${s.moves} moves but no lastDrop`);
  }

  t.prev = cloneBoard(s.board);
}

/* ================= view checks =================
   Perfect information: every viewer, spectators included, gets the same board. */

function checkViews(s: Connect4State, now: number, ctx: string) {
  const viewers = [s.players[0].id, s.players[1].id, "spectator-1"];
  const stateJson = JSON.stringify(s);
  let canonical = "";
  for (const viewerId of viewers) {
    const v = redactConnect4(s, viewerId, now);
    if (v.youId !== viewerId) throw new Error(`${ctx}: view.youId is ${v.youId}, not ${viewerId}`);
    if (JSON.stringify(v.board) !== JSON.stringify(s.board))
      throw new Error(`${ctx}: view board differs from state board`);
    if (v.phase !== s.phase || v.draw !== s.draw || v.winner !== s.winner)
      throw new Error(`${ctx}: view outcome fields out of sync`);
    if (v.moves !== s.moves) throw new Error(`${ctx}: view move count out of sync`);
    for (const p of v.players) {
      const actual = s.board.reduce(
        (n, col) => n + col.reduce((m, c) => m + (c === p.color ? 1 : 0), 0),
        0
      );
      if (p.discsPlaced !== actual)
        throw new Error(`${ctx}: ${p.name} discsPlaced=${p.discsPlaced}, board says ${actual}`);
    }

    // perfect information: every viewer sees exactly the same thing
    const rest = JSON.stringify({ ...v, youId: null });
    if (!canonical) canonical = rest;
    else if (rest !== canonical) throw new Error(`${ctx}: views differ between viewers`);

    // …and scribbling on a view must never reach back into the state
    v.board[0][0] = v.board[0][0] === "red" ? "yellow" : "red";
    v.players[0].discsPlaced = -1;
    if (v.winningLine) v.winningLine[0].col = -1;
    if (v.lastDrop) v.lastDrop.col = -1;
  }
  if (JSON.stringify(s) !== stateJson)
    throw new Error(`${ctx}: a redacted view aliases the state`);
}

/* ================= invalid-move probes ================= */

let probeCount = 0;

function expectRejected(
  s: Connect4State,
  playerId: string,
  move: Connect4Move,
  now: number,
  ctx: string
) {
  const before = JSON.stringify(s);
  let threw = false;
  try {
    applyConnect4Move(s, playerId, move, now);
  } catch (e) {
    if (!(e instanceof MoveError)) throw e;
    threw = true;
  }
  if (!threw) throw new Error(`${ctx}: invalid move accepted: ${JSON.stringify(move)}`);
  if (JSON.stringify(s) !== before)
    throw new Error(`${ctx}: rejected move mutated state: ${JSON.stringify(move)}`);
  probeCount++;
}

function probeInvalid(s: Connect4State, now: number, rng: () => number, ctx: string) {
  const turnP = s.players.find((p) => p.id === s.turn) ?? s.players[0];
  const other = opponentOf(s, turnP.id);
  const probes: (() => void)[] = [
    // not in the game at all
    () => expectRejected(s, "ghost", { type: "drop", col: 0 }, now, ctx),
    // out of turn
    () => expectRejected(s, other.id, { type: "drop", col: openColumns(s.board)[0] ?? 0 }, now, ctx),
    // out of range columns
    () => expectRejected(s, turnP.id, { type: "drop", col: -1 }, now, ctx),
    () => expectRejected(s, turnP.id, { type: "drop", col: COLS }, now, ctx),
    () => expectRejected(s, turnP.id, { type: "drop", col: 99 }, now, ctx),
    () => expectRejected(s, turnP.id, { type: "drop", col: 2.5 }, now, ctx),
    () => expectRejected(s, turnP.id, { type: "drop", col: NaN }, now, ctx),
    () =>
      expectRejected(s, turnP.id, { type: "drop", col: "3" as unknown as number }, now, ctx),
    // malformed moves
    () => expectRejected(s, turnP.id, { type: "shove", col: 1 } as unknown as Connect4Move, now, ctx),
    () => expectRejected(s, turnP.id, null as unknown as Connect4Move, now, ctx),
  ];

  // full column
  const full: number[] = [];
  for (let c = 0; c < COLS; c++) if (dropRow(s.board, c) < 0) full.push(c);
  if (full.length > 0)
    probes.push(() => expectRejected(s, turnP.id, { type: "drop", col: pick(rng, full) }, now, ctx));

  pick(rng, probes)();
}

/* ================= move choosers ================= */

/** Would dropping `color` into `col` complete a line? (works on a copy) */
function wouldWin(board: Board, col: number, color: Disc): boolean {
  const row = dropRow(board, col);
  if (row < 0) return false;
  const b = cloneBoard(board);
  b[col][row] = color;
  return scanAllLines(b).some((l) => l.color === color && l.cells.some((c) => c.col === col && c.row === row));
}

/** Draw hunter: avoid winning, and avoid handing the opponent the cell above. */
function drawSeekingCol(board: Board, mine: Disc, theirs: Disc, rng: () => number): number {
  const open = openColumns(board);
  const safe = open.filter((col) => {
    if (wouldWin(board, col, mine)) return false;
    const row = dropRow(board, col);
    if (row + 1 >= ROWS) return true;
    const b = cloneBoard(board);
    b[col][row] = mine;
    return !wouldWin(b, col, theirs);
  });
  if (safe.length > 0) return pick(rng, safe);
  const nonWinning = open.filter((col) => !wouldWin(board, col, mine));
  return pick(rng, nonWinning.length > 0 ? nonWinning : open);
}

/* ================= hardcoded unit assertions ================= */

const UNIT_PLAYERS: GamePlayer[] = [
  { id: "u0", name: "Unit Zero", seat: 0 },
  { id: "u1", name: "Unit One", seat: 1 },
];

/** Play `cols` in order, always as whoever holds the turn. */
function playSequence(cols: number[]): Connect4State {
  const s = initConnect4(UNIT_PLAYERS, 1_000, () => 0); // rng 0 → seat 0 moves first
  if (s.turn !== "u0") throw new Error("unit: expected seat 0 to start with rng()=0");
  let now = 1_000;
  for (const col of cols) {
    now += 1_000;
    if (s.phase !== "play") throw new Error(`unit: sequence continued past game over at col ${col}`);
    applyConnect4Move(s, s.turn, { type: "drop", col }, now);
  }
  return s;
}

function expectWin(cols: number[], winner: string, want: string, label: string) {
  const s = playSequence(cols);
  if (s.phase !== "over") throw new Error(`unit ${label}: game did not end`);
  if (s.winner !== winner) throw new Error(`unit ${label}: winner is ${s.winner}, expected ${winner}`);
  if (s.draw) throw new Error(`unit ${label}: flagged as a draw`);
  if (!s.winningLine) throw new Error(`unit ${label}: no winning line`);
  const got = s.winningLine.map((c) => `${c.col},${c.row}`).join(" ");
  if (got !== want) throw new Error(`unit ${label}: line is [${got}], expected [${want}]`);
  const color = s.players.find((p) => p.id === winner)!.color;
  verifyWinningLine(s.board, s.winningLine, color, `unit ${label}`);
  const res = connect4Module.result(s);
  if (!res || res.winnerId !== winner) throw new Error(`unit ${label}: result() wrong`);
  if (!connect4Module.isOver!(s)) throw new Error(`unit ${label}: isOver() false after a win`);
}

function expectNoWin(cols: number[], label: string) {
  const s = playSequence(cols);
  if (s.phase !== "play") throw new Error(`unit ${label}: game ended but should still be running`);
  if (s.winningLine) throw new Error(`unit ${label}: a line was declared`);
  if (hasAnyLine(s.board)) throw new Error(`unit ${label}: the board really does hold a line`);
  if (connect4Module.result(s) !== null) throw new Error(`unit ${label}: premature result()`);
  return s;
}

function runUnitTests() {
  // ---- horizontal: seat 0 fills row 0, cols 0..3
  expectWin([0, 0, 1, 1, 2, 2, 3], "u0", "0,0 1,0 2,0 3,0", "horizontal");

  // ---- vertical: seat 0 stacks col 0 to row 3
  expectWin([0, 1, 0, 1, 0, 1, 0], "u0", "0,0 0,1 0,2 0,3", "vertical");

  // ---- diagonal "/" (up-right): (0,0) (1,1) (2,2) (3,3)
  expectWin(
    [0, 1, 1, 2, 3, 2, 2, 3, 6, 3, 3],
    "u0",
    "0,0 1,1 2,2 3,3",
    "diagonal-up"
  );

  // ---- diagonal "\" (down-right): the mirror image, (3,3) (4,2) (5,1) (6,0)
  expectWin(
    [6, 5, 5, 4, 3, 4, 4, 3, 0, 3, 3],
    "u0",
    "3,3 4,2 5,1 6,0",
    "diagonal-down"
  );

  // ---- "nearly four": three with a gap (0,1,_,3) must NOT win…
  const gap = expectNoWin([0, 5, 1, 5, 3, 5], "gap-of-three");
  if (gap.moves !== 6) throw new Error("unit gap-of-three: wrong move count");
  // …and filling the gap wins immediately
  applyConnect4Move(gap, "u0", { type: "drop", col: 2 }, 100_000);
  if (gap.phase !== "over" || gap.winner !== "u0")
    throw new Error("unit gap-of-three: filling the gap did not win");
  if (gap.winningLine!.map((c) => `${c.col},${c.row}`).join(" ") !== "0,0 1,0 2,0 3,0")
    throw new Error("unit gap-of-three: wrong line after the fill");

  // ---- three in a row blocked by the opponent must NOT win
  expectNoWin([0, 3, 1, 5, 2], "blocked-three");

  // ---- three on a diagonal with no fourth must NOT win
  expectNoWin([0, 1, 1, 2, 3, 2, 2], "diagonal-of-three");

  // ---- a filled gap can make a run of FIVE — the whole run is reported
  expectWin([0, 6, 1, 5, 3, 6, 4, 5, 2], "u0", "0,0 1,0 2,0 3,0 4,0", "run-of-five");

  // ---- forfeit hands the game over, and is a no-op afterwards
  const f = playSequence([0, 1, 0]);
  forfeitConnect4(f, "u0", 50_000);
  if (f.phase !== "over" || f.winner !== "u1" || f.winBy !== "forfeit")
    throw new Error("unit forfeit: opponent did not win");
  if (!connect4Module.isOver!(f)) throw new Error("unit forfeit: isOver() false");
  const frozen = JSON.stringify(f);
  forfeitConnect4(f, "u1", 60_000);
  forfeitConnect4(f, "u0", 60_000);
  if (JSON.stringify(f) !== frozen) throw new Error("unit forfeit: post-game forfeit mutated state");
  expectRejected(f, "u1", { type: "drop", col: 4 }, 60_000, "unit forfeit");

  // ---- the 45s clock: tick before it expires does nothing, after it drops one disc
  const t = initConnect4(UNIT_PLAYERS, 1_000, () => 0);
  if (tickConnect4(t, t.deadline! - 1, () => 0.5)) throw new Error("unit tick: fired early");
  if (!tickConnect4(t, t.deadline!, () => 0.5)) throw new Error("unit tick: did not fire on expiry");
  if (t.moves !== 1) throw new Error("unit tick: timeout did not drop exactly one disc");
  if (t.turn !== "u1") throw new Error("unit tick: turn did not pass after the auto-drop");
  if (t.deadline === null) throw new Error("unit tick: deadline was not re-armed");
  if (!t.log.some((l) => l.kind === "timeout")) throw new Error("unit tick: no timeout log entry");

  console.log("unit assertions: 11 win-detection / lifecycle cases OK");
}

/* ================= driver ================= */

const GAMES = Number(process.env.GAMES ?? 5000);

if (
  connect4Module.type !== "connect4" ||
  connect4Module.minPlayers !== 2 ||
  connect4Module.maxPlayers !== 2
)
  throw new Error("module metadata wrong");

runUnitTests();

let connectWins = 0;
let forfeitWins = 0;
let draws = 0;
let timeoutDrops = 0;
let totalDrops = 0;
let totalSteps = 0;
let longestLine = 0;

for (let g = 0; g < GAMES; g++) {
  const seed = 42_000 + g;
  const rng = mulberry32(seed);
  try {
    let now = 1_700_000_000_000;
    const players: GamePlayer[] = [
      { id: "p0", name: "Red Rosa", seat: 0 },
      { id: "p1", name: "Gold Gil", seat: 1 },
    ];
    const s = initConnect4(players, now, rng);
    const track: Track = { firstId: s.turn, prev: cloneBoard(s.board) };

    assertInvariants(s, track, `seed ${seed} start`);
    checkViews(s, now, `seed ${seed} start`);
    if (connect4Module.result(s) !== null) throw new Error(`seed ${seed}: premature result`);
    if (connect4Module.isOver!(s)) throw new Error(`seed ${seed}: premature isOver`);

    // three flavours of game: draw hunting, rage-quitting, and plain random
    const mode = g % 3;
    const forfeitProb = mode === 1 ? 0.02 : 0;

    let steps = 0;
    let drops = 0;
    while (s.phase !== "over") {
      if (++steps > 500) throw new Error(`seed ${seed}: no termination in 500 steps`);
      now += 700;

      const roll = rng();
      if (roll < forfeitProb) {
        const quitter = pick(rng, s.players);
        forfeitConnect4(s, quitter.id, now);
        if (s.phase !== "over" || s.winner !== opponentOf(s, quitter.id).id || s.winBy !== "forfeit")
          throw new Error(`seed ${seed}: forfeit didn't hand the win over`);
        const after = JSON.stringify(s);
        forfeitConnect4(s, opponentOf(s, quitter.id).id, now + 1);
        forfeitConnect4(s, quitter.id, now + 1);
        if (JSON.stringify(s) !== after)
          throw new Error(`seed ${seed}: forfeit after game over mutated state`);
      } else if (roll < forfeitProb + 0.08) {
        probeInvalid(s, now, rng, `seed ${seed} step ${steps}`);
      } else if (roll < forfeitProb + 0.14) {
        // let the shot clock expire — the engine drops for the dawdler
        if (!tickConnect4(s, s.deadline!, rng)) throw new Error(`seed ${seed}: timeout tick no-op`);
        timeoutDrops++;
        drops++;
      } else {
        const me = s.players.find((p) => p.id === s.turn)!;
        const col =
          mode === 0
            ? drawSeekingCol(s.board, me.color, opponentOf(s, me.id).color, rng)
            : pick(rng, openColumns(s.board));
        applyConnect4Move(s, me.id, { type: "drop", col }, now);
        drops++;
      }

      if (drops > CELLS) throw new Error(`seed ${seed}: ${drops} drops on a ${CELLS}-cell board`);

      // ticking with time still on the clock must never change anything
      if (s.phase === "play" && tickConnect4(s, now, rng))
        throw new Error(`seed ${seed} step ${steps}: premature tick fired`);
      // ticking a finished game is always a no-op
      if (s.phase === "over") {
        const frozen = JSON.stringify(s);
        if (tickConnect4(s, now + 10_000_000, rng))
          throw new Error(`seed ${seed}: tick changed a finished game`);
        if (JSON.stringify(s) !== frozen) throw new Error(`seed ${seed}: tick mutated a finished game`);
      }

      assertInvariants(s, track, `seed ${seed} step ${steps}`);
      checkViews(s, now, `seed ${seed} step ${steps}`);
    }

    // after the game: every further drop is rejected, from either player
    for (const p of s.players) {
      for (const col of [0, 3, 6]) {
        expectRejected(s, p.id, { type: "drop", col }, now + 5, `seed ${seed} post-game`);
      }
    }

    // outcome bookkeeping
    const res = connect4Module.result(s);
    if (!connect4Module.isOver!(s)) throw new Error(`seed ${seed}: isOver false after the game`);
    if (s.draw) {
      draws++;
      if (res !== null) throw new Error(`seed ${seed}: a draw produced a result()`);
    } else {
      if (!res || res.winnerId !== s.winner) throw new Error(`seed ${seed}: result() mismatch`);
      if (s.winBy === "connect") {
        connectWins++;
        longestLine = Math.max(longestLine, s.winningLine!.length);
      } else forfeitWins++;
    }

    const json = JSON.stringify(s);
    if (JSON.stringify(JSON.parse(json)) !== json) throw new Error(`seed ${seed}: state not JSON-stable`);

    totalDrops += s.moves;
    totalSteps += steps;
  } catch (e) {
    console.error(`FAILED at game ${g} (seed ${seed})`);
    throw e;
  }
}

if (draws === 0) throw new Error("no draws were exercised — the draw path is untested");
if (forfeitWins === 0) throw new Error("no forfeits were exercised");
if (timeoutDrops === 0) throw new Error("no timeout auto-drops were exercised");

console.log(
  `OK: ${GAMES} games, avg ${(totalDrops / GAMES).toFixed(1)} discs ` +
    `(${connectWins} connect wins, ${draws} draws, ${forfeitWins} forfeits, ` +
    `longest line ${longestLine}, avg ${(totalSteps / GAMES).toFixed(1)} steps, ` +
    `${timeoutDrops} timeout auto-drops, ${probeCount} invalid moves rejected)`
);
