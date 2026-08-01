"use client";

/* Battleship — sonar ops room. Near-black naval blue, phosphor-green traces,
   two 10×10 grids with coordinate rails, a rotating radar sweep on your turn.
   Placement is simultaneous and private; battle runs on the snappy
   hit-shoots-again house rule. */

import { AnimatePresence, motion } from "framer-motion";
import { Chakra_Petch } from "next/font/google";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  getMutedServerSnapshot,
  getMutedSnapshot,
  primeSound,
  setMuted,
  subscribeMuted,
} from "@/lib/client/synthCore";
import { canPlace } from "@/lib/games/battleship/engine";
import {
  GRID,
  PLACE_MS,
  SHIPS,
  SHIP_LEN,
  TURN_MS,
  type BattleshipMove,
  type BattleshipView,
  type BSLogEntry,
  type Dir,
  type Placement,
  type ShipId,
} from "@/lib/games/battleship/types";
import type { GameScreenProps } from "@/lib/party/types";
import {
  BRIGHT,
  coordLabel,
  EMBER,
  FleetBoard,
  FleetStatusPanel,
  GREEN,
  RED,
  STEEL,
  TargetBoard,
  type PipState,
} from "./boards";
import { BSRulesModal, GameOverOverlay } from "./Overlays";
import { playBattleshipDiff } from "./sfx";

const chakra = Chakra_Petch({ weight: ["400", "500", "600", "700"], subsets: ["latin"], display: "swap" });

const KEYFRAMES = `
@keyframes bs-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes bs-ember { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
@keyframes bs-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
`;

/* ---------------- clock (no impure calls during render) ---------------- */

function useNowEst(serverNow: number, skew: number): number {
  const [nowEst, setNowEst] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNowEst(Date.now() + skew), 200);
    return () => clearInterval(id);
  }, [skew]);
  return Math.max(nowEst, serverNow);
}

/* ---------------- log ticker ---------------- */

function logLine(l: BSLogEntry): string {
  switch (l.kind) {
    case "place_ready":
      return `${l.actor} is locked in`;
    case "battle_start":
      return `Battle stations — ${l.actor} has the first shot`;
    case "shot":
      return `${l.actor} fires ${coordLabel(l.x!, l.y!)} — ${l.hit ? "HIT" : "splash"}`;
    case "sunk":
      return `${l.actor} sank the ${l.ship}!`;
    case "timeout":
      return l.actor ? `${l.actor} hesitated — fire control takes over` : "Deployment time expired";
    case "left":
      return `${l.actor} abandoned ship`;
    case "win":
      return `${l.actor} rules the seas`;
    default:
      return "";
  }
}

/* ---------------- countdown bar ---------------- */

function DeadlineBar({
  deadline,
  total,
  nowEst,
  label,
}: {
  deadline: number;
  total: number;
  nowEst: number;
  label: string;
}) {
  const frac = Math.max(0, Math.min(1, (deadline - nowEst) / total));
  const secs = Math.max(0, Math.ceil((deadline - nowEst) / 1000));
  const danger = frac < 0.25;
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between text-[9px] uppercase tracking-[0.24em]">
        <span style={{ color: STEEL }}>{label}</span>
        <span
          className="tabular-nums text-[11px] font-semibold"
          style={{ color: danger ? RED : BRIGHT, animation: danger ? "bs-pulse 0.8s ease-in-out infinite" : undefined }}
        >
          {secs}s
        </span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full" style={{ background: "rgba(123,168,192,0.16)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-linear"
          style={{
            width: `${frac * 100}%`,
            background: danger ? RED : `linear-gradient(90deg, ${GREEN}, ${BRIGHT})`,
            boxShadow: danger ? "0 0 8px rgba(255,77,94,0.7)" : "0 0 8px rgba(61,222,155,0.5)",
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- small chrome ---------------- */

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="h-px w-3" style={{ background: "rgba(61,222,155,0.5)" }} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.26em]" style={{ color: STEEL }}>
        {children}
      </span>
      <span className="h-px flex-1" style={{ background: "rgba(61,222,155,0.18)" }} />
    </div>
  );
}

