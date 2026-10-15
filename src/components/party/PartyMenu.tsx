"use client";

/* The Parlour's menu inside a game. There is no site header during play —
   every game screen keeps the whole viewport and drops this one small pill
   into its own toolbar. The pill inherits the toolbar's text colour; the
   sheet it opens is always the Parlour's own: table code, invite, sound,
   end the game (host), leave. */

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  getMutedServerSnapshot,
  getMutedSnapshot,
  primeSound,
  setMuted,
  subscribeMuted,
  uiClick,
} from "@/lib/client/synthCore";
import type { Connection } from "@/lib/client/useParty";

export interface PartyChrome {
  code: string;
  connection: Connection;
  isHost: boolean;
  /** the host may end the running game */
  canEnd: boolean;
  /** leaving now forfeits a seat in a live game */
  forfeits: boolean;
  onEnd: () => void;
  onLeave: () => void;
  /** each mounted menu checks in, so the room knows a game screen has one */
  register?: () => () => void;
}

const ChromeCtx = createContext<PartyChrome | null>(null);
export const PartyChromeProvider = ChromeCtx.Provider;

export function useMuted() {
  return useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
}

/** The four-point star the Parlour signs everything with. Without `size` it
    takes its size from CSS (e.g. em units, to scale with the type around it). */
export function Spark({ size, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className={className} aria-hidden>
      <path d="M6 0 C6.5 3.6 8.4 5.5 12 6 C8.4 6.5 6.5 8.4 6 12 C5.5 8.4 3.6 6.5 0 6 C3.6 5.5 5.5 3.6 6 0 Z" fill="currentColor" />
    </svg>
  );
}

