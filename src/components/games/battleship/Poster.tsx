/* Game-picker poster for Battleship — a phosphor sonar scope over dark naval
   charts. Purely decorative and deterministic (no randomness, no trig). */

import { Chakra_Petch } from "next/font/google";

const chakra = Chakra_Petch({ weight: ["500", "700"], subsets: ["latin"], display: "swap" });

const GRID_LINE = "rgba(61,222,155,0.12)";

/** Fixed sonar blips (percent coordinates) — one contact burns ember. */
const BLIPS: { x: number; y: number; hot?: boolean }[] = [
  { x: 34, y: 30 },
  { x: 68, y: 44, hot: true },
  { x: 46, y: 66 },
  { x: 25, y: 55 },
];

export function BattleshipPoster() {
  return (
    <div
      className={`${chakra.className} relative flex h-full min-h-[190px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-[#3dde9b]/40`}
      style={{ background: "radial-gradient(120% 100% at 50% 20%, #0a1622 0%, #050b12 100%)" }}
    >
      {/* chart grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to right, ${GRID_LINE} 1px, transparent 1px), linear-gradient(to bottom, ${GRID_LINE} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />
      {/* vignette */}
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 60px rgba(2,7,12,0.9)" }} />

      {/* sonar scope */}
      <div className="relative h-[104px] w-[104px]">
        {[100, 66, 33].map((size) => (
          <div
            key={size}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{
              width: `${size}%`,
              height: `${size}%`,
              borderColor: "rgba(61,222,155,0.3)",
              boxShadow: size === 100 ? "0 0 24px rgba(61,222,155,0.15), inset 0 0 24px rgba(61,222,155,0.06)" : undefined,
            }}
          />
        ))}
        {/* scope cross */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2" style={{ background: "rgba(61,222,155,0.18)" }} />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2" style={{ background: "rgba(61,222,155,0.18)" }} />
        {/* frozen sweep */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 315deg at 50% 50%, rgba(109,255,192,0.28) 0deg, rgba(109,255,192,0.08) 40deg, transparent 80deg)",
          }}
        />
        {/* blips */}
        {BLIPS.map((b, i) => (
          <div
            key={i}
            className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              background: b.hot ? "#ff7a3c" : "#6dffc0",
              boxShadow: b.hot ? "0 0 8px rgba(255,122,60,0.9)" : "0 0 6px rgba(109,255,192,0.8)",
            }}
          />
        ))}
        {/* crosshair on the hot contact */}
        <div
          className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{ left: "68%", top: "44%", borderColor: "rgba(255,122,60,0.7)" }}
        />
        {/* tiny hull silhouette */}
        <div
          className="absolute h-[7px] w-[34px] -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            left: "38%",
            top: "76%",
            borderColor: "rgba(109,255,192,0.5)",
            background: "rgba(61,222,155,0.22)",
          }}
        />
      </div>

      <div className="relative mt-3 text-center">
        <div
          className="text-[16px] font-bold tracking-[0.42em]"
          style={{ color: "#6dffc0", textShadow: "0 0 14px rgba(109,255,192,0.4)" }}
        >
          BATTLESHIP
        </div>
        <div className="mt-1 text-[9px] uppercase tracking-[0.3em]" style={{ color: "#7ba8c0" }}>
          Call your shots · Sink the fleet
        </div>
      </div>
    </div>
  );
}
