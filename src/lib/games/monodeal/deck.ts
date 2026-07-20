/* The exact 106-card Monopoly Deal deck. Every card instance gets a unique id. */

import {
  ACTION_META,
  COLOR_META,
  COLORS,
  type MonoActionKind,
  type MonoCard,
  type MonoColor,
} from "./types";

const STREETS: readonly [MonoColor, string][] = [
  ["brown", "Mediterranean Avenue"],
  ["brown", "Baltic Avenue"],
  ["light_blue", "Oriental Avenue"],
  ["light_blue", "Vermont Avenue"],
  ["light_blue", "Connecticut Avenue"],
  ["magenta", "St. Charles Place"],
  ["magenta", "States Avenue"],
  ["magenta", "Virginia Avenue"],
  ["orange", "St. James Place"],
  ["orange", "Tennessee Avenue"],
  ["orange", "New York Avenue"],
  ["red", "Kentucky Avenue"],
  ["red", "Indiana Avenue"],
  ["red", "Illinois Avenue"],
  ["yellow", "Atlantic Avenue"],
  ["yellow", "Ventnor Avenue"],
  ["yellow", "Marvin Gardens"],
  ["green", "Pacific Avenue"],
  ["green", "North Carolina Avenue"],
  ["green", "Pennsylvania Avenue"],
  ["dark_blue", "Park Place"],
  ["dark_blue", "Boardwalk"],
  ["railroad", "Reading Railroad"],
  ["railroad", "Pennsylvania Railroad"],
  ["railroad", "B. & O. Railroad"],
  ["railroad", "Short Line"],
  ["utility", "Electric Company"],
  ["utility", "Water Works"],
];

/** [denomination, copies] */
const MONEY: readonly [number, number][] = [
  [1, 6],
  [2, 5],
  [3, 3],
  [4, 3],
  [5, 2],
  [10, 1],
];

/** dual-color wildcards: [colorA, colorB, value] */
const DUAL_WILDS: readonly [MonoColor, MonoColor, number][] = [
  ["light_blue", "brown", 1],
  ["light_blue", "railroad", 4],
  ["dark_blue", "green", 4],
  ["railroad", "green", 4],
  ["utility", "railroad", 2],
  ["magenta", "orange", 2],
  ["magenta", "orange", 2],
  ["red", "yellow", 3],
  ["red", "yellow", 3],
];

/** [action, copies] */
const ACTIONS: readonly [MonoActionKind, number][] = [
  ["deal_breaker", 2],
  ["just_say_no", 3],
  ["pass_go", 10],
  ["forced_deal", 3],
  ["sly_deal", 3],
  ["debt_collector", 3],
  ["birthday", 3],
  ["house", 3],
  ["hotel", 2],
  ["double_rent", 2],
];

/** dual-color rent pairs, x2 each */
const RENT_PAIRS: readonly [MonoColor, MonoColor][] = [
  ["brown", "light_blue"],
  ["magenta", "orange"],
  ["red", "yellow"],
  ["green", "dark_blue"],
  ["railroad", "utility"],
];

/** Build the full 106-card deck, unshuffled. */
export function buildDeck(): MonoCard[] {
  const cards: MonoCard[] = [];
  let seq = 0;
  const id = () => `md${++seq}`;

  // money (20)
  for (const [value, copies] of MONEY)
    for (let i = 0; i < copies; i++) cards.push({ id: id(), kind: "money", value });

  // properties (28)
  for (const [color, name] of STREETS)
    cards.push({ id: id(), kind: "property", color, name, value: COLOR_META[color].value });

  // property wildcards (11)
  for (const [a, b, value] of DUAL_WILDS)
    cards.push({ id: id(), kind: "wild", colors: [a, b], value });
  for (let i = 0; i < 2; i++)
    cards.push({ id: id(), kind: "wild", colors: [...COLORS], value: 0 });

  // actions (34)
  for (const [action, copies] of ACTIONS)
    for (let i = 0; i < copies; i++)
      cards.push({ id: id(), kind: "action", action, value: ACTION_META[action].value });

  // rent (13)
  for (const [a, b] of RENT_PAIRS)
    for (let i = 0; i < 2; i++)
      cards.push({ id: id(), kind: "rent", colors: [a, b], value: 1, wild: false });
  for (let i = 0; i < 3; i++)
    cards.push({ id: id(), kind: "rent", colors: [], value: 3, wild: true });

  return cards;
}
