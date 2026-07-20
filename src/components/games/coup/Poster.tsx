"use client";

import { CardFace } from "./CardArt";

/** Compact advertisement for the game picker, in Coup's deco language. */
export function CoupPoster() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden bg-[radial-gradient(120%_100%_at_50%_-10%,#221a30_0%,#0c0a12_70%)] px-3 py-4">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(80%_60%_at_50%_110%,rgba(198,159,88,0.14),transparent_70%)]" />
      <span className="font-sans text-[9px] font-semibold uppercase tracking-[0.3em] text-[#a89d84]">
        Bluff · Deceive
      </span>
      <div className="relative my-2 h-[84px] w-[150px]" aria-hidden>
        <div className="absolute left-1/2 top-0 w-[58px] -translate-x-[92%] -rotate-12">
          <CardFace ch="assassin" className="h-auto w-full drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)]" />
        </div>
        <div className="absolute left-1/2 top-[-6px] z-10 w-[58px] -translate-x-1/2">
          <CardFace ch="duke" className="h-auto w-full drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)]" />
        </div>
        <div className="absolute left-1/2 top-0 w-[58px] -translate-x-[8%] rotate-12">
          <CardFace ch="contessa" className="h-auto w-full drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)]" />
        </div>
      </div>
      <span
        className="font-black tracking-[0.3em] text-transparent [background:linear-gradient(180deg,#f6e9c8,#dcb975_45%,#9a7a41)] bg-clip-text"
        style={{ fontFamily: "var(--font-cinzel), serif", fontSize: 22 }}
      >
        COUP
      </span>
    </div>
  );
}
