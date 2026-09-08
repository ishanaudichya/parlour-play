/* The board's headline face. Rozha One — a high-contrast display serif with
   Devanagari roots, a nod to Pachisi, the game Ludo grew out of. Nothing
   else on the platform uses it. */

import { Rozha_One } from "next/font/google";

export const rozha = Rozha_One({ weight: "400", subsets: ["latin"], display: "swap" });