export function LiveDot({ c, className = "" }: { c: Connection; className?: string }) {
  return (
    <span
      className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${c !== "live" ? "animate-pulse" : ""} ${className}`}
      style={
        c === "live"
          ? { background: "#3ddc84", boxShadow: "0 0 8px rgba(61,220,132,0.75)" }
          : c === "degraded"
            ? { background: "#ffc93c" }
            : { background: "#8f897e" }
      }
      title={c === "live" ? "Live" : c === "degraded" ? "Reconnecting — updates may lag" : "Connecting"}
    />
  );
}

type Confirm = "end" | "leave" | null;

export function PartyMenu({
  className = "",
  style,
  label,
  fallback = false,
}: {
  /** extra classes for the pill, to sit right in a game's toolbar */
  className?: string;
  style?: React.CSSProperties;
  /** pill text; defaults to the table code */
  label?: React.ReactNode;
  /** the room's own floating copy, shown only when a screen forgot its menu */
  fallback?: boolean;
}) {
  const chrome = useContext(ChromeCtx);
  const btn = useRef<HTMLButtonElement | null>(null);
  const sheet = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const muted = useMuted();
  const register = chrome?.register;

  useEffect(() => {
    if (!fallback && register) return register();
  }, [register, fallback]);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const W = Math.min(300, window.innerWidth - 16);
      const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.right - W));
      setPos(r.top > window.innerHeight * 0.55 ? { bottom: window.innerHeight - r.top + 8, left } : { top: r.bottom + 8, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (sheet.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!chrome) return null;

  async function copy(kind: "link" | "code") {
    const text = kind === "link" ? `${window.location.origin}/p/${chrome!.code}` : chrome!.code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    } catch {}
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => {
          primeSound();
          uiClick();
          setConfirm(null);
          setOpen((o) => !o);
        }}
        aria-label="Party menu"
        aria-expanded={open}
        title="Party menu — invite, sound, leave"
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-current/25 px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80 transition hover:border-current/50 hover:opacity-100 active:scale-[0.97] ${className}`}
        style={style}
      >
        <Spark size={10} />
        <span translate="no">{label ?? chrome.code}</span>
        {chrome.connection !== "live" && <LiveDot c={chrome.connection} />}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={sheet}
                role="dialog"
                aria-label="Party menu"
                initial={{ opacity: 0, y: pos.top !== undefined ? -6 : 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pos.top !== undefined ? -4 : 4, scale: 0.98 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="fixed z-[90] w-[min(300px,calc(100vw-16px))] overflow-hidden rounded-2xl border border-seam bg-soot font-ui text-bone shadow-[0_24px_60px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.4)]"
                style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
              >
                <div className="px-4 pb-3 pt-3.5">
                  <div className="flex items-center justify-between">
                    <span className="smallprint flex items-center gap-1.5 text-dust">
                      <Spark size={9} className="text-flare" /> Parlour · table
                    </span>
                    <span className="smallprint flex items-center gap-1.5 text-dust">
                      <LiveDot c={chrome.connection} />
                      {chrome.connection === "live" ? "live" : chrome.connection === "degraded" ? "lagging" : "joining"}
                    </span>
                  </div>
                  <div className="mt-1 font-poster text-[46px] font-extrabold uppercase leading-[0.9] tracking-[0.04em]" translate="no">
                    {chrome.code}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void copy("link")}
                      className="rounded-xl bg-bone px-3 py-2 text-[12px] font-semibold text-void transition hover:bg-white active:scale-[0.98]"
                    >
                      {copied === "link" ? "Link copied" : "Copy invite"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copy("code")}
                      className="rounded-xl border border-seam px-3 py-2 text-[12px] font-semibold text-bone transition hover:border-dust active:scale-[0.98]"
                    >
                      {copied === "code" ? "Code copied" : "Copy code"}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    primeSound();
                    setMuted(!muted);
                  }}
                  className="flex w-full items-center justify-between border-t border-seam px-4 py-3 text-left text-[13px] transition hover:bg-char"
                >
                  <span>Sound</span>
                  <span
                    className={`relative h-[20px] w-[34px] rounded-full transition ${muted ? "bg-seam" : "bg-flare"}`}
                    aria-hidden
                  >
                    <span
                      className={`absolute top-[3px] h-[14px] w-[14px] rounded-full bg-bone transition-all ${muted ? "left-[3px]" : "left-[17px]"}`}
                    />
                  </span>
                </button>

                {chrome.canEnd && (
                  <ConfirmRow
                    label="End game for everyone"
                    ask="Send everyone back to the lobby?"
                    yes="End it"
                    active={confirm === "end"}
                    onAsk={() => setConfirm("end")}
                    onCancel={() => setConfirm(null)}
                    onYes={() => {
                      setOpen(false);
                      chrome.onEnd();
                    }}
                  />
                )}
                <ConfirmRow
                  label="Leave the party"
                  ask={chrome.forfeits ? "You'll forfeit your seat in this game." : "Leave this table?"}
                  yes="Leave"
                  active={confirm === "leave"}
                  onAsk={() => setConfirm("leave")}
                  onCancel={() => setConfirm(null)}
                  onYes={() => {
                    setOpen(false);
                    chrome.onLeave();
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

function ConfirmRow({
  label,
  ask,
  yes,
  active,
  onAsk,
  onCancel,
  onYes,
}: {
  label: string;
  ask: string;
  yes: string;
  active: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onYes: () => void;
}) {
  if (!active)
    return (
      <button
        type="button"
        onClick={() => {
          uiClick();
          onAsk();
        }}
        className="flex w-full items-center justify-between border-t border-seam px-4 py-3 text-left text-[13px] text-[#ff8f78] transition hover:bg-char"
      >
        {label}
        <span aria-hidden className="text-ash">
          →
        </span>
      </button>
    );
  return (
    <div className="border-t border-seam bg-char px-4 py-3">
      <p className="text-[12.5px] text-dust">{ask}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-seam px-3 py-2 text-[12px] font-semibold transition hover:border-dust"
        >
          Stay
        </button>
        <button
          type="button"
          onClick={() => {
            uiClick();
            onYes();
          }}
          className="flex-1 rounded-xl bg-flare px-3 py-2 text-[12px] font-semibold text-void transition hover:bg-flare-hi"
        >
          {yes}
        </button>
      </div>
    </div>
  );
}
