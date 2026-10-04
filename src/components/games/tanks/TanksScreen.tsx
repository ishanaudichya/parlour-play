"use client";

/* Pocket Tanks — an artillery duel on a destructible ridge. The draft is its
   own screen; once arsenals are full the battlefield takes over: a canvas the
   Scene paints and replays, with deliberately quiet chrome around it
   (scoreboard, wind, banner, a single control strip).

   As in every game here, what the screen SAYS comes from `shown` — the view
   the Scene hands back once a shot has finished landing — so scores and
   turn banners never run ahead of the explosions. Acting reads the live
   view, gated on the Scene being idle. */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getMutedServerSnapshot, getMutedSnapshot, primeSound, setMuted, subscribeMuted } from "@/lib/client/synthCore";
import { PICK_MS, TURN_MS, type TanksLogEntry, type TanksMove, type TanksView, type TanksViewPlayer } from "@/lib/games/tanks/types";
import { WEAPONS, type WeaponId } from "@/lib/games/tanks/weapons";
import type { GameScreenProps } from "@/lib/party/types";
import { Battlefield } from "./Battlefield";
import { Console } from "./Console";
import { DraftScreen } from "./Draft";
import { stencil } from "./font";
import { IconDefs, WeaponIcon } from "./icons";
import { GameOverCard, TanksRulesModal } from "./Overlays";
import { AMBER, BIOME, DANGER, LINE, PAGE, SURFACE, SWIFT, TANK, TEXT, TEXT_2, TEXT_3 } from "./palette";
import { Scene } from "./scene";
import { sfxDraw, sfxWin, tanksSfx } from "./sfx";

/* ---------------- clock ---------------- */

function useNowEst(serverNow: number, skew: number): number {
  const [nowEst, setNowEst] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNowEst(Date.now() + skew), 200);
    return () => clearInterval(id);
  }, [skew]);
  return Math.max(nowEst, serverNow);
}

function logLine(l: TanksLogEntry): string {
  const w = l.weapon ? WEAPONS[l.weapon as WeaponId]?.name ?? l.weapon : "";
  switch (l.kind) {
    case "start":
      return `The crates are open — ${l.actor} picks first`;
    case "pick":
      return `${l.actor} claims the ${w}`;
    case "draft_done":
      return "Arsenals full. Load up.";
    case "fire":
      return (l.n ?? 0) > 0 ? `${l.actor}'s ${w} scores ${l.n}` : `${l.actor} fires the ${w}`;
    case "score":
      return `${l.actor} hits ${l.victim} for ${l.n}`;
    case "self":
      return `${l.actor} takes ${l.n} of their own medicine`;
    case "drive":
      return `${l.actor} repositions`;
    case "timeout":
      return `${l.actor} ran out the clock`;
    case "left":
      return `${l.actor} pulled out — their tank is gone`;
    case "win":
      return `${l.actor} holds the ridge`;
    case "draw":
      return "Stalemate";
    default:
      return "";
  }
}

/* ---------------- HUD pieces ---------------- */

