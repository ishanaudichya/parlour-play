"use client";

/* Shell design language — "midnight lounge". Distinct from every game:
   indigo velvet, coral neon signage, warm linen type, soft rounded geometry. */

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

/** The neon sign over the door. */
export function NeonMark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-shell italic font-semibold neon-text select-none ${className}`} translate="no">
      Parlour
    </span>
  );
}
