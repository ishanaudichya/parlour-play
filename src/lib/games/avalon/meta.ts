import type { AvalonFaction, AvalonRole } from "./types";

export const factionOf = (role: AvalonRole): AvalonFaction =>
  role === "assassin" || role === "morgana" || role === "minion" ? "evil" : "good";

/** Display metadata — safe for client import (no engine code). */
export const ROLE_META: Record<
  AvalonRole,
  { title: string; faction: AvalonFaction; color: string; blurb: string }
> = {
  merlin: {
    title: "Merlin",
    faction: "good",
    color: "#8fb8de",
    blurb: "You see the servants of Mordred — but if the Assassin names you, all is lost.",
  },
  percival: {
    title: "Percival",
    faction: "good",
    color: "#d6c389",
    blurb: "Two figures stand before you. One is Merlin, one is Morgana. Guard the right one.",
  },
  servant: {
    title: "Loyal Servant of Arthur",
    faction: "good",
    color: "#a9c6e2",
    blurb: "You know nothing but your loyalty. Send true companions and succeed three quests.",
  },
  assassin: {
    title: "The Assassin",
    faction: "evil",
    color: "#e0556d",
    blurb: "Fail the quests — and should good prevail, one dagger throw can still end Merlin.",
  },
  morgana: {
    title: "Morgana",
    faction: "evil",
    color: "#b06bd4",
    blurb: "You appear as Merlin to Percival. Wear the disguise well and poison their trust.",
  },
  minion: {
    title: "Minion of Mordred",
    faction: "evil",
    color: "#c2564a",
    blurb: "You know your fellow conspirators. Sabotage quests without drawing the room's eye.",
  },
};

export const FACTION_META: Record<AvalonFaction, { title: string; color: string }> = {
  good: { title: "Loyal Servants of Arthur", color: "#8fb8de" },
  evil: { title: "Minions of Mordred", color: "#e0556d" },
};
