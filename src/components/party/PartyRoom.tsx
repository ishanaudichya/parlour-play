"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GAME_UI } from "@/components/games/registry";
import { FeltSurface, NeonMark, PaperCard, SButton, SPanel } from "@/components/party/shell";
import { Icons, Toast } from "@/components/ui";
import { clearSession, useSavedName } from "@/lib/client/session";
import {
  getMutedServerSnapshot,
  getMutedSnapshot,
  primeSound,
  setMuted,
  subscribeMuted,
} from "@/lib/client/synthCore";
import { sfx } from "@/lib/client/sound";
import { useParty, type Connection } from "@/lib/client/useParty";
import { GAME_META } from "@/lib/games/registry";
import { PARTY_MAX, type GameScreenProps } from "@/lib/party/types";
import { PartyLobby } from "./PartyLobby";

function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  return (
    <button
      onClick={() => {
        primeSound();
        setMuted(!muted);
      }}
      className="text-linen-500 transition hover:text-coral-300"
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      title={muted ? "Unmute" : "Mute"}
    >
      {muted ? <Icons.volumeOff size={17} /> : <Icons.volumeOn size={17} />}
    </button>
  );
}

function ConnectionDot({ c }: { c: Connection }) {
  const style =
    c === "live"
      ? { background: "#7dc98f", boxShadow: "0 0 8px rgba(125,201,143,0.8)" }
      : c === "degraded"
        ? { background: "#ffb199" }
        : { background: "#8f94a8" };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${c !== "live" ? "animate-pulse" : ""}`}
      style={style}
      title={c === "live" ? "Live connection" : c === "degraded" ? "Reconnecting — updates may lag" : "Connecting"}
    />
  );
}

function ConfirmSheet({
  text,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/80 p-4 backdrop-blur-sm">
      <SPanel className="w-full max-w-xs p-6 text-center">
        <p className="mb-4 text-[14px] text-linen-300">{text}</p>
        <div className="flex gap-2">
          <SButton className="flex-1" onClick={onCancel}>
            Stay
          </SButton>
          <SButton variant="danger" className="flex-1" onClick={onConfirm}>
            {confirmLabel}
          </SButton>
        </div>
      </SPanel>
    </div>
  );
}

function JoinGate({
  code,
  names,
  full,
  onJoin,
}: {
  code: string;
  names: string[];
  full: boolean;
  onJoin: (name: string) => Promise<string | null>;
}) {
  const router = useRouter();
  const [name, setName] = useSavedName();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <main className="flex flex-1 flex-col">
      <FeltSurface>
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <PaperCard rotate={-1.4} className="w-full max-w-[400px] px-7 pb-7 pt-8">
            {/* wax seal */}
            <span
              aria-hidden
              className="absolute -right-4 -top-4 flex h-14 w-14 rotate-12 items-center justify-center rounded-full text-[#f2e2b8] shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
              style={{ background: "radial-gradient(circle at 38% 32%, #b23a48, #7d2532 70%)" }}
            >
              <span className="font-shell text-xl">P</span>
            </span>

            <div className="font-hand text-[32px] font-bold leading-none text-[#463d2e]">You&apos;re invited.</div>
            <div className="mt-2 text-[9px] font-semibold uppercase tracking-[0.26em] text-[#8a7d68]">
              Reserved · table
            </div>
            <div className="font-shell text-[34px] leading-tight tracking-[0.3em] text-[#4c331d]">{code}</div>
            {names.length > 0 && (
              <p className="mt-2 font-hand text-[16px] leading-snug text-[#7a6d58]">
                already seated: <span className="text-[#5d5344]">{names.join(", ")}</span>
              </p>
            )}

            {full ? (
              <div className="mt-6">
                <p className="font-hand text-[18px] font-semibold text-[#a63c2b]">
                  ✗ every chair is taken ({PARTY_MAX} of {PARTY_MAX})
                </p>
                <button
                  onClick={() => router.push("/")}
                  className="mt-4 w-full rounded-[4px] border-[2px] border-[#6b4a2a] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6b4a2a] transition hover:bg-[#6b4a2a]/10"
                >
                  Back to the door
                </button>
              </div>
            ) : (
              <>
                <label
                  className="mt-6 block text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8a7d68]"
                  htmlFor="join-name"
                >
                  Sign your name
                </label>
                <input
                  id="join-name"
                  value={name}
                  maxLength={16}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && join()}
                  onFocus={() => primeSound()}
                  placeholder="write it here…"
                  className="mt-1 w-full border-b-2 border-dashed border-[#a89878] bg-transparent pb-1 font-hand text-[26px] font-semibold text-[#2e2a24] outline-none placeholder:text-[#b3a68c] focus:border-[#b3402e]"
                />
                <button
                  type="button"
                  disabled={busy || !name.trim()}
                  onClick={join}
                  className="mt-5 w-full -rotate-1 rounded-[4px] border-[2.5px] border-[#a63c2b] px-4 py-3 text-[13px] font-bold uppercase tracking-[0.24em] text-[#a63c2b] shadow-[inset_0_0_0_1.5px_rgba(166,60,43,0.35)] transition-all duration-150 hover:bg-[#a63c2b]/10 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35"
                >
                  {busy ? "Pulling up a chair…" : "⬢ Take a seat"}
                </button>
                <p className="mt-3 font-hand text-[15px] leading-snug text-[#8a7d68]">
                  game already going? you&apos;ll watch from behind the chairs and get dealt into the next one.
                </p>
                {error && <p className="mt-3 font-hand text-[16px] font-semibold text-[#a63c2b]">✗ {error}</p>}
              </>
            )}
          </PaperCard>
        </div>
      </FeltSurface>
    </main>
  );
}

export function PartyRoom({ code }: { code: string }) {
  const router = useRouter();
  const party = useParty(code);
  const [confirm, setConfirm] = useState<"end" | "leave" | null>(null);

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
  const gameMeta = inGame ? GAME_META[view!.game!.type] : null;
  const gv = inGame ? (view!.game!.view as { winner?: unknown; winnerId?: unknown } | null) : null;
  const gameFinished = !!gv && (gv.winner != null || gv.winnerId != null);

  async function leaveParty() {
    await move({ kind: "party", action: "leave" });
    clearSession(code);
    router.push("/");
  }

  let body: React.ReactNode;
  if (notFound) {
    body = (
      <main className="flex flex-1 flex-col">
        <FeltSurface>
          <div className="flex flex-1 items-center justify-center px-4">
            <PaperCard rotate={1.4} className="w-full max-w-[360px] px-7 py-8 text-center">
              <div className="font-hand text-[28px] font-bold text-[#463d2e]">Table {code}?</div>
              <p className="mt-2 font-hand text-[17px] leading-snug text-[#7a6d58]">
                nobody here — either the code&apos;s wrong or everyone went home hours ago.
              </p>
              <button
                onClick={() => router.push("/")}
                className="mt-5 w-full rounded-[4px] border-[2px] border-[#6b4a2a] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6b4a2a] transition hover:bg-[#6b4a2a]/10"
              >
                Back to the door
              </button>
            </PaperCard>
          </div>
        </FeltSurface>
      </main>
    );
  } else if (!ready || (!view && !preview)) {
    body = (
      <main className="flex flex-1 items-center justify-center">
        <div className="slabel animate-pulse">Finding your table…</div>
      </main>
    );
  } else if (!session || !view) {
    body = (
      <JoinGate
        code={code.toUpperCase()}
        names={preview?.names ?? []}
        full={(preview?.memberCount ?? 0) >= PARTY_MAX}
        onJoin={join}
      />
    );
  } else if (view.phase === "lobby" || !view.game) {
    body = (
      <FeltSurface>
        <PartyLobby v={view} move={move} onLeave={() => setConfirm("leave")} />
      </FeltSurface>
    );
  } else {
    const ui = GAME_UI[view.game.type];
    if (!ui) {
      body = (
        <main className="flex flex-1 items-center justify-center px-4">
          <SPanel className="p-8 text-center">
            <p className="text-linen-300">This game isn&apos;t available in this build.</p>
          </SPanel>
        </main>
      );
    } else {
      const Screen = ui.Screen as React.ComponentType<GameScreenProps>;
      body = (
        <Screen
          view={view.game.view}
          party={view}
          youId={view.youId}
          isHost={isHost}
          skew={skew}
          spectating={!view.game.players.includes(view.youId)}
          move={(m) => void move({ kind: "game", move: m })}
          playAgain={() => void move({ kind: "party", action: "start_game", game: view.game!.type })}
          exitToLobby={() => void move({ kind: "party", action: "end_game" })}
        />
      );
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="z-30 flex items-center justify-between border-b border-night-600/60 bg-night-900/70 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <NeonMark className="text-xl leading-none" />
          {gameMeta && (
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-linen-500 sm:inline">
              · {gameMeta.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <ConnectionDot c={connection} />
          <span className="hidden rounded-full border border-night-600 px-3 py-1 font-shell text-[13px] font-semibold tracking-[0.28em] text-coral-300 sm:inline">
            {code.toUpperCase()}
          </span>
          {inGame && isHost && !gameFinished && (
            <button
              onClick={() => setConfirm("end")}
              className="rounded-lg border border-blood-500/40 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-blood-300 transition hover:border-blood-400"
            >
              End game
            </button>
          )}
          <SoundToggle />
          {session && view && (
            <button
              onClick={() => setConfirm("leave")}
              className="text-linen-500 transition hover:text-blood-400"
              aria-label="Leave the party"
              title="Leave the party"
            >
              <Icons.x size={16} />
            </button>
          )}
        </div>
      </header>

      {body}

      {confirm === "end" && (
        <ConfirmSheet
          text="Abandon the current game and send everyone back to the lobby?"
          confirmLabel="End it"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void move({ kind: "party", action: "end_game" });
          }}
        />
      )}
      {confirm === "leave" && (
        <ConfirmSheet
          text={
            inGame && view?.game?.players.includes(view.youId) && !gameFinished
              ? "Leave the party? You'll forfeit your place in the current game."
              : "Leave the party?"
          }
          confirmLabel="Leave"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void leaveParty();
          }}
        />
      )}

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
