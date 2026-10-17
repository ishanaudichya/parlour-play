/* Bluff palette: Indian truck art at night — a midnight-blue body, glossy
   enamel in every colour the painter had, cream panels, gold trim and the
   evil eye watching from every card back. */

export const NIGHT = "#0c1c3d";
export const NIGHT_DEEP = "#081430";
export const CREAM = "#fff4dc";
export const CREAM_EDGE = "#ead9b4";
export const INK = "#1b1233";
export const GOLD = "#f2c14e";
export const PINK = "#d81f6c";
export const CHILLI = "#e0352b";
export const LEAF = "#22a35a";
export const TEAL = "#16a3b4";
export const MARIGOLD = "#f5a524";
export const TEXT = "#fff4dc";
export const TEXT_2 = "rgba(255,244,220,0.7)";
export const TEXT_3 = "rgba(255,244,220,0.45)";
export const LINE = "rgba(255,244,220,0.14)";
export const SURFACE = "rgba(255,244,220,0.06)";
export const SWIFT = [0.16, 1, 0.3, 1] as const;

/** One enamel per seat. */
export const ENAMELS = ["#f5a524", "#e0352b", "#22a35a", "#d81f6c", "#16a3b4", "#ff7a1a", "#8a5cf6", "#c9d43a"];
export const enamelOf = (seat: number) => ENAMELS[seat % ENAMELS.length];

/** Suits in two paints: red hearts and diamonds, ink spades and clubs. */
export const suitPaint = (s: string) => (s === "H" || s === "D" ? CHILLI : INK);

/** Painted lettering: an ink outline and a hard drop shadow, as on a tailgate. */
export const lettering = (depth = 3) => `${depth}px ${depth}px 0 ${INK}, -1px -1px 0 ${INK}, 1px -1px 0 ${INK}, -1px 1px 0 ${INK}, 1px 1px 0 ${INK}`;

/** A row of scalloped fringe (jhalar) in alternating enamels, as CSS. */
export const JHALAR = `radial-gradient(circle at 50% 0, ${MARIGOLD} 0 7px, transparent 7.5px) 0 0 / 16px 9px repeat-x, radial-gradient(circle at 50% 0, ${PINK} 0 7px, transparent 7.5px) 8px 0 / 16px 9px repeat-x`;
