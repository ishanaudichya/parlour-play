import { NextResponse } from "next/server";
import { cleanName, jsonError, mutateParty, newPlayerId, newSecret } from "@/lib/api";
import { joinParty } from "@/lib/party/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const name = cleanName(body.name);
  if (!name) return jsonError("Enter a name.");

  const playerId = newPlayerId();
  const secret = newSecret();
  const result = await mutateParty(code.toUpperCase(), (state) => {
    joinParty(state, name, { playerId, secret });
  });
  if ("error" in result) return jsonError(result.error, result.status);
  return NextResponse.json({ code: result.state.code, playerId, secret });
}
