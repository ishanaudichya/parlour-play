"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect } from "react";
import { SEAT_COLORS } from "@/lib/colors";
import { primeSound, uiClick } from "@/lib/client/synthCore";

/* ---------------- buttons ---------------- */

type BtnVariant = "primary" | "outline" | "danger" | "ghost";

const BTN: Record<BtnVariant, string> = {
  primary:
    "bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 border border-gold-200/60 hover:from-gold-200 hover:to-gold-400 shadow-[0_2px_16px_rgba(198,159,88,0.25)]",
  outline:
    "border border-gold-500/40 text-gold-300 hover:border-gold-400 hover:bg-gold-500/10",
  danger:
    "border border-blood-500/60 text-blood-300 hover:border-blood-400 hover:bg-blood-500/15",
  ghost: "text-parch-500 hover:text-gold-300 border border-transparent",
};

const btnClass = (variant: BtnVariant, className: string) =>
  `inline-flex items-center justify-center gap-2 px-4 py-2.5 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] transition-all duration-150 active:scale-[0.97] disabled:opacity-35 disabled:pointer-events-none rounded-sm ${BTN[variant]} ${className}`;

export function Button({
  variant = "outline",
  className = "",
  silent,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; silent?: boolean }) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        primeSound();
        if (!silent) uiClick();
        onClick?.(e);
      }}
      className={btnClass(variant, className)}
    />
  );
}

/** Link styled as a button — avoids invalid <a><button> nesting (hydration errors). */
export function LinkButton({
  variant = "outline",
  className = "",
  href,
  children,
}: {
  variant?: BtnVariant;
  className?: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={btnClass(variant, className)} onClick={() => uiClick()}>
      {children}
    </Link>
  );
}

/* ---------------- panel with deco corners ---------------- */

export function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const c = "absolute w-3 h-3 border-gold-400/80";
  return (
    <div className={`relative border border-gold-500/25 bg-[#141019]/80 backdrop-blur-[2px] ${className}`}>
      <span className={`${c} left-[-1px] top-[-1px] border-l border-t`} />
      <span className={`${c} right-[-1px] top-[-1px] border-r border-t`} />
      <span className={`${c} left-[-1px] bottom-[-1px] border-l border-b`} />
      <span className={`${c} right-[-1px] bottom-[-1px] border-r border-b`} />
      {children}
    </div>
  );
}

/* ---------------- modal ---------------- */

export function Modal({
  open,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[86dvh] overflow-y-auto scroll-thin`}
          >
            <Panel className="p-6 sm:p-8">{children}</Panel>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------- toast ---------------- */

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 2800);
    return () => clearTimeout(id);
  }, [message, onDone]);
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 10, opacity: 0 }}
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 border border-blood-500/50 bg-blood-900/90 px-5 py-2.5 text-sm text-blood-300 backdrop-blur rounded-sm"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------- coin ---------------- */

export function CoinIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className} aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#c69f58" stroke="#6f5730" strokeWidth="1" />
      <circle cx="10" cy="10" r="6.4" fill="none" stroke="#8a6d3a" strokeWidth="0.9" />
      <path d="M10,5.4 l3.4,4.6 -3.4,4.6 -3.4,-4.6 Z" fill="#f6e9c8" opacity="0.9" />
    </svg>
  );
}

export function CoinCount({ n, size = "md" }: { n: number; size?: "md" | "lg" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${size === "lg" ? "text-xl" : "text-sm"} font-semibold text-gold-300 tabular-nums`}>
      <CoinIcon size={size === "lg" ? 20 : 14} />
      {n}
    </span>
  );
}

/* ---------------- player medallion ---------------- */

export function Medallion({
  name,
  seat,
  size = 40,
  dim,
}: {
  name: string;
  seat: number;
  size?: number;
  dim?: boolean;
}) {
  const color = SEAT_COLORS[seat % SEAT_COLORS.length];
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold select-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        color: dim ? "#6b6355" : "#f6e9c8",
        background: `radial-gradient(circle at 35% 30%, ${color}55, #12101a 75%)`,
        border: `1.5px solid ${dim ? "#4a4438" : color}`,
        boxShadow: dim ? "none" : `0 0 12px ${color}33`,
        filter: dim ? "grayscale(0.8)" : undefined,
      }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ---------------- misc icons (stroke style) ---------------- */

function I({ children, size = 18, className = "" }: { children: React.ReactNode; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const Icons = {
  crown: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M3 18 L3 8 L8 12 L12 5 L16 12 L21 8 L21 18 Z" />
    </I>
  ),
  copy: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15 V5 a2 2 0 0 1 2-2 h10" />
    </I>
  ),
  check: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M4 12.5 L10 18 L20 6" />
    </I>
  ),
  x: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M5 5 L19 19 M19 5 L5 19" />
    </I>
  ),
  scroll: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M6 3 h12 a2 2 0 0 1 2 2 v14 a2 2 0 0 1 -2 2 H6" />
      <path d="M6 3 a2 2 0 0 0 -2 2 v2 h4" />
      <path d="M9 8 h8 M9 12 h8 M9 16 h5" />
    </I>
  ),
  book: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M12 6 C10 4.5 7 4 4 4 v15 c3 0 6 .5 8 2 c2 -1.5 5 -2 8 -2 V4 c-3 0 -6 .5 -8 2 Z" />
      <path d="M12 6 v15" />
    </I>
  ),
  volumeOn: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M4 9 v6 h4 l5 4 V5 L8 9 Z" />
      <path d="M16 9 a4 4 0 0 1 0 6 M18.5 6.5 a8 8 0 0 1 0 11" />
    </I>
  ),
  volumeOff: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M4 9 v6 h4 l5 4 V5 L8 9 Z" />
      <path d="M16 9 l6 6 M22 9 l-6 6" />
    </I>
  ),
  swords: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M3 3 L13 13 M13 13 l4 -1 -1 4 M3 3 l1 4 4 -1" />
      <path d="M21 3 L11 13 M21 3 l-1 4 -4 -1" />
      <path d="M6 18 l-2 2 M18 18 l2 2 M5 15 l4 4 M19 15 l-4 4" />
    </I>
  ),
  shield: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M12 3 L20 6 V11 C20 16 16.5 19.8 12 21 C7.5 19.8 4 16 4 11 V6 Z" />
    </I>
  ),
  skull: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M12 3 a8 7.5 0 0 0 -8 7.5 c0 3 1.5 5 3.5 6.2 V20 h9 v-3.3 C18.5 15.5 20 13.5 20 10.5 A8 7.5 0 0 0 12 3 Z" />
      <circle cx="9" cy="11" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11" r="1.4" fill="currentColor" stroke="none" />
    </I>
  ),
  home: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M4 11 L12 4 L20 11 V20 H14 V15 H10 V20 H4 Z" />
    </I>
  ),
  link: (p: { size?: number; className?: string }) => (
    <I {...p}>
      <path d="M10 14 a4 4 0 0 0 5.7 0 l3 -3 a4 4 0 0 0 -5.7 -5.7 l-1.5 1.5" />
      <path d="M14 10 a4 4 0 0 0 -5.7 0 l-3 3 a4 4 0 0 0 5.7 5.7 l1.5 -1.5" />
    </I>
  ),
};

/* ---------------- wordmark ---------------- */

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-black tracking-[0.28em] gold-text select-none ${className}`}>PARLOUR</span>
  );
}
