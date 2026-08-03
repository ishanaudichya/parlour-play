"use client";

/* Letterpress track panels — pure SVG and CSS, no assets. Two plates: the
   slate Liberal track (5 sockets, election tracker below) and the vermillion
   Fascist track (6 sockets with the power icons of this table size printed
   under the slots; the Hitler zone is hatched). Tiles slam in with a
   letterpress settle. */

import { motion } from "framer-motion";
import type { SHParty, SHPower } from "@/lib/games/secrethitler/types";
import { oswald, typewriter } from "./font";

export const INK = "#1c1712";
export const INK_SOFT = "#4a4034";
export const INK_FADE = "#7a6f5c";
export const PAPER = "#e9ddc0";
export const PAPER_DARK = "#ddcda6";
export const PAPER_EDGE = "#c4b287";
export const VERM = "#d4491f";
export const VERM_BRIGHT = "#e05a33";
export const VERM_DARK = "#a33312";
export const SLATE = "#3e6478";
export const SLATE_DEEP = "#2c4a5b";
export const SLATE_PALE = "#c7d6de";

export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Halftone newsprint dots, tiled at low opacity over every plate. */
export const HALFTONE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9'%3E%3Ccircle cx='2.2' cy='2.2' r='0.9' fill='%231c1712'/%3E%3Ccircle cx='6.8' cy='6.8' r='0.9' fill='%231c1712'/%3E%3C/svg%3E\")";

export const PRESS_SHADOW = "3px 3px 0 rgba(28,23,18,0.85)";
export const PRESS_SHADOW_SM = "2px 2px 0 rgba(28,23,18,0.85)";

/* ------------------------------ policy tile ----------------------------- */

export function PolicyTile({ party, w }: { party: SHParty; w?: number }) {
  const liberal = party === "liberal";
  const tint = liberal ? SLATE : VERM_DARK;
  return (
    <div
      className={oswald.className}
      style={{ width: w ?? "100%", aspectRatio: "120 / 80", lineHeight: 0 }}
    >
      <svg viewBox="0 0 120 80" width="100%" height="100%" role="img" aria-label={`${party} policy`}>
        <rect x="2" y="2" width="116" height="76" rx="3" fill={liberal ? "#dde4dd" : "#e6d8b8"} stroke={INK} strokeWidth="2.5" />
        <rect x="8" y="8" width="104" height="64" rx="1.5" fill="none" stroke={tint} strokeWidth="1.6" />
        {liberal ? (
          <g>
            {/* dove: circle head, swept wing, olive stroke */}
            <path d="M38 46 C46 34 62 32 74 38 L88 32 L80 42 C74 52 56 56 44 52 Z" fill={SLATE} />
            <circle cx="36" cy="45" r="4.6" fill={SLATE} />
            <path d="M31 44 L25 46 L31 47.5" fill="none" stroke={SLATE_DEEP} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M52 40 C60 34 70 34 78 36" fill="none" stroke={SLATE_PALE} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M30 58 H90" stroke={SLATE} strokeWidth="1.4" />
          </g>
        ) : (
          <g>
            {/* angular serpent-bolt */}
            <path d="M30 54 L48 40 L42 40 L62 26 L56 38 L64 38 L44 56 L52 44 Z" fill={VERM} stroke={VERM_DARK} strokeWidth="1" />
            <path d="M68 30 L92 30 L92 54 L68 54 Z" fill="none" stroke={INK} strokeWidth="2.4" />
            <path d="M73 35 L87 49 M87 35 L73 49" stroke={INK} strokeWidth="2.4" />
          </g>
        )}
        <text x="60" y="20" textAnchor="middle" fontSize="10.5" letterSpacing="3.4" fill={tint} fontWeight="600">
          {liberal ? "LIBERAL" : "FASCIST"}
        </text>
        <text x="60" y="71" textAnchor="middle" fontSize="6" letterSpacing="2.6" fill={INK_FADE}>
          POLICY · REPUBLIC PRESS
        </text>
      </svg>
    </div>
  );
}

