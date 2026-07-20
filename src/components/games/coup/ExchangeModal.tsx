"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { CardFace } from "./CardArt";
import { Button, Modal } from "@/components/ui";
import type { CoupMove } from "@/lib/games/coup/engine";
import type { ClientCard, CoupView } from "@/lib/games/coup/types";

export function ExchangeModal({ v, move }: { v: CoupView; move: (m: CoupMove) => void }) {
  const pend = v.pending;
  const you = v.players.find((p) => p.id === v.youId)!;
  const open = !!pend && pend.stage === "exchange" && pend.actor === v.youId && !!pend.exchangeDrawn;

  const hand = you.cards.filter((c) => !c.revealed);
  const drawn = pend?.exchangeDrawn ?? [];
  const pool: ClientCard[] = [...hand, ...drawn];
  const need = hand.length;

  // the parent remounts this component per exchange (keyed on the drawn cards),
  // so starting empty is always correct
  const [keep, setKeep] = useState<string[]>([]);

  const toggle = (id: string) => {
    setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : k.length < need ? [...k, id] : k));
  };

  return (
    <Modal open={open} wide>
      <div className="text-center">
        <div className="label mb-2">Exchange</div>
        <h2 className="font-display text-2xl font-bold gold-text">Choose {need === 1 ? "one card" : "two cards"} to keep</h2>
        <p className="mt-1 text-[13px] text-parch-500">The rest return to the court deck.</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {pool.map((c, i) => {
          const selected = keep.includes(c.id);
          const fromDeck = i >= hand.length;
          return (
            <motion.button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -5 }}
              className={`relative w-[92px] rounded-md transition-shadow sm:w-[108px] ${
                selected ? "shadow-[0_0_0_2px_#ecd39a,0_0_24px_rgba(198,159,88,0.45)]" : "opacity-90"
              }`}
            >
              {c.ch && <CardFace ch={c.ch} className="h-auto w-full" />}
              <span
                className={`absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border px-2 py-[1px] text-[8.5px] font-semibold uppercase tracking-[0.14em] ${
                  fromDeck ? "border-gold-500/60 bg-ink-900 text-gold-300" : "border-parch-500/40 bg-ink-900 text-parch-500"
                }`}
              >
                {fromDeck ? "drawn" : "yours"}
              </span>
              {selected && (
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-gold-400 px-2 py-[1px] text-[9px] font-bold uppercase tracking-[0.1em] text-ink-950">
                  keep
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <div className="mt-6 flex justify-center">
        <Button
          variant="primary"
          className="px-10 py-3"
          disabled={keep.length !== need}
          onClick={() => move({ move: "exchange", keep })}
        >
          Confirm ({keep.length}/{need})
        </Button>
      </div>
    </Modal>
  );
}
