"use client";

/* Pocket Tanks — an artillery duel on a destructible ridge. The draft is its
   own screen; once arsenals are full the battlefield takes over: a canvas the
   Scene paints and replays, with deliberately quiet chrome around it
   (scoreboard, banner, a single control strip).

   The screen is exactly the viewport — no page scroll, ever. The toolbar
   (with the Parlour's menu, the only way out mid-game) is always on top;
   the field takes every pixel the chrome leaves, bounded by width and
   height, with the turn and the latest shot riding on it rather than
   taking rows of their own; the console sits under it, or beside it on
   short landscape screens. On portrait screens the field is bound by the
   width, so the room left over spells out the turn and the last few shots,
   and the console grows to thumb size.

   As in every game here, what the screen SAYS comes from `shown` — the view
   the Scene hands back once a shot has finished landing — so scores and
   turn banners never run ahead of the explosions. Acting reads the live
   view, gated on the Scene being idle. */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getMutedServerSnapshot, getMutedSnapshot, primeSound, setMuted, subscribeMuted } from "@/lib/client/synthCore";
import { PICK_MS, TURN_MS, type TanksLogEntry, type TanksMove, type TanksView, type TanksViewPlayer } from "@/lib/games/tanks/types";
import { H as FIELD_H, W as FIELD_W } from "@/lib/games/tanks/terrain";
import { WEAPONS, type WeaponId } from "@/lib/games/tanks/weapons";
import type { GameScreenProps } from "@/lib/party/types";
import { PartyMenu } from "@/components/party/PartyMenu";
import { Battlefield } from "./Battlefield";
import { Console } from "./Console";
import { DraftScreen } from "./Draft";
import { stencil } from "./font";
import { IconDefs, WeaponIcon } from "./icons";
import { GameOverCard, TanksRulesModal } from "./Overlays";
import { AMBER, BIOME, DANGER, LINE, PAGE, SURFACE, SWIFT, TANK, TEXT, TEXT_2, TEXT_3 } from "./palette";
import { Scene } from "./scene";
import { sfxDraw, sfxWin, tanksSfx } from "./sfx";
import { getTheme, getThemeServer, setTheme, subscribeTheme, THEMES } from "./theme";

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
      return `Weapon selection — ${l.actor} picks first`;
    case "pick":
      return l.n ? `${l.actor} picks at random — the ${w}` : `${l.actor} picks the ${w}`;
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

