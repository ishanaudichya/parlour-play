"use client";

/* The landing page IS a game table, seen from above: walnut rim, oxblood felt
   under a lamp, the eight games scattered across it as physical artifacts,
   and a paper score pad in the middle where you sign in for the night. */

import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { CardFace as CoupCard } from "@/components/games/coup/CardArt";
import { MdCardFace } from "@/components/games/monodeal/cards";
import { CardFace as TeenPattiCard } from "@/components/games/teenpatti/PlayingCard";
import { CardFace as UnoCard } from "@/components/games/uno/cards";
import { saveSession, useSavedName } from "@/lib/client/session";
import { primeSound, uiClick } from "@/lib/client/synthCore";
import { sfx } from "@/lib/client/sound";
import { GAME_META } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";

/* ---------------- the artifacts on the table ---------------- */

function Artifact({ k }: { k: GameType }) {
  switch (k) {
    case "coup":
      return <CoupCard ch="duke" className="h-auto w-full" />;
    case "uno":
      return <UnoCard card={{ id: "hero-uno", color: "red", symbol: "7" }} w={92} className="h-auto w-full" />;
    case "monodeal":
      return (
        <MdCardFace
          card={{ id: "hero-md", kind: "property", value: 4, color: "dark_blue", name: "Boardwalk" }}
          w={94}
          className="h-auto w-full"
        />
      );
    case "teenpatti":
      return <TeenPattiCard card={{ r: 14, s: "S" }} className="h-auto w-full" />;
    case "mafia":
      return (
        <div className="flex aspect-5/7 w-full flex-col items-center justify-center border border-[#9d8256] bg-[radial-gradient(circle_at_50%_25%,#33242a,#101214_68%)] text-[#dcc69b]">
          <span className="text-3xl text-[#c75164]">◆</span>
          <span className="mt-2 text-[10px] font-semibold tracking-[0.28em]">MAFIA</span>
          <span className="mt-1 text-[6px] uppercase tracking-[0.18em] text-[#827c72]">sealed role</span>
        </div>
      );
    case "battleship":
      return (
        <div className="relative aspect-5/7 w-full overflow-hidden border border-[#2e5d4a] bg-[radial-gradient(circle_at_50%_30%,#0c1d2b,#050b12_75%)]">
          <svg viewBox="0 0 50 70" className="h-full w-full" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <line key={`v${i}`} x1={7 + i * 7.2} y1="10" x2={7 + i * 7.2} y2="46" stroke="#3dde9b" strokeOpacity="0.22" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={`h${i}`} x1="7" y1={10 + i * 7.2} x2="43" y2={10 + i * 7.2} stroke="#3dde9b" strokeOpacity="0.22" strokeWidth="0.5" />
            ))}
            <rect x="14" y="24.4" width="21.6" height="7.2" rx="3.6" fill="#3dde9b" fillOpacity="0.3" stroke="#3dde9b" strokeWidth="0.6" />
            <circle cx="32.2" cy="20.8" r="2" fill="#ff7a45" />
            <circle cx="18" cy="42" r="1.2" fill="#7ba8c0" fillOpacity="0.7" />
            <text x="25" y="59" textAnchor="middle" fontSize="4.6" fontWeight="700" letterSpacing="1.6" fill="#6dffc0">BATTLESHIP</text>
          </svg>
        </div>
      );
    case "connect4":
      return (
        <div className="relative aspect-5/7 w-full overflow-hidden bg-[linear-gradient(160deg,#1b3fa0,#12266b)]">
          <svg viewBox="0 0 50 70" className="h-full w-full" aria-hidden>
            {Array.from({ length: 4 }, (_, cx) =>
              Array.from({ length: 4 }, (_, cy) => {
                const x = 11 + cx * 9.4;
                const y = 17 + cy * 9.4;
                const red = (cx === 1 && cy === 3) || (cx === 2 && cy === 2);
                const gold = (cx === 0 && cy === 3) || (cx === 3 && cy === 3);
                return (
                  <circle key={`${cx}-${cy}`} cx={x} cy={y} r="3.6"
                    fill={red ? "#e2483f" : gold ? "#f5b23e" : "#0f1d4d"}
                    stroke={red || gold ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"} strokeWidth="0.5" />
                );
              })
            )}
            <text x="25" y="62" textAnchor="middle" fontSize="4.4" fontWeight="700" letterSpacing="1" fill="#ffe0a3">FOUR IN A ROW</text>
          </svg>
        </div>
      );
    case "avalon":
      return (
        <div className="relative aspect-5/7 w-full overflow-hidden border border-[#5a708c] bg-[radial-gradient(circle_at_50%_22%,#16233d,#0a101d_72%)]">
          <svg viewBox="0 0 50 70" className="h-full w-full" aria-hidden>
            <path d="M10,16 Q10,7 25,7 Q40,7 40,16 L40,50 L10,50 Z" fill="#101b30" stroke="#8fb8de" strokeWidth="0.7" strokeOpacity="0.7" />
            <path d="M25,14 L25,38" stroke="#b9c6d8" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="25" cy="12.5" r="2.6" fill="none" stroke="#cfe4f7" strokeWidth="0.9" />
            <circle cx="19" cy="24" r="1.3" fill="#cfe4f7" opacity="0.9" />
            <circle cx="31" cy="21" r="1" fill="#cfe4f7" opacity="0.75" />
            <circle cx="29" cy="31" r="0.8" fill="#cfe4f7" opacity="0.6" />
            <text x="25" y="60" textAnchor="middle" fontSize="4.8" fontWeight="700" letterSpacing="1.8" fill="#8fb8de">AVALON</text>
          </svg>
        </div>
      );
    case "secrethitler":
      return (
        <div className="relative aspect-5/7 w-full overflow-hidden border border-[#b8a888] bg-[linear-gradient(175deg,#e9ddc0,#d8c9a4)]">
          <svg viewBox="0 0 50 70" className="h-full w-full" aria-hidden>
            <rect x="6" y="12" width="38" height="26" rx="1.5" fill="#e2d4b2" stroke="#1c1712" strokeWidth="0.9" />
            <path d="M6,12 L25,27 L44,12" fill="none" stroke="#1c1712" strokeWidth="0.9" />
            <circle cx="25" cy="33" r="3" fill="none" stroke="#1c1712" strokeWidth="0.8" />
            <path d="M25,33 L33,30" stroke="#1c1712" strokeWidth="0.8" />
            <g transform="rotate(-8 25 48)">
              <rect x="10" y="44" width="30" height="8.5" fill="none" stroke="#d4491f" strokeWidth="1.1" />
              <text x="25" y="50.5" textAnchor="middle" fontSize="4.6" fontWeight="800" letterSpacing="1" fill="#d4491f">
                TOP SECRET
              </text>
            </g>
            <text x="25" y="62" textAnchor="middle" fontSize="4" fontWeight="700" letterSpacing="0.8" fill="#1c1712">
              SECRET HITLER
            </text>
            <text x="25" y="67" textAnchor="middle" fontSize="2.4" letterSpacing="0.6" fill="#8a7a5c">
              MINISTRY EYES ONLY
            </text>
          </svg>
        </div>
      );
    default:
      return null;
  }
}

