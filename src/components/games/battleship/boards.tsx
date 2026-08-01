"use client";

/* Battleship boards — phosphor-on-navy sonar grids. The FleetBoard shows your
   own hulls and incoming fire; the TargetBoard shows your shots into enemy
   waters, revealed sunk hulls, and a rotating radar sweep on your turn. */

import { motion } from "framer-motion";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  GRID,
  type Dir,
  type ShipId,
  type Shot,
  type SunkShipView,
  type YourShipView,
} from "@/lib/games/battleship/types";

export const GREEN = "#3dde9b";
export const BRIGHT = "#6dffc0";
export const STEEL = "#7ba8c0";
export const EMBER = "#ff7a3c";
export const RED = "#ff4d5e";
export const GRID_LINE = "rgba(61,222,155,0.12)";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
export const coordLabel = (x: number, y: number) => `${LETTERS[x]}${y + 1}`;

const key = (x: number, y: number) => y * GRID + x;

interface HullBoxT {
  x: number;
  y: number;
  dir: Dir;
  len: number;
}

const hullBox = (b: HullBoxT) => ({
  left: `${b.x * 10}%`,
  top: `${b.y * 10}%`,
  width: `${(b.dir === "h" ? b.len : 1) * 10}%`,
  height: `${(b.dir === "v" ? b.len : 1) * 10}%`,
});

const cellBox = (x: number, y: number) => ({
  left: `${x * 10}%`,
  top: `${y * 10}%`,
  width: "10%",
  height: "10%",
});

/* ---------------- frame with A–J / 1–10 rails ---------------- */

function GridFrame({ children, dimmed }: { children: ReactNode; dimmed?: boolean }) {
  return (
    <div className={`w-full transition-opacity ${dimmed ? "opacity-55" : ""}`}>
      <div
        className="mb-0.5 ml-[20px] grid grid-cols-10 text-center text-[9px] font-semibold tracking-[0.12em] tabular-nums"
        style={{ color: "rgba(123,168,192,0.75)" }}
      >
        {LETTERS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="flex items-stretch">
        <div
          className="mr-1 grid w-4 grid-rows-10 text-right text-[9px] font-semibold tabular-nums"
          style={{ color: "rgba(123,168,192,0.75)" }}
        >
          {Array.from({ length: GRID }, (_, i) => (
            <span key={i} className="self-center justify-self-end">
              {i + 1}
            </span>
          ))}
        </div>
        <div
          className="relative aspect-square min-w-0 flex-1 overflow-hidden rounded-[5px] border"
          style={{
            borderColor: "rgba(61,222,155,0.32)",
            background: "linear-gradient(158deg, rgba(10,26,38,0.92) 0%, rgba(5,13,20,0.96) 100%)",
            boxShadow: "inset 0 0 44px rgba(2,9,15,0.9), 0 0 26px rgba(61,222,155,0.05)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(to right, ${GRID_LINE} 1px, transparent 1px), linear-gradient(to bottom, ${GRID_LINE} 1px, transparent 1px)`,
              backgroundSize: "10% 10%",
            }}
          />
          {children}
        </div>
      </div>
    </div>
  );
}

/* ---------------- markers ---------------- */

function HitMarker({ quiet }: { quiet?: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-[16%]"
      initial={{ scale: 2.1, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 360, damping: 19 }}
    >
      {!quiet && (
        <>
          <div
            className="absolute left-1/2 top-1/2 h-[150%] w-px -translate-x-1/2 -translate-y-1/2 rotate-45"
            style={{ background: "linear-gradient(to bottom, transparent, rgba(255,170,90,0.7), transparent)" }}
          />
          <div
            className="absolute left-1/2 top-1/2 h-[150%] w-px -translate-x-1/2 -translate-y-1/2 -rotate-45"
            style={{ background: "linear-gradient(to bottom, transparent, rgba(255,170,90,0.7), transparent)" }}
          />
        </>
      )}
      <div
        className="absolute inset-[6%] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 42% 38%, #ffd9a0 0%, #ff7a3c 46%, rgba(255,77,46,0.35) 72%, transparent 80%)",
          filter: "drop-shadow(0 0 6px rgba(255,122,60,0.75))",
        }}
      />
      <div
        className="absolute inset-[6%] rounded-full"
        style={{
          background: "radial-gradient(circle at 55% 60%, rgba(255,217,160,0.8), transparent 55%)",
          animation: "bs-ember 1.5s ease-in-out infinite",
        }}
      />
    </motion.div>
  );
}

