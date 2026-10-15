"use client";

/* The fire-control strip under the field. One calm row on desktop; on a
   portrait screen a stack of thumb-sized rows (a label column on the left,
   every slider the full width); a narrow column beside the field on a phone
   held sideways. The loaded weapon, elevation and power as sliders with
   fine-step buttons, the drive buttons, and the trigger. Keys mirror it:
   ←/→ angle, ↑/↓ power, Q/E weapon, A/D drive, Space fire. Angles run the
   full circle. It only ever shows YOUR settings — between turns it sits
   greyed out with what you last dialled in. */

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
.tk-range.tk-big { height: 40px; }
.tk-range.tk-big::-webkit-slider-thumb { width: 22px; height: 22px; margin-top: -9px; }
.tk-range.tk-big::-moz-range-thumb { width: 16px; height: 16px; }
`;

/** row: one strip under the field · stack: portrait, a row per control · side: a column beside the field */
export type ConsoleLayout = "row" | "stack" | "side";

function Caption({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: TEXT_3 }}>
      <span>{children}</span>
      {right}
    </div>
  );
}

function Step({ onClick, disabled, label, big = false, children }: { onClick: () => void; disabled: boolean; label: string; big?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex shrink-0 items-center justify-center leading-none transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent ${big ? "h-10 w-10 rounded-lg text-[17px]" : "h-7 w-7 rounded-md text-[14px]"}`}
      style={{ color: TEXT_2, border: `1px solid ${LINE}` }}
    >
      {children}
    </button>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  color: string;
  disabled: boolean;
  /** the steppers run round past the ends (angles) */
  wrap?: boolean;
  onChange: (v: number) => void;
}

/** − slider + : the control itself, without its caption */
function SliderTrack({ label, value, min, max, color, disabled, wrap = false, onChange, big = false }: SliderProps & { big?: boolean }) {
  const span = max - min + 1;
  const stepBy = (d: number) => onChange(wrap ? ((((value - min + d) % span) + span) % span) + min : Math.max(min, Math.min(max, value + d)));
  const f = ((value - min) / (max - min)) * 100;
  return (
    <div className={`flex min-w-0 items-center ${big ? "h-11 gap-2" : "h-[38px] gap-1.5"}`}>
      <Step label={`${label} down`} big={big} disabled={disabled || (!wrap && value <= min)} onClick={() => stepBy(-1)}>
        −
      </Step>
      <input
        type="range"
        aria-label={label}
        className={`tk-range min-w-0 flex-1 ${big ? "tk-big" : ""}`}
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--c" as string]: color, ["--f" as string]: `${f}%` }}
      />
      <Step label={`${label} up`} big={big} disabled={disabled || (!wrap && value >= max)} onClick={() => stepBy(1)}>
        +
      </Step>
    </div>
  );
}

function Slider(props: SliderProps) {
  return (
    <div className="min-w-0">
      <Caption right={<span className="text-[13px] font-semibold normal-case tabular-nums tracking-normal" style={{ color: TEXT }}>{props.display}</span>}>{props.label}</Caption>
      <div className="mt-1">
        <SliderTrack {...props} />
      </div>
    </div>
  );
}

/** the stack layout's left column: what the row is, and its reading */
function RowLabel({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-center leading-none">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: TEXT_3 }}>
        {label}
      </span>
      <span className="mt-1.5 text-[15px] font-semibold tabular-nums" style={{ color: TEXT }}>
        {value}
      </span>
    </div>
  );
}

/** where the arsenal list opens: up from the strip, or down the side column */
const DROP = {
  up: "bottom-full left-0 mb-2 max-h-[60vh] w-[min(88vw,360px)]",
  upEnd: "bottom-full right-0 mb-2 max-h-[60vh] w-[min(calc(100vw-24px),360px)]",
  downEnd: "top-full right-0 mt-2 max-h-[calc(100dvh-150px)] w-[min(calc(100vw-24px),320px)]",
} as const;