/** Face-down policy card — one neutral back, never a party hint. */
export function PolicyBack({ w }: { w?: number }) {
  return (
    <div
      className={oswald.className}
      style={{ width: w ?? "100%", aspectRatio: "120 / 80", lineHeight: 0 }}
    >
      <svg viewBox="0 0 120 80" width="100%" height="100%" role="img" aria-label="Face-down policy">
        <rect x="2" y="2" width="116" height="76" rx="3" fill={PAPER_DARK} stroke={INK} strokeWidth="2.5" />
        <rect x="8" y="8" width="104" height="64" rx="1.5" fill="none" stroke={INK_FADE} strokeWidth="1.2" />
        <path d="M14 14 L106 66 M106 14 L14 66" stroke={INK_FADE} strokeWidth="0.8" opacity="0.5" />
        <text x="60" y="44" textAnchor="middle" fontSize="9" letterSpacing="3" fill={INK_SOFT} fontWeight="600">
          POLICY
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------ power icons ----------------------------- */

function PowerGlyph({ power, size = 15 }: { power: SHPower; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (power) {
    case "peek":
      return (
        <svg {...common}>
          <path d="M2.5 12 C6 6.5 18 6.5 21.5 12 C18 17.5 6 17.5 2.5 12 Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "investigate":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6" />
          <path d="M14.5 14.5 L21 21" />
        </svg>
      );
    case "special":
      return (
        <svg {...common}>
          <rect x="4" y="9" width="16" height="11" />
          <path d="M12 2 v9 M8.5 7 L12 11 L15.5 7" />
        </svg>
      );
    case "execute":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 2 v5 M12 17 v5 M2 12 h5 M17 12 h5" />
        </svg>
      );
  }
}

/* -------------------------------- sockets ------------------------------- */

function SlamTile({ party }: { party: SHParty }) {
  return (
    <motion.div
      className="w-full"
      initial={{ scale: 1.6, opacity: 0, rotate: -4 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ duration: 0.34, ease: EASE }}
      style={{ lineHeight: 0 }}
    >
      <PolicyTile party={party} />
    </motion.div>
  );
}

function Socket({
  filled,
  party,
  label,
  icon,
  hatch,
  note,
}: {
  filled: boolean;
  party: SHParty;
  label: string;
  icon?: SHPower | null;
  hatch?: boolean;
  note?: string;
}) {
  const tint = party === "liberal" ? SLATE : VERM_DARK;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <div
        className="relative grid w-full place-items-center border"
        style={{
          aspectRatio: "120 / 80",
          borderColor: filled ? INK : `${INK}55`,
          borderStyle: filled ? "solid" : "dashed",
          background: hatch
            ? `repeating-linear-gradient(45deg, transparent 0 5px, ${VERM}22 5px 8px)`
            : `${INK}0a`,
        }}
      >
        {filled ? (
          <div className="absolute inset-0 grid place-items-center p-[3%]">
            <SlamTile party={party} />
          </div>
        ) : icon ? (
          <span className="flex flex-col items-center gap-0.5" style={{ color: tint }}>
            <PowerGlyph power={icon} />
          </span>
        ) : note ? (
          <span
            className={`${oswald.className} px-1 text-center text-[8px] font-semibold uppercase tracking-[0.14em]`}
            style={{ color: tint }}
          >
            {note}
          </span>
        ) : null}
      </div>
      <span className={`${typewriter.className} text-[8px] leading-none`} style={{ color: INK_FADE }}>
        {label}
      </span>
    </div>
  );
}

/* --------------------------------- panels ------------------------------- */

function PlateHeader({ title, sub, color }: { title: string; sub: string; color: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2 border-b-2 pb-1.5" style={{ borderColor: color }}>
      <span className={`${oswald.className} text-[13px] font-semibold uppercase tracking-[0.24em]`} style={{ color }}>
        {title}
      </span>
      <span className={`${typewriter.className} truncate text-[9px]`} style={{ color: INK_FADE }}>
        {sub}
      </span>
    </div>
  );
}

export function LiberalBoard({ enacted, tracker }: { enacted: number; tracker: number }) {
  return (
    <div
      className="relative border-2 p-2.5 sm:p-3"
      style={{ borderColor: INK, background: "#e2dcc8", boxShadow: PRESS_SHADOW }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: HALFTONE }} />
      <PlateHeader title="Liberal Track" sub="5 enacted — liberals win" color={SLATE} />
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Socket
            key={i}
            filled={i < enacted}
            party="liberal"
            label={`${i + 1}`}
            note={i === 4 ? "LIBERTY" : undefined}
          />
        ))}
      </div>
      <ElectionTracker tracker={tracker} />
    </div>
  );
}

export function FascistBoard({
  enacted,
  powers,
  vetoUnlocked,
}: {
  enacted: number;
  powers: (SHPower | null)[];
  vetoUnlocked: boolean;
}) {
  return (
    <div
      className="relative border-2 p-2.5 sm:p-3"
      style={{ borderColor: INK, background: "#e6d3ae", boxShadow: PRESS_SHADOW }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: HALFTONE }} />
      <PlateHeader title="Fascist Track" sub="6 enacted — fascists win" color={VERM_DARK} />
      <div className="flex gap-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <Socket
            key={i}
            filled={i < enacted}
            party="fascist"
            label={i === 4 ? "5 · VETO" : `${i + 1}`}
            icon={powers[i]}
            hatch={i >= 2 && i >= enacted}
            note={i === 5 ? "REICH" : undefined}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <span className={`${typewriter.className} text-[8.5px]`} style={{ color: VERM_DARK }}>
          slots 3+ : Hitler as Chancellor ends the republic
        </span>
        <span
          className={`${oswald.className} text-[8px] font-semibold uppercase tracking-[0.18em]`}
          style={{ color: vetoUnlocked ? VERM : INK_FADE }}
        >
          {vetoUnlocked ? "veto power active" : "veto unlocks at 5"}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------- election tracker -------------------------- */

function TrackerStamp({ filled, alarming }: { filled: boolean; alarming: boolean }) {
  return (
    <motion.span
      className="relative grid h-6 w-6 place-items-center rounded-full border-2"
      style={{ borderColor: filled ? VERM_DARK : `${INK}66` }}
      animate={alarming ? { scale: [1, 1.14, 1] } : { scale: 1 }}
      transition={alarming ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
    >
      {filled ? (
        <motion.span
          className="h-3.5 w-3.5 rounded-full"
          style={{ background: `radial-gradient(circle at 40% 35%, ${VERM_BRIGHT}, ${VERM_DARK})` }}
          initial={{ scale: 2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
        />
      ) : null}
    </motion.span>
  );
}

export function ElectionTracker({ tracker }: { tracker: number }) {
  const alarming = tracker >= 2;
  return (
    <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2" style={{ borderColor: `${INK}33` }}>
      <span className={`${oswald.className} text-[9px] font-semibold uppercase tracking-[0.2em]`} style={{ color: alarming ? VERM_DARK : INK_SOFT }}>
        Election tracker
      </span>
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <TrackerStamp key={i} filled={i < tracker} alarming={alarming && i === tracker - 1} />
        ))}
        <span className={`${typewriter.className} ml-1 text-[8.5px]`} style={{ color: alarming ? VERM_DARK : INK_FADE }}>
          {alarming ? "one more riot enacts the top policy" : "3rd failure: top policy enacted"}
        </span>
      </div>
    </div>
  );
}
