"use client";

/* The door. A gig poster for game night: the fourteen games printed as a
   festival bill, set wall to wall, and an admission ticket to start a party
   or join one. Hover a name to see its poster; click it to open the night
   with that game. */

import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BILLING, GAME_ORDER, LINEUP, LINEUP_NARROW } from "@/components/party/catalog";
import {
  Barcode,
  Bleed,
  EASE,
  Lineup,
  Meta,
  PosterFrame,
  Spark,
  stageName,
  Ticket,
  TicketHead,
  TicketTear,
  Ticker,
  TopStrip,
} from "@/components/party/stage";
import { saveSession, useSavedName } from "@/lib/client/session";
import { primeSound, uiClick } from "@/lib/client/synthCore";
import { sfx } from "@/lib/client/sound";
import { GAME_META } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";

const CARD_W = 340;
const CARD_H = 368;

/** The poster that follows your cursor along the bill. */
function HoverCard({ k, x, y }: { k: GameType | null; x: ReturnType<typeof useSpring>; y: ReturnType<typeof useSpring> }) {
  return (
    <motion.div className="pointer-events-none fixed left-0 top-0 z-40 hidden lg:block" style={{ x, y }}>
      <AnimatePresence>
        {k && (
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.9, rotate: -6 }}
            animate={{ opacity: 1, scale: 1, rotate: -2.5 }}
            exit={{ opacity: 0, scale: 0.94, rotate: -4 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden rounded-2xl border border-seam bg-soot shadow-[0_30px_70px_rgba(0,0,0,0.6)]"
            style={{ width: CARD_W }}
          >
            <PosterFrame k={k} rounded="rounded-none" />
            <div className="px-4 pb-4 pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-poster text-[30px] font-extrabold uppercase leading-none">{stageName(k)}</span>
                <Meta k={k} className="shrink-0 text-dust" />
              </div>
              <p className="mt-2 font-ui text-[13.5px] leading-snug text-dust">{BILLING[k].pitch}</p>
              <p className="smallprint mt-3 text-flare">Click to open the night with it</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Phones: tap a name, read the bill. */
function Sheet({ k, onClose, onPick }: { k: GameType | null; onClose: () => void; onPick: (k: GameType) => void }) {
  return (
    <AnimatePresence>
      {k && (
        <motion.div className="fixed inset-0 z-50 flex items-end lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-void/70 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.36, ease: EASE }}
            className="relative w-full rounded-t-[26px] border-t border-seam bg-soot px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-seam" />
            <PosterFrame k={k} />
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <span className="font-poster text-[38px] font-extrabold uppercase leading-none">{stageName(k)}</span>
              <Meta k={k} className="shrink-0 text-dust" />
            </div>
            <p className="mt-1 font-aside text-[19px] italic text-bone/80">{GAME_META[k].tagline}</p>
            <p className="mt-2 font-ui text-[14px] leading-snug text-dust">{BILLING[k].pitch}</p>
            <button
              type="button"
              onClick={() => onPick(k)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-flare py-3.5 font-poster text-[22px] font-extrabold uppercase tracking-[0.04em] text-void active:scale-[0.99]"
            >
              Open the night with it <span aria-hidden>→</span>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
  const [pick, setPick] = useState<GameType | null>(null);
  const [hover, setHover] = useState<GameType | null>(null);
  const [sheet, setSheet] = useState<GameType | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const ticketRef = useRef<HTMLElement | null>(null);
  const [ticketSeen, setTicketSeen] = useState(true);

  // phones: watch for the ticket scrolling into view
  useEffect(() => {
    const el = ticketRef.current;
    if (!el || !window.matchMedia("(max-width: 1023px)").matches) return;
    const io = new IntersectionObserver(([e]) => setTicketSeen(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function toTicket(input: React.RefObject<HTMLInputElement | null>) {
    uiClick();
    ticketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => input.current?.focus({ preventScroll: true }), 420);
  }

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 420, damping: 36, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 420, damping: 36, mass: 0.6 });

  useEffect(() => {
    if (params.get("join")) codeRef.current?.focus();
  }, [params]);

  /** The card sits above or below the hovered name, never over it. */
  function onHover(k: GameType | null, el?: HTMLElement, e?: React.PointerEvent) {
    setHover(k);
    if (!k || !el) return;
    const r = el.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cx = e ? e.clientX : r.left + r.width / 2;
    const x = Math.max(12, Math.min(W - CARD_W - 12, cx - CARD_W / 2));
    const below = r.bottom + 14;
    const y = below + CARD_H < H - 8 ? below : Math.max(8, r.top - 14 - CARD_H);
    if (!hover) {
      mx.jump(x);
      my.jump(y);
      sx.jump(x);
      sy.jump(y);
    }
    mx.set(x);
    my.set(y);
  }

  function choose(k: GameType) {
    uiClick();
    setPick(k);
    setSheet(null);
    if (window.matchMedia("(max-width: 1023px)").matches) toTicket(nameRef);
    else setTimeout(() => nameRef.current?.focus(), 60);
  }

  async function createParty() {
    if (!name.trim() || busy) {
      if (!name.trim()) nameRef.current?.focus();
      return;
    }
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
        setError(data.error ?? "Couldn't open a table.");
        setBusy(null);
        return;
      }
      saveSession(data.code, { playerId: data.playerId, secret: data.secret, name: name.trim() });
      sfx("start");
      router.push(`/p/${data.code}${pick ? `?pick=${pick}` : ""}`);
    } catch {
      setError("Network trouble — try again.");
      setBusy(null);
    }
  }

  function joinParty() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) {
      setError("That code looks short — they're five characters.");
      codeRef.current?.focus();
      return;
    }
    setBusy("join");
    router.push(`/p/${c}`);
  }

  const ticket = (
    <Ticket className="w-full">
      <TicketHead
        left={
          <>
            <Spark size={9} /> Admit one · game night
          </>
        }
        right="Nº 14"
      />
      <div className="px-5 pb-1 pt-4 sm:px-6">
        <label htmlFor="door-name" className="smallprint text-void/55">
          Your name
        </label>
        <input
          id="door-name"
          ref={nameRef}
          value={name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createParty()}
          onFocus={() => primeSound()}
          placeholder="Who's coming?"
          className="mt-0.5 w-full border-b-2 border-void/15 bg-transparent pb-1 font-aside text-[36px] leading-tight text-void outline-none transition placeholder:text-void/25 focus:border-flare"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            uiClick();
            void createParty();
          }}
          className="group mt-4 flex w-full items-center justify-between rounded-2xl bg-void px-5 py-3.5 text-bone transition hover:bg-[#25211c] active:scale-[0.99] disabled:opacity-60"
        >
          <span className="font-poster text-[26px] font-extrabold uppercase leading-none tracking-[0.03em]">
            {busy === "create" ? "Opening…" : "Start a party"}
          </span>
          <span aria-hidden className="nudge text-[22px] text-flare">
            →
          </span>
        </button>
        <div className="mt-2.5 flex min-h-[22px] items-center justify-between gap-2">
          {pick ? (
            <span className="smallprint flex items-center gap-2 text-void/70">
              Opening with
              <span className="rounded-full bg-void px-2 py-0.5 text-bone">{stageName(pick)}</span>
              <button type="button" onClick={() => setPick(null)} className="text-void/45 hover:text-void" aria-label="Clear the opening game">
                ✕
              </button>
            </span>
          ) : (
            <span className="smallprint text-void/45">You host · send the link · pick a game</span>
          )}
        </div>
      </div>

      <TicketTear />

      <div className="px-5 pb-5 pt-1 sm:px-6">
        <label htmlFor="door-code" className="smallprint text-void/55">
          Got an invite code?
        </label>
        <div className="mt-1.5 flex items-stretch gap-2">
          <input
            id="door-code"
            ref={codeRef}
            value={code}
            maxLength={5}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && joinParty()}
            onFocus={() => primeSound()}
            placeholder="•••••"
            aria-label="Party code"
            className="w-0 min-w-0 flex-1 rounded-xl border-2 border-void/15 bg-transparent px-3 py-2 text-center font-mono text-[24px] font-semibold tracking-[0.42em] text-void outline-none transition placeholder:text-void/20 focus:border-void"
          />
          <button
            type="button"
            disabled={busy !== null || code.trim().length < 4}
            onClick={() => {
              uiClick();
              joinParty();
            }}
            className="rounded-xl bg-flare px-5 font-poster text-[22px] font-extrabold uppercase tracking-[0.04em] text-void transition hover:bg-flare-hi active:scale-[0.98] disabled:bg-void/10 disabled:text-void/30"
          >
            {busy === "join" ? "…" : "Join"}
          </button>
        </div>
        {error && <p className="mt-2 font-ui text-[13px] font-medium text-[#c2341b]">{error}</p>}
        <div className="mt-4 flex items-end justify-between gap-4">
          <Barcode seed={name || "PARLOUR"} className="h-7 w-28 text-void/80" />
          <span className="smallprint text-right leading-relaxed text-void/45">
            No accounts
            <br />
            No downloads
          </span>
        </div>
      </div>
    </Ticket>
  );

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden lg:h-dvh lg:min-h-[640px]">
      <Bleed className="-bottom-56 -left-56" size={720} />
      <Bleed className="-right-40 -top-48 opacity-50" color="var(--color-sun)" size={520} />

      <TopStrip>
        <span className="smallprint hidden text-dust sm:inline">14 games</span>
        <span className="smallprint hidden text-dust sm:inline">2–8 players</span>
        <span className="smallprint text-dust">Free · no sign-up</span>
      </TopStrip>
      <Ticker
        className="smallprint relative z-10 border-y border-seam py-2 text-dust"
        items={[
          "Now showing",
          ...GAME_ORDER.map((k) => stageName(k)),
          "Doors whenever",
          "Entry free",
          "Two to eight a table",
          "Bring a phone each",
        ]}
        seconds={70}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-x-14 gap-y-8 px-4 pb-24 sm:px-6 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(360px,400px)] lg:grid-rows-[minmax(0,1fr)_auto] lg:px-10 lg:pb-10">
        {/* the bill */}
        <section className="flex min-w-0 flex-col lg:col-start-1 lg:row-start-1 lg:min-h-0" aria-label="The games">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="flex items-end justify-between gap-4 border-b border-seam pb-3 pt-2 lg:pt-6"
          >
            <span className="font-aside text-[26px] italic leading-none text-bone/85 sm:text-[30px]">Parlour presents</span>
            <span className="smallprint hidden pb-0.5 text-dust sm:inline">Live tonight · on every phone</span>
          </motion.div>

          <div className="hidden min-h-0 flex-1 py-5 lg:block" onPointerLeave={() => setHover(null)}>
            <Lineup rows={LINEUP} fillHeight autoplay active={hover} pinned={pick} onHover={onHover} onPick={(k) => choose(k)} />
          </div>
          <div className="pt-4 lg:hidden">
            <Lineup rows={LINEUP_NARROW} maxFont={120} autoplay pinned={pick} onPick={(k, p) => (p === "mouse" ? choose(k) : setSheet(k))} />
            <p className="smallprint mt-2 text-ash">Tap a name to read the bill</p>
          </div>
        </section>

        {/* the ticket */}
        <motion.section
          ref={ticketRef}
          initial={{ opacity: 0, y: 30, rotate: 2 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ delay: 0.25, duration: 0.8, ease: EASE }}
          className="mx-auto flex w-full max-w-[420px] scroll-mt-6 flex-col justify-center lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none"
          aria-label="Start or join a party"
        >
          <div className="bob">{ticket}</div>
          <p className="mt-4 text-center font-aside text-[17px] italic text-dust">
            One person starts the party, everyone else joins with the code.
          </p>
        </motion.section>

        {/* the small print */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-seam pt-4 sm:grid-cols-4 lg:col-start-1 lg:row-start-2"
        >
          {[
            ["Doors", "Whenever you like"],
            ["Entry", "Free, no accounts"],
            ["Tables", "Two to eight"],
            ["Bring", "A phone each"],
          ].map(([a, b]) => (
            <div key={a}>
              <div className="smallprint text-flare">{a}</div>
              <div className="mt-1 font-aside text-[19px] leading-tight text-bone/85">{b}</div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* phones: the ticket's two doors, until the ticket itself is on screen */}
      <AnimatePresence>
        {!ticketSeen && (
          <motion.div
            initial={{ y: 90 }}
            animate={{ y: 0 }}
            exit={{ y: 90 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-seam bg-void/90 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden"
          >
            <button
              type="button"
              onClick={() => toTicket(nameRef)}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-flare py-3 font-poster text-[21px] font-extrabold uppercase tracking-[0.03em] text-void active:scale-[0.99]"
            >
              Start a party
            </button>
            <button
              type="button"
              onClick={() => toTicket(codeRef)}
              className="rounded-2xl border border-seam px-5 font-poster text-[21px] font-extrabold uppercase tracking-[0.03em] text-bone active:scale-[0.99]"
            >
              Join
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <HoverCard k={hover} x={sx} y={sy} />
      <Sheet k={sheet} onClose={() => setSheet(null)} onPick={choose} />
    </main>
  );
}
