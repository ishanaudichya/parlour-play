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
import { PartyMenu } from "@/components/party/PartyMenu";
import { useBoxSize } from "@/lib/client/useBox";
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
  type BSViewPlayer,
  type Dir,
  type Placement,
  type ShipId,
  type YourShipView,
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
import {
  battleLayout,
  GAP_X,
  GAP_Y,
  PANEL_GAP,
  PANEL_W,
  placementLayout,
  railH,
  railW,
} from "./layout";
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

/** The battle's shot clock, split so the seconds can sit in the status row. */
function ShotClock({ deadline, total, nowEst }: { deadline: number; total: number; nowEst: number }) {
  const frac = Math.max(0, Math.min(1, (deadline - nowEst) / total));
  const secs = Math.max(0, Math.ceil((deadline - nowEst) / 1000));
  const danger = frac < 0.25;
  return (
    <span
      className="text-[13px] font-semibold tabular-nums"
      style={{ color: danger ? RED : BRIGHT, animation: danger ? "bs-pulse 0.8s ease-in-out infinite" : undefined }}
    >
      {secs}s
    </span>
  );
}

function ClockBar({ deadline, total, nowEst }: { deadline: number; total: number; nowEst: number }) {
  const frac = Math.max(0, Math.min(1, (deadline - nowEst) / total));
  const danger = frac < 0.25;
  return (
    <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "rgba(123,168,192,0.16)" }}>
      <div
        className="h-full rounded-full transition-[width] duration-200 ease-linear"
        style={{
          width: `${frac * 100}%`,
          background: danger ? RED : `linear-gradient(90deg, ${GREEN}, ${BRIGHT})`,
          boxShadow: danger ? "0 0 8px rgba(255,77,94,0.7)" : "0 0 8px rgba(61,222,155,0.5)",
        }}
      />
    </div>
  );
}

/* ---------------- small chrome ---------------- */

