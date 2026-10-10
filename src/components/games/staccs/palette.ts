/* STACCS palette: a cobalt table, white enamel cubes, the classic red and
   ink suits, and one electric cyan that means "this matches". */

import type { Suit } from "@/lib/games/staccs/types";

export const PAGE = "#0b1a4a";
export const TABLE = "#1b3fae";
export const TABLE_HI = "#2a57d6";
export const GRID = "rgba(255,255,255,0.07)";
export const INK = "#0b1433";
export const TEXT = "#f1f5ff";
export const TEXT_2 = "rgba(241,245,255,0.72)";
export const TEXT_3 = "rgba(241,245,255,0.45)";
export const LINE = "rgba(255,255,255,0.12)";
export const SURFACE = "rgba(9,22,70,0.72)";
export const SURFACE_2 = "rgba(255,255,255,0.06)";
export const CYAN = "#3ee6ff";
export const DANGER = "#ff5a6a";
export const GOLD = "#ffd24a";

/** cube faces, lit from above: top brightest */
export const CUBE = { top: "#ffffff", face: "#eef1f8", side: "#dde3ee", edge: "#c3cbdb", line: "#b9c2d6" };
export const WILD = { top: "#5b8dff", face: "#3a6cf0", side: "#2a56d4", edge: "#1d3fa8", line: "#7aa4ff" };

export const SUIT_COLOR: Record<Suit, string> = { S: "#1c2233", H: "#e8364a", C: "#1c2233", D: "#e8364a" };
/** the pale print of the suit on a top */
export const SUIT_TINT: Record<Suit, string> = { S: "#d3d8e4", H: "#ffd2d7", C: "#d3d8e4", D: "#ffd2d7" };
export const SUIT_NAME: Record<Suit, string> = { S: "Spades", H: "Hearts", C: "Clubs", D: "Diamonds" };

export const SEAT_COLORS = ["#ff6b6b", "#ffd24a", "#5cf2a4", "#3ee6ff", "#c58cff", "#ff9a4a", "#ff7ad9", "#a3e635"];
export const SWIFT = [0.16, 1, 0.3, 1] as const;
