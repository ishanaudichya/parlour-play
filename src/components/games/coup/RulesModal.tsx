"use client";

import { CardFace } from "./CardArt";
import { Button, Modal } from "@/components/ui";
import { CHARACTER_INFO } from "@/lib/games/coup/meta";
import { CHARACTERS, type Character } from "@/lib/games/coup/types";

function CharacterChip({ ch, size = "md" }: { ch: Character; size?: "sm" | "md" }) {
  const info = CHARACTER_INFO[ch];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-sans font-semibold uppercase tracking-[0.14em] ${
        size === "sm" ? "px-2 py-[1px] text-[9px]" : "px-2.5 py-[2px] text-[10px]"
      }`}
      style={{ color: info.bright, borderColor: `${info.color}88`, background: `${info.deep}cc` }}
    >
      <span className="inline-block h-1.5 w-1.5 rotate-45" style={{ background: info.bright }} />
      {info.name}
    </span>
  );
}

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="text-center">
          <div className="label mb-2">How to play</div>
          <h2 className="font-display text-3xl font-bold gold-text">The Rules of the Court</h2>
        </div>

        <p className="text-sm leading-relaxed text-parch-300">
          You hold <b className="text-gold-300">two hidden influence cards</b> and start with 2 coins. On your turn,
          take one action. Anyone may <b className="text-blood-300">lie about the cards they hold</b> — and anyone may
          challenge a claim. Lose both influences and you are out. The last player standing seizes power.
        </p>

        <div>
          <div className="label mb-3">Actions</div>
          <div className="grid gap-2 text-[13px] text-parch-300 sm:grid-cols-2">
            <div className="border border-gold-500/15 p-3">
              <b className="text-parch-100">Income</b> — take 1 coin. Safe, unstoppable.
            </div>
            <div className="border border-gold-500/15 p-3">
              <b className="text-parch-100">Foreign Aid</b> — take 2 coins. Any <i>Duke</i> may block.
            </div>
            <div className="border border-gold-500/15 p-3">
              <b className="text-parch-100">Coup</b> — pay 7, pick a player: they lose an influence. Unstoppable. With
              10+ coins you <i>must</i> coup.
            </div>
            <div className="border border-gold-500/15 p-3">
              <b className="text-parch-100">Tax</b> <CharacterChip ch="duke" size="sm" /> — take 3 coins.
            </div>
            <div className="border border-gold-500/15 p-3">
              <b className="text-parch-100">Assassinate</b> <CharacterChip ch="assassin" size="sm" /> — pay 3, target
              loses an influence. <i>Contessa</i> blocks. Coins are spent even if blocked.
            </div>
            <div className="border border-gold-500/15 p-3">
              <b className="text-parch-100">Steal</b> <CharacterChip ch="captain" size="sm" /> — take 2 coins from a
              player. <i>Captain</i> or <i>Ambassador</i> blocks.
            </div>
            <div className="border border-gold-500/15 p-3 sm:col-span-2">
              <b className="text-parch-100">Exchange</b> <CharacterChip ch="ambassador" size="sm" /> — draw 2 from the
              deck, keep your best hand, return 2.
            </div>
          </div>
        </div>

        <div>
          <div className="label mb-3">Challenges</div>
          <p className="text-[13px] leading-relaxed text-parch-300">
            When someone claims a character (to act or to block), any player may{" "}
            <b className="text-blood-300">challenge</b>. If the claimant really holds the card, they show it, shuffle it
            back for a new one, and the <b>challenger loses an influence</b>. If they were bluffing,{" "}
            <b>they lose an influence</b> and the action fails.
          </p>
        </div>

        <div>
          <div className="label mb-3">House rules</div>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-parch-300">
            <li>
              ◆ The treasury lends no one more than <b className="text-gold-300">10 coins</b>.
            </li>
            <li>
              ◆ If your foreign aid is blocked, you pocket <b className="text-gold-300">1 coin</b> in consolation.
            </li>
            <li>
              ◆ Dawdlers are hurried along: slow reactions are allowed through, and a slow turn becomes income.
            </li>
          </ul>
        </div>

        <div>
          <div className="label mb-3">The Court</div>
          <div className="grid grid-cols-5 gap-2">
            {CHARACTERS.map((ch) => (
              <CardFace key={ch} ch={ch} className="w-full h-auto" />
            ))}
          </div>
        </div>

        <div className="flex justify-center pt-1">
          <Button variant="primary" onClick={onClose} className="px-8">
            Understood
          </Button>
        </div>
      </div>
    </Modal>
  );
}
