/* The cabinet headline face. Bungee is deliberately unlike anything else on
   the platform (UNO already owns Baloo 2) — fat, upright, arcade signage. */

import { Bungee } from "next/font/google";

export const bungee = Bungee({ weight: "400", subsets: ["latin"], display: "swap" });