/* desktop scatter: left/top as % of the felt, like things tossed on a table */
const SCATTER: { key: GameType; x: string; y: string; rot: number; w: number; z?: number }[] = [
  { key: "coup", x: "6%", y: "11%", rot: -9, w: 96 },
  { key: "uno", x: "14.5%", y: "24%", rot: 7, w: 90, z: 1 },
  { key: "avalon", x: "33%", y: "5%", rot: -4, w: 90 },
  { key: "battleship", x: "76%", y: "8%", rot: 5, w: 94 },
  { key: "secrethitler", x: "63%", y: "17%", rot: -3, w: 88, z: 1 },
  { key: "monodeal", x: "4.5%", y: "58%", rot: -5, w: 96 },
  { key: "teenpatti", x: "15%", y: "72%", rot: -12, w: 88, z: 1 },
  { key: "connect4", x: "86%", y: "38%", rot: 7, w: 92 },
  { key: "mafia", x: "75%", y: "68%", rot: 9, w: 92 },
];

const TOSS = { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const };

function TapeLabel({ k }: { k: GameType }) {
  return (
    <span
      className="mt-1.5 inline-block max-w-full -rotate-2 truncate bg-[#efe6cf]/95 px-2 py-[1px] font-hand text-[13px] font-semibold leading-tight text-[#463d2e] shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
      style={{ borderLeft: "3px solid rgba(0,0,0,0.08)", borderRight: "3px solid rgba(0,0,0,0.08)" }}
    >
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: GAME_META[k].accent }} />
      {GAME_META[k].title}
    </span>
  );
}

