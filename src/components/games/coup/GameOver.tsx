"use client";

import { motion } from "framer-motion";
import { Button, Icons, Medallion, Panel } from "@/components/ui";
import type { CoupView } from "@/lib/games/coup/types";

// deterministic pseudo-random scatter so render stays pure; rounded because
// Math.sin can differ by 1 ULP between server and client (hydration mismatch)
const hash = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 1e4) / 1e4;
};

const PARTICLES = Array.from({ length: 26 }, (_, i) => ({
  x: (hash(i, 1) - 0.5) * 340,
  y: -(60 + hash(i, 2) * 260),
  r: hash(i, 3) * 360,
  d: 0.9 + hash(i, 4) * 1.3,
  delay: hash(i, 5) * 0.35,
  size: 4 + hash(i, 6) * 6,
  key: i,
}));

export function GameOver({
  v,
  isHost,
  tallies,
  playAgain,
  exitToLobby,
}: {
  v: CoupView;
  isHost: boolean;
  tallies: Record<string, number>;
  playAgain: () => void;
  exitToLobby: () => void;
}) {
  const winner = v.players.find((p) => p.id === v.winner);
  const youWon = v.winner === v.youId;

  if (!winner) return null;

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="relative w-full max-w-sm">
        {/* gold burst */}
        <div className="pointer-events-none absolute left-1/2 top-16 z-0" aria-hidden>
          {PARTICLES.map((p) => (
            <motion.span
              key={p.key}
              className="absolute block"
              style={{ width: p.size, height: p.size, background: p.key % 3 ? "#dcb975" : "#f6e9c8" }}
              initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
              animate={{ x: p.x, y: p.y, opacity: [0, 1, 1, 0], rotate: p.r }}
              transition={{ duration: p.d, delay: 0.3 + p.delay, ease: "easeOut" }}
            />
          ))}
        </div>

        <motion.div
          initial={{ y: 30, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <Panel className="relative z-10 p-8 text-center">
            <Icons.crown size={30} className="mx-auto mb-3 text-gold-400" />
            <div className="label mb-3">{youWon ? "Victory" : "The game is over"}</div>
            <div className="mb-2 flex items-center justify-center">
              <Medallion name={winner.name} seat={winner.seat} size={56} />
            </div>
            <h2 className="font-display text-3xl font-bold gold-text">{winner.name}</h2>
            <p className="mt-1 font-display text-sm tracking-[0.2em] text-parch-300">SEIZES POWER</p>

            {Object.keys(tallies).length > 0 && (
              <div className="mt-5 space-y-1 border-t border-gold-500/20 pt-4">
                <div className="label mb-2">Coup victories</div>
                {v.players
                  .map((p) => ({ p, w: tallies[p.id] ?? 0 }))
                  .sort((a, b) => b.w - a.w)
                  .map(({ p, w }) => (
                    <div key={p.id} className="flex items-center justify-between text-[13px] text-parch-300">
                      <span>
                        {p.name}
                        {p.id === v.youId && <span className="text-parch-500"> (you)</span>}
                      </span>
                      <span className="font-semibold text-gold-400">♛ {w}</span>
                    </div>
                  ))}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2">
              {isHost ? (
                <>
                  <Button variant="primary" className="w-full py-3" onClick={playAgain}>
                    Play again
                  </Button>
                  <Button variant="outline" className="w-full" onClick={exitToLobby}>
                    Back to the lobby
                  </Button>
                </>
              ) : (
                <p className="text-[12px] italic text-parch-500">
                  The host chooses what happens next — rematch or back to the lobby…
                </p>
              )}
            </div>
          </Panel>
        </motion.div>
      </div>
    </motion.div>
  );
}