function StatusChip({ name, ready, left }: { name: string; ready: boolean; left: boolean }) {
  return (
    <div
      className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px]"
      style={{
        borderColor: ready ? "rgba(61,222,155,0.45)" : "rgba(123,168,192,0.3)",
        background: ready ? "rgba(61,222,155,0.08)" : "rgba(10,22,34,0.6)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: left ? RED : ready ? GREEN : STEEL,
          boxShadow: ready ? "0 0 6px rgba(61,222,155,0.8)" : undefined,
          animation: !ready && !left ? "bs-pulse 1.4s ease-in-out infinite" : undefined,
        }}
      />
      <span className={`truncate ${left ? "line-through opacity-60" : ""}`} style={{ color: "#cfe8dd" }}>
        {name}
      </span>
      <span className="ml-auto uppercase tracking-[0.16em]" style={{ color: ready ? BRIGHT : STEEL }}>
        {left ? "left" : ready ? "ready ✓" : "positioning…"}
      </span>
    </div>
  );
}

/* ==================== screen ==================== */

export function BattleshipScreen(props: GameScreenProps<BattleshipView>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selected, setSelected] = useState<ShipId | null>("carrier");
  const [dir, setDir] = useState<Dir>("h");
  const nowEst = useNowEst(v.now, skew);
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);

  const send = useCallback((m: BattleshipMove) => move(m), [move]);

  /* sounds: diff the previous view's log against the new one */
  const prevRef = useRef<BattleshipView | null>(null);
  useEffect(() => {
    playBattleshipDiff(prevRef.current, v, youId);
    prevRef.current = v;
  }, [v, youId]);

  const myTurn = !spectating && v.phase === "battle" && v.turn === youId;
  useEffect(() => {
    document.title = myTurn ? "● FIRE — Battleship" : "Battleship";
  }, [myTurn]);

  /* R rotates the ship in hand during placement */
  const placingNow = v.phase === "placement" && !spectating && !v.youReady;
  useEffect(() => {
    if (!placingNow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") setDir((d) => (d === "h" ? "v" : "h"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placingNow]);

  const me = v.players.find((p) => p.id === youId) ?? null;
  const opp = me ? v.players.find((p) => p.id !== youId) ?? null : null;
  const myBoard = me ? v.boards.find((b) => b.playerId === me.id) ?? null : null;
  const oppBoard = opp ? v.boards.find((b) => b.playerId === opp.id) ?? null : null;

  const fleetRecord: Partial<Record<ShipId, Placement>> = {};
  for (const sh of v.yourFleet ?? []) {
    if (sh.placed) fleetRecord[sh.ship] = { x: sh.x!, y: sh.y!, dir: sh.dir! };
  }
  const placedCount = Object.keys(fleetRecord).length;

  /* ---------------- placement handlers ---------------- */

  const clampPlacement = (x: number, y: number, shipId: ShipId): Placement => {
    const len = SHIP_LEN[shipId];
    return {
      x: dir === "h" ? Math.min(x, GRID - len) : x,
      y: dir === "v" ? Math.min(y, GRID - len) : y,
      dir,
    };
  };

  const previewFor = (x: number, y: number) => {
    if (!selected || v.youReady) return null;
    const pl = clampPlacement(x, y, selected);
    return {
      box: { ...pl, len: SHIP_LEN[selected] },
      valid: canPlace(fleetRecord, selected, pl),
    };
  };

  const handlePlaceCell = (x: number, y: number) => {
    if (!selected || v.youReady) return;
    const pl = clampPlacement(x, y, selected);
    if (!canPlace(fleetRecord, selected, pl)) return;
    send({ type: "place", shipId: selected, x: pl.x, y: pl.y, dir: pl.dir });
    const next = SHIPS.find((sp) => sp.id !== selected && !fleetRecord[sp.id]);
    setSelected(next?.id ?? null);
  };

  const handleShipTap = (id: ShipId) => {
    if (v.youReady) return;
    const current = fleetRecord[id];
    if (current) setDir(current.dir);
    setSelected(id);
  };

  /* ---------------- fleet status rows ---------------- */

  const myRows = (v.yourFleet ?? []).map((sh) => ({
    name: sh.name,
    pips: sh.placed
      ? sh.hits.map<PipState>((h) => (sh.sunk ? "sunk" : h ? "hit" : "ok"))
      : (Array.from({ length: sh.len }, () => "unknown") as PipState[]),
    sunk: sh.sunk,
  }));

  const sunkOf = (playerId: string) =>
    new Set((v.boards.find((b) => b.playerId === playerId)?.sunk ?? []).map((sk) => sk.ship));

  const enemyRowsFor = (playerId: string) => {
    const sunk = sunkOf(playerId);
    return SHIPS.map((sp) => ({
      name: sp.name,
      pips: Array.from({ length: sp.len }, () => (sunk.has(sp.id) ? "sunk" : "unknown")) as PipState[],
      sunk: sunk.has(sp.id),
    }));
  };

  /* ---------------- callout ---------------- */

  let callout: { key: string; text: string; color: string } | null = null;
  if (v.phase !== "placement" && v.lastShot) {
    const ls = v.lastShot;
    const byYou = ls.by === youId;
    const byName = v.players.find((p) => p.id === ls.by)?.name ?? "—";
    const at = coordLabel(ls.x, ls.y);
    const k = `${ls.by}-${ls.x}-${ls.y}`;
    if (!me) {
      callout = {
        key: k,
        text: ls.sunk ? `${byName} sank the ${ls.sunk}!` : `${byName} fires ${at} — ${ls.hit ? "HIT" : "splash"}`,
        color: ls.sunk ? RED : ls.hit ? EMBER : STEEL,
      };
    } else if (byYou) {
      callout = ls.sunk
        ? { key: k, text: `You sank their ${ls.sunk}!`, color: BRIGHT }
        : ls.hit
          ? { key: k, text: "HIT — fire again!", color: EMBER }
          : { key: k, text: `${at} — splash. Enemy's turn`, color: STEEL };
    } else {
      callout = ls.sunk
        ? { key: k, text: `They sank your ${ls.sunk}!`, color: RED }
        : ls.hit
          ? { key: k, text: `Direct hit at ${at} — brace!`, color: EMBER }
          : { key: k, text: `Enemy shell at ${at} missed`, color: STEEL };
    }
  }

  const lastLog = v.log.length ? v.log[v.log.length - 1] : null;
  const turnPlayer = v.turn ? v.players.find((p) => p.id === v.turn) ?? null : null;

  /* ==================== render ==================== */

  return (
    <div
      className={`${chakra.className} relative flex min-h-[100dvh] flex-col overflow-hidden text-[#cfe8dd]`}
      style={{ background: "radial-gradient(120% 95% at 50% 0%, #0a1622 0%, #071019 55%, #050b12 100%)" }}
      onPointerDown={primeSound}
    >
      <style>{KEYFRAMES}</style>

      {/* faint chart grid + scanlines */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(61,222,155,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(61,222,155,0.045) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(to bottom, rgba(61,222,155,0.025) 0px, rgba(61,222,155,0.025) 1px, transparent 1px, transparent 3px)",
        }}
      />

      {/* header */}
      <header className="relative z-10 flex items-center justify-between px-3 pb-1 pt-2.5 sm:px-5">
        <div>
          <h1
            className="text-[15px] font-bold tracking-[0.34em]"
            style={{ color: BRIGHT, textShadow: "0 0 14px rgba(109,255,192,0.35)" }}
          >
            BATTLESHIP
          </h1>
          <div className="text-[9px] uppercase tracking-[0.24em]" style={{ color: STEEL }}>
            {me && opp ? `Adm. ${me.name} vs Adm. ${opp.name}` : "Sonar ops · 10×10"}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className={`rounded-md border px-2.5 py-1.5 text-[13px] transition ${muted ? "line-through" : ""}`}
            style={{ borderColor: "rgba(123,168,192,0.35)", color: muted ? "rgba(123,168,192,0.5)" : STEEL }}
          >
            ♪
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition"
            style={{ borderColor: "rgba(123,168,192,0.35)", color: STEEL }}
          >
            Rules
          </button>
        </div>
      </header>

      {spectating && (
        <div
          className="relative z-10 mx-auto mt-1 rounded-full border px-3 py-0.5 text-[10px] uppercase tracking-[0.26em]"
          style={{ borderColor: "rgba(123,168,192,0.4)", background: "rgba(10,22,34,0.8)", color: "#9fc0e0" }}
        >
          Spectating — periscope only
        </div>
      )}

      {/* log ticker */}
      <div className="relative z-10 h-5 px-4 text-center text-[11px] italic" style={{ color: "rgba(123,168,192,0.8)" }}>
        {lastLog ? logLine(lastLog) : ""}
      </div>

      {/* ==================== PLACEMENT ==================== */}
      {v.phase === "placement" && (
        <div className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-3 pb-8 pt-2 sm:px-5">
          {v.placeDeadline && (
            <div className="mb-3">
              <DeadlineBar deadline={v.placeDeadline} total={PLACE_MS} nowEst={nowEst} label="Fleet deployment" />
            </div>
          )}

          {spectating || !me ? (
            <div
              className="mx-auto mt-10 max-w-sm space-y-2 rounded-lg border p-5 text-center"
              style={{ borderColor: "rgba(61,222,155,0.25)", background: "rgba(8,18,28,0.7)" }}
            >
              <div className="text-[12px] uppercase tracking-[0.3em]" style={{ color: BRIGHT }}>
                Fleets deploying
              </div>
              <p className="text-[11px]" style={{ color: STEEL }}>
                Both admirals are positioning their ships in secret.
              </p>
              <div className="space-y-1.5 pt-2">
                {v.players.map((p) => (
                  <StatusChip key={p.id} name={p.name} ready={p.ready} left={p.left} />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <section className="min-w-0">
                <SectionLabel>Your waters — deploy the fleet</SectionLabel>
                <FleetBoard
                  fleet={v.yourFleet ?? []}
                  incoming={[]}
                  placing={!v.youReady}
                  selected={selected}
                  previewFor={previewFor}
                  onCell={handlePlaceCell}
                  onShip={handleShipTap}
                  dimmed={v.youReady}
                />
              </section>

              <section className="min-w-0 space-y-3">
                <SectionLabel>Ship dock</SectionLabel>

                {opp && <StatusChip name={opp.name} ready={opp.ready} left={opp.left} />}

                {v.youReady ? (
                  <div
                    className="rounded-md border p-4 text-center"
                    style={{ borderColor: "rgba(61,222,155,0.4)", background: "rgba(61,222,155,0.07)" }}
                  >
                    <div className="text-[12px] font-bold uppercase tracking-[0.28em]" style={{ color: BRIGHT }}>
                      Fleet locked in
                    </div>
                    <div
                      className="mt-1 text-[10px] uppercase tracking-[0.2em]"
                      style={{ color: STEEL, animation: "bs-pulse 1.6s ease-in-out infinite" }}
                    >
                      awaiting enemy fleet…
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {(v.yourFleet ?? []).map((sh) => {
                        const isSel = selected === sh.ship;
                        return (
                          <button
                            key={sh.ship}
                            type="button"
                            onClick={() => handleShipTap(sh.ship)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition active:scale-[0.99]"
                            style={{
                              borderColor: isSel ? BRIGHT : sh.placed ? "rgba(61,222,155,0.3)" : "rgba(123,168,192,0.3)",
                              background: isSel ? "rgba(61,222,155,0.12)" : "rgba(10,22,34,0.6)",
                              boxShadow: isSel ? "0 0 12px rgba(61,222,155,0.25)" : undefined,
                            }}
                          >
                            <span className="min-w-0">
                              <span
                                className="block text-[11px] font-semibold uppercase tracking-[0.16em]"
                                style={{ color: isSel ? BRIGHT : "#cfe8dd" }}
                              >
                                {sh.name}
                              </span>
                              <span className="block text-[9px] uppercase tracking-[0.14em] tabular-nums" style={{ color: STEEL }}>
                                {sh.placed && sh.x !== undefined && sh.y !== undefined
                                  ? `anchored ${coordLabel(sh.x, sh.y)} · ${sh.dir === "h" ? "E–W" : "N–S"}`
                                  : isSel
                                    ? "in hand — tap the grid"
                                    : "in dock"}
                              </span>
                            </span>
                            <span className="flex shrink-0 gap-[3px]">
                              {Array.from({ length: sh.len }, (_, i) => (
                                <span
                                  key={i}
                                  className="h-2 w-2 rounded-[2px]"
                                  style={{
                                    background: sh.placed ? "rgba(61,222,155,0.7)" : "rgba(123,168,192,0.35)",
                                    boxShadow: sh.placed ? "0 0 4px rgba(61,222,155,0.5)" : undefined,
                                  }}
                                />
                              ))}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDir((d) => (d === "h" ? "v" : "h"))}
                        className="flex-1 rounded-md border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition active:scale-[0.98]"
                        style={{ borderColor: "rgba(123,168,192,0.4)", color: "#cfe8dd" }}
                        aria-label={`Rotate — currently ${dir === "h" ? "horizontal" : "vertical"}`}
                      >
                        Rotate · {dir === "h" ? "→ E–W" : "↓ N–S"}
                      </button>
                      <button
                        type="button"
                        onClick={() => send({ type: "randomize" })}
                        className="flex-1 rounded-md border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition active:scale-[0.98]"
                        style={{ borderColor: "rgba(123,168,192,0.4)", color: "#cfe8dd" }}
                      >
                        Scatter fleet
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={placedCount < SHIPS.length}
                      onClick={() => send({ type: "ready" })}
                      className="w-full rounded-md border px-3 py-3 text-[14px] font-bold uppercase tracking-[0.3em] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        borderColor: GREEN,
                        color: BRIGHT,
                        background: "rgba(61,222,155,0.13)",
                        textShadow: "0 0 12px rgba(109,255,192,0.45)",
                        boxShadow: placedCount === SHIPS.length ? "0 0 18px rgba(61,222,155,0.25)" : undefined,
                      }}
                    >
                      Ready {placedCount < SHIPS.length ? `(${placedCount}/${SHIPS.length})` : "— lock in"}
                    </button>
                    <p className="text-center text-[9px] uppercase tracking-[0.18em]" style={{ color: "rgba(123,168,192,0.6)" }}>
                      tap a hull to pick it up · R rotates
                    </p>
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {/* ==================== BATTLE / OVER ==================== */}
      {v.phase !== "placement" && (
        <div className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-3 pb-8 pt-1 sm:px-5">
          {/* banner + turn countdown */}
          <div className="mb-3 space-y-1.5">
            <div className="flex min-h-[26px] items-center justify-center gap-3">
              {v.phase === "battle" &&
                (spectating || !me ? (
                  <span className="text-[13px] font-semibold uppercase tracking-[0.3em]" style={{ color: STEEL }}>
                    {turnPlayer ? `${turnPlayer.name} has the gun` : ""}
                  </span>
                ) : myTurn ? (
                  <span
                    className="text-[16px] font-bold uppercase tracking-[0.36em]"
                    style={{
                      color: BRIGHT,
                      textShadow: "0 0 16px rgba(109,255,192,0.55)",
                      animation: "bs-pulse 1.5s ease-in-out infinite",
                    }}
                  >
                    Fire at will
                  </span>
                ) : (
                  <span className="text-[13px] font-semibold uppercase tracking-[0.3em]" style={{ color: STEEL }}>
                    incoming — enemy is taking aim…
                  </span>
                ))}
            </div>
            {v.phase === "battle" && v.turnDeadline && (
              <DeadlineBar
                deadline={v.turnDeadline}
                total={TURN_MS}
                nowEst={nowEst}
                label={turnPlayer ? `${turnPlayer.name}'s shot` : "shot clock"}
              />
            )}
            <div className="flex min-h-[20px] items-center justify-center">
              <AnimatePresence mode="popLayout">
                {callout && (
                  <motion.div
                    key={callout.key}
                    initial={{ y: 10, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 24 }}
                    className="text-[13px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: callout.color, textShadow: `0 0 12px ${callout.color}55` }}
                  >
                    {callout.text}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {spectating || !me || !opp || !myBoard || !oppBoard ? (
            /* -------- spectator: both shot maps, nothing secret -------- */
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {v.players.map((p) => {
                const board = v.boards.find((b) => b.playerId === p.id)!;
                return (
                  <section key={p.id} className="min-w-0 space-y-2">
                    <SectionLabel>
                      {p.name}&apos;s waters · {p.shipsRemaining}/{SHIPS.length} afloat
                    </SectionLabel>
                    <TargetBoard shots={board.shots} sunk={board.sunk} active={false} dimmed={p.left} />
                    <FleetStatusPanel title={`${p.name}'s fleet`} rows={enemyRowsFor(p.id)} />
                  </section>
                );
              })}
            </div>
          ) : (
            /* -------- player: targeting grid (big) + your fleet -------- */
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <section className={`min-w-0 space-y-2 ${myTurn ? "order-1" : "order-2"} lg:order-none`}>
                <SectionLabel>
                  Targeting — {opp.name}&apos;s waters · {opp.shipsRemaining}/{SHIPS.length} afloat
                </SectionLabel>
                <TargetBoard
                  shots={oppBoard.shots}
                  sunk={oppBoard.sunk}
                  active={myTurn}
                  onShoot={(x, y) => {
                    if (myTurn) send({ type: "shoot", x, y });
                  }}
                />
                <FleetStatusPanel title="Enemy fleet intel" rows={enemyRowsFor(opp.id)} />
              </section>

              <section className={`min-w-0 space-y-2 ${myTurn ? "order-2" : "order-1"} lg:order-none`}>
                <SectionLabel>
                  Your fleet · {me.shipsRemaining}/{SHIPS.length} afloat
                </SectionLabel>
                <FleetBoard fleet={v.yourFleet ?? []} incoming={myBoard.shots} />
                <FleetStatusPanel title="Damage control" rows={myRows} />
              </section>
            </div>
          )}
        </div>
      )}

      {/* game over — victory flare / defeat wash + action report */}
      <AnimatePresence>
        {v.phase === "over" && (
          <GameOverOverlay
            key="game-over"
            v={v}
            party={party}
            youId={youId}
            isHost={isHost}
            playAgain={playAgain}
            exitToLobby={exitToLobby}
          />
        )}
      </AnimatePresence>

      {rulesOpen && <BSRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
