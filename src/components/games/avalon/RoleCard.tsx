"use client";

/* Illuminated-manuscript role cards — pure SVG, no assets. Each card is a
   parchment portrait behind an arched stained-glass window with Celtic-knot
   corners and a per-role emblem. Face-down cards shown to others always use
   the single neutral back (crowned "A"), so a back never leaks a faction. */

import { motion } from "framer-motion";
import type { AvalonRole } from "@/lib/games/avalon/types";
import { uncial } from "./font";

const r2 = (x: number) => Number(x.toFixed(2));

/* ---------- precomputed geometry (module scope, deterministic) ---------- */

function starPath(cx: number, cy: number, r: number): string {
  const s = r2(r * 0.3);
  return (
    `M${r2(cx)} ${r2(cy - r)} L${r2(cx + s)} ${r2(cy - s)} L${r2(cx + r)} ${r2(cy)} ` +
    `L${r2(cx + s)} ${r2(cy + s)} L${r2(cx)} ${r2(cy + r)} L${r2(cx - s)} ${r2(cy + s)} ` +
    `L${r2(cx - r)} ${r2(cy)} L${r2(cx - s)} ${r2(cy - s)} Z`
  );
}

const MERLIN_STARS = [starPath(66, 78, 8), starPath(136, 66, 6), starPath(128, 100, 4.5)];

const rays = (cx: number, cy: number, n: number, ri: number, ro: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    return {
      x1: r2(cx + Math.cos(a) * ri),
      y1: r2(cy + Math.sin(a) * ri),
      x2: r2(cx + Math.cos(a) * ro),
      y2: r2(cy + Math.sin(a) * ro),
    };
  });

const SHIELD_RAYS = rays(100, 120, 12, 30, 42);
const GRAIL_BACK_RAYS = rays(100, 132, 16, 46, 62);

/* ---------------------------- shared chrome ---------------------------- */

const CARD_TITLES: Record<AvalonRole, { title: string; sub: string }> = {
  merlin: { title: "Merlin", sub: "Prophet of Camelot" },
  percival: { title: "Percival", sub: "Knight of the Round" },
  servant: { title: "Loyal Servant", sub: "Sworn to Arthur" },
  assassin: { title: "The Assassin", sub: "Blade of Mordred" },
  morgana: { title: "Morgana", sub: "The False Merlin" },
  minion: { title: "Minion", sub: "Of Mordred's Host" },
};

const isEvilRole = (role: AvalonRole) =>
  role === "assassin" || role === "morgana" || role === "minion";

function Knots({ uid, color }: { uid: string; color: string }) {
  const id = `av-knot-${uid}`;
  return (
    <>
      <g id={id} stroke={color} strokeWidth="1.6" fill="none" opacity="0.75">
        <path d="M7 26 C7 11 11 7 26 7" />
        <path d="M7 18 C7 10 10 7 18 7" />
        <circle cx="12.2" cy="12.2" r="3.6" />
      </g>
      <use href={`#${id}`} transform="translate(200 0) scale(-1 1)" />
      <use href={`#${id}`} transform="translate(0 280) scale(1 -1)" />
      <use href={`#${id}`} transform="translate(200 280) scale(-1 -1)" />
    </>
  );
}

