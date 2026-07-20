import { NextResponse } from "next/server";
import { cleanName, jsonError, newPartyCode, newPlayerId, newSecret } from "@/lib/api";
import { createParty } from "@/lib/party/engine";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = cleanName(body.name);
  if (!name) return jsonError("Enter a name.");

  const store = getStore();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newPartyCode();
    const playerId = newPlayerId();
    const secret = newSecret();
    const state = createParty(code, name, { playerId, secret }, Date.now());
    if (await store.create(code, state)) {
      return NextResponse.json({ code, playerId, secret });
    }
  }
  return jsonError("Could not allocate a party. Try again.", 503);
}