/* ---------------- table props ---------------- */

function ChipStack({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 44" className={className} aria-hidden>
      {[30, 24, 18].map((cy, i) => (
        <g key={i}>
          <ellipse cx="26" cy={cy} rx="20" ry="7.5" fill={i === 1 ? "#b23a48" : "#2c4a6e"} stroke="rgba(0,0,0,0.4)" strokeWidth="0.6" />
          <ellipse cx="26" cy={cy - 2.5} rx="20" ry="7.5" fill={i === 1 ? "#d0596a" : "#3d6291"} stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
          {[-14, 0, 14].map((dx) => (
            <rect key={dx} x={25 + dx} y={cy - 2} width="3" height="6" rx="1" fill="#f2ead8" opacity="0.85" />
          ))}
        </g>
      ))}
      <ellipse cx="46" cy="34" rx="12" ry="4.6" fill="#8f5c28" stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
      <ellipse cx="46" cy="32.4" rx="12" ry="4.6" fill="#d4a05c" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
    </svg>
  );
}

function Dice({ className = "" }: { className?: string }) {
  const pip = (x: number, y: number) => <circle cx={x} cy={y} r="1.6" fill="#2e2a24" />;
  return (
    <svg viewBox="0 0 52 30" className={className} aria-hidden>
      <g transform="rotate(-8 14 15)">
        <rect x="4" y="5" width="20" height="20" rx="4" fill="#f2ead8" stroke="rgba(0,0,0,0.35)" strokeWidth="0.7" />
        {pip(9, 10)}{pip(14, 15)}{pip(19, 20)}
      </g>
      <g transform="rotate(11 38 15)">
        <rect x="28" y="4" width="20" height="20" rx="4" fill="#b23a48" stroke="rgba(0,0,0,0.35)" strokeWidth="0.7" />
        <g fill="#f2ead8">
          <circle cx="33" cy="9" r="1.6" /><circle cx="43" cy="9" r="1.6" />
          <circle cx="33" cy="19" r="1.6" /><circle cx="43" cy="19" r="1.6" />
          <circle cx="38" cy="14" r="1.6" />
        </g>
      </g>
    </svg>
  );
}

function Pencil({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 14" className={className} aria-hidden>
      <rect x="14" y="3.5" width="88" height="7" rx="1" fill="#c99a3f" />
      <rect x="14" y="3.5" width="88" height="2.3" fill="#e0b45a" />
      <polygon points="14,3.5 2,7 14,10.5" fill="#e8d9b0" />
      <polygon points="6.5,5.8 2,7 6.5,8.4" fill="#3a3630" />
      <rect x="102" y="3" width="7" height="8" rx="1" fill="#9aa3ad" />
      <rect x="109" y="3.5" width="8" height="7" rx="2.5" fill="#d98a80" />
    </svg>
  );
}

/* ---------------- the score pad (the actual form) ---------------- */

