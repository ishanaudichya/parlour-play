"use client";

/* Weapon selection — its own screen, before the battlefield appears. A pool
   of Pocket Tanks weapons is laid out; the tanks take turns, snake order,
   claiming one at a time until every arsenal is full. As in Pocket Tanks you
   can hit "Random" for any pick, or hand the rest of your picks to chance.

   The screen is exactly one viewport: the status line, the racks and the
   actions stay put, and the pool is laid out to fit what is left — as many
   columns as it takes, cards trimmed to their names if room is short. Only
   when even that won't fit (small phones) does the pool scroll, on its own. */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ARSENAL, PICK_MS, type TanksView } from "@/lib/games/tanks/types";
import { WEAPONS, type WeaponId } from "@/lib/games/tanks/weapons";
import { stencil } from "./font";
import { WeaponIcon } from "./icons";
import { LINE, SURFACE, SURFACE_2, TANK, TEXT, TEXT_2, TEXT_3 } from "./palette";

/** large: big screens, everything a size up · full: icon beside name + blurb · compact: icon + name · stack: phone card, blurb under the name */
type Density = "large" | "full" | "compact" | "stack";

const GAP = 8;
/** the screen's own rhythm: padding above + below, and between its blocks */
const PAD_Y = 24;
const GAP_Y = 12;
const SPEC: Record<Density, { minW: number; h: number; grow: number }> = {
  large: { minW: 264, h: 100, grow: 120 },
  full: { minW: 236, h: 66, grow: 92 },
  compact: { minW: 150, h: 44, grow: 54 },
  stack: { minW: 150, h: 96, grow: 96 },
};
/** a full card this tall has room for a third line of blurb */
const ROOMY = 82;
/** past this a card is just wasted width — use another column */
const MAX_CARD_W = 380;

