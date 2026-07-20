import { NextResponse } from "next/server";
import { auth, jsonError, readParty, viewFor } from "@/lib/api";
import type { PartyPreview } from "@/lib/party/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const state = await readParty(code.toUpperCase());
  if (!state) return jsonError("Party not found — it may have expired.", 404);

  const viewer = auth(req, state);
  if (!viewer) {
    const preview: PartyPreview = {
      code: state.code,
      phase: state.phase,
      memberCount: state.members.length,
      names: state.members.map((m) => m.name),
      game: state.game?.type ?? null,
    };
    return NextResponse.json({ preview });
  }

  const url = new URL(req.url);
  const since = Number(url.searchParams.get("v") ?? 0);
  if (since && since === state.version) {
    return NextResponse.json({ v: state.version, unchanged: true });
  }
  return NextResponse.json({ v: state.version, view: viewFor(state, viewer.id) });
}
