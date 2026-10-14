/* The battlefield, alive. The server resolves a whole shot in one go and
   sends the settled world plus a ShotRecord; this class turns that back into
   time. It starts from the record's `pre` world, swings the shooter's barrel,
   fires, flies every track tick by tick, and as each recorded event comes due
   it carves the ground, spawns the fireball, drops the tanks, pops the score.
   Only when the last thing has settled does it hand the live view back to
   the screen (`onSettle`), so the HUD never runs ahead of the explosions.

   Drives replay the same way. Beats queue, so a drive-then-fire that lands in
   one packet plays as two. Imperative and frame-driven: React owns the
   chrome, this owns the canvas. */

import {
  applyOp,
  COL,
  H,
  hangingDirt,
  heightAt,
  lineCarves,
  NCOL,
  tankGround,
  tankTilt,
  W,
} from "@/lib/games/tanks/terrain";
import { G, TPS } from "@/lib/games/tanks/sim";
import type { FxStyle, LastDrive, LastShot, ShotEvent, TankColor, TerrainOp, Track, TanksView } from "@/lib/games/tanks/types";
import { drawBlast, drawDotted, drawHead, drawSilk, drawTail, drawTank, drawZap, heart, PALETTE, renderRock, renderSky, Y } from "./draw";
import { debris, embers, Fx, glitter, mix, ring, smoke, soft, sparks, withAlpha } from "./fx";
import { BIOME, TANK, type Look } from "./palette";
import { sfxBoom, sfxBounce, sfxDig, sfxEngine, sfxFire, sfxHit, sfxRound, sfxSizzle, sfxThud, sfxTink, sfxWeb, sfxZap } from "./sfx";

const MS_PER_TICK = 1000 / TPS;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

type Beat = { kind: "shot"; s: LastShot; beat: number } | { kind: "drive"; d: LastDrive; beat: number };

interface Tween {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  /** ms */
  start: number;
  dur: number;
  how: "fall" | "push" | "blink" | "rise" | "toss" | "drive";
}

interface TankSprite {
  seat: number;
  color: TankColor;
  name: string;
  x: number;
  y: number;
  angle: number;
  aim: number;
  tilt: number;
  recoil: number;
  flash: number;
  wheel: number;
  alpha: number;
  present: boolean;
  warp: number;
  tween: Tween | null;
  /** damage taken, for battle scars (smoke) */
  scars: number;
}

/** A timed effect, in ms. */
interface Effect {
  kind: "zap" | "web" | "blast";
  start: number;
  dur: number;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r?: number;
  pal?: string[];
  seed?: number;
}

/** Dirt left hanging over a fresh hole, falling into it. World units. */
interface Float {
  /** current bottom of the chunk */
  y: number;
  len: number;
  v: number;
}

/** A Tracer's landing: change your angle by `label` to land here. Kept until that tank fires again. */
interface Mark {
  seat: number;
  x: number;
  y: number;
  label: string;
}

interface Popup {
  seat: number;
  x: number;
  y: number;
  text: string;
  color: string;
  start: number;
}

interface Ambient {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  ph: number;
  hot: boolean;
}

interface Playing {
  kind: "shot" | "drive";
  beat: Beat;
  start: number;
  /** shot: when the trigger is pulled */
  fireAt: number;
  fired: boolean;
  evIdx: number;
  /** drive: how long */
  dur: number;
  grounded: Set<number>;
  groundedAt: Map<number, number>;
  started: Set<string>;
}

export interface SceneCallbacks {
  onSettle: (v: TanksView) => void;
  onScores: (scores: number[]) => void;
  onFire: (seat: number, weapon: string) => void;
  /** a replay has started */
  onBusy: () => void;
}

export interface LocalAim {
  seat: number;
  angle: number;
}

export class Scene {
  cb: SceneCallbacks;
  latest: TanksView | null = null;
  started = -1;
  lastBeat = 0;
  queue: Beat[] = [];
  cur: Playing | null = null;

  ground: number[] = Array(NCOL).fill(100);
  target: number[] = Array(NCOL).fill(100);
  tanks = new Map<number, TankSprite>();
  scores: number[] = [];
  fx = new Fx();
  effects: Effect[] = [];
  floats = new Map<number, Float>();
  marks: Mark[] = [];
  /** the dotted paths of each tank's last Tracer */
  tracerPaths: { seat: number; pts: [number, number][] }[] = [];
  popups: Popup[] = [];
  ambient: Ambient[] = [];
  shake = 0;
  screenFlash = { a: 0, color: "#ffffff" };
  aim: LocalAim | null = null;
  activeSeat: number | null = null;
  wind = 0;
  gravity = 1;
  biome: TanksView["biome"] = "mesa";
  /** the viewer's chosen theme ("auto" = the map's own scenery) */
  theme: "auto" | Exclude<Look, TanksView["biome"]> = "auto";
  look: Look = "mesa";
  scenery = 0;
  time = 0;
  lastNow = 0;

  // canvases
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  pxScale = 1;
  cssScale = 1;
  sky: HTMLCanvasElement | null = null;
  rock: HTMLCanvasElement | null = null;
  scorch: HTMLCanvasElement | null = null;
  artKey = "";
  font = "sans-serif";

  constructor(cb: SceneCallbacks) {
    this.cb = cb;
  }

  get busy() {
    return this.cur !== null || this.queue.length > 0;
  }

  /* ================= wiring ================= */

