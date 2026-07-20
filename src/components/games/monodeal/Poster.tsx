"use client";

/* Compact advertisement for the game picker — a light banknote among the
   dark posters. */

import { MdCardFace } from "./cards";
import { archivo, COPPER, GREEN, GREEN_DEEP, GUILLOCHE, PAPER } from "./theme";

export function MonoDealPoster() {
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden px-3 py-4"
      style={{ background: PAPER, backgroundImage: GUILLOCHE }}
    >
      <div
        className="pointer-events-none absolute inset-1 rounded-[4px]"
        style={{ border: `1px dashed ${GREEN}55` }}
      />
      <span className="text-[9px] font-semibold uppercase tracking-[0.3em]" style={{ color: COPPER }}>
        Charge · Steal · Collect
      </span>
      <div className="relative my-2 h-[84px] w-[150px]" aria-hidden>
        <div className="absolute left-1/2 top-1 w-[58px] -translate-x-[94%] -rotate-12">
          <MdCardFace
            card={{ id: "poster-m", kind: "money", value: 5 }}
            w={58}
            className="drop-shadow-[0_5px_10px_rgba(33,28,18,0.35)]"
          />
        </div>
        <div className="absolute left-1/2 top-[-5px] z-10 w-[58px] -translate-x-1/2">
          <MdCardFace
            card={{ id: "poster-p", kind: "property", color: "red", name: "Illinois Avenue", value: 3 }}
            w={58}
            className="drop-shadow-[0_5px_10px_rgba(33,28,18,0.35)]"
          />
        </div>
        <div className="absolute left-1/2 top-1 w-[58px] -translate-x-[6%] rotate-12">
          <MdCardFace
            card={{ id: "poster-r", kind: "rent", colors: ["green", "dark_blue"], value: 1, wild: false }}
            w={58}
            className="drop-shadow-[0_5px_10px_rgba(33,28,18,0.35)]"
          />
        </div>
      </div>
      <span className={archivo.className} style={{ color: GREEN_DEEP, fontSize: 15, letterSpacing: "0.04em" }}>
        MONOPOLY&nbsp;DEAL
      </span>
    </div>
  );
}
