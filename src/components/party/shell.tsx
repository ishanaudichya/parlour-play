"use client";

/* Shell design language — "the table at midnight": walnut, brass, lamplight,
   paper. Distinct from every game. (Token names are legacy: night-* = wood,
   coral-* = brass.) */

import { primeSound, uiClick } from "@/lib/client/synthCore";

type SBtnVariant = "primary" | "outline" | "ghost" | "danger";

const SBTN: Record<SBtnVariant, string> = {
  primary:
    "bg-gradient-to-b from-coral-300 to-coral-500 text-night-950 border border-coral-200/50 hover:from-coral-200 hover:to-coral-400 shadow-[0_4px_24px_rgba(244,116,79,0.28)]",
  outline: "border border-night-600 text-linen-100 hover:border-coral-400/70 hover:text-coral-200",
  ghost: "text-linen-500 hover:text-coral-300 border border-transparent",
  danger: "border border-blood-500/50 text-blood-300 hover:border-blood-400 hover:bg-blood-500/10",
};

export function SButton({
  variant = "outline",
  className = "",
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: SBtnVariant }) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        primeSound();
        uiClick();
        onClick?.(e);
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-sans text-[12px] font-semibold tracking-[0.04em] transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 ${SBTN[variant]} ${className}`}
    />
  );
}

export function SPanel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-2xl border border-night-600/80 bg-night-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(241,236,225,0.04)] backdrop-blur-[2px] ${className}`}
    >
      {children}
    </div>
  );
}

export const S_INPUT =
  "w-full rounded-xl border border-night-600 bg-night-900/80 px-3.5 py-3 font-sans text-[15px] text-linen-100 placeholder:text-linen-500/50 outline-none transition focus:border-coral-400/70";

/** The brass nameplate on the door. */
export function NeonMark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-shell neon-text select-none ${className}`} translate="no">
      Parlour
    </span>
  );
}

/** Walnut rim + oxblood felt — the table every shell screen is played on. */
export function FeltSurface({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col p-2 sm:p-3.5">
      <div
        className="relative flex flex-1 flex-col rounded-[22px] p-2 sm:rounded-[28px] sm:p-3"
        style={{
          background: "linear-gradient(160deg, #3a2413 0%, #241407 55%, #170c05 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(232,192,135,0.18), inset 0 -2px 8px rgba(0,0,0,0.6), 0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div
          className={`relative flex flex-1 flex-col overflow-hidden rounded-[15px] sm:rounded-[19px] ${className}`}
          style={{
            background: "radial-gradient(110% 85% at 50% 18%, #4d222c 0%, #38161f 48%, #250d14 100%)",
            boxShadow: "inset 0 0 90px rgba(0,0,0,0.65), inset 0 2px 4px rgba(0,0,0,0.5)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(52% 44% at 50% 38%, rgba(232,192,135,0.12) 0%, transparent 70%)" }}
          />
          {children}
        </div>
      </div>
    </div>
  );
}

/** A sheet of the Parlour's paper — the score pad / reservation-card material. */
export function PaperCard({
  className = "",
  rotate = 0,
  children,
}: {
  className?: string;
  rotate?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative text-[#2e2a24] shadow-[0_20px_50px_rgba(0,0,0,0.5),0_3px_10px_rgba(0,0,0,0.35)] ${className}`}
      style={{
        transform: `rotate(${rotate}deg)`,
        background:
          "repeating-linear-gradient(transparent 0px, transparent 30px, rgba(60,50,40,0.07) 30px, rgba(60,50,40,0.07) 31px), linear-gradient(180deg, #f4edda 0%, #efe6cf 100%)",
        borderRadius: "3px 4px 5px 3px",
      }}
    >
      {children}
    </div>
  );
}