function MissMarker() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <motion.div
        className="absolute inset-[26%] rounded-full border"
        style={{ borderColor: "rgba(255,255,255,0.4)" }}
        initial={{ scale: 0.4, opacity: 0.85 }}
        animate={{ scale: 1.7, opacity: 0 }}
        transition={{ duration: 0.75, ease: "easeOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-[16%] w-[16%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "rgba(255,255,255,0.38)" }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, duration: 0.25 }}
      />
    </div>
  );
}

/** A fully-sunk enemy hull, revealed on the targeting grid with a red stamp. */
function SunkHull({ sk }: { sk: SunkShipView }) {
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={hullBox(sk)}
      initial={{ opacity: 0, scale: 1.14 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <div
        className="absolute inset-[3px] rounded-full border"
        style={{
          borderColor: "rgba(255,77,94,0.7)",
          background: "linear-gradient(180deg, rgba(32,44,56,0.94), rgba(12,20,28,0.96))",
          boxShadow: "0 0 14px rgba(255,77,94,0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <motion.div
          className="flex items-center gap-1 rounded-sm border px-1 py-px text-[9px] font-bold leading-none tracking-widest"
          style={{
            borderColor: RED,
            color: RED,
            rotate: -7,
            textShadow: "0 0 8px rgba(255,77,94,0.8)",
            background: "rgba(10,16,22,0.72)",
          }}
          initial={{ scale: 2.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 320, damping: 17 }}
        >
          ✕
        </motion.div>
      </div>
    </motion.div>
  );
}

/** One of your own hulls: phosphor capsule, deck studs, ember overlays. */
function ShipHull({
  ship,
  selected,
  onTap,
}: {
  ship: YourShipView & { x: number; y: number; dir: Dir };
  selected?: boolean;
  onTap?: () => void;
}) {
  const box: HullBoxT = { x: ship.x, y: ship.y, dir: ship.dir, len: ship.len };
  const body = (
    <>
      <div
        className="absolute inset-[3px] rounded-full border"
        style={{
          borderColor: ship.sunk
            ? "rgba(255,77,94,0.8)"
            : selected
              ? BRIGHT
              : "rgba(109,255,192,0.5)",
          background: ship.sunk
            ? "linear-gradient(180deg, rgba(56,26,30,0.9), rgba(26,12,15,0.92))"
            : "linear-gradient(180deg, rgba(61,222,155,0.3), rgba(61,222,155,0.1))",
          boxShadow: selected
            ? "0 0 14px rgba(109,255,192,0.55), inset 0 1px 0 rgba(109,255,192,0.4)"
            : "0 0 9px rgba(61,222,155,0.22), inset 0 1px 0 rgba(109,255,192,0.28)",
        }}
      />
      {/* deck studs + per-cell ember overlays */}
      <div
        className="absolute inset-0 flex"
        style={{ flexDirection: ship.dir === "h" ? "row" : "column" }}
      >
        {Array.from({ length: ship.len }, (_, i) => (
          <div key={i} className="relative flex-1">
            <div
              className="absolute left-1/2 top-1/2 h-[14%] w-[14%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: ship.hits[i] ? "transparent" : "rgba(109,255,192,0.35)",
                boxShadow: ship.hits[i] ? "none" : "0 0 4px rgba(109,255,192,0.4)",
              }}
            />
            {ship.hits[i] && <HitMarker quiet={ship.sunk} />}
          </div>
        ))}
      </div>
      {ship.sunk && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm border px-1 text-[9px] font-bold leading-tight"
          style={{ borderColor: RED, color: RED, rotate: "-7deg", background: "rgba(10,16,22,0.72)" }}
        >
          ✕
        </div>
      )}
    </>
  );

  if (onTap) {
    return (
      <motion.button
        type="button"
        layout
        transition={{ type: "spring", stiffness: 480, damping: 32 }}
        className="absolute z-10 cursor-pointer"
        style={hullBox(box)}
        onClick={(e) => {
          e.stopPropagation();
          onTap();
        }}
        aria-label={`${ship.name} at ${coordLabel(ship.x, ship.y)} — tap to pick up`}
      >
        {body}
      </motion.button>
    );
  }
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 480, damping: 32 }}
      className="pointer-events-none absolute"
      style={hullBox(box)}
    >
      {body}
    </motion.div>
  );
}

