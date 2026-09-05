import { MoveError, type GameModule, type GamePlayer } from "@/lib/games/types";
import {
  LOG_CAP,
  TURN_MS,
  WAVES_HARD_CAP,
  WAVES_RECORDED,
  type ChainBoard,
  type ChainLogEntry,
  type ChainLogKind,
  type ChainMove,
  type ChainPlayer,
  type ChainState,
  type ChainView,
  type Wave,
} from "./types";

export type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

/* ---------------- geometry (shared with UI + fuzz) ---------------- */

/** More players, bigger reactor — so nobody is wiped out before they settle in. */
export function boardSize(playerCount: number): { cols: number; rows: number } {
  if (playerCount <= 3) return { cols: 6, rows: 8 };
  if (playerCount <= 5) return { cols: 7, rows: 9 };
  return { cols: 8, rows: 10 };
}

export const cellIndex = (cols: number, col: number, row: number) => row * cols + col;

export const cellCoord = (cols: number, i: number) => ({ col: i % cols, row: Math.floor(i / cols) });

/** Orthogonal neighbours of cell `i`, as indexes. */
export function neighbours(cols: number, rows: number, i: number): number[] {
  const col = i % cols;
  const row = (i - col) / cols;
  const out: number[] = [];
  if (row > 0) out.push(i - cols);
  if (row < rows - 1) out.push(i + cols);
  if (col > 0) out.push(i - 1);
  if (col < cols - 1) out.push(i + 1);
  return out;
}

/**
 * Critical mass — the cell bursts the moment it holds this many orbs.
 * Corners 2, edges 3, interior 4; a cell can therefore hold at most
 * criticalMass − 1 orbs and stay put.
 */
export function criticalMass(cols: number, rows: number, i: number): number {
  const col = i % cols;
  const row = (i - col) / cols;
  return (row > 0 ? 1 : 0) + (row < rows - 1 ? 1 : 0) + (col > 0 ? 1 : 0) + (col < cols - 1 ? 1 : 0);
}

export function emptyBoard(cols: number, rows: number): ChainBoard {
  return Array.from({ length: cols * rows }, () => ({ n: 0, owner: null }));
}

/** You may place on an empty cell or on one you already hold. */
export const canPlace = (board: ChainBoard, i: number, seat: number) =>
  i >= 0 && i < board.length && (board[i].n === 0 || board[i].owner === seat);

export function legalCells(board: ChainBoard, seat: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) if (canPlace(board, i, seat)) out.push(i);
  return out;
}

/** Orbs on the board per seat. */
export function orbsBySeat(board: ChainBoard, seats: number): number[] {
  const out = new Array<number>(seats).fill(0);
  for (const c of board) if (c.owner !== null && c.owner < seats) out[c.owner] += c.n;
  return out;
}

/**
 * Apply one cascade wave to a board, in place: every listed cell sheds its
 * critical mass, one orb to each neighbour, and every neighbour becomes the
 * mover's. Orbs are conserved. The order cells are processed in does not
 * matter — each cell ends at (n − critical + bursting neighbours), and a
 * cell left holding nothing has no owner. The client replays the recorded
 * waves through this exact function.
 */
export function applyWave(board: ChainBoard, cols: number, rows: number, wave: Wave, seat: number): void {
  for (const i of wave) {
    const c = board[i];
    c.n -= criticalMass(cols, rows, i);
    if (c.n <= 0) {
      c.n = 0;
      c.owner = null;
    }
    for (const j of neighbours(cols, rows, i)) {
      board[j].n += 1;
      board[j].owner = seat;
    }
  }
}

/** Every cell currently at or over critical mass. */
export function unstableCells(board: ChainBoard, cols: number, rows: number): Wave {
  const wave: Wave = [];
  for (let i = 0; i < board.length; i++) if (board[i].n >= criticalMass(cols, rows, i)) wave.push(i);
  return wave;
}

export interface Cascade {
  /** the first WAVES_RECORDED waves, for the replay */
  waves: Wave[];
  totalWaves: number;
  bursts: number;
}

/**
 * Let the board settle after `seat` placed an orb. Waves are simultaneous:
 * everything critical bursts together, then whatever that pushed over
 * critical bursts in the next wave, and so on.
 *
 * A cascade can be endless once the board is crowded — but a cascade only
 * ever converts cells to the mover, and one that never settles has visited
 * every cell, so the moment every orb on the board is theirs the game is
 * decided and there is nothing left to resolve. We stop right there.
 */
