/* The ministry's two voices: Oswald — condensed poster capitals for
   proclamations and stamps — and Special Elite, a worn typewriter face for
   dossiers and the record. Deliberately unlike every other face on the
   platform; body copy stays on the default sans. */

import { Oswald, Special_Elite } from "next/font/google";

export const oswald = Oswald({ subsets: ["latin"], display: "swap" });
export const typewriter = Special_Elite({ weight: "400", subsets: ["latin"], display: "swap" });
