"use client";

/* The fire-control strip under the field. One calm row on desktop, a tidy
   stack on phones: the loaded weapon, elevation and power as sliders with
   fine-step buttons, the drive buttons, and the trigger. Keys mirror it:
   ←/→ angle, ↑/↓ power, Q/E weapon, A/D drive, Space fire. When it isn't
   your shot it mirrors the shooter's settings, read-only. */

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { TanksViewPlayer } from "@/lib/games/tanks/types";
import { WEAPONS, type WeaponId } from "@/lib/games/tanks/weapons";
import { stencil } from "./font";
import { WeaponIcon } from "./icons";
import { LINE, SURFACE, SURFACE_2, TANK, TEXT, TEXT_2, TEXT_3 } from "./palette";
import { tanksSfx } from "./sfx";

const RANGE_CSS = `
.tk-range { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; background: transparent; cursor: pointer; }
.tk-range:disabled { cursor: default; }
.tk-range::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(90deg, var(--c) 0 var(--f), rgba(255,255,255,0.1) var(--f) 100%); }
.tk-range::-moz-range-track { height: 4px; border-radius: 4px; background: rgba(255,255,255,0.1); }
.tk-range::-moz-range-progress { height: 4px; border-radius: 4px; background: var(--c); }
.tk-range::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 50%; background: #f4f0e6; border: 3px solid var(--c); }
.tk-range::-moz-range-thumb { width: 10px; height: 10px; border-radius: 50%; background: #f4f0e6; border: 3px solid var(--c); }
.tk-range:disabled::-webkit-slider-thumb { background: #8a877f; }
`;

function Caption({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: TEXT_3 }}>
      <span>{children}</span>
      {right}
    </div>
  );
}

function Step({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[14px] leading-none transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
      style={{ color: TEXT_2, border: `1px solid ${LINE}` }}
    >
      {children}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  display,
  color,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  color: string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const f = ((value - min) / (max - min)) * 100;
  return (
    <div className="min-w-0">
      <Caption right={<span className="text-[13px] font-semibold normal-case tabular-nums tracking-normal" style={{ color: TEXT }}>{display}</span>}>{label}</Caption>
      <div className="mt-1 flex h-[38px] items-center gap-1.5">
        <Step label={`${label} down`} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          −
        </Step>
        <input
          type="range"
          aria-label={label}
          className="tk-range min-w-0 flex-1"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ["--c" as string]: color, ["--f" as string]: `${f}%` }}
        />
        <Step label={`${label} up`} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </Step>
      </div>
    </div>
  );
}

function WeaponPicker({ player, loaded, interactive, onLoad }: { player: TanksViewPlayer; loaded: WeaponId | null; interactive: boolean; onLoad: (w: WeaponId) => void }) {
  const [open, setOpen] = useState(false);
  const arsenal = player.arsenal;
  const m = loaded ? WEAPONS[loaded] : null;
  const choose = (w: WeaponId) => {
    onLoad(w);
    tanksSfx("load");
    setOpen(false);
  };
  return (
    <div className="relative min-w-0">
      <Caption right={<span className="normal-case tracking-normal">{arsenal.length} left</span>}>Weapon</Caption>
      <button
        type="button"
        disabled={!interactive || arsenal.length === 0}
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex h-[38px] w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left transition-colors enabled:hover:bg-white/[0.06]"
        style={{ border: `1px solid ${LINE}`, background: SURFACE_2 }}
      >
        {loaded ? <WeaponIcon id={loaded} size={24} /> : <span className="h-6 w-6" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: TEXT }}>
          {m ? m.name : "Nothing left"}
        </span>
        {interactive && arsenal.length > 1 && (
          <span className="text-[11px]" style={{ color: TEXT_3 }}>
            ▾
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && interactive && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 z-40 mb-2 max-h-[60vh] w-[min(88vw,360px)] overflow-y-auto rounded-xl p-1"
              style={{ background: SURFACE_2, border: `1px solid ${LINE}`, boxShadow: "0 16px 40px rgba(0,0,0,0.55)" }}
            >
              {arsenal.map((w) => {
                const wm = WEAPONS[w];
                const on = w === loaded;
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => choose(w)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                    style={{ background: on ? "rgba(255,255,255,0.07)" : undefined }}
                  >
                    <WeaponIcon id={w} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold" style={{ color: TEXT }}>
                        {wm.name}
                      </span>
                      <span className="block truncate text-[11px]" style={{ color: TEXT_3 }}>
                        {wm.blurb}
                      </span>
                    </span>
                    {on && <span className="h-1.5 w-1.5 rounded-full" style={{ background: wm.hue }} />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Console({
  player,
  interactive,
  angle,
  power,
  loaded,
  onAngle,
  onPower,
  onLoad,
  onDrive,
  onFire,
}: {
  player: TanksViewPlayer;
  interactive: boolean;
  angle: number;
  power: number;
  loaded: WeaponId | null;
  onAngle: (a: number) => void;
  onPower: (p: number) => void;
  onLoad: (w: WeaponId) => void;
  onDrive: (dir: -1 | 1) => void;
  onFire: () => void;
}) {
  const color = TANK[player.color].base;
  const elev = angle <= 90 ? angle : 180 - angle;
  const side = angle < 90 ? "→" : angle > 90 ? "←" : "↑";
  return (
    <div className="rounded-2xl p-3 sm:p-4" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
      <style>{RANGE_CSS}</style>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end">
        <div className="col-span-2 lg:col-span-1">
          <WeaponPicker player={player} loaded={loaded} interactive={interactive} onLoad={onLoad} />
        </div>
        {/* the slider runs 180 → 0 so dragging right swings the barrel right */}
        <Slider
          label="Angle"
          value={180 - angle}
          min={0}
          max={180}
          display={`${elev}° ${side}`}
          color={color}
          disabled={!interactive}
          onChange={(v) => onAngle(180 - v)}
        />
        <Slider label="Power" value={power} min={0} max={100} display={`${power}`} color={color} disabled={!interactive} onChange={onPower} />

        <div>
          <Caption right={<span className="normal-case tracking-normal">{player.moves}/4</span>}>Drive</Caption>
          <div className="mt-1 flex gap-1.5">
            {([-1, 1] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                aria-label={dir < 0 ? "Drive left" : "Drive right"}
                disabled={!interactive || player.moves <= 0}
                onClick={() => onDrive(dir)}
                className="flex h-[38px] w-11 items-center justify-center rounded-lg text-[12px] transition-colors enabled:hover:bg-white/[0.06] disabled:opacity-30"
                style={{ color: TEXT_2, border: `1px solid ${LINE}`, background: SURFACE_2 }}
              >
                {dir < 0 ? "◀" : "▶"}
              </button>
            ))}
          </div>
        </div>

        <motion.button
          type="button"
          disabled={!interactive || !loaded}
          onClick={onFire}
          whileTap={interactive ? { scale: 0.96 } : undefined}
          className={`${stencil.className} h-[38px] self-end rounded-lg px-7 text-[16px] tracking-[0.14em] transition-colors disabled:cursor-not-allowed lg:min-w-[120px]`}
          style={{
            background: interactive ? "#d8392b" : "rgba(255,255,255,0.06)",
            color: interactive ? "#fff6ee" : TEXT_3,
          }}
        >
          FIRE
        </motion.button>
      </div>
    </div>
  );
}