export function resolveCascade(board: ChainBoard, cols: number, rows: number, seat: number): Cascade {
  const waves: Wave[] = [];
  let totalWaves = 0;
  let bursts = 0;
  for (;;) {
    const wave = unstableCells(board, cols, rows);
    if (wave.length === 0) break;
    applyWave(board, cols, rows, wave, seat);
    totalWaves += 1;
    bursts += wave.length;
    if (waves.length < WAVES_RECORDED) waves.push(wave);
    if (board.every((c) => c.n === 0 || c.owner === seat)) break;
    if (totalWaves >= WAVES_HARD_CAP) break;
  }
  return { waves, totalWaves, bursts };
}

/* ---------------- internals ---------------- */

const player = (s: ChainState, id: string) => s.players.find((p) => p.id === id);

/** The next player still in the game after `seat`, in seat order. */
function nextAlive(s: ChainState, seat: number): ChainPlayer {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const q = s.players[(seat + k) % n];
    if (q.alive) return q;
  }
  // unreachable while the game is running: there are always two alive players
  return s.players[seat];
}

function log(s: ChainState, kind: ChainLogKind, e: Partial<ChainLogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

function endGame(s: ChainState) {
  s.phase = "over";
  s.turn = "";
  s.deadline = null;
}

function crown(s: ChainState, w: ChainPlayer, by: "last_standing" | "forfeit") {
  s.winner = w.id;
  s.winBy = by;
  endGame(s);
  log(s, "win", { actor: w.name, player: w.id, seat: w.seat });
}

/** Drop `p`'s orb on cell `i` (assumed legal), settle the board, knock out
    whoever it emptied, and pass the turn. */
function doPlace(s: ChainState, p: ChainPlayer, i: number) {
  const cell = s.board[i];
  cell.n += 1;
  cell.owner = p.seat;
  s.moves += 1;
  p.moved = true;

  const { col, row } = cellCoord(s.cols, i);
  const cascade = resolveCascade(s.board, s.cols, s.rows, p.seat);
  s.lastMove = {
    col,
    row,
    by: p.id,
    seat: p.seat,
    n: s.moves,
    waves: cascade.waves,
    totalWaves: cascade.totalWaves,
    bursts: cascade.bursts,
  };
  log(s, "place", {
    actor: p.name,
    player: p.id,
    seat: p.seat,
    col,
    row,
    waves: cascade.totalWaves,
    bursts: cascade.bursts,
  });

  // knockouts: anyone who has had a turn and holds nothing is out.
  // The mover can never be among them — a cascade only ever hands cells to them.
  const orbs = orbsBySeat(s.board, s.players.length);
  for (const q of s.players) {
    if (!q.alive || !q.moved || orbs[q.seat] > 0) continue;
    q.alive = false;
    log(s, "eliminated", { actor: q.name, player: q.id, seat: q.seat, by: p.name });
  }

  const alive = s.players.filter((q) => q.alive);
  if (alive.length === 1) {
    crown(s, alive[0], "last_standing");
    return;
  }

  s.turn = nextAlive(s, p.seat).id;
  s.deadline = s.updatedAt + TURN_MS;
}

/* ---------------- lifecycle ---------------- */

export function initChain(players: GamePlayer[], now: number, rng: Rng): ChainState {
  const { cols, rows } = boardSize(players.length);
  const seated: ChainPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    alive: true,
    moved: false,
    left: false,
  }));
  const first = seated[Math.floor(rng() * seated.length)];
  const s: ChainState = {
    phase: "play",
    cols,
    rows,
    board: emptyBoard(cols, rows),
    players: seated,
    turn: first.id,
    deadline: now + TURN_MS,
    winner: null,
    winBy: null,
    lastMove: null,
    moves: 0,
    startedAt: now,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  log(s, "start", { actor: first.name, player: first.id, seat: first.seat });
  return s;
}

