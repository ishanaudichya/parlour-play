/* Pocket Tanks palette: four enamel tank paints, four battlefields, and the
   army-surplus console the controls are bolted into. */

import type { Biome, TankColor } from "@/lib/games/tanks/types";

export const TANK: Record<TankColor, { base: string; light: string; deep: string; label: string }> = {
  red: { base: "#e5483a", light: "#ff9a7e", deep: "#7e1b14", label: "Crimson" },
  blue: { base: "#3a82e6", light: "#9cc8ff", deep: "#15386f", label: "Cobalt" },
  lime: { base: "#7cc63a", light: "#cbf28a", deep: "#335d10", label: "Lime" },
  gold: { base: "#f0aa2c", light: "#ffdc8a", deep: "#7c4f08", label: "Brass" },
};

export interface BiomePaint {
  label: string;
  /** sky, top → horizon */
  sky: string[];
  /** far hills, back → front */
  hills: [string, string];
  /** rock strata, surface → depth */
  strata: string[];
  /** the bright crust along the surface, and the shadow under it */
  lip: string;
  lipDark: string;
  /** flecks in the rock */
  fleck: string;
  /** colour of flying dirt */
  debris: string[];
  /** what drifts through the air */
  ambient: "dust" | "snow" | "ember" | "none";
  /** room glow behind the battlefield frame */
  room: string;
}

export const BIOME: Record<Biome, BiomePaint> = {
  mesa: {
    label: "Red Mesa",
    sky: ["#170d31", "#3d1a52", "#932f5c", "#e5664b", "#ffbd73"],
    hills: ["#4b1f45", "#6e2d45"],
    strata: ["#e09257", "#cf7444", "#bb5c3b", "#a24a36", "#843a31", "#632d2c", "#4a2427"],
    lip: "#ffc98a",
    lipDark: "#6e321f",
    fleck: "#ffd9a8",
    debris: ["#d98549", "#b85a38", "#8a3d2c", "#f0b07a"],
    ambient: "dust",
    room: "#5a2140",
  },
  tundra: {
    label: "Polar Night",
    sky: ["#040919", "#0a1834", "#132b52", "#244a73", "#4e7d9f"],
    hills: ["#152742", "#1f3a5e"],
    strata: ["#93aec6", "#7892ac", "#637b95", "#50667e", "#3f5268", "#304053", "#232f3e"],
    lip: "#f6faff",
    lipDark: "#8ea7c4",
    fleck: "#e4f1ff",
    debris: ["#e9f2ff", "#9db6cf", "#6c849e", "#ffffff"],
    ambient: "snow",
    room: "#10284a",
  },
  ashlands: {
    label: "The Ashlands",
    sky: ["#0b0405", "#230909", "#4f160f", "#982f17", "#e15a24"],
    hills: ["#1a0808", "#2a0e0b"],
    strata: ["#3d302d", "#332826", "#2b2220", "#241c1b", "#1e1817", "#181313", "#120e0e"],
    lip: "#6b4c42",
    lipDark: "#120c0b",
    fleck: "#ff7a2a",
    debris: ["#3a2c28", "#1f1716", "#ff6a1a", "#5a4038"],
    ambient: "ember",
    room: "#4a1208",
  },
  lunar: {
    label: "Sea of Tranquility",
    sky: ["#000004", "#02030b", "#050915", "#0a0f20", "#121a2e"],
    hills: ["#25272e", "#34373f"],
    strata: ["#c4c4c8", "#adadb2", "#98989e", "#84848a", "#707076", "#5c5c62", "#48484e"],
    lip: "#ececf0",
    lipDark: "#5c5c64",
    fleck: "#ffffff",
    debris: ["#cfcfd4", "#9a9aa0", "#6e6e74", "#e6e6ea"],
    ambient: "none",
    room: "#1b2236",
  },
};

/* ---------------- the console ---------------- */

export const ROOM = "#0d0f0b";
export const PANEL = "#2b2f25";
export const PANEL_HI = "#3d4234";
export const PANEL_LO = "#171a12";
export const PAINT = "#e8e0c4";
export const PAINT_SOFT = "rgba(232,224,196,0.62)";
export const PAINT_FAINT = "rgba(232,224,196,0.34)";
export const AMBER = "#ffb84a";
export const AMBER_DIM = "rgba(255,184,74,0.22)";
export const HAZARD = "#f2b134";
export const DANGER = "#ff5a45";
export const SWIFT = [0.16, 1, 0.3, 1] as const;

/** a steel plate: brushed olive with a hard top highlight */
export const plate = (hi = PANEL_HI, lo = PANEL) =>
  `linear-gradient(180deg, ${hi} 0%, ${lo} 55%, ${PANEL_LO} 100%)`;

/** hazard tape */
export const HAZARD_STRIPES = `repeating-linear-gradient(135deg, ${HAZARD} 0 7px, #1a1a14 7px 14px)`;

/* ---------------- the quiet chrome ---------------- */

export const SURFACE = "#16181b";
export const SURFACE_2 = "#1e2125";
export const LINE = "rgba(255,255,255,0.08)";
export const TEXT = "#ece7da";
export const TEXT_2 = "rgba(236,231,218,0.66)";
export const TEXT_3 = "rgba(236,231,218,0.4)";
export const PAGE = "#0e0f11";
