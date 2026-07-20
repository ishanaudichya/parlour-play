import type { CoupView } from "@/lib/games/coup/types";

/** Mirror of the engine's responder logic, computed on the redacted view. */
export function clientResponders(v: CoupView): string[] {
  const p = v.pending;
  if (!p || v.lose || v.phase !== "play") return [];
  const alive = v.players.filter((x) => x.alive);
  let eligible: string[];
  if (p.stage === "action_window") {
    eligible = alive.filter((x) => x.id !== p.actor).map((x) => x.id);
  } else if (p.stage === "block_window") {
    if (p.type === "foreign_aid") {
      eligible = alive.filter((x) => x.id !== p.actor).map((x) => x.id);
    } else {
      const t = v.players.find((x) => x.id === p.target);
      eligible = t && t.alive ? [t.id] : [];
    }
  } else if (p.stage === "block_challenge_window") {
    eligible = alive.filter((x) => x.id !== p.block!.blocker).map((x) => x.id);
  } else {
    eligible = [];
  }
  return eligible.filter((id) => !p.passed.includes(id));
}