function ScorePlate({ p, score, active, you, wins, compact = false, mini = false }: { p: TanksViewPlayer; score: number; active: boolean; you: boolean; wins: number; compact?: boolean; mini?: boolean }) {
  const P = TANK[p.color];
  if (mini)
    // one line — a crowded toolbar on a phone held sideways
    return (
      <div className="flex h-9 min-w-0 items-center gap-2 rounded-xl px-2.5" title={`${p.name}${you ? " (you)" : ""} · ${p.left ? "left" : `${p.arsenal.length} shots left`}`} style={{ background: SURFACE, border: `1px solid ${active ? P.base : LINE}`, opacity: p.left ? 0.45 : 1, transition: "border-color 250ms" }}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: P.base }} />
        <span className={`min-w-0 flex-1 truncate text-[12.5px] font-semibold ${p.left ? "line-through" : ""}`} style={{ color: TEXT }}>
          {p.name}
        </span>
        <motion.span key={score} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="text-[17px] font-semibold leading-none tabular-nums" style={{ color: TEXT }}>
          {score}
        </motion.span>
      </div>
    );
  return (
    <div
      className={`flex min-w-0 items-center rounded-xl ${compact ? "gap-2 px-2.5 py-1.5" : "gap-2.5 px-3 py-2"}`}
      style={{ background: SURFACE, border: `1px solid ${active ? P.base : LINE}`, opacity: p.left ? 0.45 : 1, transition: "border-color 250ms" }}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: P.base }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-[13px] font-semibold leading-4 ${p.left ? "line-through" : ""}`} style={{ color: TEXT }}>
            {p.name}
          </span>
          {you && <span className="text-[10px]" style={{ color: TEXT_3 }}>you</span>}
          {wins > 0 && <span className="text-[10px] font-semibold" style={{ color: AMBER }}>★{wins}</span>}
        </div>
        <div className="truncate text-[11px] leading-[14px]" style={{ color: TEXT_3 }}>
          {p.left ? "left" : `${p.arsenal.length} shots left`}
        </div>
      </div>
      <motion.span key={score} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className={`font-semibold leading-none tabular-nums ${compact ? "text-[19px]" : "text-[22px]"}`} style={{ color: TEXT }}>
        {score}
      </motion.span>
    </div>
  );
}

/* ---------------- layout ---------------- */

// short landscape screens (phones on their side) put the console beside the
// field instead of under it; wide screens fold the scoreboard into the toolbar
const SIDE_Q = "(orientation: landscape) and (max-height: 520px) and (min-width: 600px)";
const WIDE_Q = "(min-width: 1024px)";
// tall screens: the field is bound by the width, so the height left over
// becomes a status area between the field and the console
const TALL_Q = "(orientation: portrait)";
function subscribeQ(q: string) {
  return (cb: () => void) => {
    const m = window.matchMedia(q);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  };
}
const subSide = subscribeQ(SIDE_Q);
const subWide = subscribeQ(WIDE_Q);
const subTall = subscribeQ(TALL_Q);
const isSide = () => window.matchMedia(SIDE_Q).matches;
const isWide = () => window.matchMedia(WIDE_Q).matches;
const isTall = () => window.matchMedia(TALL_Q).matches;
const never = () => false;

/* ==================== screen ==================== */

export function TanksScreen(props: GameScreenProps<TanksView>) {
  const { view: v, party, youId, isHost, skew, spectating, move, playAgain, exitToLobby } = props;

  const [shown, setShown] = useState<TanksView>(v);
  const [scores, setScores] = useState<number[]>(() => v.players.map((p) => p.score));
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState<{ weapon: string; seat: number; k: number } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const muted = useSyncExternalStore(subscribeMuted, getMutedSnapshot, getMutedServerSnapshot);
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getThemeServer);
  const side = useSyncExternalStore(subSide, isSide, never);
  const wide = useSyncExternalStore(subWide, isWide, never);
  const tall = useSyncExternalStore(subTall, isTall, never) && !side;
  const [fieldW, setFieldW] = useState(0);
  const [themeOpen, setThemeOpen] = useState(false);
  // the how-to-aim tip shows until you first touch the controls
  const [touched, setTouched] = useState(false);
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
    scene.setTheme(theme);
  }, [scene, theme]);

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
    setTouched(true);
    tanksSfx("knob");
    setAim({ angle: a, power: aim.power });
    pushAim(a, aim.power, effectiveLoaded);
  };
  const setPower = (p: number) => {
    if (!canFire || p === aim.power) return;
    setTouched(true);
    tanksSfx("knob");
    setAim({ angle: aim.angle, power: p });
    pushAim(aim.angle, p, effectiveLoaded);
  };
  const load = (w: WeaponId) => {
    if (!canFire) return;
    setLoaded(w);
    pushAim(aim.angle, aim.power, w);
  };
  const fieldAim = (a: number, done: boolean) => {
    if (!canFire) return;
    setTouched(true);
    setAim({ angle: a, power: aim.power });
    if (done) pushAim(a, aim.power, effectiveLoaded);
  };
  const fire = useCallback(() => {
    if (!canFire || !effectiveLoaded) return;
    if (sendTimer.current !== null) window.clearTimeout(sendTimer.current);
    setTouched(true);
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
    (w: WeaponId | "random") => {
      if (!canPick) return;
      tanksSfx("pick");
      move({ type: "pick", weapon: w } satisfies TanksMove);
    },
    [canPick, move]
  );
  const autoDraftMe = useCallback(() => {
    tanksSfx("pick");
    move({ type: "autodraft" } satisfies TanksMove);
  }, [move]);

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
        setAngle((aim.angle + step) % 360);
        break;
      case "ArrowRight":
        setAngle((aim.angle - step + 360) % 360);
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
  // the battle's own story, newest first — the draft's picks aren't news here
  const feed = useMemo(() => {
    let start = d.log.length - 3;
    for (let i = d.log.length - 1; i >= Math.max(0, start); i--) if (d.log[i].kind === "draft_done") start = i;
    return d.log.slice(Math.max(0, start)).reverse();
  }, [d.log]);
  const limit = d.phase === "draft" ? PICK_MS : TURN_MS;
  const showClock = v.phase !== "over" && v.deadline !== null && !busy;
  const left = showClock ? Math.max(0, v.deadline! - nowEst) : 0;
  const frac = Math.min(1, left / limit);
  const secs = Math.ceil(left / 1000);

  // the console is mine alone: spectators get none, and other players'
  // settings never show here (the server doesn't even send them)
  const consolePlayer = me && !me.left && !spectating ? me : null;
  const consoleAngle = aim.angle;
  const consolePower = aim.power;
  const consoleLoaded = effectiveLoaded;
  const biome = BIOME[d.biome];
  const announced = announce ? WEAPONS[announce.weapon as WeaponId] : null;

  const themeMeta = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const toolBtn = "flex h-8 items-center justify-center rounded-lg text-[12px] font-medium transition-colors hover:bg-white/[0.06]";
  const inGame = d.phase !== "draft";
  // the scoreboard rides in the toolbar wherever there's width for it
  const platesInBar = inGame && (wide || side);
  const plates = d.players.map((p) => (
    <ScorePlate key={p.id} p={p} score={scores[p.seat] ?? p.score} active={d.phase !== "over" && d.turn === p.id && !busy} you={p.id === youId} wins={tallies[p.id] ?? 0} compact={platesInBar || (tall && d.players.length > 2)} mini={side && d.players.length > 2} />
  ));

  const header = (
    <header className={`relative z-20 flex shrink-0 items-center gap-3 px-3 sm:px-5 ${side ? "py-1.5" : "py-2.5"}`}>
      <div className="min-w-0 shrink">
        <h1 className={`${stencil.className} truncate leading-none ${side ? "text-[18px]" : "text-[19px] sm:text-[22px]"}`} style={{ color: TEXT }}>
          Pocket Tanks
        </h1>
        <div className="mt-1 truncate text-[11px] leading-none" style={{ color: TEXT_3 }}>
          {d.phase === "draft" ? "Weapon draft" : `${biome.label} · shot ${Math.min(d.shots + (d.phase === "over" ? 0 : 1), d.totalShots)} of ${d.totalShots}`}
          {spectating ? " · spectating" : ""}
        </div>
      </div>
      {platesInBar ? (
        <div className={`mx-auto grid min-w-0 flex-1 gap-2 ${d.players.length > 2 ? "max-w-[760px]" : "max-w-[520px]"}`} style={{ gridTemplateColumns: `repeat(${d.players.length}, minmax(0, 1fr))` }}>
          {plates}
        </div>
      ) : null}
      <div className={`flex shrink-0 items-center gap-1.5 ${platesInBar ? "" : "ml-auto"}`}>
        {inGame && (
          <div className="relative">
            <button type="button" onClick={() => setThemeOpen((o) => !o)} aria-label="Battlefield theme" title="Battlefield theme" className={`${toolBtn} gap-1.5 px-2.5`} style={{ color: TEXT_2, border: `1px solid ${LINE}` }}>
              <span className="h-3 w-3 rounded-full" style={{ background: `linear-gradient(135deg, ${themeMeta.swatch[0]} 50%, ${themeMeta.swatch[1]} 50%)` }} />
              <span className="hidden xl:inline">{themeMeta.label}</span>
            </button>
            <AnimatePresence>
              {themeOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setThemeOpen(false)} />
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="absolute right-0 top-full z-40 mt-1.5 w-40 rounded-xl p-1" style={{ background: SURFACE, border: `1px solid ${LINE}`, boxShadow: "0 14px 34px rgba(0,0,0,0.5)" }}>
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setTheme(t.id);
                          setThemeOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors hover:bg-white/[0.06]"
                        style={{ color: TEXT, background: t.id === theme ? "rgba(255,255,255,0.07)" : undefined }}
                      >
                        <span className="h-3.5 w-3.5 rounded-full" style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)` }} />
                        {t.label}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
        {/* the party menu has sound too; the quick toggle is for roomier toolbars */}
        <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute sounds" : "Mute sounds"} title={muted ? "Unmute" : "Mute"} className={`${toolBtn} hidden w-9 ${side ? "" : "sm:flex"}`} style={{ color: muted ? TEXT_3 : TEXT_2, border: `1px solid ${LINE}` }}>
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2.5 6h2.5l3.5-3v10l-3.5-3H2.5z" fill="currentColor" stroke="none" />
            {muted ? <path d="M11 6l3.5 4M14.5 6L11 10" /> : <path d="M11 5.5c1 .8 1 4.2 0 5M12.8 4c2 1.6 2 6.4 0 8" />}
          </svg>
        </button>
        <button type="button" onClick={() => setRulesOpen(true)} className={`${toolBtn} px-2.5 sm:px-3`} style={{ color: TEXT_2, border: `1px solid ${LINE}` }}>
          Rules
        </button>
        <PartyMenu className="rounded-lg!" style={{ color: TEXT_2, borderColor: LINE }} />
      </div>
    </header>
  );

  const banner_ = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={banner} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="rounded-full px-3 py-1 text-[12px] font-semibold sm:text-[13px]" style={{ background: "rgba(10,11,13,0.55)", color: accent, backdropFilter: "blur(4px)" }}>
        {banner}
      </motion.div>
    </AnimatePresence>
  );

  // the latest line of the story, riding on the field's top edge
  const logPill = (
    <AnimatePresence mode="wait" initial={false}>
      {lastLog && (
        <motion.span key={lastLog.i} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="min-w-0 truncate rounded-full px-3 py-1 text-[11.5px] sm:text-[12px]" style={{ background: "rgba(10,11,13,0.45)", color: TEXT_2, backdropFilter: "blur(4px)" }}>
          {logLine(lastLog)}
        </motion.span>
      )}
    </AnimatePresence>
  );

  const showTip = canFire && !touched;
  const tipText = (
    <>
      Drag on the field to aim
      <span className="[@media(pointer:coarse)]:hidden"> · ←/→ angle · ↑/↓ power · Q/E weapon · A/D drive · Space fires</span>
    </>
  );

  const field = (
    <Battlefield
      scene={scene}
      font={fontFamily}
      canAim={canFire}
      mySeat={me && !me.left ? me.seat : null}
      angle={aim.angle}
      onAim={fieldAim}
      onFit={setFieldW}
      className={tall ? "w-full shrink" : side ? "flex-1" : "w-full flex-1"}
      boxStyle={tall ? { aspectRatio: `${FIELD_W} / ${FIELD_H}` } : undefined}
      frameStyle={{ borderRadius: 12, boxShadow: `0 0 0 1px ${LINE}` }}
    >
      {!tall && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-2 sm:p-3">
          <div className="shrink-0">{banner_}</div>
          <div className="flex min-w-0 max-w-[60%] justify-end">{logPill}</div>
        </div>
      )}

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
      <AnimatePresence>
        {showTip && !tall && (
          <motion.div key="tip" className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3 sm:bottom-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <span className="truncate rounded-full px-3 py-1 text-[11.5px]" style={{ background: "rgba(10,11,13,0.55)", color: TEXT_2, backdropFilter: "blur(4px)" }}>
              {tipText}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {showClock && secs <= 10 && (
        <div className="pointer-events-none absolute bottom-2 right-3 text-[15px] font-semibold tabular-nums" style={{ color: DANGER }}>
          {secs}s
        </div>
      )}
    </Battlefield>
  );

  const showConsole = d.phase !== "over" && !!consolePlayer;
  const consoleEl = consolePlayer && (
    <Console player={consolePlayer} interactive={canFire} angle={consoleAngle} power={consolePower} loaded={consoleLoaded} onAngle={setAngle} onPower={setPower} onLoad={load} onDrive={drive} onFire={fire} layout={side ? "side" : tall ? "stack" : "row"} />
  );

  const plateCols = d.players.length === 4 ? "grid-cols-2 md:grid-cols-4" : d.players.length === 3 ? "grid-cols-3" : "grid-cols-2";

  const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: SWIFT } } as const;
  const battle = side ? (
    // short landscape: the field takes the height, the console sits beside it
    <motion.main key="battle" {...enter} className="flex min-h-0 flex-1 gap-2 px-2 pb-2 sm:px-3">
      {field}
      {showConsole && <aside className="flex w-[212px] shrink-0 flex-col justify-center">{consoleEl}</aside>}
    </motion.main>
  ) : tall ? (
    // portrait: scoreboard, the field at full width, the turn and the last
    // few shots in the room below it, the console at the bottom in thumb's reach
    <motion.main key="battle" {...enter} className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2 sm:px-4 sm:pb-4">
      {/* no console (watching, or the game is over): scores, field and story sit centred together */}
      {!showConsole && <div className="min-h-0 flex-1" />}
      <div className={`grid shrink-0 gap-2 ${plateCols}`}>{plates}</div>
      {field}
      <div className={`flex min-h-0 flex-col items-center overflow-hidden px-2 text-center ${showConsole ? "flex-1 justify-center-safe py-1" : "shrink-0 py-4"}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={banner} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className={`${stencil.className} shrink-0 text-[24px] leading-tight sm:text-[30px]`} style={{ color: accent }}>
            {banner}
          </motion.div>
        </AnimatePresence>
        <div className="mt-1 flex h-[18px] shrink-0 items-center justify-center text-[12px]" style={{ color: TEXT_2 }}>
          <AnimatePresence mode="wait" initial={false}>
            {showTip && (
              <motion.span key="tip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="truncate">
                {tipText}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <ul className="mt-2 flex w-full max-w-md shrink-0 flex-col items-center gap-1">
          <AnimatePresence initial={false}>
            {feed.map((l, k) => (
              <motion.li key={l.i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: k === 0 ? 1 : k === 1 ? 0.62 : 0.36, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="w-full truncate text-[12.5px] leading-[18px]" style={{ color: k === 0 ? TEXT_2 : TEXT_3 }}>
                {logLine(l)}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {/* on a touch screen held upright, a hint that sideways is roomier */}
        <div className="mt-4 hidden shrink-0 items-center gap-1.5 text-[11px] [@media(pointer:coarse)_and_(min-height:780px)]:flex" style={{ color: TEXT_3 }}>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x={5} y={1.5} width={6.5} height={11} rx={1.4} />
            <path d="M2 9.5a6 6 0 0 0 5 5M2 9.5l-.6 2M2 9.5l2 .4" />
          </svg>
          Turn sideways for a bigger field
        </div>
      </div>
      {showConsole ? <div className="shrink-0">{consoleEl}</div> : <div className="min-h-0 flex-1" />}
    </motion.main>
  ) : (
    <motion.main key="battle" {...enter} className="flex min-h-0 flex-1 flex-col items-center gap-2 px-2 pb-2 sm:px-4 sm:pb-3">
      {!platesInBar && (
        <div className={`grid w-full shrink-0 gap-2 ${plateCols}`} style={{ maxWidth: fieldW || undefined }}>
          {plates}
        </div>
      )}
      {field}
      {showConsole && (
        <div className="w-full shrink-0" style={{ maxWidth: fieldW || undefined }}>
          {consoleEl}
        </div>
      )}
    </motion.main>
  );

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden" style={{ background: PAGE, color: TEXT }} onPointerDown={primeSound}>
      <IconDefs />
      {header}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {d.phase === "draft" ? (
            <motion.div key="draft" className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <DraftScreen v={v} youId={youId} canPick={canPick} onPick={pick} onAuto={autoDraftMe} seated={!spectating && !!me && !me.left} nowEst={nowEst} />
            </motion.div>
          ) : (
            battle
          )}
        </AnimatePresence>

        {/* over the field, under the toolbar — the party menu stays reachable */}
        <AnimatePresence>{d.phase === "over" && <GameOverCard key="tk-over" v={d} party={party} youId={youId} isHost={isHost} playAgain={playAgain} exitToLobby={exitToLobby} />}</AnimatePresence>
      </div>
      {rulesOpen && <TanksRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