function ScorePlate({ p, score, active, you, wins }: { p: TanksViewPlayer; score: number; active: boolean; you: boolean; wins: number }) {
  const P = TANK[p.color];
  return (
    <div
      className="flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2"
      style={{ background: SURFACE, border: `1px solid ${active ? P.base : LINE}`, opacity: p.left ? 0.45 : 1, transition: "border-color 250ms" }}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: P.base }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-[13px] font-semibold ${p.left ? "line-through" : ""}`} style={{ color: TEXT }}>
            {p.name}
          </span>
          {you && <span className="text-[10px]" style={{ color: TEXT_3 }}>you</span>}
          {wins > 0 && <span className="text-[10px] font-semibold" style={{ color: AMBER }}>★{wins}</span>}
        </div>
        <div className="text-[11px]" style={{ color: TEXT_3 }}>
          {p.left ? "left" : `${p.arsenal.length} shots left`}
        </div>
      </div>
      <motion.span key={score} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="text-[22px] font-semibold leading-none tabular-nums" style={{ color: TEXT }}>
        {score}
      </motion.span>
    </div>
  );
}

function WindTag({ wind, lunar }: { wind: number; lunar: boolean }) {
  const mag = Math.abs(wind);
  return (
    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: "rgba(10,11,13,0.55)", color: TEXT_2, backdropFilter: "blur(4px)" }}>
      <span style={{ color: TEXT_3 }}>Wind</span>
      <span className="tabular-nums" style={{ color: TEXT }}>
        {lunar ? "none" : mag === 0 ? "calm" : `${wind < 0 ? "←" : "→"} ${mag}`}
      </span>
    </div>
  );
}

/* ==================== screen ==================== */

export function TanksScreen(props: GameScreenProps<TanksView>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;

  const [shown, setShown] = useState<TanksView>(v);
  const [scores, setScores] = useState<number[]>(() => v.players.map((p) => p.score));
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState<{ weapon: string; seat: number; k: number } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const nowEst = useNowEst(v.now, skew);

  const fontFamily = stencil.style.fontFamily;
  const [scene] = useState(
    () =>
      new Scene({
        onSettle: (sv) => {
          setShown(sv);
          setBusy(false);
        },
        onScores: setScores,
        onBusy: () => setBusy(true),
        onFire: (seat, weapon) => setAnnounce((a) => ({ weapon, seat, k: (a?.k ?? 0) + 1 })),
      })
  );

  useEffect(() => {
    scene.ingest(v);
  }, [scene, v]);

  useEffect(() => {
    if (!announce) return;
    const id = window.setTimeout(() => setAnnounce(null), 1700);
    return () => window.clearTimeout(id);
  }, [announce]);

  const d = shown;
  const me = v.players.find((p) => p.id === youId) ?? null;
  const turnPlayer = d.turn ? d.players.find((p) => p.id === d.turn) ?? null : null;
  const winner = d.winner ? d.players.find((p) => p.id === d.winner) ?? null : null;
  const tallies = party.tallies.tanks ?? {};

  // acting: live view, gated on the replay
  const myTurnLive = !spectating && !!me && !me.left && v.turn === youId && v.phase !== "over";
  const canPick = myTurnLive && v.phase === "draft";
  const canFire = myTurnLive && v.phase === "aim" && !busy;

  /* --- local aim ---------------------------------------------------------- */

  const [aim, setAim] = useState({ angle: me?.angle ?? 60, power: me?.power ?? 60 });
  const [loaded, setLoaded] = useState<WeaponId | null>(me?.loaded ?? null);
  const aimTurnKey = `${v.startedAt}:${v.shots}:${v.turn}`;
  const [aimKey, setAimKey] = useState(aimTurnKey);
  // a new turn: start from the server's record of my tank (render-phase reset)
  if (aimKey !== aimTurnKey) {
    setAimKey(aimTurnKey);
    if (me) {
      setAim({ angle: me.angle, power: me.power });
      setLoaded(me.loaded && me.arsenal.includes(me.loaded) ? me.loaded : me.arsenal[0] ?? null);
    }
  }
  const effectiveLoaded = loaded && me?.arsenal.includes(loaded) ? loaded : me?.arsenal[0] ?? null;

  // tell the table where I'm pointing, once I settle
  const sendTimer = useRef<number | null>(null);
  const pushAim = useCallback(
    (a: number, p: number, w: WeaponId | null) => {
      if (sendTimer.current !== null) window.clearTimeout(sendTimer.current);
      sendTimer.current = window.setTimeout(() => {
        move({ type: "aim", angle: a, power: p, ...(w ? { weapon: w } : {}) } satisfies TanksMove);
      }, 450);
    },
    [move]
  );
  useEffect(() => () => {
    if (sendTimer.current !== null) window.clearTimeout(sendTimer.current);
  }, []);

  const setAngle = (a: number) => {
    if (!canFire || a === aim.angle) return;
    tanksSfx("knob");
    setAim({ angle: a, power: aim.power });
    pushAim(a, aim.power, effectiveLoaded);
  };
  const setPower = (p: number) => {
    if (!canFire || p === aim.power) return;
    tanksSfx("knob");
    setAim({ angle: aim.angle, power: p });
    pushAim(aim.angle, p, effectiveLoaded);
  };
  const load = (w: WeaponId) => {
    if (!canFire) return;
    setLoaded(w);
    pushAim(aim.angle, aim.power, w);
  };
  const fieldAim = (a: number, p: number, done: boolean) => {
    if (!canFire) return;
    setAim({ angle: a, power: p });
    if (done) pushAim(a, p, effectiveLoaded);
  };
  const fire = useCallback(() => {
    if (!canFire || !effectiveLoaded) return;
    if (sendTimer.current !== null) window.clearTimeout(sendTimer.current);
    move({ type: "fire", angle: aim.angle, power: aim.power, weapon: effectiveLoaded } satisfies TanksMove);
  }, [canFire, effectiveLoaded, aim, move]);
  const drive = useCallback(
    (dir: -1 | 1) => {
      if (!canFire || !me || me.moves <= 0) return tanksSfx("denied");
      move({ type: "drive", dir } satisfies TanksMove);
    },
    [canFire, me, move]
  );
  const pick = useCallback(
    (w: WeaponId) => {
      if (!canPick) return;
      tanksSfx("pick");
      move({ type: "pick", weapon: w } satisfies TanksMove);
    },
    [canPick, move]
  );

  // keyboard: subscribe once per turn, always call the latest handler
  const onKey = (e: KeyboardEvent) => {
    if (!canFire) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;
    const step = e.shiftKey ? 5 : 1;
    const arsenal = me?.arsenal ?? [];
    const i = effectiveLoaded ? arsenal.indexOf(effectiveLoaded) : 0;
    switch (e.key) {
      case "ArrowLeft":
        setAngle(Math.min(180, aim.angle + step));
        break;
      case "ArrowRight":
        setAngle(Math.max(0, aim.angle - step));
        break;
      case "ArrowUp":
        setPower(Math.min(100, aim.power + step));
        break;
      case "ArrowDown":
        setPower(Math.max(0, aim.power - step));
        break;
      case "q":
      case "Q":
        if (arsenal.length) load(arsenal[(i - 1 + arsenal.length) % arsenal.length]);
        break;
      case "e":
      case "E":
        if (arsenal.length) load(arsenal[(i + 1) % arsenal.length]);
        break;
      case "a":
      case "A":
        drive(-1);
        break;
      case "d":
      case "D":
        drive(1);
        break;
      case " ":
      case "Enter":
        fire();
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  const keyRef = useRef(onKey);
  useEffect(() => {
    keyRef.current = onKey;
  });
  useEffect(() => {
    if (!canFire) return;
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [canFire]);

  /* --- sounds + title ----------------------------------------------------- */

  const prevTurn = useRef<string | null>(null);
  useEffect(() => {
    const mine = d.turn === youId && d.phase !== "over" && !spectating;
    if (mine && prevTurn.current !== youId) {
      tanksSfx("yourTurn");
      try {
        navigator.vibrate?.(40);
      } catch {}
    }
    prevTurn.current = d.turn;
  }, [d.turn, d.phase, youId, spectating]);

  const prevPhase = useRef(d.phase);
  useEffect(() => {
    if (d.phase === "over" && prevPhase.current !== "over") (d.winner ? sfxWin : sfxDraw)();
    prevPhase.current = d.phase;
  }, [d.phase, d.winner]);

  useEffect(() => {
    document.title = canPick ? "● Your pick — Pocket Tanks" : canFire ? "● Your shot — Pocket Tanks" : "Pocket Tanks";
  }, [canPick, canFire]);

  /* --- chrome ------------------------------------------------------------- */

  const accent = turnPlayer ? TANK[turnPlayer.color].light : winner ? TANK[winner.color].light : TEXT;
  const banner = useMemo(() => {
    if (d.phase === "over") return winner ? `${winner.name} holds the ridge` : "Stalemate";
    if (me?.left) return "You pulled out";
    if (d.phase === "draft") return turnPlayer ? (turnPlayer.id === youId ? "Your pick" : `${turnPlayer.name} is drafting`) : "The draft";
    if (busy) return "Incoming…";
    if (!turnPlayer) return "…";
    if (turnPlayer.id === youId && !spectating) return "Your shot";
    return `${turnPlayer.name} is aiming`;
  }, [d.phase, winner, me, turnPlayer, youId, busy, spectating]);

  const lastLog = d.log.length ? d.log[d.log.length - 1] : null;
  const limit = d.phase === "draft" ? PICK_MS : TURN_MS;
  const showClock = v.phase !== "over" && v.deadline !== null && !busy;
  const left = showClock ? Math.max(0, v.deadline! - nowEst) : 0;
  const frac = Math.min(1, left / limit);
  const secs = Math.ceil(left / 1000);

  // what the console shows: my live aim on my shot, else the shooter's
  const consolePlayer = (canFire ? me : turnPlayer ? v.players.find((p) => p.id === turnPlayer.id) : me) ?? v.players[0];
  const consoleAngle = canFire ? aim.angle : consolePlayer.angle;
  const consolePower = canFire ? aim.power : consolePlayer.power;
  const consoleLoaded = canFire ? effectiveLoaded : consolePlayer.loaded;
  const biome = BIOME[d.biome];
  const announced = announce ? WEAPONS[announce.weapon as WeaponId] : null;

  const header = (
    <header className="flex items-center justify-between gap-3 px-3 pb-2 pt-3 sm:px-5">
      <div className="min-w-0">
        <h1 className={`${stencil.className} truncate text-[20px] leading-none sm:text-[22px]`} style={{ color: TEXT }}>
          Pocket Tanks
        </h1>
        <div className="mt-1 truncate text-[11px]" style={{ color: TEXT_3 }}>
          {d.phase === "draft" ? "Draft" : `${biome.label} · shot ${Math.min(d.shots + (d.phase === "over" ? 0 : 1), d.totalShots)} of ${d.totalShots}${d.gravity !== 1 ? " · low gravity" : ""}`}
          {spectating ? " · spectating" : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute sounds" : "Mute sounds"} className="h-8 rounded-lg px-2.5 text-[13px] transition-colors hover:bg-white/[0.06]" style={{ color: muted ? TEXT_3 : TEXT_2, border: `1px solid ${LINE}` }}>
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2.5 6h2.5l3.5-3v10l-3.5-3H2.5z" fill="currentColor" stroke="none" />
            {muted ? <path d="M11 6l3.5 4M14.5 6L11 10" /> : <path d="M11 5.5c1 .8 1 4.2 0 5M12.8 4c2 1.6 2 6.4 0 8" />}
          </svg>
        </button>
        <button type="button" onClick={() => setRulesOpen(true)} className="h-8 rounded-lg px-3 text-[12px] font-medium transition-colors hover:bg-white/[0.06]" style={{ color: TEXT_2, border: `1px solid ${LINE}` }}>
          Rules
        </button>
      </div>
    </header>
  );

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden" style={{ background: PAGE, color: TEXT }} onPointerDown={primeSound}>
      <IconDefs />
      {header}

      <AnimatePresence mode="wait" initial={false}>
        {d.phase === "draft" ? (
          <motion.div key="draft" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <DraftScreen v={v} youId={youId} canPick={canPick} onPick={pick} nowEst={nowEst} />
          </motion.div>
        ) : (
          <motion.main key="battle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: SWIFT }} className="mx-auto w-full max-w-[1180px] flex-1 px-2 pb-6 sm:px-4">
            {/* scoreboard */}
            <div className={`grid gap-2 ${d.players.length > 2 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2"}`}>
              {d.players.map((p) => (
                <ScorePlate key={p.id} p={p} score={scores[p.seat] ?? p.score} active={d.phase !== "over" && d.turn === p.id && !busy} you={p.id === youId} wins={tallies[p.id] ?? 0} />
              ))}
            </div>

            {/* the field */}
            <div className="relative mt-2 overflow-hidden rounded-xl" style={{ border: `1px solid ${LINE}` }}>
              <Battlefield scene={scene} font={fontFamily} canAim={canFire} mySeat={me && !me.left ? me.seat : null} angle={aim.angle} power={aim.power} straight={effectiveLoaded === "lance" || effectiveLoaded === "prism"} onAim={fieldAim}>
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={banner} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="rounded-full px-3 py-1 text-[12px] font-semibold sm:text-[13px]" style={{ background: "rgba(10,11,13,0.55)", color: accent, backdropFilter: "blur(4px)" }}>
                      {banner}
                    </motion.div>
                  </AnimatePresence>
                  <WindTag wind={busy && v.lastShot ? v.lastShot.wind : d.wind} lunar={d.biome === "lunar"} />
                </div>

                <AnimatePresence>
                  {announced && announce && (
                    <motion.div key={announce.k} className="pointer-events-none absolute inset-x-0 top-[18%] flex justify-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                      <span className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold sm:text-[15px]" style={{ background: "rgba(10,11,13,0.55)", color: TEXT, backdropFilter: "blur(4px)" }}>
                        <WeaponIcon id={announce.weapon as WeaponId} size={20} />
                        {announced.name}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {showClock && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]" style={{ background: "rgba(0,0,0,0.35)" }}>
                    <div className="h-full" style={{ width: `${frac * 100}%`, background: frac < 0.25 ? DANGER : accent, transition: "width 200ms linear" }} />
                  </div>
                )}
                {showClock && secs <= 10 && (
                  <div className="pointer-events-none absolute bottom-2 right-3 text-[15px] font-semibold tabular-nums" style={{ color: DANGER }}>
                    {secs}s
                  </div>
                )}
              </Battlefield>
            </div>

            {/* log line */}
            <div className="mt-2 flex min-h-[18px] items-center justify-center px-2 text-center">
              <AnimatePresence mode="wait" initial={false}>
                {lastLog && (
                  <motion.span key={lastLog.i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="text-[12px]" style={{ color: TEXT_3 }}>
                    {logLine(lastLog)}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {d.phase !== "over" && consolePlayer && (
              <div className="mt-2">
                <Console player={consolePlayer} interactive={canFire} angle={consoleAngle} power={consolePower} loaded={consoleLoaded} onAngle={setAngle} onPower={setPower} onLoad={load} onDrive={drive} onFire={fire} />
                {canFire && (
                  <p className="mt-2 hidden text-center text-[11px] lg:block" style={{ color: TEXT_3 }}>
                    Drag on the field to aim · arrow keys fine-tune · Q/E weapon · A/D drive · Space fires
                  </p>
                )}
              </div>
            )}
          </motion.main>
        )}
      </AnimatePresence>

      <AnimatePresence>{d.phase === "over" && <GameOverCard key="tk-over" v={d} party={party} youId={youId} isHost={isHost} playAgain={playAgain} exitToLobby={exitToLobby} />}</AnimatePresence>
      {rulesOpen && <TanksRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
