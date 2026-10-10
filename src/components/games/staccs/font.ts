/* STACCS' faces. Silkscreen — a blocky bitmap face — for every rank glyph
   and the headlines, echoing the deck's pixel numerals; Pixelify Sans for
   the friendlier bits of chrome. Nothing else on the platform uses either. */

import { Pixelify_Sans, Silkscreen } from "next/font/google";

export const pixel = Silkscreen({ weight: ["400", "700"], subsets: ["latin"], display: "swap" });
export const pixelSans = Pixelify_Sans({ weight: ["500", "600", "700"], subsets: ["latin"], display: "swap" });
