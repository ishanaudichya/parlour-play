/* Monopoly Deal — "banknote ledger" design tokens.
   The CARDS stay cream paper (they pop on the table); the CHROME around them
   is a deep casino-table green-black with cream ink and brightened accents. */

import { Archivo_Black, Libre_Franklin } from "next/font/google";

export const franklin = Libre_Franklin({ subsets: ["latin"] });
export const archivo = Archivo_Black({ weight: "400", subsets: ["latin"] });

/* ---- card-face palette (light, unchanged) ---- */
export const PAPER = "#f4efe4";
export const PAPER_DEEP = "#ebe2cc";
export const CARD_FACE = "#faf6ea";
export const INK = "#211c12";
export const INK_SOFT = "#756b52";
export const GREEN = "#1d7a53";
export const GREEN_DEEP = "#14573c";
export const COPPER = "#b0662f";
export const RED = "#a8342a";
export const LINE = "rgba(33,28,18,0.16)";
export const LINE_SOFT = "rgba(33,28,18,0.09)";

/* ---- dark chrome (the table around the cards) ---- */
export const TABLE_BG = "radial-gradient(130% 100% at 50% -10%, #1a2820 0%, #121b16 45%, #0b100d 100%)";
export const VIGNETTE = "radial-gradient(140% 140% at 50% 40%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)";
/** primary chrome ink on dark */
export const CHROME = "#f0ead9";
export const CHROME_SOFT = "rgba(240,234,217,0.58)";
export const CHROME_FAINT = "rgba(240,234,217,0.36)";
export const HAIRLINE = "rgba(240,234,217,0.14)";
export const HAIRLINE_SOFT = "rgba(240,234,217,0.08)";
/** translucent ledger panel */
export const PANEL = "rgba(19,26,21,0.8)";
export const PANEL_SOLID = "#131a15";
/** accents brightened for dark contrast */
export const COPPER_HI = "#d98e4f";
export const GREEN_HI = "#3fae7f";
export const RED_HI = "#e0685a";

/** faint engraved guilloche, tiled */
export const GUILLOCHE = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><g fill='none' stroke='#1d7a53' stroke-width='0.55' opacity='0.13'><circle cx='30' cy='30' r='26'/><circle cx='90' cy='30' r='26'/><circle cx='30' cy='90' r='26'/><circle cx='90' cy='90' r='26'/><circle cx='60' cy='60' r='26'/><circle cx='0' cy='60' r='26'/><circle cx='120' cy='60' r='26'/><circle cx='60' cy='0' r='26'/><circle cx='60' cy='120' r='26'/></g></svg>`
)}")`;

/** the guilloche in light ink at very low opacity, for the dark table */
export const GUILLOCHE_DARK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><g fill='none' stroke='#f0ead9' stroke-width='0.55' opacity='0.05'><circle cx='30' cy='30' r='26'/><circle cx='90' cy='30' r='26'/><circle cx='30' cy='90' r='26'/><circle cx='90' cy='90' r='26'/><circle cx='60' cy='60' r='26'/><circle cx='0' cy='60' r='26'/><circle cx='120' cy='60' r='26'/><circle cx='60' cy='0' r='26'/><circle cx='60' cy='120' r='26'/></g></svg>`
)}")`;

/** denser engraving for card backs / seals */
export const GUILLOCHE_DENSE = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><g fill='none' stroke='#f4efe4' stroke-width='0.5' opacity='0.22'><circle cx='16' cy='16' r='14'/><circle cx='48' cy='16' r='14'/><circle cx='16' cy='48' r='14'/><circle cx='48' cy='48' r='14'/><circle cx='32' cy='32' r='14'/></g></svg>`
)}")`;

/** banknote accent per denomination */
export function moneyAccent(value: number): string {
  switch (value) {
    case 1:
      return "#6f7d62";
    case 2:
      return "#4f7d9c";
    case 3:
      return "#1d7a53";
    case 4:
      return "#8a5a8f";
    case 5:
      return "#b0662f";
    default:
      return "#8f2f3f"; // $10
  }
}

export const fmtM = (n: number) => `$${n}M`;