export function applyChainMove(s: ChainState, playerId: string, move: ChainMove, now: number): void {
  const p = player(s, playerId) ?? (err("You are not in this game.") as never);
  if (s.phase === "over") err("The game is over.");
  if (!move || move.type !== "place") err("Unknown move.");
  if (!p.alive) err(p.left ? "You left this game." : "You've been knocked out of this one.");
  if (s.turn !== p.id) err("It's not your turn.");
  const { col, row } = move;
  if (
    !Number.isInteger(col) ||
    !Number.isInteger(row) ||
    col < 0 ||
    col >= s.cols ||
    row < 0 ||
    row >= s.rows
  )
    err("That cell isn't on the board.");
  const i = cellIndex(s.cols, col, row);
  if (!canPlace(s.board, i, p.seat)) err("That cell is held by someone else.");

  s.updatedAt = now;
  doPlace(s, p, i);
}

/** The dawdler's clock ran out: the reactor places for them, then re-arms. */
export function tickChain(s: ChainState, now: number, rng: Rng): boolean {
  if (s.phase !== "play") return false;
  if (s.deadline === null || now < s.deadline) return false;

  s.updatedAt = now;
  const p = player(s, s.turn)!;
  log(s, "timeout", { actor: p.name, player: p.id, seat: p.seat });

  const legal = legalCells(s.board, p.seat);
  if (legal.length === 0) {
    // unreachable: a live player always holds a cell or can see an empty one
    s.turn = nextAlive(s, p.seat).id;
    s.deadline = now + TURN_MS;
    return true;
  }
  doPlace(s, p, legal[Math.floor(rng() * legal.length)]);
  return true;
}

/** A player left the party: their orbs are swept off the board and play
    goes on without them. The last one standing takes the win. */
export function forfeitChain(s: ChainState, playerId: string, now: number): void {
  if (s.phase === "over") return;
  const p = player(s, playerId);
  if (!p || p.left) return;

  s.updatedAt = now;
  p.left = true;
  p.alive = false;
  for (const c of s.board) {
    if (c.owner === p.seat) {
      c.n = 0;
      c.owner = null;
    }
  }
  log(s, "left", { actor: p.name, player: p.id, seat: p.seat });

  const alive = s.players.filter((q) => q.alive);
  if (alive.length === 1) {
    crown(s, alive[0], "forfeit");
    return;
  }
  if (alive.length === 0) {
    // unreachable — the game ends at one — but never leave a dead game "running"
    endGame(s);
    return;
  }
  if (s.turn === p.id) {
    s.turn = nextAlive(s, p.seat).id;
    s.deadline = s.updatedAt + TURN_MS;
  }
}

/* ---------------- redaction ---------------- */

/** Perfect information: everyone (players and spectators alike) sees this. */
export function redactChain(s: ChainState, viewerId: string, now: number): ChainView {
  const orbs = orbsBySeat(s.board, s.players.length);
  const cells = new Array<number>(s.players.length).fill(0);
  for (const c of s.board) if (c.owner !== null && c.owner < cells.length) cells[c.owner] += 1;

  return {
    phase: s.phase,
    cols: s.cols,
    rows: s.rows,
    board: s.board.map((c) => ({ ...c })),
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      alive: p.alive,
      moved: p.moved,
      left: p.left,
      orbs: orbs[p.seat],
      cells: cells[p.seat],
    })),
    youId: viewerId,
    turn: s.phase === "play" ? s.turn : null,
    deadline: s.phase === "play" ? s.deadline : null,
    winner: s.winner,
    winBy: s.winBy,
    lastMove: s.lastMove ? { ...s.lastMove, waves: s.lastMove.waves.map((w) => w.slice()) } : null,
    moves: s.moves,
    startedAt: s.startedAt,
    log: s.log.slice(-40),
    now,
  };
}

/* ---------------- module ---------------- */

export const chainreactionModule: GameModule<ChainState, ChainView, ChainMove> = {
  type: "chainreaction",
  minPlayers: 2,
  maxPlayers: 8,
  init: initChain,
  applyMove: (s, playerId, move, now) => applyChainMove(s, playerId, move, now),
  tick: tickChain,
  redact: redactChain,
  /** Chain Reaction cannot be drawn: the last player holding orbs wins. */
  result: (s) => (s.phase === "over" && s.winner ? { winnerId: s.winner } : null),
  isOver: (s) => s.phase === "over",
  forfeit: (s, playerId, now) => forfeitChain(s, playerId, now),
};
