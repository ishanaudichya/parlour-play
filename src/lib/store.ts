import { Redis } from "@upstash/redis";
import type { PartyState } from "./party/types";

const TTL_S = 60 * 60 * 24; // rooms live for 24h after last activity

export interface RoomStore {
  /** Create the room iff the code is unused. */
  create(code: string, state: PartyState): Promise<boolean>;
  get(code: string): Promise<PartyState | null>;
  /** Persist iff the stored version still equals `expectedVersion`. */
  cas(code: string, expectedVersion: number, state: PartyState): Promise<boolean>;
}

const key = (code: string) => `coup:party:${code}`;
const vkey = (code: string) => `coup:partyv:${code}`;

const CAS_LUA = `
local v = tonumber(redis.call('GET', KEYS[2]) or '0')
if v == tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ${TTL_S})
  redis.call('SET', KEYS[2], ARGV[3], 'EX', ${TTL_S})
  return 1
end
return 0
`;

class RedisStore implements RoomStore {
  constructor(private r: Redis) {}

  async create(code: string, state: PartyState): Promise<boolean> {
    const ok = await this.r.set(key(code), JSON.stringify(state), { nx: true, ex: TTL_S });
    if (!ok) return false;
    await this.r.set(vkey(code), state.version, { ex: TTL_S });
    return true;
  }

  async get(code: string): Promise<PartyState | null> {
    const raw = await this.r.get<PartyState>(key(code));
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as PartyState) : raw;
  }

  async cas(code: string, expectedVersion: number, state: PartyState): Promise<boolean> {
    const res = await this.r.eval(
      CAS_LUA,
      [key(code), vkey(code)],
      [String(expectedVersion), JSON.stringify(state), String(state.version)]
    );
    return res === 1;
  }
}

/** Dev fallback when Redis isn't configured. Single-process only. */
class MemoryStore implements RoomStore {
  private rooms: Map<string, PartyState>;
  constructor() {
    const g = globalThis as unknown as { __coupRooms?: Map<string, PartyState> };
    g.__coupRooms ??= new Map();
    this.rooms = g.__coupRooms;
  }
  async create(code: string, state: PartyState) {
    if (this.rooms.has(code)) return false;
    this.rooms.set(code, structuredClone(state));
    return true;
  }
  async get(code: string) {
    const s = this.rooms.get(code);
    return s ? structuredClone(s) : null;
  }
  async cas(code: string, expectedVersion: number, state: PartyState) {
    const cur = this.rooms.get(code);
    if (!cur || cur.version !== expectedVersion) return false;
    this.rooms.set(code, structuredClone(state));
    return true;
  }
}

let store: RoomStore | null = null;

/** Derive Upstash REST credentials from a rediss://default:TOKEN@host.upstash.io TCP URL. */
function fromRedisUrl(): { url: string; token: string } | null {
  const raw = process.env.REDIS_URL ?? process.env.KV_URL ?? process.env.UPSTASH_REDIS_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!u.hostname.endsWith(".upstash.io") || !u.password) return null;
    return { url: `https://${u.hostname}`, token: u.password };
  } catch {
    return null;
  }
}

/** Upstash REST credentials, however they were provided. Null when running on the in-memory store. */
export function redisRestCreds(): { url: string; token: string } | null {
  const derived = fromRedisUrl();
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? derived?.url;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? derived?.token;
  return url && token ? { url, token } : null;
}

export function getStore(): RoomStore {
  if (store) return store;
  const creds = redisRestCreds();
  if (creds) {
    store = new RedisStore(new Redis(creds));
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[coup] No Redis configured — falling back to in-memory rooms. " +
          "Set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN for production."
      );
    }
    store = new MemoryStore();
  }
  return store;
}
