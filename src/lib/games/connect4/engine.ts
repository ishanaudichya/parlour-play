import { MoveError, type GameModule, type GamePlayer } from "@/lib/games/types";
import {
  CELLS,
  COLS,
  LOG_CAP,
  ROWS,
  TURN_MS,
  type Board,
  type C4LogEntry,
  type C4LogKind,
  type C4Player,
  type Connect4Move,
  type Connect4State,
  type Connect4View,
  type Coord,
  type Disc,
} from "./types";

export type Rng = () => number;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

/* ---------------- board helpers (shared with UI + fuzz) ---------------- */

export function emptyBoard(): Board {
  return Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => null));
}

/** Lowest empty row in `col`, or -1 if the column is full / out of range. */
export function dropRow(board: Board, col: number): number {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return -1;
  const column = board[col];
  for (let row = 0; row < ROWS; row++) if (column[row] === null) return row;
  return -1;
}

export const columnFull = (board: Board, col: number) => dropRow(board, col) < 0;

/** Columns that still have room, left to right. */
export function openColumns(board: Board): number[] {
  const out: number[] = [];
  for (let col = 0; col < COLS; col++) if (dropRow(board, col) >= 0) out.push(col);
  return out;
}

/** The four axes a line can run along, as (Δcol, Δrow). */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], // —
  [0, 1], // |
  [1, 1], // ⁄
  [1, -1], // ⁠\
];

/**
 * The connected run of ≥4 same-coloured discs through (col,row), or null.
 * Returns the WHOLE run (a filled gap can make five), ordered ascending by
 * column then row so the UI can draw one straight line end to end.
 */
export function winningLineAt(board: Board, col: number, row: number): Coord[] | null {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  const color = board[col][row];
  if (!color) return null;

  for (const [dc, dr] of DIRS) {
    const run: Coord[] = [{ col, row }];
    for (const sign of [1, -1] as const) {
      let c = col + dc * sign;
      let r = row + dr * sign;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && board[c][r] === color) {
        if (sign === 1) run.push({ col: c, row: r });
        else run.unshift({ col: c, row: r });
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (run.length >= 4) {
      run.sort((a, b) => a.col - b.col || a.row - b.row);
      return run;
    }
  }
  return null;
}

/* ---------------- internals ---------------- */

const player = (s: Connect4State, id: string) => s.players.find((p) => p.id === id);

const opponentOf = (s: Connect4State, id: string) => s.players.find((p) => p.id !== id)!;

function log(s: Connect4State, kind: C4LogKind, e: Partial<C4LogEntry> = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

function endGame(s: Connect4State) {
  s.phase = "over";
  s.turn = "";
  s.deadline = null;
}

/** Land `p`'s disc in `col`. Assumes the column has room. Resolves win/draw. */
function doDrop(s: Connect4State, p: C4Player, col: number) {
  const row = dropRow(s.board, col);
  s.board[col][row] = p.color;
  s.moves += 1;
  s.lastDrop = { col, row, by: p.id, color: p.color, n: s.moves };
  log(s, "drop", { actor: p.name, player: p.id, color: p.color, col, row });

  const line = winningLineAt(s.board, col, row);
  if (line) {
    s.winner = p.id;
    s.winBy = "connect";
    s.winningLine = line;
    endGame(s);
    log(s, "win", { actor: p.name, player: p.id, color: p.color, line });
    return;
  }

  if (s.moves >= CELLS) {
    s.draw = true;
    endGame(s);
    log(s, "draw");
    return;
  }

  s.turn = opponentOf(s, p.id).id;
  s.deadline = s.updatedAt + TURN_MS;
}

/* ---------------- lifecycle ---------------- */

export function initConnect4(players: GamePlayer[], now: number, rng: Rng): Connect4State {
  const seated: C4Player[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    color: p.seat === 0 ? "red" : "yellow",
    left: false,
  }));
  const first = seated[Math.floor(rng() * seated.length)];
  const s: Connect4State = {
    phase: "play",
    board: emptyBoard(),
    players: seated,
    turn: first.id,
    deadline: now + TURN_MS,
    winner: null,
    winBy: null,
    draw: false,
    winningLine: null,
    lastDrop: null,
    moves: 0,
    startedAt: now,
    log: [],
    logSeq: 0,
    updatedAt: now,
  };
  log(s, "start", { actor: first.name, player: first.id, color: first.color });
  return s;
}