/* ---------------- your fleet board ---------------- */

export function FleetBoard({
  fleet,
  incoming,
  placing,
  selected,
  previewFor,
  onCell,
  onShip,
  dimmed,
}: {
  fleet: YourShipView[];
  incoming: Shot[];
  /** placement mode: cells are tap targets, hulls can be picked up */
  placing?: boolean;
  selected?: ShipId | null;
  previewFor?: (x: number, y: number) => { box: HullBoxT; valid: boolean } | null;
  onCell?: (x: number, y: number) => void;
  onShip?: (id: ShipId) => void;
  dimmed?: boolean;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const placed = fleet.filter(
    (sh): sh is YourShipView & { x: number; y: number; dir: Dir } =>
      sh.placed && sh.x !== undefined && sh.y !== undefined && sh.dir !== undefined
  );
  const preview = placing && hover && previewFor ? previewFor(hover.x, hover.y) : null;

  return (
    <GridFrame dimmed={dimmed}>
      <div
        className="absolute inset-0 grid grid-cols-10 grid-rows-10"
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const x = i % GRID;
          const y = Math.floor(i / GRID);
          if (!placing) return <div key={i} />;
          return (
            <button
              key={i}
              type="button"
              className="relative focus-visible:outline-1 focus-visible:outline-[#6dffc0]"
              onClick={() => onCell?.(x, y)}
              onMouseEnter={() => setHover({ x, y })}
              aria-label={`Deploy at ${coordLabel(x, y)}`}
            />
          );
        })}
      </div>

      {/* placement ghost */}
      {preview && (
        <div className="pointer-events-none absolute z-20" style={hullBox(preview.box)}>
          <div
            className="absolute inset-[3px] rounded-full border border-dashed"
            style={{
              borderColor: preview.valid ? BRIGHT : RED,
              background: preview.valid ? "rgba(61,222,155,0.14)" : "rgba(255,77,94,0.12)",
            }}
          />
        </div>
      )}

      {placed.map((sh) => (
        <ShipHull
          key={sh.ship}
          ship={sh}
          selected={placing && selected === sh.ship}
          onTap={placing && onShip ? () => onShip(sh.ship) : undefined}
        />
      ))}

      {incoming.map((sh) => (
        <div key={key(sh.x, sh.y)} className="pointer-events-none absolute z-20" style={cellBox(sh.x, sh.y)}>
          {sh.hit ? <HitMarker /> : <MissMarker />}
        </div>
      ))}
    </GridFrame>
  );
}

/* ---------------- targeting board ---------------- */

const Crosshair = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke={BRIGHT} strokeWidth="1.5">
    <circle cx="12" cy="12" r="6.5" opacity="0.9" />
    <path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6" strokeLinecap="round" />
    <circle cx="12" cy="12" r="1" fill={BRIGHT} stroke="none" />
  </svg>
);

