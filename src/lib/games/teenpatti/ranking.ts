/* Teen Patti hand ranking — the heart of the game.

   Category order (high to low):
     6 Trail / Set   (three of a kind)
     5 Pure Sequence (straight flush)
     4 Sequence      (straight)
     3 Color         (flush)
     2 Pair
     1 High Card

   Sequence order: A-K-Q is highest, then A-2-3, then K-Q-J down to 4-3-2.
   Aces are high everywhere else. Suits never break ties — hands with identical
   ranks in the same category compare equal (0). */

import type { Card } from "./types";

export type HandCategory = 1 | 2 | 3 | 4 | 5 | 6;

export interface HandEval {
  cat: HandCategory;
  /** tiebreak keys, compared lexicographically within the same category */
  keys: number[];
  label: string;
}

const WORD: Record<number, string> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Jack",
  12: "Queen",
  13: "King",
  14: "Ace",
};

const word = (r: number): string => WORD[r] ?? String(r);
const plural = (r: number): string => (r === 6 ? "Sixes" : `${word(r)}s`);

export function evaluateHand(cards: Card[]): HandEval {
  if (cards.length !== 3) throw new Error(`teen patti hand needs 3 cards, got ${cards.length}`);
  const rs = cards.map((c) => c.r).sort((x, y) => y - x); // descending
  const [a, b, c] = rs;
  const flush = cards[0].s === cards[1].s && cards[1].s === cards[2].s;
  const run = a === b + 1 && b === c + 1; // includes A-K-Q (14,13,12)
  const a23 = a === 14 && b === 3 && c === 2;

  if (a === b && b === c) {
    return { cat: 6, keys: [a], label: `Trail of ${plural(a)}` };
  }
  if (run || a23) {
    // A-K-Q = 15 > A-2-3 = 14 > K-Q-J = 13 > … > 4-3-2 = 4
    const strength = a23 ? 14 : a === 14 ? 15 : a;
    const seq = a23 ? "A-2-3" : `${word(a)} high`;
    if (flush) return { cat: 5, keys: [strength], label: `Pure Sequence, ${seq}` };
    return { cat: 4, keys: [strength], label: `Sequence, ${seq}` };
  }
  if (flush) {
    return { cat: 3, keys: [a, b, c], label: `Color, ${word(a)} high` };
  }
  if (a === b || b === c) {
    const pair = b; // the middle rank is always part of the pair
    const kicker = a === b ? c : a;
    return { cat: 2, keys: [pair, kicker], label: `Pair of ${plural(pair)}` };
  }
  return { cat: 1, keys: [a, b, c], label: `${word(a)} High` };
}

/** -1 if a < b, 0 on an exact tie (suits never break ties), 1 if a > b. */
export function compareHands(a: Card[], b: Card[]): -1 | 0 | 1 {
  const ea = evaluateHand(a);
  const eb = evaluateHand(b);
  if (ea.cat !== eb.cat) return ea.cat > eb.cat ? 1 : -1;
  for (let i = 0; i < ea.keys.length; i++) {
    if (ea.keys[i] !== eb.keys[i]) return ea.keys[i] > eb.keys[i] ? 1 : -1;
  }
  return 0;
}

/** "Trail of Kings" / "Pure Sequence, Ace high" / "Pair of Nines" … */
export function rankLabel(cards: Card[]): string {
  return evaluateHand(cards).label;
}
