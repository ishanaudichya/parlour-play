/* Dots and Boxes palette: an engineer's notebook on a desk at night — cream
   paper, blue quad ruling, a red margin, and one ink per player. */

export const DESK = "#211c18";
export const PAPER = "#fbf7ec";
export const PAPER_EDGE = "#e9e1cc";
export const RULE = "rgba(80,130,200,0.18)";
export const RULE_MAJOR = "rgba(80,130,200,0.3)";
export const MARGIN = "rgba(214,70,70,0.45)";
export const PENCIL = "#2c2f3a";
export const TEXT = "#f4efe3";
export const TEXT_2 = "rgba(244,239,227,0.68)";
export const TEXT_3 = "rgba(244,239,227,0.42)";
export const LINE = "rgba(255,255,255,0.1)";
export const SURFACE = "rgba(255,255,255,0.05)";
export const SWIFT = [0.16, 1, 0.3, 1] as const;

/** One ink per seat: the colours of a decent pen case. */
export const INKS = [
  { ink: "#2457c5", name: "Blue" },
  { ink: "#d23a32", name: "Red" },
  { ink: "#16875a", name: "Green" },
  { ink: "#7b45b8", name: "Violet" },
  { ink: "#d97a14", name: "Orange" },
  { ink: "#0f8b93", name: "Teal" },
  { ink: "#cf3c86", name: "Pink" },
  { ink: "#6f4e2c", name: "Sepia" },
];

export const inkOf = (seat: number) => INKS[seat % INKS.length].ink;
