/* Picker poster — a propaganda broadsheet: vermillion beams over newsprint,
   an ink podium, one sealed vermillion envelope. All original geometry. */

import { oswald, typewriter } from "./font";

const HALFTONE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9'%3E%3Ccircle cx='2.2' cy='2.2' r='0.9' fill='%231c1712'/%3E%3Ccircle cx='6.8' cy='6.8' r='0.9' fill='%231c1712'/%3E%3C/svg%3E\")";

export function SecretHitlerPoster() {
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      style={{ background: "#e9ddc0", color: "#1c1712" }}
    >
      {/* halftone grain + vermillion propaganda beams */}
      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: HALFTONE }} />
      <div
        className="absolute inset-0"
        style={{
          background:
            "conic-gradient(from 208deg at 50% 118%, transparent 0deg, rgba(212,73,31,0.16) 8deg, transparent 16deg, rgba(212,73,31,0.16) 24deg, transparent 32deg, rgba(212,73,31,0.16) 40deg, transparent 48deg, rgba(212,73,31,0.16) 56deg, transparent 64deg)",
        }}
      />

      <div className="relative mb-2.5">
        <svg viewBox="0 0 96 104" width="86" height="93" aria-hidden>
          {/* podium of the chancellery */}
          <path d="M28 96 H68 L64 66 H32 Z" fill="#1c1712" />
          <path d="M24 96 H72" stroke="#1c1712" strokeWidth="3" />
          <path d="M36 72 H60 M34 80 H62 M32 88 H64" stroke="#e9ddc0" strokeWidth="1.4" opacity="0.5" />
          {/* sealed dossier leaning on the podium */}
          <g transform="rotate(-8 48 40)">
            <rect x="30" y="18" width="36" height="46" fill="#ddcda6" stroke="#1c1712" strokeWidth="2" />
            <path d="M30 18 L48 40 L66 18" fill="#d3c093" stroke="#4a4034" strokeWidth="1.2" />
            <circle cx="48" cy="40" r="7.5" fill="#d4491f" stroke="#a33312" strokeWidth="1.4" />
            <text
              x="48"
              y="42.6"
              textAnchor="middle"
              fontSize="6"
              fill="#f1e2c0"
              fontWeight="700"
              style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
            >
              SH
            </text>
          </g>
          {/* one vermillion wedge — the hidden sixth vote */}
          <path d="M10 26 L22 6 L26 28 Z" fill="#d4491f" opacity="0.9" />
          <path d="M74 22 L86 10 L84 30 Z" fill="#3e6478" opacity="0.85" />
        </svg>
      </div>

      <div className="relative text-center">
        <div className={`${oswald.className} text-[17px] font-bold uppercase leading-none tracking-[0.26em]`}>
          Secret
          <span style={{ color: "#d4491f" }}> Hitler</span>
        </div>
        <div className={`${typewriter.className} mt-1.5 text-[8px] tracking-[0.22em]`} style={{ color: "#7a6f5c" }}>
          PASS POLICIES · TRUST NO CABINET
        </div>
      </div>

      <div className="pointer-events-none absolute inset-[7px] border-2" style={{ borderColor: "rgba(28,23,18,0.5)" }} aria-hidden />
      <div className="pointer-events-none absolute inset-[11px] border" style={{ borderColor: "rgba(212,73,31,0.35)" }} aria-hidden />
    </div>
  );
}
