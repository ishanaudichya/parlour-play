/* Pocket Tanks' faces. Black Ops One — stencilled, painted-on-steel, the
   lettering on an ammo crate — for everything that shouts; Share Tech Mono
   for the console readouts. Nothing else on the platform uses either. */

import { Black_Ops_One, Share_Tech_Mono } from "next/font/google";

export const stencil = Black_Ops_One({ weight: "400", subsets: ["latin"], display: "swap" });
export const mono = Share_Tech_Mono({ weight: "400", subsets: ["latin"], display: "swap" });
