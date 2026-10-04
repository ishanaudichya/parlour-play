/* The armoury. Metadata only — what each weapon is called, what it promises,
   how hard it hits — safe for the client. What each one actually DOES lives
   in sim.ts, keyed by the same id. */

export const WEAPON_IDS = [
  "shell",
  "howitzer",
  "sun",
  "trident",
  "fan",
  "hydra",
  "mirv",
  "cluster",
  "daisy",
  "roller",
  "pinball",
  "tunneler",
  "sinkhole",
  "lance",
  "prism",
  "napalm",
  "acid",
  "thunder",
  "airraid",
  "meteors",
  "skyspear",
  "singularity",
  "tremor",
  "volcano",
  "mudpie",
  "rampart",
  "blink",
  "seeker",
  "boomerang",
  "buzzsaw",
  "fireworks",
  "gatling",
  "jackhammer",
  "twister",
] as const;

export type WeaponId = (typeof WEAPON_IDS)[number];

export type WeaponFamily = "blast" | "scatter" | "ground" | "beam" | "sky" | "chaos" | "utility";

export interface WeaponMeta {
  name: string;
  /** one line for the draft card */
  blurb: string;
  family: WeaponFamily;
  /** 0–5 — how much it tends to score, for the card pips and the auto-drafter */
  punch: number;
  /** signature colour for its icon and its card */
  hue: string;
}

export const WEAPONS: Record<WeaponId, WeaponMeta> = {
  shell: { name: "Field Shell", blurb: "Plain, honest high explosive.", family: "blast", punch: 2, hue: "#d9a35b" },
  howitzer: { name: "Howitzer", blurb: "A heavier shell and a deeper crater.", family: "blast", punch: 3, hue: "#e07b39" },
  sun: { name: "Little Sun", blurb: "A pocket star. Mind the mushroom.", family: "blast", punch: 5, hue: "#ffd34d" },
  trident: { name: "Trident", blurb: "Three shells, fanned tight.", family: "scatter", punch: 3, hue: "#7fc8ff" },
  fan: { name: "Fan of Five", blurb: "Five shells spread like a hand of cards.", family: "scatter", punch: 3, hue: "#5aa9e6" },
  hydra: { name: "Hydra", blurb: "Splits into three heads at the top of its arc.", family: "scatter", punch: 4, hue: "#59d68c" },
  mirv: { name: "Starfall", blurb: "Peaks, then lets six warheads rain down.", family: "scatter", punch: 4, hue: "#b388ff" },
  cluster: { name: "Cluster Bomb", blurb: "Lands, bursts, and flings six bomblets.", family: "scatter", punch: 3, hue: "#ff8f5a" },
  daisy: { name: "Firecracker", blurb: "A string of pops marching along the ground.", family: "ground", punch: 3, hue: "#ff5d5d" },
  roller: { name: "Roller", blurb: "Lands, then rolls downhill until it finds you.", family: "ground", punch: 3, hue: "#c9c2b0" },
  pinball: { name: "Pinball", blurb: "Bounces five times, popping on every hit.", family: "ground", punch: 3, hue: "#e8e8f0" },
  tunneler: { name: "Mole", blurb: "Burrows through the hill, then goes off.", family: "ground", punch: 3, hue: "#b07d4f" },
  sinkhole: { name: "Sinkhole", blurb: "Drills down and pulls the floor out.", family: "ground", punch: 3, hue: "#8f6a46" },
  lance: { name: "Sun Lance", blurb: "A straight beam. Ignores gravity, wind and hills.", family: "beam", punch: 3, hue: "#ff4f6d" },
  prism: { name: "Prism", blurb: "A laser that ricochets off the ground.", family: "beam", punch: 3, hue: "#62f0ff" },
  napalm: { name: "Napalm", blurb: "Sticky fire that runs downhill and burns.", family: "chaos", punch: 4, hue: "#ff7a1a" },
  acid: { name: "Acid Rain", blurb: "Bursts into a cloud that rains corrosion.", family: "sky", punch: 3, hue: "#9bff3a" },
  thunder: { name: "Thunderclap", blurb: "Summons a storm. Lightning seeks steel.", family: "sky", punch: 4, hue: "#8fb8ff" },
  airraid: { name: "Air Raid", blurb: "Mark the spot; a bomber does the rest.", family: "sky", punch: 4, hue: "#c7d36f" },
  meteors: { name: "Meteor Call", blurb: "Eight rocks out of a clear sky.", family: "sky", punch: 4, hue: "#ff9d5c" },
  skyspear: { name: "Sky Spear", blurb: "Paints a target for the satellite.", family: "beam", punch: 4, hue: "#6fd3ff" },
  singularity: { name: "Singularity", blurb: "Swallows the ground and drags tanks in.", family: "chaos", punch: 4, hue: "#a35bff" },
  tremor: { name: "Tremor", blurb: "Shakes the whole range. Everyone feels it.", family: "chaos", punch: 3, hue: "#c4a46b" },
  volcano: { name: "Volcano", blurb: "Raises a cone, then spits lava.", family: "chaos", punch: 4, hue: "#ff4a2a" },
  mudpie: { name: "Mud Pie", blurb: "A ball of earth. Bury, block, rebuild.", family: "utility", punch: 0, hue: "#a07a50" },
  rampart: { name: "Rampart", blurb: "Throws up a wall where it lands.", family: "utility", punch: 0, hue: "#9c8f7a" },
  blink: { name: "Blink Drive", blurb: "Teleports your tank to where it lands.", family: "utility", punch: 0, hue: "#59fff0" },
  seeker: { name: "Seeker", blurb: "Peaks, locks on, and steers itself home.", family: "blast", punch: 4, hue: "#ff6262" },
  boomerang: { name: "Boomerang", blurb: "Curls back toward you mid-flight.", family: "blast", punch: 3, hue: "#f2c14e" },
  buzzsaw: { name: "Buzzsaw", blurb: "Lands spinning and grinds a trench.", family: "ground", punch: 3, hue: "#d8dde6" },
  fireworks: { name: "Fireworks", blurb: "Bursts into fourteen falling stars.", family: "scatter", punch: 3, hue: "#ff6bd6" },
  gatling: { name: "Gatling", blurb: "Twelve rounds, as fast as it can spin.", family: "scatter", punch: 3, hue: "#ffe066" },
  jackhammer: { name: "Jackhammer", blurb: "Bounces in place, digging deeper each time.", family: "ground", punch: 3, hue: "#9aa3ad" },
  twister: { name: "Twister", blurb: "A tornado that tosses tanks aside.", family: "chaos", punch: 3, hue: "#bcd4e6" },
};

export const isWeapon = (id: unknown): id is WeaponId => typeof id === "string" && id in WEAPONS;
