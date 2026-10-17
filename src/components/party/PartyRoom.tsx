"use client";

/* One party, start to finish: the invitation at the door, the lobby, and the
   games. During a game the game owns the whole screen — the Parlour shrinks
   to the small menu each game keeps in its own toolbar. */

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_UI } from "@/components/games/registry";
import { armMusic, duckMusic } from "@/lib/client/music";
import { clearSession, useSavedName } from "@/lib/client/session";
import { primeSound, uiClick } from "@/lib/client/synthCore";
import { sfx } from "@/lib/client/sound";
import { useParty } from "@/lib/client/useParty";
import { GAME_META } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";
import { PARTY_MAX, type GameScreenProps } from "@/lib/party/types";
import { dealBill, shuffled } from "./catalog";
import { PartyLobby } from "./PartyLobby";
import { PartyChromeProvider, PartyMenu } from "./PartyMenu";
import { Avatar, Bleed, EASE, Marquee, Spark, stageName, Ticket, TicketHead, TicketTear, TopStrip } from "./stage";

/** The bill, faint and huge, sliding past behind the door's ticket. */
function Backdrop() {
  // the room only renders in the browser, so a fresh deal per visit is safe
  const [rows] = useState(() => dealBill(shuffled(), 4, [3, 4]));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-[2vh] overflow-hidden opacity-[0.075]">
      {rows.map((r, i) => (
        <Marquee key={i} seconds={70 + i * 12} reverse={i % 2 === 1}>
          {r.map((k) => (
            <span
              key={k}
              className="flex items-center whitespace-nowrap font-poster text-[clamp(72px,17vh,190px)] font-extrabold uppercase leading-[0.9]"
              style={{ fontVariationSettings: '"opsz" 72' }}
            >
              {stageName(k)}
              <Spark className="mx-[0.25em] h-[0.3em] w-[0.3em] text-flare" />
            </span>
          ))}
        </Marquee>
      ))}
    </div>
  );
}

function DoorFrame({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <Backdrop />
      <Bleed className="-bottom-60 -right-48" size={680} />
      <TopStrip>
        <span className="smallprint text-dust" translate="no">
          Table {code}
        </span>
      </TopStrip>
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-10 pt-4">{children}</div>
    </main>
  );
}