  attach(canvas: HTMLCanvasElement, font: string) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.font = font;
  }

  resize(cssW: number, dpr: number) {
    if (!this.canvas) return;
    const cssH = (cssW * H) / W;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.pxScale = this.canvas.width / W;
    this.cssScale = cssW / W;
    this.ensureArt(true);
  }

  private ensureArt(force = false) {
    if (typeof document === "undefined") return;
    const scale = Math.min(2, Math.max(0.5, this.pxScale));
    const key = `${this.look}:${this.scenery}:${scale.toFixed(2)}`;
    if (!force && key === this.artKey) return;
    if (key === this.artKey && this.sky) return;
    const biomeChanged = !this.artKey.startsWith(`${this.look}:${this.scenery}:`);
    this.artKey = key;
    this.sky = renderSky(this.look, this.scenery, scale);
    this.rock = renderRock(this.look, this.scenery, scale);
    if (!this.scorch || biomeChanged) {
      this.scorch = document.createElement("canvas");
      this.scorch.width = W;
      this.scorch.height = H;
    }
  }

  /* ================= ingest ================= */

  ingest(v: TanksView) {
    this.latest = v;
    if (v.startedAt !== this.started) {
      this.reset(v);
      return;
    }
    const beats: Beat[] = [];
    if (v.lastDrive && v.lastDrive.beat > this.lastBeat) beats.push({ kind: "drive", d: v.lastDrive, beat: v.lastDrive.beat });
    if (v.lastShot && v.lastShot.beat > this.lastBeat) beats.push({ kind: "shot", s: v.lastShot, beat: v.lastShot.beat });
    if (beats.length) {
      beats.sort((a, b) => a.beat - b.beat);
      this.lastBeat = Math.max(...beats.map((b) => b.beat));
      this.queue.push(...beats);
      if (!this.cur) this.next();
      return;
    }
    if (!this.busy) this.sync(v);
  }

  private reset(v: TanksView) {
    this.started = v.startedAt;
    this.lastBeat = v.beat;
    this.queue = [];
    this.cur = null;
    this.fx.clear();
    this.effects = [];
    this.popups = [];
    this.floats.clear();
    this.marks = [];
    this.tracerPaths = [];
    this.biome = v.biome;
    this.look = this.theme === "auto" ? v.biome : this.theme;
    this.scenery = v.scenery;
    this.gravity = v.gravity;
    this.ensureArt();
    this.scorch?.getContext("2d")?.clearRect(0, 0, W, H);
    this.ground = v.ground.slice();
    this.target = v.ground.slice();
    this.tanks.clear();
    for (const p of v.players) {
      this.tanks.set(p.seat, {
        seat: p.seat,
        color: p.color,
        name: p.name,
        x: p.x,
        y: p.y,
        angle: p.angle,
        aim: p.angle,
        tilt: tankTilt(v.ground, p.x),
        recoil: 0,
        flash: 0,
        wheel: 0,
        alpha: p.left ? 0 : 1,
        present: !p.left,
        warp: 0,
        tween: null,
        scars: p.taken,
      });
    }
    this.seedAmbient();
    this.sync(v);
  }

  /** Present the live view as-is: nothing left to replay. */
  private sync(v: TanksView) {
    this.wind = v.wind;
    this.gravity = v.gravity;
    this.floats.clear();
    for (let i = 0; i < NCOL; i++) {
      this.target[i] = v.ground[i];
      if (this.ground[i] > v.ground[i] || Math.abs(this.ground[i] - v.ground[i]) > 40) this.ground[i] = v.ground[i];
    }
    for (const p of v.players) {
      const t = this.tanks.get(p.seat);
      if (!t) continue;
      t.name = p.name;
      t.present = !p.left;
      t.tween = null;
      t.x = p.x;
      t.y = p.y;
      t.aim = p.angle;
      t.scars = p.taken;
    }
    this.scores = v.players.map((p) => p.score);
    this.cb.onScores(this.scores.slice());
    this.cb.onSettle(v);
  }

  private next(): void {
    const b = this.queue.shift();
    if (!b) {
      this.cur = null;
      if (this.latest) this.sync(this.latest);
      return;
    }
    const now = performance.now();
    this.cb.onBusy();
    if (b.kind === "drive") {
      const t = this.tanks.get(b.d.seat);
      if (!t) return this.next();
      const dist = Math.abs(b.d.to - b.d.from);
      const dur = 260 + (dist / 70) * 1000;
      t.x = b.d.from;
      t.y = tankGround(this.ground, t.x);
      t.tween = { fx: b.d.from, fy: t.y, tx: b.d.to, ty: tankGround(this.ground, b.d.to), start: now, dur, how: "drive" };
      this.activeSeat = b.d.seat;
      sfxEngine(dur / 1000);
      this.cur = { kind: "drive", beat: b, start: now, fireAt: now, fired: true, evIdx: 0, dur, grounded: new Set(), groundedAt: new Map(), started: new Set() };
      return;
    }
    const s = b.s;
    // rewind to the world as it was when the trigger was pulled
    this.ground = s.pre.ground.slice();
    this.target = s.pre.ground.slice();
    this.floats.clear();
    // a tank's tracer readings last until it fires again
    this.marks = this.marks.filter((m) => m.seat !== s.seat);
    this.tracerPaths = this.tracerPaths.filter((p) => p.seat !== s.seat);
    for (const t of this.tanks.values()) {
      const pre = s.pre.tanks.find((q) => q.seat === t.seat);
      t.tween = null;
      if (pre) {
        t.x = pre.x;
        t.y = pre.y;
      }
    }
    this.scores = s.pre.scores.slice();
    this.cb.onScores(this.scores.slice());
    this.wind = s.wind;
    this.activeSeat = s.seat;
    const shooter = this.tanks.get(s.seat);
    if (shooter) shooter.aim = s.angle;
    const swing = shooter && Math.abs(shooter.angle - s.angle) > 2 ? 520 : 160;
    this.cur = { kind: "shot", beat: b, start: now, fireAt: now + swing, fired: false, evIdx: 0, dur: 0, grounded: new Set(), groundedAt: new Map(), started: new Set() };
  }

  private finishBeat() {
    const cur = this.cur;
    if (cur?.kind === "shot") {
      const shot = (cur.beat as Extract<Beat, { kind: "shot" }>).s;
      for (const tr of shot.rec.tracks) {
        if (tr.s !== "tracer") continue;
        const pts: [number, number][] = [];
        for (let i = 0; i + 1 < tr.p.length; i += 2) pts.push([tr.p[i], tr.p[i + 1]]);
        this.tracerPaths.push({ seat: shot.seat, pts });
      }
    }
    for (const [i] of this.floats) this.ground[i] = this.target[i];
    this.floats.clear();
    for (const t of this.tanks.values()) {
      if (t.tween) {
        t.x = t.tween.tx;
        t.y = t.tween.ty;
        t.tween = null;
      }
      t.warp = 0;
    }
    this.cur = null;
    this.next();
  }

  /** Switch the battlefield's look. Scorch marks are kept. */
  setTheme(theme: Scene["theme"]) {
    this.theme = theme;
    const look = theme === "auto" ? this.biome : theme;
    if (look === this.look) return;
    this.look = look;
    const scorch = this.scorch;
    this.ensureArt(true);
    if (scorch && this.scorch !== scorch) this.scorch?.getContext("2d")?.drawImage(scorch, 0, 0);
    this.seedAmbient();
  }

  setAim(a: LocalAim | null) {
    this.aim = a;
  }

  /* ================= time ================= */

  frame(now: number) {
    const dt = this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 0.016;
    this.lastNow = now;
    this.time += dt;
    this.update(now, dt);
    this.draw(now);
  }

  private tick(now: number): number {
    return this.cur ? (now - this.cur.fireAt) / MS_PER_TICK : 0;
  }

  private update(now: number, dt: number) {
    const cur = this.cur;
    if (cur?.kind === "shot") {
      const s = (cur.beat as Extract<Beat, { kind: "shot" }>).s;
      if (!cur.fired && now >= cur.fireAt) {
        cur.fired = true;
        this.muzzle(s.seat, s.weapon, true);
        this.cb.onFire(s.seat, s.weapon);
      }
      if (cur.fired) {
        const tau = this.tick(now);
        const evs = s.rec.events;
        while (cur.evIdx < evs.length && evs[cur.evIdx].t <= tau) this.handle(evs[cur.evIdx++], s);
        this.trackFx(s, tau, dt, cur);
        if (tau >= s.rec.dur) this.finishBeat();
      }
    } else if (cur?.kind === "drive") {
      const t = this.tanks.get((cur.beat as Extract<Beat, { kind: "drive" }>).d.seat);
      if (t && t.tween && Math.random() < dt * 30) {
        const dir = Math.sign(t.tween.tx - t.tween.fx);
        this.fx.add({ k: "smoke", x: t.x - dir * 14, y: t.y + 2, vx: -dir * 20 + rnd(-8, 8), vy: rnd(6, 18), drag: 0.5, max: rnd(0.6, 1.1), size: 2.5, grow: 9, color: BIOME[this.look].debris[0], alpha: 0.4 });
      }
      if (now >= cur.start + cur.dur) this.finishBeat();
    }

    // ground: craters snap open, hanging dirt falls in, new dirt rises
    const rise = dt * 260;
    for (const [i, f] of this.floats) {
      f.v += G * this.gravity * dt;
      f.y -= f.v * dt;
      if (f.y <= this.ground[i]) {
        this.ground[i] = this.target[i];
        this.floats.delete(i);
        if (i % 6 === 0 && Math.random() < 0.5) this.fx.add({ k: "smoke", x: (i + 0.5) * COL, y: this.ground[i] + 2, vx: rnd(-10, 10), vy: rnd(6, 14), drag: 0.5, max: 0.9, size: 3, grow: 9, color: BIOME[this.look].debris[0], alpha: 0.3 });
      }
    }
    for (let i = 0; i < NCOL; i++) {
      if (this.floats.has(i)) continue;
      const g = this.ground[i];
      const tg = this.target[i];
      if (g > tg) this.ground[i] = tg;
      else if (g < tg) this.ground[i] = Math.min(tg, g + rise);
    }

    // tanks
    for (const t of this.tanks.values()) {
      const mine = this.aim && this.aim.seat === t.seat && !this.busy;
      const want = mine ? this.aim!.angle : t.aim;
      t.angle += (want - t.angle) * Math.min(1, dt * (mine ? 30 : 7));
      t.recoil = Math.max(0, t.recoil - dt * 3.2);
      t.flash = Math.max(0, t.flash - dt * 4);
      if (t.tween) {
        const tw = t.tween;
        const u = clamp01((now - tw.start) / tw.dur);
        const px = t.x;
        switch (tw.how) {
          case "fall":
            t.x = tw.tx;
            t.y = tw.fy + (tw.ty - tw.fy) * u * u;
            break;
          case "drive":
          case "push": {
            const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
            t.x = tw.fx + (tw.tx - tw.fx) * e;
            t.y = tw.how === "drive" ? tankGround(this.ground, t.x) : tw.fy + (tw.ty - tw.fy) * e;
            break;
          }
          case "toss":
            t.x = tw.fx + (tw.tx - tw.fx) * u;
            t.y = tw.fy + (tw.ty - tw.fy) * u + Math.sin(u * Math.PI) * 70;
            t.wheel += dt * 30;
            break;
          case "blink":
            t.warp = u < 0.5 ? u * 2 : (1 - u) * 2;
            t.x = u < 0.5 ? tw.fx : tw.tx;
            t.y = u < 0.5 ? tw.fy : tw.ty;
            break;
          case "rise":
            t.x = tw.tx;
            t.y = tw.fy + (tw.ty - tw.fy) * u;
            break;
        }
        t.wheel += (t.x - px) * 0.45;
        if (u >= 1) {
          if (tw.how === "fall" && tw.fy - tw.ty > 14) {
            sfxThud();
            debris(this.fx, t.x, t.y, 8, BIOME[this.look].debris, 70);
            smoke(this.fx, t.x, t.y, 3, 10, withAlpha(BIOME[this.look].debris[0], 1), this.wind, 10);
          }
          t.x = tw.tx;
          t.y = tw.ty;
          t.warp = 0;
          t.tween = null;
        }
      }
      const tilt = tankTilt(this.ground, t.x);
      t.tilt += (tilt - t.tilt) * Math.min(1, dt * 10);
      const wantAlpha = t.present ? 1 : 0;
      t.alpha += (wantAlpha - t.alpha) * Math.min(1, dt * 3);
      // battle scars: a damaged tank smokes
      if (t.present && t.scars > 40 && Math.random() < dt * Math.min(6, t.scars / 30)) {
        this.fx.add({ k: "smoke", x: t.x + rnd(-4, 4), y: t.y + 16, vx: this.wind * 2, vy: rnd(14, 24), drag: 0.6, max: rnd(1.4, 2.4), size: 2, grow: 6, color: "#2a2826", alpha: 0.35 });
        if (t.scars > 110 && Math.random() < 0.3) this.fx.add({ k: "ember", x: t.x + rnd(-6, 6), y: t.y + 14, vx: rnd(-10, 10), vy: rnd(20, 50), g: 0.3, max: 0.8, size: 1, color: "#ff8a3a" });
      }
    }

    this.fx.update(dt, (x) => heightAt(this.ground, x));
    this.shake *= Math.pow(0.0025, dt);
    this.screenFlash.a = Math.max(0, this.screenFlash.a - dt * 2.2);
    this.effects = this.effects.filter((e) => now < e.start + e.dur + 100);
    this.popups = this.popups.filter((p) => now < p.start + 1600);
    this.updateAmbient(dt);
  }

  /* ================= events ================= */

  /** Apply a terrain op to the replay: holes open at once, dirt left hanging over them falls. */
  private terrain(op: TerrainOp) {
    const discs = op.k === "carve" ? [{ x: op.x, y: op.y, r: op.r }] : op.k === "line" ? lineCarves(op.x1, op.y1, op.x2, op.y2, op.r) : [];
    for (const d of discs) {
      const hanging = hangingDirt(this.target, d.x, d.y, d.r);
      for (const [i] of hanging) {
        // settle anything already falling in this column first
        if (this.floats.has(i)) this.floats.delete(i);
        this.ground[i] = this.target[i];
      }
      applyOp(this.target, { k: "carve", x: d.x, y: d.y, r: d.r });
      for (const [i, bot, top, before] of hanging) {
        this.ground[i] = bot;
        this.floats.set(i, { y: top, len: before - top, v: 0 });
      }
    }
    if (!discs.length) applyOp(this.target, op);
  }

  private handle(e: ShotEvent, s: LastShot) {
    const now = performance.now();
    const shooter = this.tanks.get(s.seat);
    const shooterColor = shooter ? TANK[shooter.color].light : "#ffffff";
    switch (e.k) {
      case "op":
        return this.terrain(e.op);
      case "boom":
        return this.boom(e.x, e.y, e.r, e.fx);
      case "dmg": {
        const self = e.seat === s.seat;
        if (self) this.scores[s.seat] = Math.max(0, (this.scores[s.seat] ?? 0) - e.n);
        else this.scores[s.seat] = (this.scores[s.seat] ?? 0) + e.n;
        this.cb.onScores(this.scores.slice());
        const victim = this.tanks.get(e.seat);
        if (victim) {
          victim.flash = 1;
          victim.scars += e.n;
          sparks(this.fx, victim.x, victim.y + 10, 6, "#fff0c0", 140, true);
        }
        const stack = this.popups.filter((p) => p.seat === e.seat && now - p.start < 700).length;
        this.popups.push({ seat: e.seat, x: e.x + rnd(-5, 5) + (stack % 2 ? 14 : stack ? -14 : 0), y: e.y + stack * 13, text: self ? `−${e.n}` : `+${e.n}`, color: self ? "#ff6a5a" : shooterColor, start: now });
        if (e.n > 1) sfxHit(self);
        else sfxTink();
        return;
      }
      case "tank": {
        const t = this.tanks.get(e.seat);
        if (!t) return;
        t.tween = { fx: t.x, fy: t.y, tx: e.x, ty: e.y, start: now, dur: e.d * MS_PER_TICK, how: e.how };
        if (e.how === "push" || e.how === "toss") debris(this.fx, t.x, t.y, 6, BIOME[this.look].debris, 60);
        return;
      }
      case "beam":
        if (e.fx === "zap") {
          this.effects.push({ kind: "zap", start: now, dur: e.d * MS_PER_TICK, x: e.x1, y: e.y1, x2: e.x2, y2: e.y2, seed: Math.floor(Math.random() * 1e6) });
          this.fx.light(e.x2, e.y2, 90, "#40c4ff", 0.4);
          this.screenFlash = { a: 0.12, color: "#bfe6ff" };
          sfxZap();
        } else {
          this.effects.push({ kind: "web", start: now, dur: e.d * MS_PER_TICK, x: e.x1, y: e.y1, x2: e.x2, y2: e.y2 });
          sfxWeb();
        }
        return;
      case "mark":
        this.marks.push({ seat: e.seat, x: e.x, y: e.y, label: e.label });
        return;
      case "muzzle":
        this.muzzle(e.seat, "tommygun", false);
        return;
      case "bounce":
        sfxBounce();
        return;
    }
  }

  private muzzle(seat: number, weapon: string, main: boolean) {
    const t = this.tanks.get(seat);
    if (!t) return;
    const a = (t.angle * Math.PI) / 180;
    const mx = t.x + Math.cos(a) * 22;
    const my = t.y + 15 + Math.sin(a) * 22;
    t.recoil = 1;
    const col = weapon === "sniper" ? "#ffffff" : "#ffd27a";
    this.fx.add({ k: "flash", x: mx, y: my, size: main ? 20 : 11, color: col, max: 0.12 });
    for (let i = 0; i < (main ? 8 : 3); i++) {
      const sp = rnd(80, 220);
      const da = a + rnd(-0.35, 0.35);
      this.fx.add({ k: "spark", x: mx, y: my, vx: Math.cos(da) * sp, vy: Math.sin(da) * sp, drag: 0.1, max: rnd(0.1, 0.22), size: 1.1, color: col });
    }
    for (let i = 0; i < (main ? 5 : 1); i++) {
      const sp = rnd(20, 60);
      this.fx.add({ k: "smoke", x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 8, drag: 0.3, max: rnd(0.8, 1.5), size: 3, grow: 9, color: "#b9b2a4", alpha: 0.4 });
    }
    this.fx.light(mx, my, main ? 70 : 34, col, 0.16);
    if (main) {
      this.shake = Math.max(this.shake, 3);
      sfxFire(weapon);
    } else sfxRound();
  }

  /** An explosion, Pocket Tanks style: a colour-cycling disc of rings, plus a little debris and light. */
  private boom(x: number, y: number, r: number, fx: FxStyle) {
    const b = BIOME[this.look];
    const now = performance.now();
    sfxBoom(fx, r);
    const dur = fx === "spark" ? 220 : 420 + r * 7;
    this.effects.push({ kind: "blast", start: now, dur, x, y, r, pal: PALETTE[fx] });
    const scorch = (rad: number, color: string, alpha: number) => {
      const sc = this.scorch?.getContext("2d");
      if (!sc) return;
      const g = sc.createRadialGradient(x, H - y, 0, x, H - y, rad);
      g.addColorStop(0, withAlpha(color, alpha));
      g.addColorStop(0.6, withAlpha(color, alpha * 0.55));
      g.addColorStop(1, withAlpha(color, 0));
      sc.fillStyle = g;
      sc.fillRect(x - rad, H - y - rad, rad * 2, rad * 2);
    };
    const warm = fx === "fire" || fx === "big" || fx === "small" || fx === "pop" || fx === "napalm";
    if (r >= 10) debris(this.fx, x, y, Math.round(Math.min(26, r / 2)), b.debris, r * 6);
    switch (fx) {
      case "ice":
        glitter(this.fx, x, y, 14, ["#ffffff", "#b3e5fc", "#e1f5fe"], 120, 0.5);
        break;
      case "zap":
        sparks(this.fx, x, y, 14, "#80d8ff", 220);
        this.fx.light(x, y, r * 4, "#40c4ff", 0.4);
        break;
      case "web":
        glitter(this.fx, x, y, 6, ["#ffffff"], 60, 0.4);
        break;
      case "dirt":
        smoke(this.fx, x, y, Math.round(2 + r / 10), r * 0.6, mix(b.debris[0], "#7a7066", 0.4), this.wind, 16);
        this.shake = Math.max(this.shake, Math.min(8, r / 6));
        break;
      case "napalm":
        embers(this.fx, x, y, 16, "#ff7a2a", 10);
        break;
      case "sniper":
        sparks(this.fx, x, y, 16, "#ffffff", 320, true);
        this.shake = Math.max(this.shake, 4);
        break;
    }
    if (warm) {
      sparks(this.fx, x, y, Math.round(r / 3), "#ffd27a", r * 8, true);
      smoke(this.fx, x, y + r * 0.3, Math.round(2 + r / 12), r * 0.5, "#3a3430", this.wind);
      this.fx.light(x, y, r * 3.2, "#ff9a4a", 0.35 + r / 160);
      this.shake = Math.max(this.shake, Math.min(13, r / 6));
      if (r > 50) ring(this.fx, x, y, r * 1.4, "#fff2d0", 3, 0.5);
      scorch(r * 1.15, "#140a06", 0.36);
    }
  }

  /** Particles that tracks shed while they fly; sounds when they change state. */
  private trackFx(s: LastShot, tau: number, dt: number, cur: Playing) {
    const b = BIOME[this.look];
    s.rec.tracks.forEach((tr, i) => {
      if (tau < tr.t0 || tau > tr.t1) return;
      const p = posAt(tr, tau);
      if (!p) return;
      const [x, y] = p;
      const gh = x >= 0 && x <= W ? heightAt(this.ground, x) : -999;
      const under = y < gh - 3;
      const chance = (rate: number) => Math.random() < rate * dt;
      const key = `${tr.s}:${i}`;
      if (tr.s === "flame" && !cur.started.has("flame")) {
        cur.started.add("flame");
        sfxSizzle(2.4);
      }
      if (under && !cur.started.has(key)) {
        cur.started.add(key);
        if (tr.s === "bullet") sfxDig((tr.t1 - tau) / TPS);
      }
      switch (tr.s) {
        case "bullet":
        case "warhead":
          if (under && chance(60)) debris(this.fx, x, gh, 1, b.debris, 90);
          // cruising and skipping kick up dust
          if (!under && Math.abs(y - gh) < 6 && chance(30)) this.fx.add({ k: "smoke", x, y: gh + 2, vx: rnd(-10, 10), vy: rnd(4, 12), drag: 0.5, max: 0.8, size: 2, grow: 6, color: b.debris[0], alpha: 0.35 });
          break;
        case "flame":
          if (chance(10)) this.fx.add({ k: "smoke", x, y: y + 6, vx: 0, vy: rnd(14, 30), drag: 0.6, max: rnd(0.8, 1.6), size: 2, grow: 7, color: "#2a2422", alpha: 0.35 });
          if (chance(8)) this.fx.add({ k: "ember", x, y: y + 4, vx: rnd(-10, 10), vy: rnd(30, 70), g: 0.2, max: 0.7, size: 1, color: "#ffb04a" });
          if (Math.abs(y - gh) < 5 && chance(14)) this.scorchDot(x, y, 7, "#1a0a04", 0.18);
          break;
        case "missile":
          if (chance(36)) this.fx.add({ k: "smoke", x, y, vx: rnd(-6, 6), vy: rnd(2, 10), drag: 0.5, max: rnd(0.8, 1.5), size: 2, grow: 8, color: "#d8d2c4", alpha: 0.3 });
          break;
        case "clod":
          if (chance(14)) debris(this.fx, x, y, 1, b.debris, 30);
          break;
      }
    });
  }

  private scorchDot(x: number, y: number, r: number, color: string, a: number) {
    const sc = this.scorch?.getContext("2d");
    if (!sc) return;
    sc.fillStyle = withAlpha(color, a);
    sc.beginPath();
    sc.arc(x, H - y + 2, r, 0, Math.PI * 2);
    sc.fill();
  }

  /* ================= ambience ================= */

  private seedAmbient() {
    const n = this.look === "love" ? 22 : this.look === "tundra" ? 110 : this.look === "ashlands" ? 80 : this.look === "mesa" ? 40 : 0;
    this.ambient = Array.from({ length: n }, () => this.newAmbient(true));
  }

  private newAmbient(anywhere: boolean): Ambient {
    const b = this.look;
    return {
      x: rnd(-40, W + 40),
      y: anywhere ? rnd(0, H) : H + 10,
      vx: 0,
      vy: b === "love" ? -rnd(8, 18) : b === "tundra" ? -rnd(14, 34) : b === "ashlands" ? -rnd(6, 20) : rnd(-3, 3),
      size: b === "love" ? rnd(4, 8) : b === "tundra" ? rnd(0.8, 2.2) : b === "ashlands" ? rnd(0.8, 1.8) : rnd(0.6, 1.4),
      ph: rnd(0, 10),
      hot: b === "ashlands" && Math.random() < 0.3,
    };
  }

  private updateAmbient(dt: number) {
    for (let i = 0; i < this.ambient.length; i++) {
      const a = this.ambient[i];
      a.x += (this.wind * 2.2 + Math.sin(this.time * 1.3 + a.ph) * 8) * dt;
      a.y += a.vy * dt + (this.look === "mesa" ? Math.sin(this.time + a.ph) * 4 * dt : 0);
      if (a.y < heightAt(this.ground, Math.max(0, Math.min(W, a.x))) || a.y < 0 || a.x < -60 || a.x > W + 60) {
        this.ambient[i] = this.newAmbient(this.look === "mesa");
        if (this.ambient[i].x < 0 && this.wind < 0) this.ambient[i].x = W + 30;
      }
    }
  }

  /* ================= drawing ================= */

  private draw(now: number) {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    this.ensureArt();
    const b = BIOME[this.look];
    const s = this.pxScale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const sh = this.shake;
    const ox = sh > 0.2 ? rnd(-sh, sh) : 0;
    const oy = sh > 0.2 ? rnd(-sh, sh) : 0;
    ctx.setTransform(s, 0, 0, s, ox * s, oy * s);

    // sky
    if (this.sky) ctx.drawImage(this.sky, -20, -20, W + 40, H + 40);
    this.drawSkyLife(ctx);

    // ambient behind the ridge
    this.drawAmbient(ctx);

    // the ridge, and any dirt still falling into a fresh hole
    this.drawGround(ctx, b);
    this.drawFloats(ctx, b);

    // tracer readings from earlier turns
    this.drawTracers(ctx, now);

    // tanks
    for (const t of this.tanks.values()) {
      if (t.alpha < 0.02) continue;
      drawTank(ctx, { x: t.x, y: t.y, tilt: t.tilt, angle: t.angle, recoil: t.recoil, flash: t.flash, color: t.color, wheel: t.wheel, alpha: t.alpha, wind: this.wind, warp: t.warp }, this.time);
    }

    // particles (solid)
    this.fx.drawSolid(ctx, this.time);

    // projectiles
    const cur = this.cur;
    if (cur?.kind === "shot" && cur.fired) {
      const shot = (cur.beat as Extract<Beat, { kind: "shot" }>).s;
      const tau = this.tick(now);
      const above = shot.rec.tracks.filter((tr) => {
        const p = tau >= tr.t0 && tau <= tr.t1 ? posAt(tr, tau) : null;
        return p !== null && p[1] > H + 4;
      }).length;
      for (const tr of shot.rec.tracks) {
        if (tau < tr.t0) continue;
        // a tracer leaves its dotted path behind as it flies
        if (tr.s === "tracer") {
          const pts: [number, number][] = [];
          for (let t = tr.t0; t <= Math.min(tau, tr.t1); t += 1) pts.push(posAt(tr, t)!);
          drawDotted(ctx, pts, 0.7);
        }
        if (tau > tr.t1) continue;
        const p = posAt(tr, tau);
        if (!p) continue;
        const q = posAt(tr, Math.max(tr.t0, tau - 1)) ?? p;
        const vx = (p[0] - q[0]) * TPS;
        const vy = (p[1] - q[1]) * TPS;
        const color = tr.c ?? "#ffffff";
        const gh = p[0] >= 0 && p[0] <= W ? heightAt(this.ground, p[0]) : -999;
        const under = p[1] < gh - 3;
        if (!under && (tr.s === "bullet" || tr.s === "warhead" || tr.s === "missile")) {
          const pts: [number, number][] = [];
          for (let j = 7; j >= 0; j--) {
            const t = tau - j;
            if (t >= tr.t0) pts.push(posAt(tr, t)!);
          }
          drawTail(ctx, pts, color, tr.s === "warhead" ? 1.4 : 2.2);
        }
        drawHead(ctx, tr.s, color, p[0], p[1], vx, vy, tau - tr.t0, this.time, under);
        if (p[1] > H + 4) this.drawOffscreen(ctx, p[0], p[1], color, above <= 2);
      }
    }

    // explosions
    for (const e of this.effects) {
      if (e.kind !== "blast") continue;
      const u = (now - e.start) / e.dur;
      if (u < 0 || u > 1) continue;
      drawBlast(ctx, e.x, e.y, e.r ?? 20, u, e.pal ?? PALETTE.fire, this.time);
    }

    // glows
    this.fx.drawGlow(ctx, this.time);

    // zaps and silk
    for (const e of this.effects) {
      const u = (now - e.start) / e.dur;
      if (u < 0 || u > 1) continue;
      if (e.kind === "zap") drawZap(ctx, e.x, e.y, e.x2!, e.y2!, u < 0.7 ? 1 : (1 - u) / 0.3, (e.seed ?? 0) + Math.floor((now - e.start) / 50));
      if (e.kind === "web") drawSilk(ctx, e.x, e.y, e.x2!, e.y2!, Math.min(1, (now - e.start) / 120), u < 0.75 ? 0.85 : ((1 - u) / 0.25) * 0.85);
    }

    // aim guide + pull line
    this.drawAim(ctx);

    // labels, chevron, popups
    this.drawLabels(ctx, now);

    // vignette + flash (screen space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const vg = ctx.createRadialGradient(cw / 2, ch * 0.45, ch * 0.35, cw / 2, ch * 0.5, cw * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cw, ch);
    if (this.screenFlash.a > 0.01) {
      ctx.globalAlpha = this.screenFlash.a;
      ctx.fillStyle = this.screenFlash.color;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalAlpha = 1;
    }
  }

  private drawSkyLife(ctx: CanvasRenderingContext2D) {
    const t = this.time;
    if (this.look === "tundra") {
      // aurora curtains
      ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 3; k++) {
        const base = 110 + k * 40;
        for (let x = -20; x < W + 20; x += 5) {
          const y = base + Math.sin(x * 0.006 + t * 0.25 + k * 2) * 34 + Math.sin(x * 0.017 - t * 0.4 + k) * 12;
          const a = (0.5 + 0.5 * Math.sin(x * 0.02 + t * 0.9 + k * 1.7)) * (k === 1 ? 0.07 : 0.05);
          const len = 70 + 40 * Math.sin(x * 0.01 + k + t * 0.3);
          const g = ctx.createLinearGradient(0, y, 0, y + len);
          g.addColorStop(0, withAlpha(k === 2 ? "#b86bff" : "#5affb0", 0));
          g.addColorStop(0.3, withAlpha(k === 2 ? "#b86bff" : "#5affb0", a * 3));
          g.addColorStop(1, withAlpha("#2affd0", 0));
          ctx.fillStyle = g;
          ctx.fillRect(x, y, 5, len);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    } else if (this.look === "lunar") {
      // a few stars that glint
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 12; i++) {
        const x = (i * 97.3 + this.scenery * 0.001) % W;
        const y = 30 + ((i * 53.7) % (H * 0.5));
        const a = Math.max(0, Math.sin(t * (0.6 + i * 0.13) + i));
        ctx.globalAlpha = a * 0.8;
        ctx.drawImage(soft("#ffffff"), x - 4, y - 4, 8, 8);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private drawAmbient(ctx: CanvasRenderingContext2D) {
    if (!this.ambient.length) return;
    for (const a of this.ambient) {
      if (this.look === "love") {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#ffffff";
        heart(ctx, a.x, Y(a.y), a.size * (0.9 + 0.1 * Math.sin(this.time * 2 + a.ph)));
        ctx.fill();
      } else if (this.look === "tundra") {
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = "#f2f8ff";
        ctx.beginPath();
        ctx.arc(a.x, Y(a.y), a.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.look === "ashlands") {
        if (a.hot) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 6 + a.ph);
          ctx.drawImage(soft("#ff7a2a"), a.x - 3, Y(a.y) - 3, 6, 6);
          ctx.globalCompositeOperation = "source-over";
        } else {
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = "#4a3a36";
          ctx.fillRect(a.x, Y(a.y), a.size * 1.6, a.size);
        }
      } else {
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.time * 2 + a.ph);
        ctx.fillStyle = "#ffe0b0";
        ctx.beginPath();
        ctx.arc(a.x, Y(a.y), a.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The surface polyline. `join` continues the current subpath instead of starting one. */
  private surfacePath(ctx: CanvasRenderingContext2D, dy = 0, join = false) {
    const g = this.ground;
    if (join) ctx.lineTo(0, Y(g[0]) + dy);
    else ctx.moveTo(0, Y(g[0]) + dy);
    for (let i = 0; i < NCOL; i++) ctx.lineTo((i + 0.5) * COL, Y(g[i]) + dy);
    ctx.lineTo(W, Y(g[NCOL - 1]) + dy);
  }

  private drawGround(ctx: CanvasRenderingContext2D, b: (typeof BIOME)[Look]) {
    ctx.beginPath();
    ctx.moveTo(0, H + 30);
    this.surfacePath(ctx, 0, true);
    ctx.lineTo(W, H + 30);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    if (this.rock) ctx.drawImage(this.rock, 0, 0, W, H);
    if (this.scorch) ctx.drawImage(this.scorch, 0, 0, W, H);
    // sunlit topsoil: a soft lighter band hugging the surface
    ctx.lineJoin = "round";
    ctx.strokeStyle = withAlpha(b.lip, 0.1);
    ctx.lineWidth = 26;
    ctx.beginPath();
    this.surfacePath(ctx, 6);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(b.lipDark, 0.45);
    ctx.lineWidth = 6;
    ctx.beginPath();
    this.surfacePath(ctx, 4.5);
    ctx.stroke();
    ctx.restore();

    // the crust
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (this.look === "tundra") {
      ctx.strokeStyle = "#c9dcf2";
      ctx.lineWidth = 6;
      ctx.beginPath();
      this.surfacePath(ctx, 1.4);
      ctx.stroke();
      ctx.strokeStyle = b.lip;
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      this.surfacePath(ctx, 0);
      ctx.stroke();
    } else if (this.look === "ashlands") {
      ctx.strokeStyle = b.lip;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      this.surfacePath(ctx, 0);
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.28 + 0.1 * Math.sin(this.time * 1.7);
      ctx.strokeStyle = "#ff5a1a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.surfacePath(ctx, 3.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.strokeStyle = b.lip;
      ctx.lineWidth = this.look === "lunar" ? 2 : 2.6;
      ctx.beginPath();
      this.surfacePath(ctx, 0);
      ctx.stroke();
    }
  }

  /** Dirt hanging over a fresh hole, mid-fall: drawn as columns cut from the same rock. */
  private drawFloats(ctx: CanvasRenderingContext2D, b: (typeof BIOME)[Look]) {
    if (!this.floats.size) return;
    ctx.save();
    ctx.beginPath();
    for (const [i, f] of this.floats) ctx.rect(i * COL - 0.2, Y(f.y + f.len), COL + 0.4, f.len);
    ctx.clip();
    if (this.rock) ctx.drawImage(this.rock, 0, 0, W, H);
    if (this.scorch) ctx.drawImage(this.scorch, 0, 0, W, H);
    ctx.restore();
    ctx.fillStyle = b.lip;
    for (const [i, f] of this.floats) ctx.fillRect(i * COL - 0.2, Y(f.y + f.len), COL + 0.4, 2.4);
  }

  /** Each tank's last Tracer: the dotted paths and the angle change written where each bullet landed. */
  private drawTracers(ctx: CanvasRenderingContext2D, now: number) {
    void now;
    for (const p of this.tracerPaths) drawDotted(ctx, p.pts, 0.4);
    if (!this.marks.length) return;
    const fs = this.uiFont(10);
    ctx.font = `${fs}px ${this.font}`;
    ctx.textAlign = "center";
    // landings bunch up, so stack the labels into lanes that never overlap
    const lanes: number[] = [];
    const placed = [...this.marks]
      .sort((a, b) => a.x - b.x)
      .map((m) => {
        const text = m.label === "0" ? "0°" : `${m.label}°`;
        const w = ctx.measureText(text).width + fs * 0.8;
        let lane = 0;
        while (lane < lanes.length && lanes[lane] > m.x - w / 2 - 2) lane++;
        lanes[lane] = m.x + w / 2;
        return { m, text, w, lane };
      });
    for (const { m, text, w, lane } of placed) {
      const col = TANK[this.tanks.get(m.seat)?.color ?? "red"].light;
      const ly = Y(m.y) - fs * 2.2 - lane * fs * 1.6;
      ctx.strokeStyle = withAlpha(col, 0.5);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(m.x, Y(m.y));
      ctx.lineTo(m.x, ly + fs * 0.35);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(m.x, Y(m.y), 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(8,8,10,0.72)";
      ctx.beginPath();
      ctx.roundRect?.(m.x - w / 2, ly - fs * 0.95, w, fs * 1.35, fs * 0.4);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillText(text, m.x, ly + fs * 0.05);
    }
  }

  private drawOffscreen(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: boolean) {
    const fs = this.uiFont(10);
    ctx.fillStyle = color.startsWith("rgba") ? "#ffffff" : color;
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x - 5, 13);
    ctx.lineTo(x + 5, 13);
    ctx.closePath();
    ctx.fill();
    if (!label) return;
    ctx.font = `${fs}px ${this.font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(`${Math.round(y - H)}`, x, 13 + fs);
  }

  private uiFont(cssPx: number) {
    return Math.max(cssPx * 0.9, Math.min(cssPx * 3, cssPx / Math.max(0.01, this.cssScale)));
  }

  /** My turn: a faint ring around the turret with a notch at the barrel's angle. No trajectory. */
  private drawAim(ctx: CanvasRenderingContext2D) {
    const a = this.aim;
    if (!a || this.busy) return;
    const t = this.tanks.get(a.seat);
    if (!t || !t.present) return;
    const col = TANK[t.color].light;
    const cx = t.x;
    const cy = Y(t.y + 15);
    ctx.strokeStyle = withAlpha(col, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.stroke();
    const rad = (a.angle * Math.PI) / 180;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, -rad - 0.08, -rad + 0.08);
    ctx.stroke();
  }

  private drawLabels(ctx: CanvasRenderingContext2D, now: number) {
    const fs = this.uiFont(11);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const t of this.tanks.values()) {
      if (t.alpha < 0.05) continue;
      const P = TANK[t.color];
      const active = this.activeSeat === t.seat && !!this.latest && this.latest.phase !== "over";
      const ly = Y(t.y + 40) - fs * 0.2;
      ctx.globalAlpha = t.alpha * (active ? 1 : 0.8);
      ctx.font = `${fs}px ${this.font}`;
      const w = ctx.measureText(t.name).width + fs * 1.1;
      ctx.fillStyle = "rgba(10,10,8,0.62)";
      const h = fs * 1.45;
      ctx.beginPath();
      ctx.roundRect?.(t.x - w / 2, ly - h * 0.78, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = active ? P.light : "#ece4cc";
      ctx.fillText(t.name, t.x, ly + fs * 0.12);
      if (active) {
        const bob = Math.sin(this.time * 5) * 3;
        const cy = ly - h - 6 + bob;
        ctx.fillStyle = P.light;
        ctx.beginPath();
        ctx.moveTo(t.x - 6, cy - 6);
        ctx.lineTo(t.x + 6, cy - 6);
        ctx.lineTo(t.x, cy + 1);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const p of this.popups) {
      const u = (now - p.start) / 1600;
      const pop = u < 0.12 ? 0.6 + (u / 0.12) * 0.6 : u < 0.2 ? 1.2 - ((u - 0.12) / 0.08) * 0.2 : 1;
      const size = this.uiFont(17) * pop;
      ctx.font = `${size}px ${this.font}`;
      ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
      const y = Y(p.y + 30 * Math.sqrt(u) + 10);
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = "rgba(10,8,6,0.85)";
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, y);
    }
    ctx.globalAlpha = 1;
  }

  /** World coordinates of a client-space point on the canvas. */
  toWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.canvas) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: H - ((clientY - r.top) / r.height) * H };
  }

  tankPos(seat: number) {
    const t = this.tanks.get(seat);
    return t ? { x: t.x, y: t.y } : null;
  }
}

/* ---------------- track sampling ---------------- */

/** Where a track is at tick `tau` (interpolated), or null outside its life. */
export function posAt(tr: Track, tau: number): [number, number] | null {
  if (tau < tr.t0 || tau > tr.t1) return null;
  const n = tr.p.length / 2;
  const f = (tau - tr.t0) / tr.k;
  const j = Math.floor(f);
  if (j >= n - 1) return [tr.p[(n - 1) * 2], tr.p[(n - 1) * 2 + 1]];
  const tj = tr.t0 + j * tr.k;
  const tn = Math.min(tr.t0 + (j + 1) * tr.k, tr.t1);
  const u = tn > tj ? (tau - tj) / (tn - tj) : 1;
  const ax = tr.p[j * 2];
  const ay = tr.p[j * 2 + 1];
  const bx = tr.p[(j + 1) * 2];
  const by = tr.p[(j + 1) * 2 + 1];
  return [ax + (bx - ax) * u, ay + (by - ay) * u];
}
