import type { SHParty, SHPower, SHRole } from "./types";

/** Party membership card — Hitler carries a FASCIST card. */
export const partyOf = (role: SHRole): SHParty => (role === "liberal" ? "liberal" : "fascist");

/** Display metadata — safe for client import (no engine code). */
export const ROLE_META: Record<SHRole, { title: string; party: SHParty; color: string; blurb: string }> = {
  liberal: {
    title: "Liberal",
    party: "liberal",
    color: "#3e6478",
    blurb: "Enact five liberal policies, or put a bullet in Hitler. You know nothing — vote carefully.",
  },
  fascist: {
    title: "Fascist",
    party: "fascist",
    color: "#d4491f",
    blurb: "You know your conspirators and you know Hitler. Push fascist policies and shield his name.",
  },
  hitler: {
    title: "Hitler",
    party: "fascist",
    color: "#1c1712",
    blurb: "Play the moderate. Once three fascist policies stand, winning the chancellorship wins the war.",
  },
};

export const PARTY_META: Record<SHParty, { title: string; color: string }> = {
  liberal: { title: "The Liberals", color: "#3e6478" },
  fascist: { title: "The Fascists", color: "#d4491f" },
};

export const POWER_META: Record<SHPower, { title: string; blurb: string }> = {
  peek: { title: "Policy Peek", blurb: "The President privately examines the top three policies." },
  investigate: {
    title: "Investigate Loyalty",
    blurb: "The President privately reads one player's party card. The result is theirs alone.",
  },
  special: {
    title: "Special Election",
    blurb: "The President appoints the next presidential candidate; rotation then resumes.",
  },
  execute: { title: "Execution", blurb: "The President executes a player. Their role stays hidden — unless it was Hitler." },
};
