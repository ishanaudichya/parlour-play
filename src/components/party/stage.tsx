"use client";

/* The Parlour's own look — a gig poster for game night. Soot-black stock,
   bone-white type set in a condensed poster face, a flare-red ink and a
   sun-yellow one, halftone dots, and paper tickets. Every shell screen (door,
   invitation, lobby) is built from these pieces; the games keep their own
   worlds. */

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GAME_UI } from "@/components/games/registry";
import { GAME_META } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";
import { BILLING } from "./catalog";
import { Spark } from "./PartyMenu";

export { Spark };

export const EASE = [0.16, 1, 0.3, 1] as const;

/** Eight riso inks for the people at the table, by seat. */
export const INKS = ["#ff4d2e", "#ffc93c", "#4d7cff", "#2fd39a", "#ff63a5", "#a47cff", "#ff9a3d", "#4fd2ff"];
export const inkOf = (seat: number) => INKS[((seat % INKS.length) + INKS.length) % INKS.length];

/** A game's accent, lifted so it reads on soot. */
export const liftAccent = (k: GameType) => `color-mix(in oklab, ${GAME_META[k].accent} 78%, white)`;

export const stageName = (k: GameType) => BILLING[k].stage ?? GAME_META[k].title;

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-poster font-extrabold uppercase leading-none tracking-[0.08em] ${className}`} translate="no">
      <Spark size={13} className="text-flare" />
      Parlour
    </span>
  );
}

export function TopStrip({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <header className={`relative z-20 flex h-14 shrink-0 items-center justify-between gap-4 px-4 sm:px-6 lg:px-10 ${className}`}>
      <Link href="/" className="text-[24px] text-bone transition hover:text-white" aria-label="Parlour — home">
        <Wordmark />
      </Link>
      <div className="flex min-w-0 items-center gap-4">{children}</div>
    </header>
  );
}

/** Halftone ink bleeding in from an edge — print texture, nothing more. */
export function Bleed({ className = "", color = "var(--color-flare)", size = 560 }: { className?: string; color?: string; size?: number }) {
  return (
    <div
      aria-hidden
      className={`halftone drift pointer-events-none absolute ${className}`}
      style={{
        width: size,
        height: size,
        color,
        maskImage: "radial-gradient(circle at center, black 0%, transparent 68%)",
        WebkitMaskImage: "radial-gradient(circle at center, black 0%, transparent 68%)",
      }}
    />
  );
}

/** A person at the table: a riso-ink disc with their initial. */
export function Avatar({ name, seat, size = 40, className = "" }: { name: string; seat: number; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-poster font-extrabold uppercase text-void ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.56, background: inkOf(seat), lineHeight: 1 }}
    >
      {name.trim().slice(0, 1) || "?"}
    </span>
  );
}

/* ---------------- posters ---------------- */

const POSTER_W = 304;
const POSTER_H = 190;

/** A game's poster at any size: drawn at its design size, scaled to fit. */
export function PosterFrame({ k, className = "", rounded = "rounded-xl" }: { k: GameType; className?: string; rounded?: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / POSTER_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const Poster = GAME_UI[k]?.Poster;
  return (
    <div ref={box} className={`relative aspect-[16/10] w-full overflow-hidden bg-char ${rounded} ${className}`}>
      {Poster && scale !== null && (
        <div
          className="absolute left-0 top-0 [&>*]:!rounded-none [&>*]:!border-0"
          style={{ width: POSTER_W, height: POSTER_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        >
          <Poster />
        </div>
      )}
    </div>
  );
}

/* ---------------- the lineup ---------------- */

const BASE = 100; // measuring size, px
const LH = 0.9; // line height, em
const ROW_GAP = 0.06; // em of the row's own size
const INTER_LH = 2.1; // an interlude line's height, in its own em

/** A row of the bill: games set wall to wall, or a small interlude line
    ("with special guests") printed between them. */
export type BillRow = GameType[] | string;

/** One game's name as a bill of its own (cached, so the identity is stable). */
const SOLO = new Map<GameType, BillRow[]>();
export const soloBill = (k: GameType): BillRow[] => {
  let rows = SOLO.get(k);
  if (!rows) SOLO.set(k, (rows = [[k]]));
  return rows;
};

/** A festival bill: each row of game names is set to the full width, so
    short rows print big; the whole bill also fits the height when asked. */
export function Lineup({
  rows,
  fillHeight = false,
  maxFont = 240,
  active = null,
  pinned = null,
  decor = false,
  autoplay = false,
  onHover,
  onPick,
  className = "",
}: {
  rows: BillRow[];
  fillHeight?: boolean;
  maxFont?: number;
  active?: GameType | null;
  pinned?: GameType | null;
  /** background texture only: no interaction, no entrance */
  decor?: boolean;
  /** now and then a name prints its colour plate by itself */
  autoplay?: boolean;
  onHover?: (k: GameType | null, el?: HTMLElement, e?: React.PointerEvent) => void;
  onPick?: (k: GameType, pointer: string) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const plates = useRef<HTMLDivElement | null>(null);
  const measure = useRef<(HTMLDivElement | null)[]>([]);
  const [sizes, setSizes] = useState<number[] | null>(null);
  const pointer = useRef("mouse");
  const [auto, setAuto] = useState<GameType | null>(null);

  // the bill is never quite still: a name lights up in its own ink, then the next
  useEffect(() => {
    if (!autoplay || active) return;
    const names = rows.flatMap((r) => (typeof r === "string" ? [] : r));
    let last: GameType | null = null;
    const id = window.setInterval(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      let k = names[Math.floor(Math.random() * names.length)];
      if (k === last) k = names[(names.indexOf(k) + 1) % names.length];
      last = k;
      setAuto(k);
    }, 1700);
    return () => {
      window.clearInterval(id);
      setAuto(null);
    };
  }, [autoplay, active, rows]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const W = el.clientWidth;
      if (!W) return;
      // game rows fit the width (with a hair of slack for hinting)
      let s = rows.map((r, i) => (typeof r === "string" ? 0 : Math.min(maxFont, (BASE * W * 0.985) / (measure.current[i]?.scrollWidth || 1))));
      const games = s.filter((x) => x > 0);
      const mean = games.reduce((a, x) => a + x, 0) / Math.max(1, games.length);
      s = s.map((x, i) => (typeof rows[i] === "string" ? Math.max(15, Math.min(30, mean * 0.3)) : x));
      if (fillHeight) {
        const H = el.clientHeight;
        const total = s.reduce((a, x, i) => a + x * (typeof rows[i] === "string" ? INTER_LH : LH + ROW_GAP), 0);
        if (H && total > H) s = s.map((x) => (x * H) / total);
      }
      const next = s.map((x) => Math.floor(x * 10) / 10);
      setSizes((prev) => (prev && prev.length === next.length && prev.every((x, i) => x === next[i]) ? prev : next));
    };
    fit();
    // refit when the box resizes, and when the poster face swaps in
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    measure.current.forEach((m) => m && ro.observe(m));
    document.fonts?.addEventListener?.("loadingdone", fit);
    let live = true;
    document.fonts?.ready.then(() => live && fit());
    return () => {
      live = false;
      ro.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", fit);
    };
  }, [rows, fillHeight, maxFont]);

  const names = (r: GameType[], interactive: boolean) =>
    r.map((k, j) => (
      <span key={k}>
        {j > 0 && (
          <span
            aria-hidden
            className={`mx-[0.14em] inline-block align-[0.08em] text-flare ${decor ? "" : "twinkle"}`}
            style={decor ? undefined : { animationDelay: `${-((k.length * 7 + j * 13) % 38) / 10}s` }}
          >
            <Spark className="h-[0.36em] w-[0.36em]" />
          </span>
        )}
        {interactive ? (
          <button
            type="button"
            className="relative uppercase transition-[opacity,text-shadow] duration-200"
            style={{
              opacity: active && active !== k ? 0.22 : 1,
              textShadow:
                active === k || pinned === k || (!active && auto === k) ? `0.05em 0.04em 0 ${liftAccent(k)}` : "0 0 0 transparent",
              transitionDuration: auto === k && !active ? "600ms" : undefined,
            }}
            onPointerDown={(e) => (pointer.current = e.pointerType)}
            onPointerEnter={(e) => e.pointerType === "mouse" && onHover?.(k, e.currentTarget, e)}
            onPointerMove={(e) => e.pointerType === "mouse" && onHover?.(k, e.currentTarget, e)}
            onFocus={(e) => onHover?.(k, e.currentTarget)}
            onBlur={() => onHover?.(null)}
            onClick={() => onPick?.(k, pointer.current)}
            aria-label={`${GAME_META[k].title} — ${GAME_META[k].tagline}`}
          >
            {stageName(k)}
          </button>
        ) : (
          <span className="uppercase">{stageName(k)}</span>
        )}
      </span>
    ));

  return (
    <div
      ref={box}
      className={`relative ${fillHeight ? "flex h-full flex-col justify-center" : ""} ${className}`}
      // the display cut at every size, so widths scale linearly with size
      style={{ fontVariationSettings: '"opsz" 72' }}
    >
      {/* measuring plates, at a fixed size */}
      <div ref={plates} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 overflow-hidden">
        {rows.map((r, i) =>
          typeof r === "string" ? (
            <div key={i} />
          ) : (
            <div
              key={i}
              ref={(el) => {
                measure.current[i] = el;
              }}
              className="w-max whitespace-nowrap font-poster font-extrabold leading-none tracking-[0.005em]"
              style={{ fontSize: BASE }}
            >
              {names(r, false)}
            </div>
          )
        )}
      </div>

      <div className={`font-poster font-extrabold tracking-[0.005em] text-bone ${sizes ? "" : "opacity-0"}`}>
        {rows.map((r, i) =>
          typeof r === "string" ? (
            <motion.div
              key={i}
              initial={decor ? false : { opacity: 0 }}
              animate={sizes ? { opacity: 1 } : undefined}
              transition={{ delay: 0.3 + i * 0.07, duration: 0.6 }}
              className="flex items-center gap-[0.6em] font-aside font-normal italic text-dust"
              style={{ fontSize: sizes?.[i] ?? 18, lineHeight: 1, height: `${INTER_LH}em` }}
            >
              <span className="h-px flex-1 bg-seam" />
              {r}
              <span className="h-px flex-1 bg-seam" />
            </motion.div>
          ) : (
            <div key={i} className="overflow-hidden" style={{ fontSize: sizes?.[i] ?? 40, lineHeight: LH, marginBottom: `${ROW_GAP}em` }}>
              <motion.div
                className="whitespace-nowrap"
                initial={decor ? false : { y: "105%" }}
                animate={sizes ? { y: 0 } : undefined}
                transition={{ delay: 0.08 + i * 0.07, duration: 0.7, ease: EASE }}
              >
                {names(r, !decor)}
              </motion.div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

/* ---------------- the ticker ---------------- */

/** A band of type that runs forever: the content is printed twice and slid
    half its length, so the seam never shows. */
export function Marquee({
  children,
  seconds = 40,
  reverse = false,
  className = "",
}: {
  children: React.ReactNode;
  seconds?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <div className={`marquee-track flex w-max ${reverse ? "reverse" : ""}`} style={{ "--marquee-dur": `${seconds}s` } as React.CSSProperties}>
        <div className="flex shrink-0 items-center">{children}</div>
        <div aria-hidden className="flex shrink-0 items-center">
          {children}
        </div>
      </div>
    </div>
  );
}

/** A ticker of short items, sparks between them. */
export function Ticker({ items, seconds, className = "" }: { items: React.ReactNode[]; seconds?: number; className?: string }) {
  // repeat short lists so one copy is wider than any screen
  const reps = Math.max(1, Math.ceil(12 / Math.max(1, items.length)));
  const run = Array.from({ length: reps }, () => items).flat();
  return (
    <Marquee seconds={seconds ?? Math.max(28, run.length * 3.2)} className={className}>
      {run.map((it, i) => (
        <span key={i} className="flex shrink-0 items-center">
          <span className="whitespace-nowrap px-4">{it}</span>
          <Spark size={8} className="shrink-0 text-flare" />
        </span>
      ))}
    </Marquee>
  );
}

/* ---------------- tickets ---------------- */

/** A paper admission ticket. */
export function Ticket({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative rounded-[20px] bg-bone text-void shadow-[0_30px_80px_rgba(0,0,0,0.55),0_4px_14px_rgba(0,0,0,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

export function TicketHead({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-t-[20px] bg-flare px-5 py-2.5 text-void">
      <span className="smallprint flex items-center gap-1.5 font-semibold">{left}</span>
      {right && <span className="smallprint font-semibold">{right}</span>}
    </div>
  );
}

/** The perforation: notches bitten out of both edges and a dotted tear line. */
export function TicketTear({ notch = "var(--color-void)" }: { notch?: string }) {
  return (
    <div aria-hidden className="relative my-1 h-6">
      <span className="absolute -left-3 top-0 h-6 w-6 rounded-full" style={{ background: notch }} />
      <span className="absolute -right-3 top-0 h-6 w-6 rounded-full" style={{ background: notch }} />
      <span className="absolute left-5 right-5 top-1/2 border-t-2 border-dotted border-void/25" />
    </div>
  );
}

/** Decorative barcode, deterministic per seed. */
export function Barcode({ seed = "PARLOUR", className = "" }: { seed?: string; className?: string }) {
  const bars: { x: number; w: number }[] = [];
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let x = 0;
  while (x < 118) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const w = 1 + (h % 3);
    bars.push({ x, w });
    x += w + 1 + ((h >>> 4) % 3);
  }
  return (
    <svg viewBox="0 0 120 26" className={className} aria-hidden preserveAspectRatio="none">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={26} fill="currentColor" />
      ))}
    </svg>
  );
}

/** Small "copied" feedback that resets itself. */
export function useFlash(ms = 1600): [string | null, (k: string) => void] {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    if (!v) return;
    const id = setTimeout(() => setV(null), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return [v, setV];
}

export function Meta({ k, className = "" }: { k: GameType; className?: string }) {
  const m = GAME_META[k];
  return (
    <span className={`smallprint ${className}`}>
      {m.min === m.max ? `${m.min} players` : `${m.min}–${m.max} players`} · ~{BILLING[k].minutes} min
    </span>
  );
}
