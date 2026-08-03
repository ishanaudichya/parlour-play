/* The Camelot display face. Uncial Antiqua is deliberately unlike every other
   face on the platform — an insular medieval hand for an illuminated
   manuscript. Body copy stays on the default sans. */

import { Uncial_Antiqua } from "next/font/google";

export const uncial = Uncial_Antiqua({ weight: "400", subsets: ["latin"], display: "swap" });
