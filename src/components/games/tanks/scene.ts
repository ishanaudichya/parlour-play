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
  heightAt,
  NCOL,
  tankGround,
  tankTilt,
  W,
} from "@/lib/games/tanks/terrain";
import { TPS } from "@/lib/games/tanks/sim";
import type { FxStyle, LastDrive, LastShot, ShotEvent, TankColor, Track, TanksView } from "@/lib/games/tanks/types";
import {
  boltPath,
  drawBeam,
  drawBolt,
  drawHead,
  drawPlane,
  drawRift,
  drawStorm,
  drawTank,
  drawTarget,
  drawTrail,
  drawTwister,
  drawWell,
  heart,
  renderRock,
  renderSky,
  TRAIL,
  Y,
} from "./draw";
import { arcs, debris, droplets, embers, fireball, Fx, glitter, mix, ring, smoke, soft, sparks, withAlpha } from "./fx";
import { BIOME, TANK, type Look } from "./palette";
import {
  sfxBeam,
  sfxBolt,
  sfxBoom,
  sfxBounce,
  sfxBurst,
  sfxEngine,
  sfxFire,
  sfxGrind,
  sfxHit,
  sfxPlane,
  sfxRain,
  sfxRound,
  sfxRumble,
  sfxSizzle,
  sfxThud,
  sfxWarp,
  sfxWell,
  sfxWind,
} from "./sfx";

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
  kind: "beam" | "bolt" | "plane" | "storm" | "well" | "flare-smoke" | "flare-target" | "flare-summon" | "quake" | "mushroom";
  start: number;
  dur: number;
  x: number;
  y: number;
  data?: unknown;
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

    // ground: craters snap open, dirt rises into place
    const rise = dt * 260;
    for (let i = 0; i < NCOL; i++) {
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
    this.effects = this.effects.filter((e) => now < e.start + e.dur + 400);
    this.popups = this.popups.filter((p) => now < p.start + 1600);
    this.effectEmit(now, dt);
    this.updateAmbient(dt);
  }

  /* ================= events ================= */

  private handle(e: ShotEvent, s: LastShot) {
    const now = performance.now();
    const shooter = this.tanks.get(s.seat);
    const shooterColor = shooter ? TANK[shooter.color].light : "#ffffff";
    switch (e.k) {
      case "op": {
        applyOp(this.target, e.op);
        const sc = this.scorch?.getContext("2d");
        if (sc && e.op.k === "line" && e.op.r >= 8) {
          sc.globalCompositeOperation = "source-over";
          sc.strokeStyle = "rgba(20,10,6,0.35)";
          sc.lineWidth = e.op.r * 2.6;
          sc.lineCap = "round";
          sc.beginPath();
          sc.moveTo(e.op.x1, H - e.op.y1);
          sc.lineTo(e.op.x2, H - e.op.y2);
          sc.stroke();
        }
        return;
      }
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
        sfxHit(self);
        return;
      }
      case "tank": {
        const t = this.tanks.get(e.seat);
        if (!t) return;
        t.tween = { fx: t.x, fy: t.y, tx: e.x, ty: e.y, start: now, dur: e.d * MS_PER_TICK, how: e.how };
        if (e.how === "blink") sfxWarp();
        if (e.how === "toss") sfxWind(0.8);
        if (e.how === "push") debris(this.fx, t.x, t.y, 6, BIOME[this.look].debris, 60);
        return;
      }
      case "beam": {
        let len = 0;
        for (let i = 0; i + 3 < e.pts.length; i += 2) len += Math.hypot(e.pts[i + 2] - e.pts[i], e.pts[i + 3] - e.pts[i + 1]);
        this.effects.push({ kind: "beam", start: now, dur: e.d * MS_PER_TICK, x: e.pts[0], y: e.pts[1], data: { pts: e.pts, fx: e.fx, len } });
        sfxBeam(e.fx, (e.d * MS_PER_TICK) / 1000);
        if (e.fx === "orbital") {
          this.screenFlash = { a: 0.35, color: "#9fd8ff" };
          this.shake = Math.max(this.shake, 12);
        } else this.shake = Math.max(this.shake, 3);
        // light all along the beam
        for (let i = 0; i + 1 < e.pts.length; i += 2) this.fx.light(e.pts[i], e.pts[i + 1], 60, e.fx === "lance" ? "#ff3a5a" : "#3ad4ff", 0.5, 0.7);
        return;
      }
      case "bolt": {
        this.effects.push({ kind: "bolt", start: now, dur: 230, x: e.x2, y: e.y2, data: e });
        this.screenFlash = { a: 0.28, color: "#cfe0ff" };
        this.shake = Math.max(this.shake, 6);
        this.fx.light(e.x2, e.y2, 140, "#9cc4ff", 0.4);
        sfxBolt();
        return;
      }
      case "plane":
        this.effects.push({ kind: "plane", start: now, dur: e.d * MS_PER_TICK, x: e.x0, y: e.y, data: { x1: e.x1, color: TANK[shooter?.color ?? "red"].base } });
        sfxPlane((e.d * MS_PER_TICK) / 1000);
        return;
      case "cloud":
        this.effects.push({ kind: "storm", start: now, dur: e.d * MS_PER_TICK, x: e.x, y: e.y });
        sfxRumble(1.2);
        return;
      case "well":
        this.effects.push({ kind: "well", start: now, dur: e.d * MS_PER_TICK, x: e.x, y: e.y });
        sfxWell((e.d * MS_PER_TICK) / 1000);
        return;
      case "quake":
        this.effects.push({ kind: "quake", start: now, dur: e.d * MS_PER_TICK, x: 0, y: 0 });
        sfxRumble((e.d * MS_PER_TICK) / 1000);
        return;
      case "burst":
        sfxBurst(e.fx);
        if (e.fx === "firework") {
          glitter(this.fx, e.x, e.y, 70, ["#ff6bd6", "#62f0ff", "#ffd34d", "#8cff6b", "#ffffff"], 170, 0.18);
          this.fx.add({ k: "flash", x: e.x, y: e.y, size: 60, color: "#ffffff", max: 0.3 });
          ring(this.fx, e.x, e.y, 60, "#ffe4f6", 2, 0.5);
          this.fx.light(e.x, e.y, 200, "#ff9ad8", 0.6);
        } else if (e.fx === "split") {
          this.fx.add({ k: "flash", x: e.x, y: e.y, size: 26, color: "#ffffff", max: 0.2 });
          ring(this.fx, e.x, e.y, 24, "#ffffff", 1.5, 0.35);
          sparks(this.fx, e.x, e.y, 10, "#fff0b0", 160);
        } else {
          fireball(this.fx, e.x, e.y + 6, 26, "#ff6a1a", 16);
          embers(this.fx, e.x, e.y, 40, "#ff7a2a", 10);
          smoke(this.fx, e.x, e.y + 20, 14, 30, "#2a1a14", this.wind, 50);
          this.shake = Math.max(this.shake, 8);
          this.fx.light(e.x, e.y, 180, "#ff5a1a", 1.2);
        }
        return;
      case "flare": {
        const kind = e.fx === "smoke" ? "flare-smoke" : e.fx === "target" ? "flare-target" : "flare-summon";
        this.effects.push({ kind, start: now, dur: e.d * MS_PER_TICK, x: e.x, y: e.y });
        return;
      }
      case "muzzle":
        this.muzzle(e.seat, "gatling", false);
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
    const beamy = weapon === "lance" || weapon === "prism";
    const col = beamy ? (weapon === "lance" ? "#ff4a6a" : "#5ae4ff") : "#ffd27a";
    this.fx.add({ k: "flash", x: mx, y: my, size: main ? 22 : 12, color: col, max: 0.14 });
    for (let i = 0; i < (main ? 10 : 4); i++) {
      const s = rnd(80, 220);
      const da = a + rnd(-0.35, 0.35);
      this.fx.add({ k: "spark", x: mx, y: my, vx: Math.cos(da) * s, vy: Math.sin(da) * s, drag: 0.1, max: rnd(0.1, 0.25), size: 1.2, color: col });
    }
    if (!beamy) {
      for (let i = 0; i < (main ? 6 : 2); i++) {
        const s = rnd(20, 60);
        this.fx.add({ k: "smoke", x: mx, y: my, vx: Math.cos(a) * s + this.wind * 2, vy: Math.sin(a) * s + 8, drag: 0.3, max: rnd(0.8, 1.6), size: 3, grow: 10, color: "#b9b2a4", alpha: 0.45 });
      }
    }
    this.fx.light(mx, my, main ? 80 : 40, col, 0.18);
    if (main) {
      this.shake = Math.max(this.shake, 3.5);
      sfxFire(weapon);
    } else sfxRound();
  }

  private boom(x: number, y: number, r: number, fx: FxStyle) {
    const b = BIOME[this.look];
    const wind = this.wind;
    sfxBoom(fx, r);
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
    switch (fx) {
      case "fire":
      case "big":
      case "meteor": {
        const k = fx === "big" ? 1.3 : 1;
        this.fx.add({ k: "flash", x, y, size: r * 1.7 * k, color: "#fff1c4", max: 0.2 });
        fireball(this.fx, x, y, r * k, fx === "big" ? "#ff7a2a" : "#ff9a3c", Math.round(10 + r / 3));
        ring(this.fx, x, y, r * 1.5, "#ffe8c8", 2.5);
        debris(this.fx, x, y, Math.round(r / 1.5), fx === "meteor" ? ["#3a2e28", "#5a4a40", ...b.debris] : b.debris, r * 7);
        sparks(this.fx, x, y, Math.round(r / 2), "#ffd27a", r * 9, true);
        smoke(this.fx, x, y + r * 0.3, Math.round(4 + r / 7), r * 0.6, "#3a3430", wind);
        embers(this.fx, x, y, Math.round(r / 4), "#ff8a3a", r * 0.5);
        this.fx.light(x, y, r * 3.4, "#ff9a4a", 0.45 + r / 120);
        this.shake = Math.max(this.shake, Math.min(14, r / 5));
        scorch(r * 1.2, "#140a06", 0.38);
        break;
      }
      case "nuke": {
        this.screenFlash = { a: 0.95, color: "#fff6dc" };
        this.fx.add({ k: "flash", x, y, size: r * 3, color: "#ffffff", max: 0.5 });
        fireball(this.fx, x, y, r * 0.9, "#ffb03a", 40);
        ring(this.fx, x, y, r * 2.4, "#fff2d0", 4, 0.9);
        ring(this.fx, x, y + 6, r * 4, "#ffd8a0", 2, 1.4);
        debris(this.fx, x, y, 60, b.debris, r * 6);
        sparks(this.fx, x, y, 50, "#ffe08a", r * 7, true);
        embers(this.fx, x, y, 80, "#ff8a3a", r * 0.8);
        this.effects.push({ kind: "mushroom", start: performance.now(), dur: 3200, x, y });
        this.fx.light(x, y, r * 6, "#ffb45a", 2.2, 1);
        this.shake = 24;
        scorch(r * 1.4, "#0e0604", 0.5);
        break;
      }
      case "electric": {
        this.fx.add({ k: "flash", x, y, size: r * 2, color: "#cfe4ff", max: 0.18 });
        arcs(this.fx, x, y, 9, "#cfe4ff", r * 1.6);
        sparks(this.fx, x, y, 18, "#9cc4ff", 260);
        ring(this.fx, x, y, r * 1.3, "#9cc4ff", 2);
        smoke(this.fx, x, y, 3, r * 0.5, "#2a2e3a", wind);
        debris(this.fx, x, y, Math.round(r / 2), b.debris, r * 6);
        this.fx.light(x, y, r * 4, "#7fb0ff", 0.5);
        this.shake = Math.max(this.shake, 4);
        scorch(r, "#0a0c14", 0.55);
        break;
      }
      case "acid": {
        droplets(this.fx, x, y, 8, "#a8ff4a", 120, 1.4);
        for (let i = 0; i < 3; i++) this.fx.add({ k: "bubble", x: x + rnd(-5, 5), y: y + 2, vy: rnd(10, 26), max: rnd(0.6, 1.2), size: rnd(1, 2.2), color: "#c6ff6a" });
        smoke(this.fx, x, y, 1, 6, "#5a6a2a", wind, 14);
        this.fx.light(x, y, 30, "#8cff2a", 0.3, 0.6);
        scorch(14, "#3a5a10", 0.35);
        break;
      }
      case "lava": {
        fireball(this.fx, x, y, r * 0.8, "#ff6a1a", 8);
        droplets(this.fx, x, y, 10, "#ffb347", 170, 1.8);
        embers(this.fx, x, y, 14, "#ff7a2a", 8);
        smoke(this.fx, x, y, 3, r * 0.5, "#24140e", wind);
        debris(this.fx, x, y, 6, b.debris, r * 5);
        this.fx.light(x, y, r * 3.5, "#ff5a1a", 0.6);
        this.shake = Math.max(this.shake, 3);
        scorch(r * 1.1, "#1a0804", 0.32);
        break;
      }
      case "void": {
        for (let i = 0; i < 36; i++) {
          const a = rnd(0, Math.PI * 2);
          const d = rnd(r * 1.4, r * 2.4);
          this.fx.add({ k: "glitter", x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, max: 0.3, size: 1.6, color: "#c58cff" });
        }
        this.fx.add({ k: "flash", x, y, size: r * 2.4, color: "#b67bff", max: 0.35 });
        ring(this.fx, x, y, r * 2, "#e0c4ff", 3, 0.6);
        ring(this.fx, x, y, r * 3, "#8a4bff", 1.5, 0.9);
        sparks(this.fx, x, y, 24, "#d6b4ff", 300);
        debris(this.fx, x, y, 24, b.debris, r * 7);
        this.fx.light(x, y, r * 4, "#8a3bff", 0.8);
        this.shake = Math.max(this.shake, 12);
        scorch(r * 1.2, "#14061e", 0.4);
        break;
      }
      case "spark": {
        sparks(this.fx, x, y, 10, "#fff0b0", 200, true);
        this.fx.add({ k: "flash", x, y, size: r * 1.6, color: "#fff4d0", max: 0.12 });
        this.fx.light(x, y, r * 3, "#ffe08a", 0.25, 0.6);
        if (r >= 14) debris(this.fx, x, y, 5, b.debris, 110);
        break;
      }
      case "pop": {
        this.fx.add({ k: "flash", x, y, size: r * 2, color: "#ffcf7a", max: 0.12 });
        for (let i = 0; i < 12; i++) {
          this.fx.add({ k: "confetti", x, y: y + 3, vx: rnd(-90, 90), vy: rnd(80, 220), g: 0.5, drag: 0.4, max: rnd(1.4, 2.4), size: rnd(2, 3.4), vr: rnd(-10, 10), color: ["#ff4a4a", "#ffd34d", "#ffffff", "#ff8a3a"][i % 4] });
        }
        sparks(this.fx, x, y, 8, "#ffd27a", 180, true);
        smoke(this.fx, x, y, 2, 8, "#5a504a", wind, 18);
        debris(this.fx, x, y, 5, b.debris, 110);
        this.fx.light(x, y, 50, "#ff7a3a", 0.25);
        this.shake = Math.max(this.shake, 2);
        scorch(r, "#1a0a06", 0.45);
        break;
      }
      case "mud":
      case "dirt": {
        const browns = fx === "mud" ? ["#7a5638", "#5a3e28", "#9a7450", ...b.debris.slice(0, 2)] : b.debris;
        debris(this.fx, x, y, Math.round(10 + r / 2), browns, r * 6);
        smoke(this.fx, x, y, Math.round(3 + r / 8), r * 0.7, mix(b.debris[0], "#7a7066", 0.4), wind, 18);
        ring(this.fx, x, y, r * 1.2, withAlpha(b.debris[0], 0.8), 3, 0.5);
        this.shake = Math.max(this.shake, fx === "mud" ? 4 : 6);
        break;
      }
      case "orbital": {
        this.fx.add({ k: "flash", x, y, size: 90, color: "#cfeaff", max: 0.4 });
        ring(this.fx, x, y, 80, "#bfe6ff", 4, 0.7);
        sparks(this.fx, x, y, 40, "#cfeaff", 360, true);
        debris(this.fx, x, y, 40, b.debris, 380);
        smoke(this.fx, x, y + 10, 12, 30, "#2a3040", wind, 40);
        for (let i = 0; i < 16; i++) this.fx.add({ k: "streak", x: x + rnd(-14, 14), y: y + rnd(0, 20), vx: 0, vy: rnd(300, 700), max: rnd(0.3, 0.6), size: rnd(1, 2.2), color: "#9fdcff" });
        this.fx.light(x, y, 260, "#6fd3ff", 1.2);
        this.shake = Math.max(this.shake, 14);
        scorch(46, "#060a14", 0.45);
        break;
      }
      case "blink": {
        ring(this.fx, x, y, 26, "#59fff0", 2, 0.5);
        ring(this.fx, x, y, 40, "#c8fffa", 1, 0.7);
        glitter(this.fx, x, y, 24, ["#59fff0", "#ffffff", "#9ffff6"], 90, 0);
        for (let i = 0; i < 10; i++) this.fx.add({ k: "streak", x: x + rnd(-10, 10), y: y + rnd(-6, 6), vx: 0, vy: rnd(120, 320), max: rnd(0.3, 0.5), size: 1.2, color: "#9ffff6" });
        this.fx.light(x, y, 90, "#59fff0", 0.5);
        break;
      }
      case "firework": {
        glitter(this.fx, x, y, 14, ["#ff6bd6", "#62f0ff", "#ffd34d", "#8cff6b"], 120, 0.3);
        this.fx.add({ k: "flash", x, y, size: 22, color: "#ffffff", max: 0.12 });
        debris(this.fx, x, y, 4, b.debris, 100);
        this.fx.light(x, y, 50, "#ff9ad8", 0.3);
        scorch(r, "#1a0a14", 0.4);
        break;
      }
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
      const q = posAt(tr, Math.max(tr.t0, tau - 1)) ?? p;
      const vx = (x - q[0]) * TPS;
      const vy = (y - q[1]) * TPS;
      const gh = x >= 0 && x <= W ? heightAt(this.ground, x) : -999;
      const near = Math.abs(y - gh) < 9;
      const under = y < gh - 4;
      const startKey = `${tr.s}:start`;
      if (!cur.started.has(startKey)) {
        cur.started.add(startKey);
        if (tr.s === "acidcloud") sfxRain(((tr.t1 - tr.t0) / TPS) * 0.9);
        if (tr.s === "flame") sfxSizzle(2.4);
      }
      const groundedStyles = tr.s === "saw" || tr.s === "seed" || tr.s === "roller";
      if (groundedStyles && near && Math.abs(vy) < 200 && !cur.grounded.has(i) && tau > tr.t0 + 4) {
        cur.grounded.add(i);
        cur.groundedAt.set(i, tau);
        const secs = (tr.t1 - tau) / TPS;
        if (tr.s === "saw") sfxGrind(secs);
        if (tr.s === "seed") sfxWind(secs);
      }
      const chance = (rate: number) => Math.random() < rate * dt;
      switch (tr.s) {
        case "heavy":
        case "seeker":
        case "sun":
          if (chance(tr.s === "seeker" ? 40 : 18)) this.fx.add({ k: "smoke", x, y, vx: this.wind * 2 + rnd(-6, 6), vy: rnd(2, 10), drag: 0.5, max: rnd(0.8, 1.6), size: 2, grow: tr.s === "sun" ? 14 : 8, color: tr.s === "sun" ? "#8a6a4a" : "#d8d2c4", alpha: 0.3 });
          break;
        case "meteor":
        case "lava":
        case "volcano":
          if (chance(30)) this.fx.add({ k: "ember", x: x + rnd(-2, 2), y: y + rnd(-2, 2), vx: rnd(-20, 20), vy: rnd(-10, 20), g: 0.2, max: rnd(0.4, 0.9), size: 1.2, color: "#ff8a2a" });
          if (tr.s === "meteor" && chance(20)) this.fx.add({ k: "smoke", x, y, vx: rnd(-6, 6), vy: rnd(4, 12), drag: 0.5, max: 1.6, size: 3, grow: 10, color: "#3a2a24", alpha: 0.4 });
          break;
        case "flame":
          if (chance(10)) this.fx.add({ k: "smoke", x, y: y + 6, vx: this.wind * 2, vy: rnd(14, 30), drag: 0.6, max: rnd(0.8, 1.6), size: 2, grow: 7, color: "#2a2422", alpha: 0.35 });
          if (chance(8)) this.fx.add({ k: "ember", x, y: y + 4, vx: rnd(-10, 10), vy: rnd(30, 70), g: 0.2, max: 0.7, size: 1, color: "#ffb04a" });
          if (near && chance(14)) this.scorchDot(x, y, 7, "#1a0a04", 0.18);
          break;
        case "rocket":
        case "flare":
        case "beacon":
        case "summon":
        case "star0":
        case "star1":
        case "star2":
        case "star3":
          if (chance(24)) this.fx.add({ k: "glitter", x, y, vx: rnd(-14, 14), vy: rnd(-24, 4), g: 0.1, max: rnd(0.4, 0.9), size: 1, color: TRAIL[tr.s]?.c ?? "#ffffff" });
          break;
        case "drill":
          if (under && chance(60)) debris(this.fx, x, gh, 1, b.debris, 120);
          break;
        case "saw":
          if (cur.grounded.has(i) && chance(80)) {
            this.fx.add({ k: "spark", x, y: y - 3, vx: -Math.sign(vx) * rnd(60, 200), vy: rnd(40, 180), g: 0.8, drag: 0.4, max: rnd(0.2, 0.4), size: 1, color: "#fff0a0" });
            if (Math.random() < 0.4) debris(this.fx, x, y - 2, 1, b.debris, 110);
          }
          break;
        case "roller":
          if (cur.grounded.has(i) && chance(20)) this.fx.add({ k: "smoke", x, y: y - 3, vx: rnd(-8, 8), vy: rnd(4, 10), drag: 0.5, max: 0.8, size: 2, grow: 6, color: b.debris[0], alpha: 0.3 });
          break;
        case "seed":
          if (cur.grounded.has(i)) {
            if (chance(40)) {
              const a = rnd(0, Math.PI * 2);
              const h = rnd(0, 100);
              this.fx.add({ k: "debris", x: x + Math.cos(a) * (6 + h * 0.3), y: gh + h, vx: -Math.sin(a) * 120, vy: rnd(40, 120), g: 0.4, drag: 0.5, max: 0.9, size: rnd(1, 2.4), color: b.debris[Math.floor(Math.random() * b.debris.length)], vr: 10 });
            }
            if (chance(14)) this.fx.add({ k: "smoke", x: x + rnd(-14, 14), y: gh + 2, vx: rnd(-20, 20), vy: rnd(10, 30), drag: 0.5, max: 1.2, size: 4, grow: 12, color: mix(b.debris[0], "#a09080", 0.5), alpha: 0.3 });
          }
          break;
        case "pinball":
          if (chance(30)) this.fx.add({ k: "glitter", x, y, vx: 0, vy: 0, max: 0.25, size: 1.2, color: "#b8e8ff" });
          break;
        case "blink":
          if (chance(30)) this.fx.add({ k: "flash", x, y, size: 7, color: "#59fff0", max: 0.35 });
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

  /** Continuous emitters for timed effects. */
  private effectEmit(now: number, dt: number) {
    for (const e of this.effects) {
      const u = (now - e.start) / e.dur;
      if (u < 0 || u > 1) continue;
      const chance = (rate: number) => Math.random() < rate * dt;
      switch (e.kind) {
        case "flare-smoke":
          if (chance(30)) this.fx.add({ k: "smoke", x: e.x + rnd(-2, 2), y: e.y + 4, vx: this.wind * 2.4 + rnd(-6, 6), vy: rnd(28, 52), drag: 0.6, max: rnd(1.6, 2.6), size: 3, grow: 10, color: Math.random() < 0.7 ? "#d8463a" : "#f07a5a", alpha: 0.5 });
          break;
        case "flare-summon":
          if (chance(30)) this.fx.add({ k: "glitter", x: e.x + rnd(-160, 160), y: H - rnd(10, 30), vx: rnd(-10, 10), vy: rnd(-80, -30), max: 1.2, size: 1.4, color: "#d6b4ff" });
          break;
        case "well": {
          const b = BIOME[this.look];
          if (chance(70)) {
            const a = rnd(0, Math.PI * 2);
            const d = rnd(60, 160);
            const px = e.x + Math.cos(a) * d;
            const py = e.y + Math.sin(a) * d * 0.6;
            // drift inward with a swirl
            this.fx.add({ k: "debris", x: px, y: Math.max(py, heightAt(this.ground, px)), vx: (e.x - px) * 2.4 - Math.sin(a) * 90, vy: (e.y - py) * 2.4 + Math.cos(a) * 60, g: 0, drag: 1, max: 0.45, size: rnd(1.4, 3), color: b.debris[Math.floor(Math.random() * b.debris.length)], vr: 12 });
          }
          if (chance(20)) this.fx.add({ k: "glitter", x: e.x + rnd(-40, 40), y: e.y + rnd(-30, 30), vx: 0, vy: 0, max: 0.4, size: 1.4, color: "#c58cff" });
          break;
        }
        case "quake": {
          const k = 1 - u;
          this.shake = Math.max(this.shake, 5 * k);
          if (chance(30 * k)) {
            const x = rnd(0, W);
            const gh = heightAt(this.ground, x);
            this.fx.add({ k: "smoke", x, y: gh + 2, vx: rnd(-10, 10), vy: rnd(6, 16), drag: 0.5, max: 1.4, size: 4, grow: 12, color: BIOME[this.look].debris[0], alpha: 0.28 });
            if (Math.random() < 0.5) debris(this.fx, x, gh, 2, BIOME[this.look].debris, 80);
          }
          break;
        }
        case "mushroom": {
          const rise = Math.min(1, u * 1.4);
          const top = e.y + 40 + 190 * rise;
          const hot = Math.max(0, 1 - u * 2.2);
          for (let n = 0; n < 3; n++) {
            if (!chance(40)) continue;
            const stem = Math.random() < 0.45;
            const px = stem ? e.x + rnd(-10, 10) : e.x + rnd(-70, 70) * (0.4 + rise * 0.6);
            const py = stem ? e.y + rnd(0, top - e.y) : top + rnd(-18, 22);
            if (hot > 0.15 && Math.random() < hot) this.fx.add({ k: "fire", x: px, y: py, vx: rnd(-10, 10), vy: rnd(10, 30), drag: 0.4, max: rnd(0.4, 0.8), size: rnd(8, 14), grow: 10, color: "#ff8a3a" });
            else this.fx.add({ k: "smoke", x: px, y: py, vx: (stem ? 0 : (px - e.x) * 0.5) + this.wind, vy: stem ? rnd(30, 60) : rnd(-4, 10), drag: 0.6, max: rnd(1.6, 2.6), size: rnd(8, 14), grow: 10, color: mix("#7a5040", "#3a3432", Math.min(1, u * 1.5)), alpha: 0.55 });
          }
          break;
        }
      }
    }
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

    // timed effects that sit behind tanks
    for (const e of this.effects) {
      const u = (now - e.start) / e.dur;
      if (u < 0 || u > 1) continue;
      if (e.kind === "storm") drawStorm(ctx, e.x, e.y, Math.min(1, u * 5, (1 - u) * 5), this.boltFlicker(now), this.time);
      if (e.kind === "flare-summon") drawRift(ctx, e.x, u, this.time);
      if (e.kind === "plane") {
        const d = e.data as { x1: number; color: string };
        drawPlane(ctx, e.x + (d.x1 - e.x) * u, e.y, Math.sign(d.x1 - e.x), d.color, this.time);
      }
    }

    // the ridge
    this.drawGround(ctx, b);

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
      shot.rec.tracks.forEach((tr, i) => {
        if (tau < tr.t0 || tau > tr.t1) return;
        const p = posAt(tr, tau);
        if (!p) return;
        const q = posAt(tr, Math.max(tr.t0, tau - 1)) ?? p;
        const vx = (p[0] - q[0]) * TPS;
        const vy = (p[1] - q[1]) * TPS;
        const grounded = cur.grounded.has(i);
        if (tr.s === "seed" && grounded) {
          drawTwister(ctx, p[0], heightAt(this.ground, Math.max(0, Math.min(W, p[0]))), this.time, tau - (cur.groundedAt.get(i) ?? tau));
          return;
        }
        const tl = TRAIL[tr.s];
        if (tl && !(grounded && (tr.s === "saw" || tr.s === "roller"))) {
          const pts: [number, number][] = [];
          for (let j = tl.len; j >= 0; j--) {
            const pp = posAt(tr, tau - j * 0.8);
            if (pp && tau - j * 0.8 >= tr.t0) pts.push(pp);
          }
          drawTrail(ctx, tr.s, pts);
        }
        drawHead(ctx, tr.s, p[0], p[1], vx, vy, tau - tr.t0, this.time, grounded);
        if (p[1] > H + 4) this.drawOffscreen(ctx, p[0], p[1], TRAIL[tr.s]?.c ?? "#ffffff", above <= 2);
      });
    }

    // glows
    this.fx.drawGlow(ctx, this.time);

    // timed effects that glow over everything
    for (const e of this.effects) {
      const u = (now - e.start) / e.dur;
      if (u < 0 || u > 1) continue;
      if (e.kind === "beam") {
        const d = e.data as { pts: number[]; fx: "lance" | "prism" | "orbital"; len: number };
        const ms = now - e.start;
        const speed = d.fx === "prism" ? 45 : d.fx === "orbital" ? 120 : 400;
        const reveal = (ms / MS_PER_TICK) * speed;
        const a = u < 0.6 ? 1 : (1 - u) / 0.4;
        drawBeam(ctx, d.pts, d.fx, reveal, a, this.time);
      }
      if (e.kind === "bolt") {
        const d = e.data as { x1: number; y1: number; x2: number; y2: number; seed: number };
        const flick = Math.floor((now - e.start) / 45);
        drawBolt(ctx, boltPath(d.x1, d.y1, d.x2, d.y2, d.seed, flick), 1 - u * u);
      }
      if (e.kind === "well") drawWell(ctx, e.x, e.y, u, this.time);
      if (e.kind === "flare-target") drawTarget(ctx, e.x, e.y, u, this.time);
      if (e.kind === "flare-smoke") {
        const blink = Math.floor(this.time * 6) % 2 ? 1 : 0.5;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = blink;
        ctx.drawImage(soft("#ff3a2a"), e.x - 14, Y(e.y + 4) - 14, 28, 28);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
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

  private boltFlicker(now: number): number {
    let f = 0;
    for (const e of this.effects) if (e.kind === "bolt" && now < e.start + e.dur) f = Math.max(f, 1 - (now - e.start) / e.dur);
    return f;
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
