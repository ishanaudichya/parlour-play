"use client";

/* Sealed dossiers — pure SVG, no assets. Your secret role is a letterpress
   plate inside a state envelope: tap to break the seal, tap to re-seal.
   The sealed face is identical for every role, so a closed dossier never
   leaks a party. Emblems are original geometric plates: a dove over columns
   for the liberals, an angular eagle-bolt for the fascists, and a black
   plate with a vermillion border for Hitler. */

import { motion } from "framer-motion";
import type { SHParty, SHRole } from "@/lib/games/secrethitler/types";
import { INK, INK_FADE, INK_SOFT, SLATE, SLATE_DEEP, SLATE_PALE, VERM, VERM_BRIGHT, VERM_DARK } from "./Boards";
import { oswald } from "./font";

/* ------------------------------ role plates ----------------------------- */

function LiberalEmblem() {
  return (
    <g>
      {/* columns of the republic */}
      <g stroke={SLATE} strokeWidth="5" opacity="0.5">
        <path d="M62 150 V104 M86 150 V98 M114 150 V98 M138 150 V104" />
      </g>
      <path d="M52 152 H148 M56 158 H144" stroke={SLATE} strokeWidth="3" opacity="0.6" />
      <path d="M54 96 L100 78 L146 96" fill="none" stroke={SLATE} strokeWidth="4" opacity="0.6" />
      {/* dove */}
      <path d="M62 122 C74 104 100 100 118 108 L140 99 L128 114 C119 130 91 136 72 130 Z" fill={SLATE_PALE} stroke={SLATE_DEEP} strokeWidth="2" />
      <circle cx="60" cy="120" r="7" fill={SLATE_PALE} stroke={SLATE_DEEP} strokeWidth="2" />
      <path d="M52 119 L43 122 L52 125" fill="none" stroke={SLATE_DEEP} strokeWidth="2" strokeLinecap="round" />
      <path d="M84 114 C94 106 110 105 122 108" fill="none" stroke={SLATE_DEEP} strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

function FascistEmblem() {
  return (
    <g>
      {/* angular eagle-bolt: chevron wings around a hard diamond */}
      <path d="M100 84 L120 116 L100 148 L80 116 Z" fill={VERM} stroke={VERM_DARK} strokeWidth="2" />
      <path d="M96 104 L110 132 M104 104 L90 132" stroke="#f1e2c0" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M76 104 L40 92 L64 116 L36 118 L70 130" fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d="M124 104 L160 92 L136 116 L164 118 L130 130" fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d="M84 152 H116" stroke={INK} strokeWidth="4" />
      <path d="M90 158 H110" stroke={VERM_DARK} strokeWidth="3" />
    </g>
  );
}

function HitlerEmblem() {
  return (
    <g>
      {/* stark black podium under a vermillion inverted wedge */}
      <path d="M100 82 L128 130 H72 Z" fill={VERM} stroke={VERM_BRIGHT} strokeWidth="2" transform="rotate(180 100 106)" />
      <path d="M64 138 H136 M72 146 H128 M80 154 H120" stroke={VERM_BRIGHT} strokeWidth="4" />
      <circle cx="100" cy="106" r="9" fill="#0d0a07" stroke={VERM_BRIGHT} strokeWidth="2" />
    </g>
  );
}

const PLATE: Record<
  SHRole,
  { title: string; sub: string; paper: string; frame: string; text: string; subText: string }
> = {
  liberal: { title: "LIBERAL", sub: "Servant of the Republic", paper: "#dfe4df", frame: SLATE, text: SLATE_DEEP, subText: SLATE },
  fascist: { title: "FASCIST", sub: "Agent of the Conspiracy", paper: "#e6d6b4", frame: VERM_DARK, text: VERM_DARK, subText: VERM },
  hitler: { title: "HITLER", sub: "The Name They Protect", paper: "#171310", frame: VERM, text: VERM_BRIGHT, subText: VERM },
};

export function RolePlate({ role, w = 150 }: { role: SHRole; w?: number }) {
  const p = PLATE[role];
  return (
    <div className={oswald.className} style={{ width: w, aspectRatio: "200 / 280", lineHeight: 0 }}>
      <svg viewBox="0 0 200 280" width="100%" height="100%" role="img" aria-label={`Secret role: ${p.title}`}>
        <rect x="3" y="3" width="194" height="274" fill={p.paper} stroke={INK} strokeWidth="3" />
        <rect x="11" y="11" width="178" height="258" fill="none" stroke={p.frame} strokeWidth="2.5" />
        <rect x="16" y="16" width="168" height="248" fill="none" stroke={p.frame} strokeWidth="1" opacity="0.5" />
        {/* corner registration marks */}
        <g stroke={p.frame} strokeWidth="1.4" opacity="0.8">
          <path d="M22 30 H36 M30 22 V36" />
          <path d="M178 30 H164 M170 22 V36" />
          <path d="M22 250 H36 M30 242 V258" />
          <path d="M178 250 H164 M170 242 V258" />
        </g>
        <text x="100" y="48" textAnchor="middle" fontSize="8" letterSpacing="4" fill={role === "hitler" ? VERM : INK_FADE}>
          SECRET ROLE
        </text>
        <path d="M46 56 H154" stroke={p.frame} strokeWidth="1.2" opacity="0.7" />
        {role === "liberal" ? <LiberalEmblem /> : role === "fascist" ? <FascistEmblem /> : <HitlerEmblem />}
        <path d="M46 180 H154" stroke={p.frame} strokeWidth="1.2" opacity="0.7" />
        <text x="100" y="216" textAnchor="middle" fontSize={role === "liberal" ? 30 : role === "fascist" ? 29 : 32} letterSpacing="6" fill={p.text} fontWeight="700">
          {p.title}
        </text>
        <text x="100" y="238" textAnchor="middle" fontSize="8" letterSpacing="2.2" fill={p.subText}>
          {p.sub.toUpperCase()}
        </text>
        <text x="100" y="258" textAnchor="middle" fontSize="6.5" letterSpacing="1.8" fill={role === "hitler" ? "#6e5747" : INK_FADE}>
          BURN AFTER READING
        </text>
      </svg>
    </div>
  );
}

/* ---------------------------- party membership --------------------------- */

export function PartyCard({ party, w = 150 }: { party: SHParty; w?: number }) {
  const liberal = party === "liberal";
  const tint = liberal ? SLATE : VERM_DARK;
  return (
    <div className={oswald.className} style={{ width: w, aspectRatio: "200 / 120", lineHeight: 0 }}>
      <svg viewBox="0 0 200 120" width="100%" height="100%" role="img" aria-label={`Party membership: ${party}`}>
        <rect x="3" y="3" width="194" height="114" fill={liberal ? "#dde3e3" : "#e6d6b4"} stroke={INK} strokeWidth="2.6" />
        <rect x="10" y="10" width="180" height="100" fill="none" stroke={tint} strokeWidth="1.6" />
        <text x="100" y="32" textAnchor="middle" fontSize="9" letterSpacing="3.4" fill={INK_SOFT}>
          PARTY MEMBERSHIP
        </text>
        <path d="M30 40 H170" stroke={tint} strokeWidth="1" opacity="0.7" />
        <text x="100" y="74" textAnchor="middle" fontSize="24" letterSpacing="5" fill={tint} fontWeight="700">
          {liberal ? "LIBERAL" : "FASCIST"}
        </text>
        <text x="100" y="98" textAnchor="middle" fontSize="6.5" letterSpacing="2" fill={INK_FADE}>
          SHOWN UNDER INVESTIGATION · NOT YOUR ROLE
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------ the envelope ----------------------------- */

export function EnvelopeFace({ w = 150 }: { w?: number }) {
  return (
    <div className={oswald.className} style={{ width: w, aspectRatio: "200 / 280", lineHeight: 0 }}>
      <svg viewBox="0 0 200 280" width="100%" height="100%" role="img" aria-label="Sealed dossier">
        <rect x="3" y="3" width="194" height="274" fill="#ddcda6" stroke={INK} strokeWidth="3" />
        <rect x="11" y="11" width="178" height="258" fill="none" stroke={INK_FADE} strokeWidth="1.2" />
        {/* envelope flap */}
        <path d="M11 11 L100 128 L189 11" fill="#d3c093" stroke={INK_SOFT} strokeWidth="1.6" />
        <path d="M11 269 L100 160 L189 269" fill="none" stroke={INK_FADE} strokeWidth="1" opacity="0.6" />
        {/* wax seal */}
        <circle cx="100" cy="128" r="24" fill={VERM} stroke={VERM_DARK} strokeWidth="2.5" />
        <circle cx="100" cy="128" r="17" fill="none" stroke="#f1e2c0" strokeWidth="1.2" opacity="0.8" />
        <text x="100" y="132.5" textAnchor="middle" fontSize="11" letterSpacing="1.5" fill="#f1e2c0" fontWeight="700">
          SH
        </text>
        <g transform="rotate(-9 100 196)">
          <rect x="38" y="182" width="124" height="28" fill="none" stroke={VERM_DARK} strokeWidth="2.4" />
          <text x="100" y="201.5" textAnchor="middle" fontSize="13.5" letterSpacing="3.4" fill={VERM_DARK} fontWeight="700">
            STATE SECRET
          </text>
        </g>
        <text x="100" y="238" textAnchor="middle" fontSize="7.5" letterSpacing="2.6" fill={INK_SOFT}>
          EYES ONLY · DO NOT DISCLOSE
        </text>
        <text x="100" y="254" textAnchor="middle" fontSize="6.5" letterSpacing="2" fill={INK_FADE}>
          TAP TO BREAK THE SEAL
        </text>
      </svg>
    </div>
  );
}

/* ------------------------- flip: sealed <-> open ------------------------- */

export function FlipDossier({
  role,
  w = 128,
  sealed,
  onToggle,
}: {
  role: SHRole;
  w?: number;
  sealed: boolean;
  onToggle: () => void;
}) {
  const h = w * 1.4;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={sealed}
      aria-label={sealed ? "Open your dossier" : "Re-seal your dossier"}
      className="relative block shrink-0 cursor-pointer select-none"
      style={{ width: w, height: h, perspective: 900 }}
      title={sealed ? "Tap to open" : "Tap to re-seal against shoulder-surfers"}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: sealed ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
          <RolePlate role={role} w={w} />
        </div>
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          {/* one neutral envelope for every role — a sealed face never leaks */}
          <EnvelopeFace w={w} />
        </div>
      </motion.div>
    </button>
  );
}