function ScorePad({
  name, setName, code, setCode, busy, error, onCreate, onJoin, nameRef,
}: {
  name: string; setName: (s: string) => void;
  code: string; setCode: (s: string) => void;
  busy: "create" | "join" | null; error: string | null;
  onCreate: () => void; onJoin: () => void;
  nameRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, rotate: 0.5 }}
      animate={{ opacity: 1, y: 0, rotate: -1.2 }}
      transition={{ delay: 0.35, ...TOSS }}
      className="relative w-full max-w-[380px]"
    >
      {/* coffee ring, half under the pad */}
      <div
        aria-hidden
        className="absolute -left-12 -top-10 h-24 w-24 rounded-full opacity-25"
        style={{ border: "7px solid #6b4a2a", boxShadow: "inset 0 0 0 2px rgba(107,74,42,0.4)" }}
      />
      <div
        className="relative px-7 pb-6 pt-7 text-[#2e2a24] shadow-[0_24px_60px_rgba(0,0,0,0.55),0_4px_14px_rgba(0,0,0,0.4)]"
        style={{
          background:
            "repeating-linear-gradient(transparent 0px, transparent 30px, rgba(60,50,40,0.08) 30px, rgba(60,50,40,0.08) 31px), linear-gradient(180deg, #f4edda 0%, #efe6cf 100%)",
          borderRadius: "3px 3px 5px 4px",
        }}
      >
        {/* red margin line */}
        <span aria-hidden className="absolute bottom-0 left-9 top-0 w-px bg-[#c26a5a]/45" />
        {/* binder holes */}
        <span aria-hidden className="absolute left-1/2 top-2 flex -translate-x-1/2 gap-16">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-full bg-[#1d120a]/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]" />
          ))}
        </span>

        <div className="font-hand text-[34px] font-bold leading-none text-[#463d2e]">Game night?</div>
        <div className="mt-1 font-hand text-[17px] text-[#7a6d58]">pull up a chair — eight games on the table</div>

        <label className="mt-6 block text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8a7d68]" htmlFor="pad-name">
          Your name
        </label>
        <input
          id="pad-name"
          ref={nameRef}
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
          onFocus={() => primeSound()}
          placeholder="write it here…"
          className="mt-1 w-full border-b-2 border-dashed border-[#a89878] bg-transparent pb-1 font-hand text-[26px] font-semibold text-[#2e2a24] outline-none placeholder:text-[#b3a68c] focus:border-[#b3402e]"
        />

        <button
          type="button"
          disabled={!name.trim() || busy !== null}
          onClick={() => { uiClick(); onCreate(); }}
          className="mt-5 w-full -rotate-1 rounded-[4px] border-[2.5px] border-[#a63c2b] px-4 py-3 text-[13px] font-bold uppercase tracking-[0.24em] text-[#a63c2b] shadow-[inset_0_0_0_1.5px_rgba(166,60,43,0.35)] transition-all duration-150 hover:bg-[#a63c2b]/10 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35"
        >
          {busy === "create" ? "Stamping…" : "⬢ Open a table"}
        </button>

        <div className="mt-5 flex items-center gap-2">
          <span className="h-px flex-1 bg-[#a89878]/50" />
          <span className="font-hand text-[15px] text-[#8a7d68]">or got an invitation?</span>
          <span className="h-px flex-1 bg-[#a89878]/50" />
        </div>

        {/* ticket stub */}
        <div className="mt-3 flex items-stretch overflow-hidden rounded-[4px] border border-[#b3a68c] bg-[#e9dfc6]">
          <span aria-hidden className="my-1 border-l-2 border-dashed border-[#a89878]/70" />
          <input
            value={code}
            maxLength={5}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && onJoin()}
            placeholder="CODE"
            className="w-0 flex-1 bg-transparent px-3 py-2.5 text-center font-shell text-[17px] tracking-[0.4em] text-[#4c331d] outline-none placeholder:tracking-[0.2em] placeholder:text-[#b3a68c]"
          />
          <button
            type="button"
            disabled={busy !== null || code.trim().length < 4}
            onClick={() => { uiClick(); onJoin(); }}
            className="border-l border-dashed border-[#a89878] px-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#6b4a2a] transition hover:bg-[#6b4a2a]/10 disabled:pointer-events-none disabled:opacity-35"
          >
            Join
          </button>
        </div>

        {error && <p className="mt-3 font-hand text-[16px] font-semibold text-[#a63c2b]">✗ {error}</p>}

        <div className="mt-6 font-hand text-[15.5px] leading-snug text-[#7a6d58]">
          1. gather your people &nbsp; 2. the host deals &nbsp; 3. wins go on the board
        </div>
        <div
          className="mt-3 inline-block rotate-[-3deg] border-[1.5px] border-[#8a7d68]/60 px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.24em] text-[#8a7d68]/80"
          aria-hidden
        >
          No accounts · free · 2–8 players
        </div>
      </div>
    </motion.div>
  );
}

/* ==================== page ==================== */

