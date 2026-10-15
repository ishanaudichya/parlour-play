"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { CardFace } from "./CardArt";
import { Button, Panel } from "@/components/ui";
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

  // cards sized to the screen: one row of four on landscape screens, 2 × 2
  // in portrait (phones, upright tablets) — bounded by height too, so the
  // whole choice is always in view; capped so a big monitor stays composed
  const cardW =
    "w-[min(calc((100vw_-_92px)/2),calc((100dvh_-_360px)/3),250px)] sm:landscape:w-[min(calc((94vw_-_120px)/4),calc((100dvh_-_335px)/1.5),250px)]";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[44] flex items-center justify-center px-3 pb-3 pt-[60px] sm:px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" />
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="scroll-thin relative max-h-[calc(100dvh_-_72px)] w-fit max-w-full overflow-y-auto"
          >
            <Panel className="px-5 py-6 sm:px-8 sm:py-7">
              <div className="text-center">
                <div className="label mb-2">Exchange</div>
                <h2 className="font-display text-xl font-bold gold-text sm:text-2xl">
                  Choose {need === 1 ? "one card" : "two cards"} to keep
                </h2>
                <p className="mt-1 text-[13px] text-parch-500">The rest return to the court deck.</p>
              </div>

              <div className="mx-auto mt-6 grid w-fit grid-cols-2 justify-center gap-3 sm:gap-4 sm:landscape:grid-flow-col sm:landscape:grid-cols-none">
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
                      className={`relative rounded-md transition-shadow ${cardW} ${
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
            </Panel>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
