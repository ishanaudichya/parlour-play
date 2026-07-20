import type { MafiaRole, MafiaTeam } from "./types";

export const ROLE_META: Record<
  MafiaRole,
  { title: string; team: MafiaTeam; color: string; description: string; symbol: string }
> = {
  mafia: {
    title: "Mafia",
    team: "mafia",
    color: "#d35d6e",
    description: "Conspire at night. Reach parity with the town.",
    symbol: "◆",
  },
  detective: {
    title: "Detective",
    team: "town",
    color: "#75b9d6",
    description: "Investigate one player each night.",
    symbol: "⌕",
  },
  doctor: {
    title: "Doctor",
    team: "town",
    color: "#79c99e",
    description: "Protect one player each night, but not the same player twice in a row.",
    symbol: "✚",
  },
  villager: {
    title: "Villager",
    team: "town",
    color: "#d9c9aa",
    description: "Read the room, discuss, and vote out the Mafia.",
    symbol: "●",
  },
};

export const teamFor = (role: MafiaRole): MafiaTeam => (role === "mafia" ? "mafia" : "town");