function JoinGate({
  code,
  names,
  game,
  full,
  onJoin,
}: {
  code: string;
  names: string[];
  game: GameType | null;
  full: boolean;
  onJoin: (name: string) => Promise<string | null>;
}) {
  const router = useRouter();
  const [name, setName] = useSavedName();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = names[0];

  async function join() {
    if (busy || !name.trim() || full) return;
    setBusy(true);
    setError(null);
    const err = await onJoin(name.trim());
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <DoorFrame code={code}>
      <motion.div
        initial={{ opacity: 0, y: 30, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="w-full max-w-[440px]"
      >
        <div className="bob">
          <Ticket>
            <TicketHead
              left={
                <>
                  <Spark size={9} /> You&apos;re on the list
                </>
              }
              right="Admit one"
            />
            <div className="px-6 pt-5">
              <p className="font-aside text-[24px] italic leading-none text-void/70">{host ? `${host}'s table` : "Table"}</p>
              <div
                className="mt-1 font-poster text-[104px] font-extrabold uppercase leading-[0.82] tracking-[0.04em] text-void"
                style={{ fontVariationSettings: '"opsz" 72', textShadow: "0.04em 0.03em 0 var(--color-flare)" }}
                translate="no"
              >
                {code}
              </div>
              {names.length > 0 && (
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {names.slice(0, 6).map((n, i) => (
                      <Avatar key={n} name={n} seat={i} size={28} className="ring-2 ring-bone" />
                    ))}
                  </div>
                  <span className="min-w-0 truncate font-ui text-[13px] text-void/65">
                    {names.length === 1 ? `${names[0]} is waiting` : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]} are in`}
                  </span>
                </div>
              )}
              {game && (
                <p className="smallprint mt-3 flex items-center gap-2 text-void/60">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-flare" />
                  Now playing {stageName(game)}
                </p>
              )}
            </div>

            <TicketTear />

            <div className="px-6 pb-6">
              {full ? (
                <>
                  <p className="font-poster text-[30px] font-extrabold uppercase leading-none">Sold out</p>
                  <p className="mt-1 font-ui text-[14px] text-void/65">
                    All {PARTY_MAX} seats are taken at this table.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="mt-4 w-full rounded-2xl bg-void py-3.5 font-poster text-[22px] font-extrabold uppercase tracking-[0.03em] text-bone"
                  >
                    Start your own
                  </button>
                </>
              ) : (
                <>
                  <label htmlFor="join-name" className="smallprint text-void/55">
                    Your name
                  </label>
                  <input
                    id="join-name"
                    value={name}
                    maxLength={16}
                    autoFocus
                    autoComplete="nickname"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && join()}
                    onFocus={() => primeSound()}
                    placeholder="So they know it's you"
                    className="mt-0.5 w-full border-b-2 border-void/15 bg-transparent pb-1 font-aside text-[34px] leading-tight text-void outline-none transition placeholder:text-void/25 focus:border-flare"
                  />
                  <button
                    type="button"
                    disabled={busy || !name.trim()}
                    onClick={() => {
                      uiClick();
                      void join();
                    }}
                    className="group mt-4 flex w-full items-center justify-between rounded-2xl bg-flare px-5 py-3.5 text-void transition hover:bg-flare-hi active:scale-[0.99] disabled:bg-void/10 disabled:text-void/35"
                  >
                    <span className="font-poster text-[26px] font-extrabold uppercase leading-none tracking-[0.03em]">
                      {busy ? "Pulling up a chair…" : "Take a seat"}
                    </span>
                    <span aria-hidden className="nudge text-[22px]">
                      →
                    </span>
                  </button>
                  {error && <p className="mt-2 font-ui text-[13px] font-medium text-[#c2341b]">{error}</p>}
                  <p className="mt-3 font-ui text-[12.5px] leading-snug text-void/50">
                    {game
                      ? "A game's already on — you'll watch this one and get dealt into the next."
                      : "No account needed. Your name is just for this table."}
                  </p>
                </>
              )}
            </div>
          </Ticket>
        </div>
      </motion.div>
    </DoorFrame>
  );
}

function NotFound({ code }: { code: string }) {
  const router = useRouter();
  return (
    <DoorFrame code={code}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="w-full max-w-[420px]">
        <Ticket className="overflow-hidden">
          <TicketHead left="Admit none" right="Void" />
          <div className="relative px-6 pb-6 pt-5">
            <span
              aria-hidden
              className="absolute right-5 top-8 rotate-[-14deg] rounded-md border-[3px] border-flare px-3 py-1 font-poster text-[34px] font-extrabold uppercase leading-none text-flare opacity-80"
            >
              Void
            </span>
            <p className="font-aside text-[24px] italic leading-none text-void/70">No table called</p>
            <div className="mt-1 font-poster text-[96px] font-extrabold uppercase leading-[0.82] tracking-[0.04em] text-void/35 line-through decoration-flare decoration-4" style={{ fontVariationSettings: '"opsz" 72' }}>
              {code}
            </div>
            <p className="mt-4 font-ui text-[14px] leading-snug text-void/65">
              Either the code&apos;s off by a letter, or everyone went home hours ago.
            </p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-5 w-full rounded-2xl bg-void py-3.5 font-poster text-[22px] font-extrabold uppercase tracking-[0.03em] text-bone"
            >
              Back to the door
            </button>
          </div>
        </Ticket>
      </motion.div>
    </DoorFrame>
  );
}

function Finding() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <motion.span className="text-flare" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}>
        <Spark size={26} />
      </motion.span>
      <span className="smallprint text-dust">Finding your table…</span>
    </main>
  );
}

function ConfirmSheet({ text, yes, onYes, onNo }: { text: string; yes: string; onYes: () => void; onNo: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-void/75 backdrop-blur-sm" onClick={onNo} />
      <motion.div
        initial={{ y: 24, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 16, scale: 0.98 }}
        transition={{ duration: 0.26, ease: EASE }}
        className="relative w-full max-w-[360px] rounded-3xl border border-seam bg-soot p-6"
      >
        <p className="font-poster text-[30px] font-extrabold uppercase leading-none">Heading out?</p>
        <p className="mt-2 font-ui text-[14px] text-dust">{text}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onNo} className="flex-1 rounded-2xl border border-seam py-3 font-ui text-[13.5px] font-semibold text-bone transition hover:border-dust">
            Stay
          </button>
          <button type="button" onClick={onYes} className="flex-1 rounded-2xl bg-flare py-3 font-ui text-[13.5px] font-semibold text-void transition hover:bg-flare-hi">
            {yes}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StageToast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 3000);
    return () => clearTimeout(id);
  }, [message, onDone]);
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 10, opacity: 0 }}
          className="fixed bottom-24 left-1/2 z-[95] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2.5 rounded-full bg-bone px-5 py-2.5 font-ui text-[13.5px] font-medium text-void shadow-[0_12px_30px_rgba(0,0,0,0.5)] lg:bottom-8"
        >
          <Spark size={10} className="shrink-0 text-flare" />
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PartyRoom({ code }: { code: string }) {
  const router = useRouter();
  const party = useParty(code);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // every game screen carries the Parlour menu; if one ever renders without
  // it, the room floats its own so nobody is stuck inside a game
  const [menus, setMenus] = useState(0);
  const [orphan, setOrphan] = useState(false);
  const register = useCallback(() => {
    setMenus((c) => c + 1);
    return () => setMenus((c) => c - 1);
  }, []);

  const { ready, session, view, preview, notFound, connection, toast, clearToast, skew, join, move } = party;

  // party-level sounds: someone joins, a game begins
  const lastLogRef = useRef(-1);
  useEffect(() => {
    if (!view) return;
    const latest = view.log.length ? view.log[view.log.length - 1].i : 0;
    if (lastLogRef.current >= 0) {
      for (const l of view.log) {
        if (l.i <= lastLogRef.current) continue;
        if (l.kind === "join") sfx("join");
        else if (l.kind === "game_start") sfx("start");
      }
    }
    lastLogRef.current = latest;
  }, [view]);

  const inGame = view?.phase === "game" && view.game;
  const isHost = !!view && view.hostId === view.youId;
  const gv = inGame ? (view!.game!.view as { winner?: unknown; winnerId?: unknown } | null) : null;
  const gameFinished = !!gv && (gv.winner != null || gv.winnerId != null);

  // the Parlour's music plays in its own rooms and steps aside for the games
  useEffect(() => armMusic(), []);
  useEffect(() => duckMusic(!!inGame), [inGame]);

  useEffect(() => {
    const id = window.setTimeout(() => setOrphan(!!inGame && menus === 0), menus === 0 ? 900 : 0);
    return () => window.clearTimeout(id);
  }, [inGame, menus]);

  async function leaveParty() {
    await move({ kind: "party", action: "leave" });
    clearSession(code);
    router.push("/");
  }

  let body: React.ReactNode;
  if (notFound) {
    body = <NotFound code={code.toUpperCase()} />;
  } else if (!ready || (!view && !preview)) {
    body = <Finding />;
  } else if (!session || !view) {
    body = (
      <JoinGate
        code={code.toUpperCase()}
        names={preview?.names ?? []}
        game={preview?.phase === "game" ? preview.game : null}
        full={(preview?.memberCount ?? 0) >= PARTY_MAX}
        onJoin={join}
      />
    );
  } else if (view.phase === "lobby" || !view.game) {
    body = <PartyLobby v={view} move={(m) => void move(m)} connection={connection} onLeave={() => setConfirmLeave(true)} />;
  } else {
    const ui = GAME_UI[view.game.type];
    if (!ui) {
      body = (
        <main className="flex min-h-dvh items-center justify-center px-4">
          <p className="font-ui text-dust">{GAME_META[view.game.type]?.title ?? "This game"} isn&apos;t available in this build.</p>
        </main>
      );
    } else {
      const Screen = ui.Screen as React.ComponentType<GameScreenProps>;
      const seated = view.game.players.includes(view.youId);
      body = (
        <PartyChromeProvider
          value={{
            code: code.toUpperCase(),
            connection,
            isHost,
            canEnd: isHost && !gameFinished,
            forfeits: seated && !gameFinished,
            onEnd: () => void move({ kind: "party", action: "end_game" }),
            onLeave: () => void leaveParty(),
            register,
          }}
        >
          {orphan && (
            <div className="fixed right-3 top-3 z-[80]">
              <PartyMenu fallback className="bg-void/85 text-bone opacity-100 shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-md" />
            </div>
          )}
          <Screen
            view={view.game.view}
            party={view}
            youId={view.youId}
            isHost={isHost}
            skew={skew}
            spectating={!seated}
            move={(m) => move({ kind: "game", move: m })}
            playAgain={() => void move({ kind: "party", action: "start_game", game: view.game!.type })}
            exitToLobby={() => void move({ kind: "party", action: "end_game" })}
          />
        </PartyChromeProvider>
      );
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {body}
      <AnimatePresence>
        {confirmLeave && (
          <ConfirmSheet
            text="You'll leave this table. You can rejoin with the code while it's open."
            yes="Leave"
            onNo={() => setConfirmLeave(false)}
            onYes={() => {
              setConfirmLeave(false);
              void leaveParty();
            }}
          />
        )}
      </AnimatePresence>
      <StageToast message={toast} onDone={clearToast} />
    </div>
  );
}