export function applyConnect4Move(
  s: Connect4State,
  playerId: string,
  move: Connect4Move,
  now: number
): void {
  const p = player(s, playerId) ?? (err("You are not in this game.") as never);
  if (s.phase === "over") err("The game is over.");
  if (!move || move.type !== "drop") err("Unknown move.");
  if (s.turn !== p.id) err("It's not your turn.");
  const col = move.col;
  if (!Number.isInteger(col) || col < 0 || col >= COLS) err("That column isn't on the board.");
  if (dropRow(s.board, col) < 0) err("That column is full.");

  s.updatedAt = now;
  doDrop(s, p, col);
}

/** The dawdler's clock ran out: drop for them at random, then re-arm. */
export function tickConnect4(s: Connect4State, now: number, rng: Rng): boolean {
  if (s.phase !== "play") return false;
  if (s.deadline === null || now < s.deadline) return false;

  s.updatedAt = now;
  const p = player(s, s.turn)!;
  log(s, "timeout", { actor: p.name, player: p.id, color: p.color });

  const open = openColumns(s.board);
  if (open.length === 0) {
    // unreachable: a full board is settled as a draw the moment it fills
    s.draw = true;
    endGame(s);
    log(s, "draw");
    return true;
  }
  doDrop(s, p, open[Math.floor(rng() * open.length)]);
  return true;
}

/** A player left the party: their opponent takes the win on the spot. */
export function forfeitConnect4(s: Connect4State, playerId: string, now: number): void {
  if (s.phase === "over") return;
  const p = player(s, playerId);
  if (!p || p.left) return;

  s.updatedAt = now;
  p.left = true;
  log(s, "left", { actor: p.name, player: p.id, color: p.color });

  const opp = opponentOf(s, playerId);
  s.winner = opp.id;
  s.winBy = "forfeit";
  endGame(s);
  log(s, "win", { actor: opp.name, player: opp.id, color: opp.color });
}

/* ---------------- redaction ---------------- */

/** Perfect information: everyone (players and spectators alike) sees this. */
export function redactConnect4(
  s: Connect4State,
  viewerId: string,
  now: number
): Connect4View {
  const discs = (color: Disc) =>
    s.board.reduce((n, column) => n + column.reduce((m, c) => m + (c === color ? 1 : 0), 0), 0);

  return {
    phase: s.phase,
    board: s.board.map((column) => column.slice()),
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      color: p.color,
      discsPlaced: discs(p.color),
      left: p.left,
    })),
    youId: viewerId,
    turn: s.phase === "play" ? s.turn : null,
    deadline: s.phase === "play" ? s.deadline : null,
    winner: s.winner,
    winBy: s.winBy,
    draw: s.draw,
    winningLine: s.winningLine ? s.winningLine.map((c) => ({ ...c })) : null,
    lastDrop: s.lastDrop ? { ...s.lastDrop } : null,
    moves: s.moves,
    startedAt: s.startedAt,
    log: s.log.slice(-40),
    now,
  };
}

/* ---------------- module ---------------- */

export const connect4Module: GameModule<Connect4State, Connect4View, Connect4Move> = {
  type: "connect4",
  minPlayers: 2,
  maxPlayers: 2,
  init: initConnect4,
  applyMove: (s, playerId, move, now) => applyConnect4Move(s, playerId, move, now),
  tick: tickConnect4,
  redact: redactConnect4,
  /** A DRAW has no winner, so this stays null forever — see `isOver`. */
  result: (s) => (s.phase === "over" && s.winner ? { winnerId: s.winner } : null),
  isOver: (s) => s.phase === "over",
  forfeit: (s, playerId, now) => forfeitConnect4(s, playerId, now),
};
