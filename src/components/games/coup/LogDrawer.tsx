"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { Icons } from "@/components/ui";
import type { LogEntry } from "@/lib/games/coup/types";
import { logLine } from "./logText";

const KIND_ICON: Partial<Record<LogEntry["kind"], keyof typeof Icons>> = {
  challenge: "swords",
  challenge_failed: "swords",
  challenge_success: "swords",
  block: "shield",
  eliminated: "skull",
  left: "skull",
  win: "crown",
};

/** The chronicle entries themselves — used by the drawer AND the desktop sidebar. */
export function LogList({ log, follow = true }: { log: LogEntry[]; follow?: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (follow) endRef.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [follow, log.length]);
  return (
    <>
      <ul className="space-y-2.5">
        {log.map((l) => {
          const iconKey = KIND_ICON[l.kind];
          const Icon = iconKey ? Icons[iconKey] : null;
          return (
            <li key={l.i} className="flex items-start gap-2 text-[12.5px] leading-snug text-parch-300">
              <span className="mt-[3px] shrink-0 text-gold-600">
                {Icon ? <Icon size={12} /> : <span className="block h-1.5 w-1.5 rotate-45 bg-gold-700" />}
              </span>
              <span>{logLine(l)}</span>
            </li>
          );
        })}
      </ul>
      <div ref={endRef} />
    </>
  );
}

export function LogDrawer({ open, onClose, log }: { open: boolean; onClose: () => void; log: LogEntry[] }) {

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink-950/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 z-50 flex h-dvh w-[300px] flex-col border-l border-gold-500/25 bg-[#100d16]/97 backdrop-blur"
          >
            <div className="flex items-center justify-between border-b border-gold-500/20 px-4 py-3.5">
              <span className="label">Chronicle</span>
              <button onClick={onClose} className="text-parch-500 transition hover:text-gold-300" aria-label="Close log">
                <Icons.x size={16} />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-4 py-3">
              <LogList log={log} follow={open} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