export function Landing() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useSavedName();
  const [code, setCode] = useState(params.get("join")?.toUpperCase() ?? "");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  async function createParty() {
    if (!name.trim() || busy) return;
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/party", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not open a table.");
        setBusy(null);
        return;
      }
      saveSession(data.code, { playerId: data.playerId, secret: data.secret, name: name.trim() });
      sfx("start");
      router.push(`/p/${data.code}`);
    } catch {
      setError("Network error — try again.");
      setBusy(null);
    }
  }

  function joinParty() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) {
      setError("That code looks short.");
      return;
    }
    setBusy("join");
    router.push(`/p/${c}`);
  }

  return (
    <main className="relative flex min-h-dvh flex-col p-2.5 sm:p-5">
      {/* the walnut rim */}
      <div
        className="relative flex min-h-[calc(100dvh-20px)] flex-1 flex-col rounded-[26px] p-2.5 sm:min-h-[calc(100dvh-40px)] sm:rounded-[34px] sm:p-3.5"
        style={{
          background: "linear-gradient(160deg, #3a2413 0%, #241407 55%, #170c05 100%)",
          boxShadow: "inset 0 1px 0 rgba(232,192,135,0.18), inset 0 -2px 8px rgba(0,0,0,0.6), 0 30px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* the felt */}
        <div
          className="relative flex flex-1 flex-col overflow-hidden rounded-[18px] sm:rounded-[24px]"
          style={{
            background:
              "radial-gradient(110% 85% at 50% 18%, #4d222c 0%, #38161f 48%, #250d14 100%)",
            boxShadow: "inset 0 0 90px rgba(0,0,0,0.65), inset 0 2px 4px rgba(0,0,0,0.5)",
          }}
        >
          {/* lamp pool */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(52% 44% at 50% 40%, rgba(232,192,135,0.13) 0%, transparent 70%)" }}
          />

          {/* brass nameplate on the rim edge */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="relative z-10 mx-auto mt-4 flex flex-col items-center sm:mt-6"
          >
            <span className="font-shell neon-text text-[42px] leading-none sm:text-[54px]" translate="no">
              Parlour
            </span>
            <span className="slabel mt-2">nine games · one table · tonight</span>
          </motion.div>

          {/* desktop: artifacts scattered on the felt */}
          <div className="absolute inset-0 hidden lg:block" aria-hidden={false}>
            {SCATTER.map((a, i) => (
              <motion.button
                key={a.key}
                type="button"
                onClick={() => {
                  uiClick();
                  nameRef.current?.focus();
                }}
                title={`${GAME_META[a.key].title} — ${GAME_META[a.key].tagline}`}
                className="absolute flex flex-col items-center text-left"
                style={{ left: a.x, top: a.y, width: a.w, zIndex: a.z ?? 0 }}
                initial={{ opacity: 0, scale: 1.18, y: -36, rotate: a.rot * 2.2 }}
                animate={{ opacity: 1, scale: 1, y: 0, rotate: a.rot }}
                transition={{ delay: 0.28 + i * 0.07, ...TOSS }}
                whileHover={{ y: -7, scale: 1.05, rotate: a.rot / 2, zIndex: 20, transition: { duration: 0.18 } }}
              >
                <span className="block w-full overflow-hidden rounded-[7px] shadow-[0_14px_28px_rgba(0,0,0,0.55),0_3px_8px_rgba(0,0,0,0.4)]">
                  <Artifact k={a.key} />
                </span>
                <TapeLabel k={a.key} />
              </motion.button>
            ))}

            {/* props */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0, duration: 0.6 }}>
              <ChipStack className="absolute left-[24%] top-[76%] w-[74px] drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]" />
              <Dice className="absolute left-[66%] top-[26%] w-[64px] drop-shadow-[0_5px_8px_rgba(0,0,0,0.5)]" />
              <Pencil className="absolute left-[58%] top-[79%] w-[130px] rotate-[24deg] drop-shadow-[0_5px_8px_rgba(0,0,0,0.5)]" />
            </motion.div>
          </div>

          {/* mobile: a loose hand of artifacts above the pad */}
          <div className="relative z-10 mx-auto mt-5 flex max-w-[360px] flex-wrap items-start justify-center gap-x-2 gap-y-3 px-3 lg:hidden">
            {SCATTER.map((a, i) => (
              <motion.div
                key={a.key}
                className="w-[64px]"
                style={{ rotate: a.rot / 1.5 }}
                initial={{ opacity: 0, y: -16, scale: 1.1 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.25 + i * 0.05, ...TOSS }}
              >
                <span className="block w-full overflow-hidden rounded-[5px] shadow-[0_8px_16px_rgba(0,0,0,0.5)]">
                  <Artifact k={a.key} />
                </span>
              </motion.div>
            ))}
          </div>

          {/* the score pad */}
          <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:py-10">
            <ScorePad
              name={name}
              setName={setName}
              code={code}
              setCode={setCode}
              busy={busy}
              error={error}
              onCreate={createParty}
              onJoin={joinParty}
              nameRef={nameRef}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