export function TargetBoard({
  shots,
  sunk,
  active,
  onShoot,
  dimmed,
}: {
  /** your shots into these waters */
  shots: Shot[];
  /** revealed (fully sunk) enemy hulls */
  sunk: SunkShipView[];
  /** it's your gun: hover crosshair, radar sweep, cells tappable */
  active: boolean;
  onShoot?: (x: number, y: number) => void;
  dimmed?: boolean;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const shotMap = new Map(shots.map((sh) => [key(sh.x, sh.y), sh]));
  const sunkCells = new Set<number>();
  for (const sk of sunk) {
    for (let i = 0; i < sk.len; i++) {
      sunkCells.add(key(sk.x + (sk.dir === "h" ? i : 0), sk.y + (sk.dir === "v" ? i : 0)));
    }
  }

  return (
    <GridFrame dimmed={dimmed}>
      <div
        className="absolute inset-0 grid grid-cols-10 grid-rows-10"
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const x = i % GRID;
          const y = Math.floor(i / GRID);
          const sh = shotMap.get(i);
          if (sh) {
            return (
              <div key={i} className="relative" onMouseEnter={() => setHover(null)}>
                {sunkCells.has(i) ? (
                  <div
                    className="absolute left-1/2 top-1/2 h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ background: "rgba(255,77,94,0.65)" }}
                  />
                ) : sh.hit ? (
                  <HitMarker />
                ) : (
                  <MissMarker />
                )}
              </div>
            );
          }
          return (
            <button
              key={i}
              type="button"
              disabled={!active}
              className="group relative focus-visible:outline-1 focus-visible:outline-[#6dffc0]"
              onClick={() => onShoot?.(x, y)}
              onMouseEnter={() => setHover({ x, y })}
              aria-label={`Fire at ${coordLabel(x, y)}`}
            >
              {active && (
                <span className="pointer-events-none absolute inset-[14%] opacity-0 transition-opacity duration-75 group-hover:opacity-100">
                  <Crosshair />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {sunk.map((sk) => (
        <SunkHull key={sk.ship} sk={sk} />
      ))}

      {/* radar sweep while it's your gun */}
      {active && (
        <div className="pointer-events-none absolute inset-0 z-30">
          <div
            className="absolute inset-0"
            style={{
              background:
                "conic-gradient(from 0deg at 50% 50%, rgba(109,255,192,0.15) 0deg, rgba(109,255,192,0.05) 28deg, transparent 62deg)",
              animation: "bs-sweep 4.4s linear infinite",
            }}
          />
        </div>
      )}

      {active && hover && (
        <div
          className="pointer-events-none absolute right-1 top-1 z-40 rounded-sm border px-1 py-px text-[10px] font-semibold tabular-nums"
          style={{ borderColor: "rgba(109,255,192,0.4)", color: BRIGHT, background: "rgba(5,11,18,0.8)" }}
        >
          {coordLabel(hover.x, hover.y)}
        </div>
      )}
    </GridFrame>
  );
}

/* ---------------- fleet status pips ---------------- */

export type PipState = "ok" | "hit" | "sunk" | "unknown";

export function FleetStatusPanel({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; pips: PipState[]; sunk: boolean }[];
}) {
  const pipStyle = (p: PipState): CSSProperties => {
    switch (p) {
      case "ok":
        return { background: "rgba(61,222,155,0.75)", boxShadow: "0 0 4px rgba(61,222,155,0.5)" };
      case "hit":
        return { background: EMBER, boxShadow: "0 0 5px rgba(255,122,60,0.7)" };
      case "sunk":
        return { background: "rgba(255,77,94,0.85)", boxShadow: "0 0 5px rgba(255,77,94,0.6)" };
      case "unknown":
        return { background: "rgba(123,168,192,0.3)" };
    }
  };
  return (
    <div
      className="rounded-md border px-2.5 py-2"
      style={{ borderColor: "rgba(61,222,155,0.2)", background: "rgba(8,18,28,0.6)" }}
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.24em]" style={{ color: STEEL }}>
        {title}
      </div>
      <div className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-2 text-[10px]">
            <span
              className={`uppercase tracking-[0.14em] ${r.sunk ? "line-through" : ""}`}
              style={{ color: r.sunk ? "rgba(255,77,94,0.8)" : "rgba(207,232,221,0.85)" }}
            >
              {r.name}
            </span>
            <span className="flex gap-[3px]">
              {r.pips.map((p, i) => (
                <span key={i} className="h-[7px] w-[7px] rounded-[2px]" style={pipStyle(p)} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