function WeaponPicker({
  player,
  loaded,
  interactive,
  onLoad,
  big = false,
  drop = "up",
}: {
  player: TanksViewPlayer;
  loaded: WeaponId | null;
  interactive: boolean;
  onLoad: (w: WeaponId) => void;
  big?: boolean;
  drop?: keyof typeof DROP;
}) {
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
      {!big && <Caption right={<span className="normal-case tracking-normal">{arsenal.length} left</span>}>Weapon</Caption>}
      <button
        type="button"
        disabled={!interactive || arsenal.length === 0}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left transition-colors enabled:hover:bg-white/[0.06] ${big ? "h-11" : "mt-1 h-[38px]"}`}
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
              className={`absolute z-40 overflow-y-auto rounded-xl p-1 ${DROP[drop]}`}
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
  layout = "row",
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
  layout?: ConsoleLayout;
}) {
  const color = TANK[player.color].base;
  const side = layout === "side";
  const stack = layout === "stack";

  const driveButtons = ([-1, 1] as const).map((dir) => (
    <button
      key={dir}
      type="button"
      aria-label={dir < 0 ? "Drive left" : "Drive right"}
      disabled={!interactive || player.moves <= 0}
      onClick={() => onDrive(dir)}
      className={`flex shrink-0 items-center justify-center rounded-lg text-[12px] transition-colors enabled:hover:bg-white/[0.06] disabled:opacity-30 ${stack ? "h-11 w-11" : side ? "h-[38px] w-9" : "h-[38px] w-11"}`}
      style={{ color: TEXT_2, border: `1px solid ${LINE}`, background: SURFACE_2 }}
    >
      {dir < 0 ? "◀" : "▶"}
    </button>
  ));
  const fireButton = (
    <motion.button
      type="button"
      disabled={!interactive || !loaded}
      onClick={onFire}
      whileTap={interactive ? { scale: 0.96 } : undefined}
      className={`${stencil.className} rounded-lg tracking-[0.14em] transition-colors disabled:cursor-not-allowed ${stack ? "h-11 min-w-0 flex-1 text-[17px]" : side ? "h-[38px] self-end px-3 text-[16px]" : "h-[38px] self-end px-7 text-[16px] lg:min-w-[120px]"}`}
      style={{
        background: interactive ? "#d8392b" : "rgba(255,255,255,0.06)",
        color: interactive ? "#fff6ee" : TEXT_3,
      }}
    >
      FIRE
    </motion.button>
  );

  if (stack)
    // portrait: a label column and full-width, thumb-sized controls
    return (
      <div className="rounded-2xl px-3 py-2.5" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
        <style>{RANGE_CSS}</style>
        <div className="grid grid-cols-[62px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2">
          <RowLabel label="Weapon" value={<span className="text-[12px] font-medium" style={{ color: TEXT_2 }}>{player.arsenal.length} left</span>} />
          <WeaponPicker player={player} loaded={loaded} interactive={interactive} onLoad={onLoad} big drop="upEnd" />
          <RowLabel label="Angle" value={`${angle}°`} />
          <SliderTrack label="Angle" value={angle} min={0} max={359} display={`${angle}°`} color={color} disabled={!interactive} wrap onChange={onAngle} big />
          <RowLabel label="Power" value={power} />
          <SliderTrack label="Power" value={power} min={0} max={100} display={`${power}`} color={color} disabled={!interactive} onChange={onPower} big />
          <RowLabel label="Drive" value={<span className="text-[12px] font-medium" style={{ color: TEXT_2 }}>{player.moves}/4 left</span>} />
          <div className="flex min-w-0 items-center gap-2">
            {driveButtons}
            {fireButton}
          </div>
        </div>
      </div>
    );

  return (
    <div className={side ? "rounded-2xl p-2.5" : "rounded-2xl p-3 lg:px-4"} style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
      <style>{RANGE_CSS}</style>
      <div
        className={
          side
            ? "grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2"
            : "grid grid-cols-2 gap-x-4 gap-y-2.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end"
        }
      >
        <div className={side ? "col-span-2" : "col-span-2 lg:col-span-1"}>
          <WeaponPicker player={player} loaded={loaded} interactive={interactive} onLoad={onLoad} drop={side ? "downEnd" : "up"} />
        </div>
        <div className={side ? "col-span-2" : undefined}>
          <Slider label="Angle" value={angle} min={0} max={359} display={`${angle}°`} color={color} disabled={!interactive} wrap onChange={onAngle} />
        </div>
        <div className={side ? "col-span-2" : undefined}>
          <Slider label="Power" value={power} min={0} max={100} display={`${power}`} color={color} disabled={!interactive} onChange={onPower} />
        </div>

        <div>
          <Caption right={<span className="normal-case tracking-normal">{player.moves}/4</span>}>Drive</Caption>
          <div className="mt-1 flex gap-1.5">{driveButtons}</div>
        </div>

        {fireButton}
      </div>
    </div>
  );
}