function Emblem({ role, variant }: { role: AvalonRole; variant: number }) {
  switch (role) {
    case "merlin":
      return (
        <g>
          <g stroke="#7fa8c9" strokeWidth="3.2" strokeLinecap="round" fill="none">
            <path d="M92 180 L92 100" />
            <path d="M92 100 C92 84 106 78 113 88 C119 97 110 106 102 101" />
          </g>
          {MERLIN_STARS.map((d) => (
            <path key={d} d={d} fill="#cfe4f7" stroke="#7fa8c9" strokeWidth="0.8" />
          ))}
          <ellipse cx="96" cy="184" rx="22" ry="4" fill="#0e1c30" opacity="0.55" />
        </g>
      );
    case "percival":
      return (
        <g>
          <g stroke="#d6c389" strokeWidth="1.5" strokeLinecap="round" opacity="0.85">
            {SHIELD_RAYS.map((l) => (
              <line key={`${l.x1}-${l.y1}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
            ))}
          </g>
          <path
            d="M100 84 L128 100 V134 C128 156 100 172 100 172 C100 172 72 156 72 134 V100 Z"
            fill="#dfe8f2"
            stroke="#93a7bd"
            strokeWidth="2"
          />
          <path d="M100 92 V164 M80 118 H120" stroke="#93a7bd" strokeWidth="2.4" fill="none" />
          <circle cx="100" cy="118" r="7" fill="#d6c389" stroke="#a8935b" strokeWidth="1.2" />
        </g>
      );
    case "servant":
      return variant % 2 === 0 ? (
        <g>
          <path d="M96 76 L104 76 L101.5 166 L98.5 166 Z" fill="#dfe8f2" stroke="#93a7bd" />
          <path d="M82 104 H118" stroke="#a9c6e2" strokeWidth="5.5" strokeLinecap="round" />
          <path d="M100 104 V86" stroke="#7d94ad" strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="100" cy="78" r="5" fill="#a9c6e2" stroke="#7d94ad" />
          <path d="M60 170 Q100 148 140 170 L133 186 Q100 172 67 186 Z" fill="#3d4c61" stroke="#5b6b82" />
          <path d="M74 170 Q100 156 126 170" stroke="#5b6b82" strokeWidth="1" fill="none" opacity="0.7" />
        </g>
      ) : (
        <g>
          <g stroke="#cfe4f7" strokeWidth="1.6" strokeLinecap="round" opacity="0.8">
            <path d="M100 66 V78 M78 72 L84 82 M122 72 L116 82" />
          </g>
          <path
            d="M78 94 C78 122 88 132 100 134 C112 132 122 122 122 94 Z"
            fill="#dfe8f2"
            stroke="#93a7bd"
            strokeWidth="2"
          />
          <path d="M76 94 H124" stroke="#a9c6e2" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M100 134 V152" stroke="#93a7bd" strokeWidth="4" />
          <path d="M84 158 Q100 149 116 158 L116 164 H84 Z" fill="#dfe8f2" stroke="#93a7bd" />
        </g>
      );
    case "assassin":
      return (
        <g>
          <path
            d="M88 84 C116 98 126 132 108 166 C104 146 98 118 82 98 Z"
            fill="#a1273a"
            stroke="#e0556d"
            strokeWidth="1.2"
          />
          <path d="M96 100 C106 116 110 136 108 152" stroke="#e0556d" strokeWidth="1" fill="none" opacity="0.6" />
          <path d="M82 98 L70 84" stroke="#c98f9a" strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="82" cy="98" r="4.6" fill="#7e2231" stroke="#e0556d" strokeWidth="1" />
          <path
            d="M108 172 C108 178 104.8 181 104.8 185 A3.4 3.4 0 0 0 111.6 185 C111.6 181 108.4 178 108.4 172 Z"
            fill="#e0556d"
          />
        </g>
      );
    case "morgana":
      return (
        <g>
          <path
            d="M110 72 A40 40 0 0 0 110 152 A48 48 0 0 1 110 72 Z"
            fill="#b06bd4"
            stroke="#d9a8ef"
            strokeWidth="1.2"
            opacity="0.92"
          />
          <path
            d="M118 152 C134 144 140 128 129 121 C118 114 106 124 113 133 C118 139 127 136 126 129"
            fill="none"
            stroke="#e0556d"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <circle cx="119" cy="151" r="3" fill="#e0556d" />
          <path d="M122 155 L127 159" stroke="#e0556d" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
    case "minion":
      return (
        <g>
          <path d="M76 108 C58 102 52 84 60 66 C66 84 70 96 84 101 Z" fill="#c2564a" stroke="#8e3b31" />
          <path d="M124 108 C142 102 148 84 140 66 C134 84 130 96 116 101 Z" fill="#c2564a" stroke="#8e3b31" />
          <path d="M76 112 C76 90 124 90 124 112 V154 H76 Z" fill="#7d8798" stroke="#4e5867" strokeWidth="1.6" />
          <rect x="84" y="122" width="32" height="5" rx="2.5" fill="#12060b" />
          <path d="M100 127 V142" stroke="#4e5867" strokeWidth="4" />
          <path d="M76 140 H124" stroke="#4e5867" strokeWidth="1.2" opacity="0.7" />
        </g>
      );
  }
}

/* ------------------------------ face card ------------------------------ */

export function RoleCard({ role, variant = 0, w = 150 }: { role: AvalonRole; variant?: number; w?: number }) {
  const evil = isEvilRole(role);
  const uid = `${role}${variant % 2}`;
  const tint = evil ? "#a1273a" : "#8fb8de";
  const { title, sub } = CARD_TITLES[role];
  const fontSize = title.length > 12 ? 14.5 : title.length > 8 ? 16 : 18.5;

  return (
    <div className={uncial.className} style={{ width: w, lineHeight: 0 }}>
      <svg viewBox="0 0 200 280" width={w} height={w * 1.4} role="img" aria-label={`Role card: ${title}`}>
        <defs>
          <linearGradient id={`av-parch-${uid}`} x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor="#f0e6cd" />
            <stop offset="0.55" stopColor="#e8dcc0" />
            <stop offset="1" stopColor="#d9c9a5" />
          </linearGradient>
          <radialGradient id={`av-sky-${uid}`} cx="0.6" cy="0.16" r="1.1">
            {evil ? (
              <>
                <stop offset="0" stopColor="#4d1626" />
                <stop offset="0.55" stopColor="#2a0c16" />
                <stop offset="1" stopColor="#12060b" />
              </>
            ) : (
              <>
                <stop offset="0" stopColor="#2c486b" />
                <stop offset="0.55" stopColor="#1a2c4a" />
                <stop offset="1" stopColor="#0d1526" />
              </>
            )}
          </radialGradient>
        </defs>

        <rect x="3" y="3" width="194" height="274" rx="10" fill={`url(#av-parch-${uid})`} stroke="#6f5f41" strokeWidth="2" />
        <rect x="9.5" y="9.5" width="181" height="261" rx="7" fill="none" stroke="#b9a97e" strokeWidth="1" />
        <rect x="12.5" y="12.5" width="175" height="255" rx="6" fill="none" stroke={tint} strokeWidth="1" opacity="0.5" />
        <Knots uid={uid} color="#8a744e" />

        {/* arched stained-glass window */}
        <path
          d="M34 206 V112 C34 62 64 36 100 36 C136 36 166 62 166 112 V206 Z"
          fill={`url(#av-sky-${uid})`}
          stroke={tint}
          strokeWidth="2"
        />
        <path d="M38 124 C64 106 136 106 162 124" fill="none" stroke={tint} strokeWidth="1" opacity="0.3" />
        <path d="M70 40 V206 M130 40 V206" stroke={tint} strokeWidth="0.8" opacity="0.12" />
        <circle cx="136" cy="66" r="11" fill={evil ? "#e0556d" : "#cfe4f7"} opacity="0.85" />
        <circle cx="140" cy="63" r="9" fill={evil ? "#2a0c16" : "#1a2c4a"} opacity="0.9" />

        <Emblem role={role} variant={variant} />

        {/* banner */}
        <path d="M56 220 H144" stroke={tint} strokeWidth="1.4" opacity="0.7" />
        <text x="100" y="243" textAnchor="middle" fontSize={fontSize} fill="#2f2517">
          {title}
        </text>
        <text
          x="100"
          y="258"
          textAnchor="middle"
          fontSize="7.5"
          letterSpacing="2.2"
          fill={evil ? "#7e2231" : "#4a6f8e"}
          style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", textTransform: "uppercase" }}
        >
          {sub.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------ card backs ----------------------------- */

export function CardBack({ kind = "neutral", w = 150 }: { kind?: "neutral" | "good" | "evil"; w?: number }) {
  const palette =
    kind === "good"
      ? { base0: "#23415e", base1: "#0a1220", edge: "#8fb8de", ink: "#cfe4f7" }
      : kind === "evil"
        ? { base0: "#3a1020", base1: "#0d0407", edge: "#a1273a", ink: "#e0556d" }
        : { base0: "#1b2740", base1: "#0b1120", edge: "#55627a", ink: "#b9c6d8" };
  const uid = `back-${kind}`;

  return (
    <div style={{ width: w, lineHeight: 0 }}>
      <svg viewBox="0 0 200 280" width={w} height={w * 1.4} role="img" aria-label="Face-down card">
        <defs>
          <radialGradient id={`av-${uid}`} cx="0.5" cy="0.36" r="1">
            <stop offset="0" stopColor={palette.base0} />
            <stop offset="1" stopColor={palette.base1} />
          </radialGradient>
        </defs>
        <rect x="3" y="3" width="194" height="274" rx="10" fill={`url(#av-${uid})`} stroke={palette.edge} strokeWidth="2" />
        <rect x="10.5" y="10.5" width="179" height="259" rx="7" fill="none" stroke={palette.edge} strokeWidth="1" opacity="0.6" />
        <Knots uid={uid} color={palette.edge} />

        {kind === "neutral" && (
          <g>
            <circle cx="100" cy="140" r="56" fill="none" stroke={palette.ink} strokeWidth="1" opacity="0.45" />
            <circle cx="100" cy="140" r="48" fill="none" stroke={palette.ink} strokeWidth="0.7" opacity="0.3" />
            <path d="M80 120 L80 104 L90 112 L100 97 L110 112 L120 104 L120 120 Z" fill="#d6c389" stroke="#a8935b" />
            <path
              d="M85 172 L100 130 L115 172 M90.5 157 H109.5"
              fill="none"
              stroke={palette.ink}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
        {kind === "good" && (
          <g>
            <g stroke="#d6c389" strokeWidth="1.4" strokeLinecap="round" opacity="0.8">
              {GRAIL_BACK_RAYS.map((l) => (
                <line key={`${l.x1}-${l.y1}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
              ))}
            </g>
            <path d="M76 106 C76 134 87 145 100 147 C113 145 124 134 124 106 Z" fill="#cfe4f7" stroke="#8fb8de" strokeWidth="2" />
            <path d="M74 106 H126" stroke="#dfe8f2" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M100 147 V164" stroke="#8fb8de" strokeWidth="4" />
            <path d="M84 170 Q100 161 116 170 L116 176 H84 Z" fill="#cfe4f7" stroke="#8fb8de" />
          </g>
        )}
        {kind === "evil" && (
          <g>
            <circle cx="100" cy="140" r="52" fill="none" stroke={palette.ink} strokeWidth="1.2" strokeDasharray="3 7" opacity="0.6" />
            <path d="M84 128 C68 122 62 106 70 90 C75 106 79 116 90 121 Z" fill="#a1273a" stroke="#e0556d" strokeWidth="1" />
            <path d="M116 128 C132 122 138 106 130 90 C125 106 121 116 110 121 Z" fill="#a1273a" stroke="#e0556d" strokeWidth="1" />
            <path d="M86 131 C86 114 114 114 114 131 V160 H86 Z" fill="#2a0c16" stroke="#a1273a" strokeWidth="1.6" />
            <rect x="92" y="138" width="16" height="4" rx="2" fill="#e0556d" opacity="0.85" />
          </g>
        )}
      </svg>
    </div>
  );
}

/* --------------------- your card, flippable to hide -------------------- */

export function FlipRoleCard({
  role,
  variant = 0,
  w = 128,
  hidden,
  onToggle,
}: {
  role: AvalonRole;
  variant?: number;
  w?: number;
  hidden: boolean;
  onToggle: () => void;
}) {
  const h = w * 1.4;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={hidden}
      aria-label={hidden ? "Reveal your role card" : "Hide your role card"}
      className="relative block shrink-0 cursor-pointer select-none"
      style={{ width: w, height: h, perspective: 900 }}
      title={hidden ? "Tap to reveal" : "Tap to hide from shoulder-surfers"}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: hidden ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
          <RoleCard role={role} variant={variant} w={w} />
        </div>
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          {/* the privacy flip always shows the NEUTRAL back — a faction back would leak */}
          <CardBack kind="neutral" w={w} />
        </div>
      </motion.div>
    </button>
  );
}
