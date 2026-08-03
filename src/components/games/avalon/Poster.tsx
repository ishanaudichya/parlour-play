/* Picker poster — a moonlit arched window over Camelot with a radiant grail. */

import { uncial } from "./font";

export function AvalonPoster() {
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden text-[#dfe8f2]"
      style={{
        background:
          "radial-gradient(circle at 68% 18%, rgba(207,228,247,.14), transparent 24%), radial-gradient(120% 100% at 50% 10%, #14223a 0%, #070b14 74%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(104deg, transparent 0, transparent 30px, rgba(207,228,247,.05) 31px, transparent 32px)",
        }}
      />

      <div className="relative mb-3">
        <svg viewBox="0 0 96 116" width="82" height="99" aria-hidden>
          {/* arched window */}
          <path
            d="M12 110 V52 C12 24 28 8 48 8 C68 8 84 24 84 52 V110 Z"
            fill="#0d1526"
            stroke="#8fb8de"
            strokeWidth="1.6"
          />
          <path d="M14 58 C30 48 66 48 82 58" fill="none" stroke="#8fb8de" strokeWidth="0.8" opacity="0.35" />
          <path d="M32 10 V110 M64 10 V110" stroke="#8fb8de" strokeWidth="0.6" opacity="0.14" />
          <circle cx="66" cy="26" r="6.5" fill="#cfe4f7" opacity="0.9" />
          <circle cx="68.5" cy="24.5" r="5.2" fill="#0d1526" opacity="0.85" />
          {/* radiant grail */}
          <g stroke="#d6c389" strokeWidth="0.9" strokeLinecap="round" opacity="0.75">
            <path d="M48 40 V47 M34 45 L38.5 51 M62 45 L57.5 51 M28 58 H35 M68 58 H61" />
          </g>
          <path
            d="M36 54 C36 68 42 74 48 75 C54 74 60 68 60 54 Z"
            fill="#cfe4f7"
            stroke="#8fb8de"
            strokeWidth="1.2"
          />
          <path d="M34.5 54 H61.5" stroke="#dfe8f2" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M48 75 V85" stroke="#8fb8de" strokeWidth="2" />
          <path d="M39 89 Q48 84.6 57 89 L57 92 H39 Z" fill="#cfe4f7" stroke="#8fb8de" strokeWidth="0.8" />
          {/* dagger silhouette leaning in the corner */}
          <path d="M22 104 C26 96 27 88 25 82 L28 84 C30 91 28 99 25 105 Z" fill="#a1273a" opacity="0.85" />
        </svg>
      </div>

      <div className="relative text-center">
        <div className={`${uncial.className} text-[20px] tracking-[0.34em] text-[#dfe8f2]`}>AVALON</div>
        <div className="mt-1.5 text-[9px] uppercase tracking-[0.3em] text-[#5f7189]">
          Merlin knows · the Assassin waits
        </div>
      </div>

      <div className="pointer-events-none absolute inset-[7px] rounded-md border border-[#8fb8de]/20" aria-hidden />
    </div>
  );
}