/** phones on their side: every rack on one line */
const SHORT_Q = "(max-height: 520px) and (min-width: 600px)";
/** phones upright: three or four racks go two-up, name over slots */
const NARROW_Q = "(max-width: 639px)";
const subQ = (q: string) => (cb: () => void) => {
  const m = window.matchMedia(q);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const subShort = subQ(SHORT_Q);
const subNarrow = subQ(NARROW_Q);
const isShort = () => window.matchMedia(SHORT_Q).matches;
const isNarrow = () => window.matchMedia(NARROW_Q).matches;
const never = () => false;

interface Fit {
  cols: number;
  density: Density;
  rowH: number;
  scroll: boolean;
}

/** The densest-reading layout of `n` cards that fits a w × h box. */
function fitPool(n: number, w: number, h: number): Fit {
  const colsFor = (c: number) => (w - GAP * (c - 1)) / c;
  for (const density of ["large", "full", "compact"] as const) {
    const s = SPEC[density];
    const minCols = Math.max(1, Math.ceil((w + GAP) / (MAX_CARD_W + GAP)));
    for (let c = minCols; c <= n && colsFor(c) >= s.minW; c++) {
      const rows = Math.ceil(n / c);
      const need = rows * s.h + (rows - 1) * GAP;
      if (need <= h) {
        const rowH = Math.min(s.grow, Math.floor((h - (rows - 1) * GAP) / rows));
        return { cols: c, density, rowH, scroll: false };
      }
    }
  }
  // it can't all fit: scroll the pool alone, at a comfortable reading size
  if (colsFor(2) >= SPEC.full.minW) {
    const cols = Math.max(2, Math.min(n, Math.floor((w + GAP) / (SPEC.full.minW + GAP))));
    return { cols, density: "full", rowH: SPEC.full.h, scroll: true };
  }
  const cols = Math.max(1, Math.min(3, Math.floor((w + GAP) / (SPEC.stack.minW + GAP))));
  return { cols, density: cols >= 2 ? "stack" : "full", rowH: cols >= 2 ? SPEC.stack.h : SPEC.full.h, scroll: true };
}

function Punch({ n, hue }: { n: number; hue: string }) {
  return (
    <span className="flex shrink-0 gap-[3px]" title={`Punch ${n}/5`}>
      {Array.from({ length: 5 }, (_, k) => (
        <span key={k} className="h-1.5 w-1.5 rounded-full" style={{ background: k < n ? hue : "rgba(255,255,255,0.12)" }} />
      ))}
    </span>
  );
}

function Card({ id, canPick, onPick, density, roomy }: { id: WeaponId; canPick: boolean; onPick: (w: WeaponId) => void; density: Density; roomy: boolean }) {
  const m = WEAPONS[id];
  const base = `h-full min-w-0 rounded-xl text-left transition-colors ${canPick ? "hover:bg-white/[0.05]" : "cursor-default"}`;
  const motionProps = {
    layout: true,
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
    transition: { duration: 0.2 },
  } as const;
  const large = density === "large";
  const name = (
    <span className={`truncate font-semibold ${large ? "text-[15px] leading-5" : "text-[13px] leading-4"}`} style={{ color: TEXT }}>
      {m.name}
    </span>
  );

  if (density === "stack")
    return (
      <motion.button {...motionProps} type="button" disabled={!canPick} onClick={() => onPick(id)} title={m.blurb} className={`${base} flex flex-col gap-1.5 p-2.5`} style={{ background: SURFACE_2, border: `1px solid ${LINE}` }}>
        <span className="flex w-full min-w-0 items-center gap-2">
          <WeaponIcon id={id} size={26} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            {name}
            <Punch n={m.punch} hue={m.hue} />
          </span>
        </span>
        <span className="line-clamp-3 text-[11px] leading-[14px]" style={{ color: TEXT_2 }}>
          {m.blurb}
        </span>
      </motion.button>
    );

  return (
    <motion.button
      {...motionProps}
      type="button"
      disabled={!canPick}
      onClick={() => onPick(id)}
      title={density === "compact" ? `${m.name} — ${m.blurb}` : m.blurb}
      className={`${base} flex items-center ${large ? "gap-4 px-4 py-3" : density === "full" ? "gap-3 px-3 py-2" : "gap-2.5 px-2.5 py-1.5"}`}
      style={{ background: SURFACE_2, border: `1px solid ${LINE}` }}
    >
      <WeaponIcon id={id} size={large ? 44 : density === "full" ? 34 : 26} />
      <span className="min-w-0 flex-1">
        {/* compact cards are narrow: the punch goes under the name so the name keeps its width */}
        <span className={density === "compact" ? "flex flex-col gap-1" : "flex items-center justify-between gap-2"}>
          {name}
          <Punch n={m.punch} hue={m.hue} />
        </span>
        {density !== "compact" && (
          <span className={large ? "mt-1 line-clamp-3 text-[12.5px] leading-[17px]" : `mt-0.5 text-[11.5px] leading-[14px] ${roomy ? "line-clamp-3" : "line-clamp-2"}`} style={{ color: TEXT_2 }}>
            {m.blurb}
          </span>
        )}
      </span>
    </motion.button>
  );
}

export function DraftScreen({
  v,
  youId,
  canPick,
  onPick,
  onAuto,
  seated,
  nowEst,
}: {
  v: TanksView;
  youId: string;
  canPick: boolean;
  onPick: (w: WeaponId | "random") => void;
  onAuto: () => void;
  seated: boolean;
  nowEst: number;
}) {
  const me = v.players.find((p) => p.id === youId) ?? null;
  const n = v.players.length;
  const k = ARSENAL[n] ?? 6;
  const picker = v.players.find((p) => p.id === v.turn) ?? null;
  const round = Math.min(k, Math.floor(v.draftIdx / n) + 1);
  const left = v.deadline ? Math.max(0, v.deadline - nowEst) : 0;
  const frac = Math.min(1, left / PICK_MS);
  const accent = picker ? TANK[picker.color].base : TEXT;
  const short = useSyncExternalStore(subShort, isShort, never);
  const twoUp = useSyncExternalStore(subNarrow, isNarrow, never) && !short && n > 2;
  const slot = short ? 15 : twoUp && k > 6 ? 16 : 18;

  // lay the pool out for the room it has: the whole area, less the status
  // row and racks above it
  const area = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const a = area.current;
    const hd = head.current;
    if (!a || !hd) return;
    const measure = () => {
      const w = hd.clientWidth;
      const h = a.clientHeight - hd.offsetHeight - PAD_Y - GAP_Y;
      setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(a);
    ro.observe(hd);
    return () => ro.disconnect();
  }, []);
  // size for the whole pool as dealt, so cards don't reflow as picks thin it out
  const dealt = v.pool.length + v.draftIdx;
  const fit = box ? fitPool(dealt, box.w, box.h) : null;
  const rows = fit ? Math.ceil(dealt / fit.cols) : 0;

  const status = canPick ? "Your pick" : picker ? `${picker.name} is picking…` : "…";

  const statusRow = (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
      <div className="flex min-w-0 items-center gap-4 sm:gap-6">
        <div className="min-w-0">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.2em]" style={{ color: TEXT_3 }}>
            Round {round} of {k}
          </div>
          {/* on short screens the toolbar's "Weapon draft" says it */}
          <h2 className={`${stencil.className} truncate text-[19px] leading-tight sm:text-[25px] [@media(max-height:520px)]:hidden`} style={{ color: TEXT }}>
            Draft your arsenal
          </h2>
        </div>
        <div className="min-w-0 pt-3.5 [@media(max-height:520px)]:pt-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${v.draftIdx}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="truncate text-[13.5px] font-semibold" style={{ color: canPick ? accent : TEXT_2 }}>
              {status}
            </motion.div>
          </AnimatePresence>
          <div className="mt-1.5 h-[3px] w-28 overflow-hidden rounded-full sm:w-36" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: accent, transition: "width 200ms linear" }} />
          </div>
        </div>
      </div>

      {/* chance */}
      {seated && me && (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {me.autoDraft ? (
            <span className="flex h-10 flex-1 items-center justify-center rounded-lg px-3 text-[12.5px] sm:flex-none" style={{ color: TEXT_2, border: `1px dashed ${LINE}` }}>
              Your picks are being made at random
            </span>
          ) : (
            <>
              <motion.button
                type="button"
                disabled={!canPick}
                onClick={() => onPick("random")}
                whileTap={{ scale: 0.96 }}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition-colors enabled:hover:bg-white/[0.08] disabled:opacity-35 sm:flex-none"
                style={{ color: TEXT, border: `1px solid ${LINE}`, background: SURFACE_2 }}
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                  <rect x={1.5} y={1.5} width={13} height={13} rx={3} fill="none" stroke="currentColor" strokeWidth={1.3} />
                  {[[5, 5], [11, 5], [8, 8], [5, 11], [11, 11]].map(([x, y]) => (
                    <circle key={`${x}${y}`} cx={x} cy={y} r={1.1} fill="currentColor" />
                  ))}
                </svg>
                Random
              </motion.button>
              <button
                type="button"
                onClick={onAuto}
                className="h-10 flex-[1.6] rounded-lg px-4 text-[13px] font-medium transition-colors hover:bg-white/[0.06] sm:flex-none"
                style={{ color: TEXT_2, border: `1px solid ${LINE}` }}
              >
                Pick the rest at random
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );

  // each player's rack
  const cols = short || twoUp ? (twoUp ? "grid-cols-2" : n === 2 ? "grid-cols-2" : n === 3 ? "grid-cols-3" : "grid-cols-4") : n === 2 ? "sm:grid-cols-2" : n === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";
  const racks = (
    <div className={`grid gap-2 ${cols}`}>
      {v.players.map((p) => {
        const P = TANK[p.color];
        const active = p.id === v.turn;
        return (
          <div
            key={p.id}
            className={`flex min-w-0 rounded-xl ${twoUp ? "flex-col gap-1.5 px-2.5 py-2" : short ? "items-center gap-2 px-2.5 py-1.5" : "items-center gap-2.5 px-3 py-2"}`}
            style={{ background: SURFACE, border: `1px solid ${active ? P.base : LINE}`, opacity: p.left ? 0.45 : 1, transition: "border-color 200ms" }}
          >
            <span className={`flex min-w-0 items-center ${twoUp ? "gap-2" : "shrink-0 gap-2.5"}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: P.base }} />
              <span className={`truncate font-semibold ${twoUp ? "min-w-0 text-[12.5px] leading-4" : short ? "w-10 text-[12px]" : "w-14 text-[13px] sm:w-16 lg:w-auto lg:max-w-20"}`} style={{ color: TEXT }}>
                {p.id === youId ? "You" : p.name}
              </span>
            </span>
            <div className={`flex min-w-0 flex-1 flex-wrap ${short || twoUp ? "gap-[2px]" : "gap-[3px]"}`}>
              {p.drafted.map((w) => (
                <motion.span key={w} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 26 }} title={WEAPONS[w].name}>
                  <WeaponIcon id={w} size={slot} />
                </motion.span>
              ))}
              {Array.from({ length: Math.max(0, k - p.drafted.length) }, (_, i) => (
                <span key={`e${i}`} className="rounded-full" style={{ width: slot, height: slot, border: `1px dashed ${LINE}` }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    // the whole area is measured; the content sits centred in it when the
    // pool fits, or fills it (pool scrolling) when it doesn't
    <div ref={area} className="flex min-h-0 flex-1 flex-col">
      <div
        className={`mx-auto flex min-h-0 w-full max-w-[1600px] flex-col px-3 sm:px-5 ${fit?.scroll ? "flex-1" : "my-auto"}`}
        style={{ paddingTop: PAD_Y / 2, paddingBottom: PAD_Y / 2, gap: GAP_Y }}
      >
        <div ref={head} className="flex shrink-0 flex-col gap-3">
          {statusRow}
          {racks}
        </div>

        {/* the pool: fitted to the room left, scrolling on its own only when it must */}
        <div
          className={fit?.scroll ? "-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1" : "shrink-0"}
          style={fit && !fit.scroll ? { height: rows * fit.rowH + (rows - 1) * GAP } : undefined}
        >
          {fit && (
            <div className="grid" style={{ gap: GAP, gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))`, gridAutoRows: fit.rowH }}>
              <AnimatePresence mode="popLayout">
                {v.pool.map((id) => (
                  <Card key={id} id={id} canPick={canPick} onPick={onPick} density={fit.density} roomy={fit.rowH >= ROOMY} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
