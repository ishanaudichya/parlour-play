import { NextResponse } from "next/server";
import { auth, jsonError, mutateParty, viewFor } from "@/lib/api";
import { applyPartyMove, type Registry } from "@/lib/party/engine";
import { REGISTRY } from "@/lib/games/registry";
import type { PartyMove } from "@/lib/party/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const body = (await req.json().catch(() => null)) as PartyMove | null;
  if (!body || (body.kind !== "party" && body.kind !== "game")) return jsonError("Invalid move.");

  let viewerId: string | null = null;
  const result = await mutateParty(code.toUpperCase(), (state, now) => {
    const m = auth(req, state);
    if (!m) throw Object.assign(new Error("unauthorized"), { unauthorized: true });
    viewerId = m.id;
    applyPartyMove(state, m.id, body, now, Math.random, REGISTRY as Registry);
  }).catch((e) => {
    if (e && typeof e === "object" && "unauthorized" in e)
      return { error: "You are not in this party.", status: 401 as const };
    throw e;
  });

  if ("error" in result) return jsonError(result.error, result.status);
  return NextResponse.json({ v: result.state.version, view: viewFor(result.state, viewerId!) });
}
