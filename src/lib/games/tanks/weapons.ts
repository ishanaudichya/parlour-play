/* The armoury: Pocket Tanks' original 30 — the pack every version of the game
   ships with — under their own names, each with BlitWise's own one-line
   description. Metadata only, safe for the client; what each one actually
   DOES lives in sim.ts, keyed by the same id. */

export const WEAPON_IDS = [
  "single",
  "big",
  "three",
  "five",
  "jackhammer",
  "heatseeker",
  "tracer",
  "piledriver",
  "dirtmover",
  "crazyivan",
  "spider",
  "sniper",
  "magicwall",
  "dirtslinger",
  "zapper",
  "napalm",
  "hailstorm",
  "groundhog",
  "worm",
  "homingworm",
  "skipper",
  "chainreaction",
  "pineapple",
  "firecracker",
  "homingmissile",
  "dirtball",
  "tommygun",
  "mountainmover",
  "scattershot",
  "cruiser",
] as const;

export type WeaponId = (typeof WEAPON_IDS)[number];

export type WeaponFamily = "blast" | "scatter" | "ground" | "beam" | "chaos" | "utility";

export interface WeaponMeta {
  name: string;
  /** the official one-liner */
  blurb: string;
  family: WeaponFamily;
  /** 0–5 — how much it tends to score, for the card pips and the auto-drafter */
  punch: number;
  /** signature colour: its bullet, its icon, its card */
  hue: string;
}

export const WEAPONS: Record<WeaponId, WeaponMeta> = {
  single: { name: "Single Shot", blurb: "The default weapon, medium sized explosion and good points.", family: "blast", punch: 3, hue: "#ffe082" },
  big: { name: "Big Shot", blurb: "Large explosion radius, but points are low.", family: "blast", punch: 2, hue: "#ffb74d" },
  three: { name: "3 Shot", blurb: "3 bullet spread, medium explosion size, low points per explosion.", family: "scatter", punch: 3, hue: "#81d4fa" },
  five: { name: "5 Shot", blurb: "5 bullet spread, medium explosion size, very low points per explosion.", family: "scatter", punch: 3, hue: "#4fc3f7" },
  jackhammer: { name: "Jackhammer", blurb: "Bullet bounces straight up 5 times… lots of fun to use.", family: "ground", punch: 4, hue: "#ff8a65" },
  heatseeker: { name: "Heatseeker", blurb: "If the bullet gets close to the opponent's tank, it flies toward it.", family: "blast", punch: 3, hue: "#ff5252" },
  tracer: { name: "Tracer", blurb: "Fires a spread of 5 bullets that tell you how much to change your angle for the next turn.", family: "utility", punch: 0, hue: "#e0e0e0" },
  piledriver: { name: "Pile Driver", blurb: "Small amount of damage, but explosions are directed down creating a hole.", family: "ground", punch: 1, hue: "#bcaaa4" },
  dirtmover: { name: "Dirt Mover", blurb: "Directional dirt removal based on the angle when fired.", family: "utility", punch: 0, hue: "#a1887f" },
  crazyivan: { name: "Crazy Ivan", blurb: "Proximity-based multi-warhead with unusual yet fun results.", family: "chaos", punch: 3, hue: "#ea80fc" },
  spider: { name: "Spider", blurb: "Spider web effect that sprays the closest tank when it goes off.", family: "chaos", punch: 3, hue: "#f5f5f5" },
  sniper: { name: "Sniper Rifle", blurb: "No explosion radius, large points, throws the tank nicely, deadly.", family: "blast", punch: 4, hue: "#90a4ae" },
  magicwall: { name: "Magic Wall", blurb: "Vertical wall will grow where the bullet lands.", family: "utility", punch: 0, hue: "#b388ff" },
  dirtslinger: { name: "Dirt Slinger", blurb: "V-shape dirt effect based on location where bullet lands.", family: "utility", punch: 0, hue: "#8d6e63" },
  zapper: { name: "Zapper", blurb: "Laser beam emits from bullet if it gets close to tank.", family: "beam", punch: 3, hue: "#40c4ff" },
  napalm: { name: "Napalm", blurb: "Exploding liquid that covers and burns everything caught in its wake.", family: "chaos", punch: 4, hue: "#ff6d00" },
  hailstorm: { name: "Hail Storm", blurb: "Hundreds of bouncing ice pellets that flow along the ground.", family: "chaos", punch: 3, hue: "#b3e5fc" },
  groundhog: { name: "Ground Hog", blurb: "Ground weapon that tunnels through the dirt and explodes on other side.", family: "ground", punch: 3, hue: "#c0ca33" },
  worm: { name: "Worm", blurb: "Ground weapon that tunnels through dirt, but tries to dig upward.", family: "ground", punch: 3, hue: "#f48fb1" },
  homingworm: { name: "Homing Worm", blurb: "Same as worm, but stops when it passes under tank and rises upward.", family: "ground", punch: 4, hue: "#f06292" },
  skipper: { name: "Skipper", blurb: "Skips a number of times before exploding.", family: "ground", punch: 3, hue: "#80cbc4" },
  chainreaction: { name: "Chain Reaction", blurb: "Random explosions in the general area where the bullet landed.", family: "scatter", punch: 3, hue: "#ffca28" },
  pineapple: { name: "Pineapple", blurb: "Shell explodes when close to a tank, emitting a large number of tiny explosions.", family: "scatter", punch: 3, hue: "#d4e157" },
  firecracker: { name: "Firecracker", blurb: "Horizontal spread of explosions based on where the bullet lands.", family: "scatter", punch: 3, hue: "#ff1744" },
  homingmissile: { name: "Homing Missile", blurb: "Stops horizontal speed when it passes over a tank.", family: "blast", punch: 4, hue: "#ff7043" },
  dirtball: { name: "Dirtball", blurb: "Dirt forms where bullet lands.", family: "utility", punch: 0, hue: "#795548" },
  tommygun: { name: "Tommy Gun", blurb: "A very satisfying automatic machine gun-style weapon.", family: "scatter", punch: 3, hue: "#fff176" },
  mountainmover: { name: "Mountain Mover", blurb: "Explosion removes dirt, but takes no points from tank.", family: "utility", punch: 0, hue: "#d7ccc8" },
  scattershot: { name: "Scatter Shot", blurb: "5 bullets spread upward where bullet lands.", family: "scatter", punch: 3, hue: "#69f0ae" },
  cruiser: { name: "Cruiser", blurb: "Bullet 'cruises' along terrain for a few seconds before exploding.", family: "ground", punch: 3, hue: "#ffab40" },
};

export const isWeapon = (id: unknown): id is WeaponId => typeof id === "string" && id in WEAPONS;