/** One fixed-height row (LABEL_H with its margin) so the layout maths stays exact. */
function SectionLabel({ children, size = 400 }: { children: ReactNode; size?: number }) {
  const font = Math.round(Math.min(12, Math.max(10, size * 0.015)));
  return (
    <div className="mb-1 flex h-[18px] items-center gap-2">
      <span className="h-px w-3 shrink-0" style={{ background: "rgba(61,222,155,0.5)" }} />
      <span className="truncate font-semibold uppercase tracking-[0.26em]" style={{ color: STEEL, fontSize: font }}>
        {children}
      </span>
      <span className="h-px min-w-3 flex-1" style={{ background: "rgba(61,222,155,0.18)" }} />
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

/* ---------------- ship dock ----------------
   Full: a column beside the grid. Compact: three short rows under it, for
   phones and portrait tablets where the grid takes the width. */

function ShipDock({
  compact,
  narrow = false,
  fleet,
  opp,
  youReady,
  selected,
  dir,
  placedCount,
  onShip,
  onRotate,
  onScatter,
  onReady,
}: {
  compact: boolean;
  /** compact dock on a very small phone: tighter type so ship names fit */
  narrow?: boolean;
  fleet: YourShipView[];
  opp: BSViewPlayer | null;
  youReady: boolean;
  selected: ShipId | null;
  dir: Dir;
  placedCount: number;
  onShip: (id: ShipId) => void;
  onRotate: () => void;
  onScatter: () => void;
  onReady: () => void;
}) {
  const allPlaced = placedCount === SHIPS.length;
  const plain = { borderColor: "rgba(123,168,192,0.4)", color: "#cfe8dd" };
  const readyStyle = {
    borderColor: GREEN,
    color: BRIGHT,
    background: "rgba(61,222,155,0.13)",
    textShadow: "0 0 12px rgba(109,255,192,0.45)",
    boxShadow: allPlaced ? "0 0 18px rgba(61,222,155,0.25)" : undefined,
  };
  const pips = (sh: YourShipView) => (
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
  );
  const shipStyle = (sh: YourShipView) => {
    const isSel = selected === sh.ship;
    return {
      borderColor: isSel ? BRIGHT : sh.placed ? "rgba(61,222,155,0.3)" : "rgba(123,168,192,0.3)",
      background: isSel ? "rgba(61,222,155,0.12)" : "rgba(10,22,34,0.6)",
      boxShadow: isSel ? "0 0 12px rgba(61,222,155,0.25)" : undefined,
    };
  };
  const locked = (
    <div
      className="flex flex-col items-center justify-center rounded-md border p-4 text-center"
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
  );

  if (compact) {
    return (
      <div className="flex h-full flex-col gap-1.5">
        {opp && <StatusChip name={opp.name} ready={opp.ready} left={opp.left} />}
        {youReady ? (
          <div className="flex flex-1 flex-col [&>*]:flex-1">{locked}</div>
        ) : (
          <>
            <div className={`grid min-h-11 flex-1 grid-cols-5 ${narrow ? "gap-1" : "gap-1.5"}`}>
              {fleet.map((sh) => (
                <button
                  key={sh.ship}
                  type="button"
                  onClick={() => onShip(sh.ship)}
                  className={`flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-md border transition active:scale-[0.97] ${narrow ? "px-0.5" : "px-1"}`}
                  style={shipStyle(sh)}
                  aria-label={`${sh.name}${sh.placed ? " — anchored, tap to move" : ""}`}
                >
                  {pips(sh)}
                  <span
                    className={`max-w-full truncate font-semibold uppercase leading-none ${narrow ? "text-[8px] tracking-normal" : "text-[8.5px] tracking-[0.06em]"}`}
                    style={{ color: selected === sh.ship ? BRIGHT : "#cfe8dd" }}
                  >
                    {sh.name}
                  </span>
                </button>
              ))}
            </div>
            <div className="grid min-h-10 flex-1 grid-cols-[1fr_1fr_1.35fr] gap-1.5">
              <button
                type="button"
                onClick={onRotate}
                className="rounded-md border px-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition active:scale-[0.98]"
                style={plain}
                aria-label={`Rotate — currently ${dir === "h" ? "horizontal" : "vertical"}`}
              >
                {dir === "h" ? "→ E–W" : "↓ N–S"}
              </button>
              <button
                type="button"
                onClick={onScatter}
                className="rounded-md border px-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition active:scale-[0.98]"
                style={plain}
              >
                Scatter
              </button>
              <button
                type="button"
                disabled={!allPlaced}
                onClick={onReady}
                className="rounded-md border px-1 text-[12px] font-bold uppercase tracking-[0.2em] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                style={readyStyle}
              >
                {allPlaced ? "Ready" : `Ready ${placedCount}/${SHIPS.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {opp && <StatusChip name={opp.name} ready={opp.ready} left={opp.left} />}
      {youReady ? (
        locked
      ) : (
        <>
          <div className="space-y-1.5">
            {fleet.map((sh) => {
              const isSel = selected === sh.ship;
              return (
                <button
                  key={sh.ship}
                  type="button"
                  onClick={() => onShip(sh.ship)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition active:scale-[0.99]"
                  style={shipStyle(sh)}
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
                  {pips(sh)}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRotate}
              className="flex-1 rounded-md border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition active:scale-[0.98]"
              style={plain}
              aria-label={`Rotate — currently ${dir === "h" ? "horizontal" : "vertical"}`}
            >
              Rotate · {dir === "h" ? "→ E–W" : "↓ N–S"}
            </button>
            <button
              type="button"
              onClick={onScatter}
              className="flex-1 rounded-md border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition active:scale-[0.98]"
              style={plain}
            >
              Scatter fleet
            </button>
          </div>

          <button
            type="button"
            disabled={!allPlaced}
            onClick={onReady}
            className="w-full rounded-md border px-3 py-3 text-[14px] font-bold uppercase tracking-[0.3em] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={readyStyle}
          >
            Ready {!allPlaced ? `(${placedCount}/${SHIPS.length})` : "— lock in"}
          </button>
          <p className="text-center text-[9px] uppercase tracking-[0.18em]" style={{ color: "rgba(123,168,192,0.6)" }}>
            tap a hull to pick it up · R rotates
          </p>
        </>
      )}
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

  /* ---------------- stage: measure the room, size the waters ---------------- */

  const [stageRef, stage] = useBoxSize();
  const playerView = !(spectating || !me || !opp || !myBoard || !oppBoard);
  const placeL = stage && v.phase === "placement" && playerView ? placementLayout(stage.w, stage.h) : null;
  // spectators get the two shot maps in every phase — still empty while the fleets deploy
  const battleL = stage && (v.phase !== "placement" || !playerView) ? battleLayout(stage.w, stage.h, !playerView) : null;
  // the status strip lines up with the boards under it
  const boardsW = placeL
    ? placeL.mode === "side"
      ? placeL.s + railW(placeL.s) + GAP_X + placeL.dockW
      : placeL.s + railW(placeL.s)
    : battleL
      ? battleL.mode === "side"
        ? 2 * (battleL.a + railW(battleL.a)) + GAP_X
        : battleL.a + railW(battleL.a)
      : undefined;
  const statusW = boardsW !== undefined ? Math.max(boardsW, 300) : undefined;
  // one status row (banner · callout · clock) when there's width for it, two lines otherwise
  const wideStatus = (statusW ?? 0) >= 760;

  const toolbarBtn = "flex h-8 items-center rounded-md border px-2.5 transition hover:brightness-125";
  const toolbarStyle = { borderColor: "rgba(123,168,192,0.35)", color: STEEL };

  /* ---------------- pieces ---------------- */

  const targetBlock = (s: number, strip: boolean) =>
    opp &&
    oppBoard && (
      <section className="min-w-0" style={{ width: s + railW(s) }}>
        <SectionLabel size={s}>
          Targeting — {opp.name}&apos;s waters · {opp.shipsRemaining}/{SHIPS.length} afloat
        </SectionLabel>
        <TargetBoard
          size={s}
          shots={oppBoard.shots}
          sunk={oppBoard.sunk}
          active={myTurn}
          onShoot={(x, y) => {
            if (myTurn) send({ type: "shoot", x, y });
          }}
        />
        {strip && <FleetStatusPanel variant="strip" scale={s} title="Enemy fleet intel" rows={enemyRowsFor(opp.id)} />}
      </section>
    );

  const fleetBlock = (s: number, panel: "strip" | "beside") =>
    me &&
    myBoard && (
      <section className="min-w-0" style={{ width: panel === "beside" ? undefined : s + railW(s) }}>
        <SectionLabel size={s}>
          Your fleet · {me.shipsRemaining}/{SHIPS.length} afloat
        </SectionLabel>
        {panel === "beside" ? (
          <div className="flex items-start" style={{ gap: PANEL_GAP }}>
            <FleetBoard size={s} fleet={v.yourFleet ?? []} incoming={myBoard.shots} />
            <div className="shrink-0" style={{ width: PANEL_W, marginTop: railH(s) }}>
              <FleetStatusPanel title="Damage control" rows={myRows} scale={s} />
            </div>
          </div>
        ) : (
          <>
            <FleetBoard size={s} fleet={v.yourFleet ?? []} incoming={myBoard.shots} />
            <FleetStatusPanel variant="strip" scale={s} title="Damage control" rows={myRows} />
          </>
        )}
      </section>
    );

  /* ==================== render ==================== */

  return (
    <div
      className={`${chakra.className} relative flex h-dvh flex-col overflow-hidden text-[#cfe8dd]`}
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

      {/* toolbar — stays above the game-over report so the Parlour menu is always in reach */}
      <header className="relative z-[55] flex h-12 shrink-0 items-center justify-between gap-3 px-3 sm:px-5">
        <div className="min-w-0">
          <h1
            className="text-[15px] font-bold leading-none tracking-[0.34em]"
            style={{ color: BRIGHT, textShadow: "0 0 14px rgba(109,255,192,0.35)" }}
          >
            BATTLESHIP
          </h1>
          <div className="mt-1 truncate text-[9px] uppercase leading-none tracking-[0.24em]" style={{ color: spectating ? "#9fc0e0" : STEEL }}>
            {spectating ? (
              <>
                Spectating<span className="hidden sm:inline"> — periscope only</span>
              </>
            ) : me && opp ? `Adm. ${me.name} vs Adm. ${opp.name}` : "Sonar ops · 10×10"}
          </div>
        </div>
        {/* log ticker */}
        <div
          className="hidden min-w-0 flex-1 truncate text-center text-[11px] italic md:block"
          style={{ color: "rgba(123,168,192,0.8)" }}
        >
          {lastLog ? logLine(lastLog) : ""}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            className={`${toolbarBtn} text-[13px] ${muted ? "line-through" : ""}`}
            style={{ ...toolbarStyle, color: muted ? "rgba(123,168,192,0.5)" : STEEL }}
          >
            ♪
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className={`${toolbarBtn} text-[10px] font-semibold uppercase tracking-[0.18em]`}
            style={toolbarStyle}
          >
            Rules
          </button>
          <PartyMenu style={{ borderRadius: 6, color: STEEL }} />
        </div>
      </header>

      {/* status strip */}
      <div className="relative z-10 mx-auto w-full shrink-0 px-3 sm:px-5" style={{ maxWidth: statusW !== undefined ? statusW + 40 : undefined }}>
        {v.phase === "placement" ? (
          v.placeDeadline && (
            <div className="pb-1 pt-1">
              <DeadlineBar deadline={v.placeDeadline} total={PLACE_MS} nowEst={nowEst} label="Fleet deployment" />
            </div>
          )
        ) : (
          <div className="pb-1">
            <div
              className={`grid items-center gap-x-3 ${wideStatus ? "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
            >
              <div className="min-w-0 truncate">
                {v.phase === "battle" &&
                  (spectating || !me ? (
                    <span className="text-[12px] font-semibold uppercase tracking-[0.26em]" style={{ color: STEEL }}>
                      {turnPlayer ? `${turnPlayer.name} has the gun` : ""}
                    </span>
                  ) : myTurn ? (
                    <span
                      className="text-[15px] font-bold uppercase tracking-[0.34em]"
                      style={{
                        color: BRIGHT,
                        textShadow: "0 0 16px rgba(109,255,192,0.55)",
                        animation: "bs-pulse 1.5s ease-in-out infinite",
                      }}
                    >
                      Fire at will
                    </span>
                  ) : (
                    <span className="text-[12px] font-semibold uppercase tracking-[0.26em]" style={{ color: STEEL }}>
                      incoming — enemy is taking aim…
                    </span>
                  ))}
              </div>
              {/* callout: centred on wide screens, its own line on phones */}
              <div className={`flex h-5 min-w-0 items-center justify-center ${wideStatus ? "" : "order-3 col-span-2"}`}>
                <AnimatePresence mode="popLayout">
                  {callout && (
                    <motion.div
                      key={callout.key}
                      initial={{ y: 10, opacity: 0, scale: 0.9 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: -8, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 380, damping: 24 }}
                      className="truncate text-[12px] font-bold uppercase tracking-[0.18em] sm:text-[13px]"
                      style={{ color: callout.color, textShadow: `0 0 12px ${callout.color}55` }}
                    >
                      {callout.text}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="justify-self-end text-right">
                {v.phase === "battle" && v.turnDeadline && (
                  <ShotClock deadline={v.turnDeadline} total={TURN_MS} nowEst={nowEst} />
                )}
              </div>
            </div>
            {v.phase === "battle" && v.turnDeadline && (
              <ClockBar deadline={v.turnDeadline} total={TURN_MS} nowEst={nowEst} />
            )}
          </div>
        )}
      </div>

      {/* stage — everything below is sized to fit it */}
      <main ref={stageRef} className="relative z-10 min-h-0 flex-1 px-3 pb-3 pt-2 sm:px-5 sm:pb-5">
        {/* ==================== PLACEMENT ==================== */}
        {placeL && (
          <div className="flex h-full items-center justify-center">
            <div
              className={`flex justify-center ${placeL.mode === "stack" ? "flex-col items-center" : "items-start"}`}
              style={{ gap: placeL.mode === "side" ? GAP_X : GAP_Y }}
            >
              <section className="min-w-0" style={{ width: placeL.s + railW(placeL.s) }}>
                <SectionLabel size={placeL.s}>Your waters — deploy the fleet</SectionLabel>
                <FleetBoard
                  size={placeL.s}
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

              <section
                className="min-w-0"
                style={
                  placeL.mode === "side"
                    ? { width: placeL.dockW }
                    : { width: placeL.s + railW(placeL.s), height: placeL.dockH }
                }
              >
                {placeL.mode === "side" && <SectionLabel>Ship dock</SectionLabel>}
                <ShipDock
                  compact={placeL.mode === "stack"}
                  narrow={placeL.s + railW(placeL.s) < 340}
                  fleet={v.yourFleet ?? []}
                  opp={opp}
                  youReady={v.youReady}
                  selected={selected}
                  dir={dir}
                  placedCount={placedCount}
                  onShip={handleShipTap}
                  onRotate={() => setDir((d) => (d === "h" ? "v" : "h"))}
                  onScatter={() => send({ type: "randomize" })}
                  onReady={() => send({ type: "ready" })}
                />
              </section>
            </div>
          </div>
        )}

        {/* ==================== BATTLE / OVER ==================== */}
        {battleL &&
          (!playerView ? (
            /* -------- spectator: both shot maps, nothing secret -------- */
            <div
              className={`flex h-full items-center justify-center ${battleL.mode === "stack" ? "flex-col" : ""}`}
              style={{ gap: battleL.mode === "side" ? GAP_X : GAP_Y }}
            >
              {v.players.map((p) => {
                const board = v.boards.find((b) => b.playerId === p.id)!;
                return (
                  <section key={p.id} className="min-w-0" style={{ width: battleL.a + railW(battleL.a) }}>
                    <SectionLabel size={battleL.a}>
                      {p.name}&apos;s waters
                      {v.phase === "placement" ? "" : ` · ${p.shipsRemaining}/${SHIPS.length} afloat`}
                    </SectionLabel>
                    <div className="relative">
                      <TargetBoard
                        size={battleL.a}
                        shots={board.shots}
                        sunk={board.sunk}
                        active={false}
                        dimmed={p.left || (v.phase === "placement" && !p.ready)}
                      />
                      {v.phase === "placement" && (
                        /* the hidden fleet's state, stamped across the empty water */
                        <div
                          className="pointer-events-none absolute flex flex-col items-center justify-center gap-1 text-center"
                          style={{ left: railW(battleL.a), top: railH(battleL.a), width: battleL.a, height: battleL.a }}
                        >
                          <span
                            className="font-bold uppercase"
                            style={{
                              fontSize: Math.round(Math.min(18, Math.max(11, battleL.a * 0.026))),
                              letterSpacing: "0.3em",
                              color: p.left ? RED : p.ready ? BRIGHT : STEEL,
                              textShadow: p.ready ? "0 0 14px rgba(109,255,192,0.4)" : undefined,
                              animation: !p.ready && !p.left ? "bs-pulse 1.6s ease-in-out infinite" : undefined,
                            }}
                          >
                            {p.left ? "Abandoned" : p.ready ? "Fleet locked in" : "Positioning…"}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.22em]" style={{ color: "rgba(123,168,192,0.7)" }}>
                            ships hidden from the gallery
                          </span>
                        </div>
                      )}
                    </div>
                    <FleetStatusPanel variant="strip" scale={battleL.a} title={`${p.name}'s fleet`} rows={enemyRowsFor(p.id)} />
                  </section>
                );
              })}
            </div>
          ) : battleL.mode === "side" ? (
            /* -------- player, wide: targeting | your fleet, equal -------- */
            <div className="flex h-full items-center justify-center" style={{ gap: GAP_X }}>
              {targetBlock(battleL.a, true)}
              {fleetBlock(battleL.b, "strip")}
            </div>
          ) : (
            /* -------- player, tall: targeting on top, your fleet + damage list below -------- */
            <div className="flex h-full flex-col items-center justify-center" style={{ gap: GAP_Y }}>
              {targetBlock(battleL.a, true)}
              {fleetBlock(battleL.b, "beside")}
            </div>
          ))}
      </main>

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
