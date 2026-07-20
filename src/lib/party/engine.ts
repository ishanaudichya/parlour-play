import { MoveError, type GameModule, type GamePlayer, type GameType } from "@/lib/games/types";
import {
  PARTY_MAX,
  type Member,
  type PartyLogKind,
  type PartyMove,
  type PartyState,
  type PartyView,
} from "./types";

export type Rng = () => number;
export type Registry = Partial<Record<GameType, GameModule>>;

const err = (msg: string): never => {
  throw new MoveError(msg);
};

const LOG_CAP = 60;

function log(s: PartyState, kind: PartyLogKind, e: { member?: string; game?: GameType } = {}) {
  s.log.push({ i: ++s.logSeq, ts: s.updatedAt, kind, ...e });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}

export function createParty(
  code: string,
  hostName: string,
  ids: { playerId: string; secret: string },
  now: number
): PartyState {
  const host: Member = { id: ids.playerId, secret: ids.secret, name: hostName, seat: 0, joinedAt: now };
  const s: PartyState = {
    code,
    hostId: host.id,
    members: [host],
    phase: "lobby",
    game: null,
    tallies: {},
    log: [],
    logSeq: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  log(s, "join", { member: hostName });
  return s;
}

export function joinParty(s: PartyState, name: string, ids: { playerId: string; secret: string }): void {
  if (s.members.length >= PARTY_MAX) err("This party is full.");
  if (s.members.some((m) => m.name.toLowerCase() === name.toLowerCase()))
    err("That name is taken in this party.");
  const seat = Math.max(-1, ...s.members.map((m) => m.seat)) + 1;
  s.members.push({ id: ids.playerId, secret: ids.secret, name, seat, joinedAt: s.updatedAt });
  log(s, "join", { member: name });
}

/** Record the finished game's winner in the tallies exactly once. */
function settleGame(s: PartyState, registry: Registry) {
  const g = s.game;
  if (!g || g.tallied) return;
  const mod = registry[g.type];
  if (!mod) return;
  const result = mod.result(g.state);
  if (!result) return;
  const t = (s.tallies[g.type] ??= {});
  const winnerIds = result.winnerIds?.length ? result.winnerIds : [result.winnerId];
  for (const winnerId of new Set(winnerIds)) {
    t[winnerId] = (t[winnerId] ?? 0) + 1;
  }
  g.tallied = true;
  const winner = winnerIds.length === 1 ? s.members.find((m) => m.id === winnerIds[0]) : undefined;
  log(s, "winner", { member: winner?.name, game: g.type });
}

function startGame(s: PartyState, memberId: string, type: GameType, now: number, rng: Rng, registry: Registry) {
  if (memberId !== s.hostId) err("Only the host can start a game.");
  const mod = registry[type];
  if (!mod) err("That game isn't available.");
  if (s.phase === "game" && s.game && !s.game.tallied && registry[s.game.type]?.result(s.game.state) === null)
    err("A game is already in progress.");
  const players = s.members.slice(0, mod!.maxPlayers);
  if (players.length < mod!.minPlayers)
    err(`${type === "monodeal" ? "Monopoly Deal" : type} needs at least ${mod!.minPlayers} players.`);
  const gamePlayers: GamePlayer[] = players.map((m, i) => ({ id: m.id, name: m.name, seat: i }));
  s.game = {
    type,
    players: gamePlayers.map((p) => p.id),
    state: mod!.init(gamePlayers, now, rng),
    startedAt: now,
    tallied: false,
  };
  s.phase = "game";
  log(s, "game_start", { game: type });
}

export function applyPartyMove(
  s: PartyState,
  memberId: string,
  move: PartyMove,
  now: number,
  rng: Rng,
  registry: Registry
): void {
  s.updatedAt = now;
  const member = s.members.find((m) => m.id === memberId) ?? (err("You are not in this party.") as never);

  if (move.kind === "party") {
    switch (move.action) {
      case "start_game":
        startGame(s, memberId, move.game, now, rng, registry);
        return;
      case "end_game": {
        if (memberId !== s.hostId) err("Only the host can end the game.");
        if (!s.game) err("No game is running.");
        settleGame(s, registry);
        log(s, "game_end", { game: s.game!.type });
        s.game = null;
        s.phase = "lobby";
        return;
      }
      case "leave": {
        // mid-game: the game engine forfeits them so play keeps moving
        if (s.game && !s.game.tallied && s.game.players.includes(memberId)) {
          const mod = registry[s.game.type];
          if (mod && mod.result(s.game.state) === null) {
            mod.forfeit(s.game.state, memberId, now, rng);
            settleGame(s, registry);
          }
        }
        s.members = s.members.filter((m) => m.id !== memberId);
        log(s, "leave", { member: member.name });
        if (s.hostId === memberId && s.members.length > 0) {
          s.hostId = s.members[0].id;
        }
        return;
      }
    }
  }

  // game move
  if (!s.game) return err("No game is running.");
  const mod = registry[s.game.type] ?? (err("That game isn't available.") as never);
  if (!s.game.players.includes(memberId)) err("You are spectating this game — you'll be dealt into the next one.");
  mod.applyMove(s.game.state, memberId, (move as { kind: "game"; move: unknown }).move, now, rng);
  settleGame(s, registry);
}

/** Advance game timers. Returns true if anything changed. */
export function tickParty(s: PartyState, now: number, rng: Rng, registry: Registry): boolean {
  if (!s.game) return false;
  const mod = registry[s.game.type];
  if (!mod) return false;
  const changed = mod.tick(s.game.state, now, rng);
  if (changed) {
    s.updatedAt = now;
    settleGame(s, registry);
  }
  return changed;
}

export function redactParty(s: PartyState, viewerId: string, now: number, registry: Registry): PartyView {
  return {
    code: s.code,
    youId: viewerId,
    hostId: s.hostId,
    phase: s.phase,
    members: s.members.map((m) => ({
      id: m.id,
      name: m.name,
      seat: m.seat,
      inGame: s.game?.players.includes(m.id) ?? false,
    })),
    game: s.game
      ? {
          type: s.game.type,
          players: s.game.players,
          view: registry[s.game.type]?.redact(s.game.state, viewerId, now) ?? null,
        }
      : null,
    tallies: s.tallies,
    log: s.log.slice(-30),
    version: s.version,
    now,
  };
}

export { MoveError };
