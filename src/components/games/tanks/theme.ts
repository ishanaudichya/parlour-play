/* The viewer's battlefield theme — a per-device preference, nothing the
   table shares. "auto" shows the map's own scenery. */

import type { Look } from "./palette";

export type TanksTheme = "auto" | Extract<Look, "classic" | "love" | "slate">;

export const THEMES: { id: TanksTheme; label: string; swatch: [string, string] }[] = [
  { id: "auto", label: "Scenic", swatch: ["#932f5c", "#e09257"] },
  { id: "classic", label: "Classic", swatch: ["#281447", "#46b33e"] },
  { id: "love", label: "Love", swatch: ["#ffb5cc", "#e2557f"] },
  { id: "slate", label: "Slate", swatch: ["#1a232e", "#5d6874"] },
];

const KEY = "tanks.theme";
const listeners = new Set<() => void>();
let cached: TanksTheme | null = null;

export function getTheme(): TanksTheme {
  if (cached) return cached;
  try {
    const v = localStorage.getItem(KEY);
    cached = THEMES.some((t) => t.id === v) ? (v as TanksTheme) : "auto";
  } catch {
    cached = "auto";
  }
  return cached;
}

export function setTheme(t: TanksTheme) {
  cached = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {}
  listeners.forEach((l) => l());
}

export function subscribeTheme(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const getThemeServer = (): TanksTheme => "auto";
