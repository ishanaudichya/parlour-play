import type { ActionType, Character } from "./types";

export interface CharacterInfo {
  name: string;
  color: string; // main tint
  deep: string; // dark backdrop
  bright: string; // highlight
  power: string;
  counter: string;
}

export const CHARACTER_INFO: Record<Character, CharacterInfo> = {
  duke: {
    name: "Duke",
    color: "#8d6fc7",
    deep: "#241b3a",
    bright: "#c3a9ef",
    power: "Tax — take 3 coins",
    counter: "Blocks foreign aid",
  },
  assassin: {
    name: "Assassin",
    color: "#7086ad",
    deep: "#141a2b",
    bright: "#a9bdde",
    power: "Assassinate for 3 coins",
    counter: "",
  },
  captain: {
    name: "Captain",
    color: "#3f9e9a",
    deep: "#0d2726",
    bright: "#7fd4cd",
    power: "Steal 2 coins",
    counter: "Blocks stealing",
  },
  ambassador: {
    name: "Ambassador",
    color: "#98a655",
    deep: "#222611",
    bright: "#cbd88a",
    power: "Exchange with the deck",
    counter: "Blocks stealing",
  },
  contessa: {
    name: "Contessa",
    color: "#c25a6c",
    deep: "#2c1017",
    bright: "#eb92a1",
    power: "",
    counter: "Blocks assassination",
  },
};

export interface ActionInfo {
  label: string;
  short: string;
  cost: number;
  gain?: number;
  claim?: Character;
  blockedBy: Character[];
  needsTarget: boolean;
  blurb: string;
}

export const ACTION_INFO: Record<ActionType, ActionInfo> = {
  income: {
    label: "Income",
    short: "+1",
    cost: 0,
    gain: 1,
    blockedBy: [],
    needsTarget: false,
    blurb: "Take 1 coin. Unstoppable.",
  },
  foreign_aid: {
    label: "Foreign Aid",
    short: "+2",
    cost: 0,
    gain: 2,
    blockedBy: ["duke"],
    needsTarget: false,
    blurb: "Take 2 coins. Any Duke may block.",
  },
  coup: {
    label: "Coup",
    short: "−7",
    cost: 7,
    blockedBy: [],
    needsTarget: true,
    blurb: "Pay 7. Target loses an influence. Unstoppable.",
  },
  tax: {
    label: "Tax",
    short: "+3",
    cost: 0,
    gain: 3,
    claim: "duke",
    blockedBy: [],
    needsTarget: false,
    blurb: "Claim Duke. Take 3 coins.",
  },
  assassinate: {
    label: "Assassinate",
    short: "−3",
    cost: 3,
    claim: "assassin",
    blockedBy: ["contessa"],
    needsTarget: true,
    blurb: "Claim Assassin. Pay 3 — target loses an influence.",
  },
  steal: {
    label: "Steal",
    short: "+2",
    cost: 0,
    claim: "captain",
    blockedBy: ["captain", "ambassador"],
    needsTarget: true,
    blurb: "Claim Captain. Take 2 coins from a target.",
  },
  exchange: {
    label: "Exchange",
    short: "⇄",
    cost: 0,
    claim: "ambassador",
    blockedBy: [],
    needsTarget: false,
    blurb: "Claim Ambassador. Swap cards with the deck.",
  },
};

