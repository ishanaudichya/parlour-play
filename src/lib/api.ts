import { customAlphabet, nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { MoveError } from "./games/types";
import { REGISTRY } from "./games/registry";
import { redactParty, tickParty } from "./party/engine";
import type { PartyState } from "./party/types";
import { publishChange } from "./realtime";
import { getStore } from "./store";

export const newPartyCode = customAlphabet("ABCDEFGHJKMNPQRSTVWXYZ23456789", 5);
export const newPlayerId = () => nanoid(10);
export const newSecret = () => nanoid(24);

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ").slice(0, 16);
  return name.length >= 1 ? name : null;
}

export function auth(req: Request, state: PartyState) {
  const id = req.headers.get("x-player-id");
  const secret = req.headers.get("x-player-secret");
  if (!id || !secret) return null;
  const m = state.members.find((x) => x.id === id);
  return m && m.secret === secret ? m : null;
}

/**
 * Read → tick (expire timers) → mutate → CAS-write, retrying on version races.
 * Publishes a change signal after every successful write.
 * `fn` may throw MoveError for user-facing validation failures.
 */
export async function mutateParty(
  code: string,
  fn: (state: PartyState, now: number) => void
): Promise<{ state: PartyState } | { error: string; status: number }> {
  const store = getStore();
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await store.get(code);
    if (!state) return { error: "Party not found — it may have expired.", status: 404 };
    const expected = state.version;
    const now = Date.now();
    tickParty(state, now, Math.random, REGISTRY);
    try {
      fn(state, now);
    } catch (e) {
      if (e instanceof MoveError) return { error: e.message, status: 409 };
      throw e;
    }
    state.version = expected + 1;
    state.updatedAt = now;
    if (await store.cas(code, expected, state)) {
      publishChange(code, state.version);
      return { state };
    }
  }
  return { error: "The party is busy — try again.", status: 503 };
}

/** Read the party, applying (and best-effort persisting) any expired timers. */
export async function readParty(code: string): Promise<PartyState | null> {
  const store = getStore();
  const state = await store.get(code);
  if (!state) return null;
  const now = Date.now();
  if (tickParty(state, now, Math.random, REGISTRY)) {
    const expected = state.version;
    state.version = expected + 1;
    state.updatedAt = now;
    if (await store.cas(code, expected, state)) {
      publishChange(code, state.version);
      return state;
    }
    const fresh = await store.get(code);
    return fresh ?? state;
  }
  return state;
}

export function viewFor(state: PartyState, viewerId: string) {
  return redactParty(state, viewerId, Date.now(), REGISTRY);
}

export { MoveError, REGISTRY };
