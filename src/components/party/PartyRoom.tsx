"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GAME_UI } from "@/components/games/registry";
import { NeonMark, S_INPUT, SButton, SPanel } from "@/components/party/shell";
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
    <main className="flex flex-1 flex-col items-center justify-center px-4">
      <SPanel className="w-full max-w-sm p-6 sm:p-7">
        <div className="mb-5 text-center">
          <div className="slabel mb-2">Joining party</div>
          <div className="font-shell text-3xl font-semibold tracking-[0.3em] text-coral-300">{code}</div>
          {names.length > 0 && (
            <p className="mt-2 text-[12.5px] text-linen-500">
              Here already: <span className="text-linen-300">{names.join(", ")}</span>
            </p>
          )}
        </div>
        {full ? (
          <div className="text-center">
            <p className="mb-4 text-[14px] text-blood-300">This party is full ({PARTY_MAX} people).</p>
            <SButton className="w-full" onClick={() => router.push("/")}>
              Return home
            </SButton>
          </div>
        ) : (
          <>
            <label className="slabel mb-2 block" htmlFor="join-name">
              Your name
            </label>
            <input
              id="join-name"
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
              onFocus={() => primeSound()}
              placeholder="e.g. Machiavelli"
              className={`${S_INPUT} mb-4`}
            />
            <SButton variant="primary" className="w-full py-3.5" disabled={busy || !name.trim()} onClick={join}>
              {busy ? "Joining…" : "Join the party"}
            </SButton>
            <p className="mt-3 text-center text-[11px] text-linen-500">
              A game already running? You&apos;ll spectate and get dealt into the next one.
            </p>
            {error && <p className="mt-3 text-center text-[13px] text-blood-300">{error}</p>}
          </>
        )}
      </SPanel>
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
      <main className="flex flex-1 flex-col items-center justify-center px-4">
        <SPanel className="w-full max-w-sm p-8 text-center">
          <div className="slabel mb-3">Party {code}</div>
          <p className="mb-5 text-[14px] text-linen-300">
            This party doesn&apos;t exist — or everyone has long since gone home.
          </p>
          <SButton className="w-full" onClick={() => router.push("/")}>
            Return home
          </SButton>
        </SPanel>
      </main>
    );
  } else if (!ready || (!view && !preview)) {
    body = (
      <main className="flex flex-1 items-center justify-center">
        <div className="slabel animate-pulse">Finding the party…</div>
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
    body = <PartyLobby v={view} move={move} onLeave={() => setConfirm("leave")} />;
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
