/* The ballistics. One call resolves an entire shot — every bullet, warhead,
   pellet, droplet, worm and beam, every crater and every point of damage — at
   a fixed 60 ticks a second, and writes it down as a ShotRecord: sampled flight
   paths plus a timeline of events. The server keeps the outcome; the client
   replays the record frame by frame, applying the same terrain ops at the
   same ticks.

   The arsenal is Pocket Tanks' original 30, each behaving the way its
   official description says. As in Pocket Tanks there is no fall damage:
   tanks drop with the dirt, but only explosions, beams, burns and bullets
   score.

   Pure apart from the passed rng. World units, y up (see terrain.ts). */

import {
  applyOp,
  BARREL,
  EDGE,
  FLOOR,
  heightAt,
  PIVOT_Y,
  slopeAt,
  TANK_CY,
  TANK_R,
  tankGround,
  W,
} from "./terrain";
import type { FxStyle, ShotEvent, ShotRecord, TerrainOp, Track, TrackStyle } from "./types";
import { WEAPONS, type WeaponId } from "./weapons";

export const TPS = 60;
const DT = 1 / TPS;
/** gravity, world units / s² */
export const G = 300;
/** muzzle speed at power 100 */
export const V_MAX = 640;
/** horizontal acceleration per unit of wind */
export const WIND_ACC = 1.5;
/** hard stop, so no weapon can ever run forever */
const MAX_TICKS = 1500;

export interface SimTank {
  seat: number;
  x: number;
  y: number;
}

export interface SimInput {
  ground: number[];
  tanks: SimTank[];
  /** score slots, one per seat (index = seat) */
  seats: number;
  shooter: number;
  weapon: WeaponId;
  angle: number;
  power: number;
  wind: number;
  gravity: number;
  rng: () => number;
}

export interface SimResult {
  rec: ShotRecord;
  ground: number[];
  tanks: SimTank[];
  /** net score change per seat (only the shooter's moves) */
  delta: number[];
  /** damage taken per seat */
  taken: number[];
  /** damage the shooter dealt to others */
  dealt: number;
}

type Mode = "fly" | "dig" | "cruise" | "flow" | "dead";

interface Ent {
  kind: string;
  mode: Mode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** gravity and wind multipliers */
  g: number;
  wind: number;
  /** constant horizontal acceleration (the boomerang's curl) */
  ax: number;
  /** collision radius */
  rad: number;
  /** blast radius, damage, carve radius, look */
  r: number;
  dmg: number;
  cr: number;
  fx: FxStyle;
  age: number;
  born: number;
  /** ticks during which the shooter's own tank is not hit */
  grace: number;
  /** general counters */
  n: number;
  life: number;
  still: number;
  dir: number;
  /** burrow direction */
  dx: number;
  dy: number;
  apexDone: boolean;
  hit: number[];
  /** bullet colour for the replay */
  color?: string;
  /** tracer label */
  label?: string;
  track: Track;
}

interface Hit {
  type: "ground" | "tank" | "out";
  seat?: number;
}

const ri = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const clampX = (x: number) => Math.max(EDGE, Math.min(W - EDGE, x));
const rad = (deg: number) => (deg * Math.PI) / 180;

class Shot {
  t = 0;
  g: number[];
  tanks: SimTank[];
  ents: Ent[] = [];
  events: ShotEvent[] = [];
  tracks: Track[] = [];
  timers: { t: number; fn: () => void }[] = [];
  delta: number[];
  taken: number[];
  dealt = 0;
  burn: number[];
  burnLeft: number[];
  hailLeft: number[];
  shooter: number;
  wind: number;
  grav: number;
  rng: () => number;

  constructor(private inp: SimInput) {
    this.g = inp.ground.slice();
    this.tanks = inp.tanks.map((t) => ({ ...t }));
    this.delta = Array(inp.seats).fill(0);
    this.taken = Array(inp.seats).fill(0);
    this.burn = Array(inp.seats).fill(0);
    this.burnLeft = Array(inp.seats).fill(45);
    this.hailLeft = Array(inp.seats).fill(40);
    this.shooter = inp.shooter;
    this.wind = inp.wind;
    this.grav = inp.gravity;
    this.rng = inp.rng;
  }

  /* ---------------- bookkeeping ---------------- */

  rand(a: number, b: number) {
    return a + (b - a) * this.rng();
  }

  ev(e: ShotEvent) {
    this.events.push(e);
  }

  at(dt: number, fn: () => void) {
    this.timers.push({ t: this.t + Math.max(1, Math.round(dt)), fn });
  }

  op(op: TerrainOp) {
    applyOp(this.g, op);
    this.ev({ t: this.t, k: "op", op });
  }

  tank(seat: number) {
    return this.tanks.find((t) => t.seat === seat);
  }

  spawn(kind: string, x: number, y: number, vx: number, vy: number, style: TrackStyle, o: Partial<Ent> = {}, k = 2): Ent {
    const track: Track = { s: style, t0: this.t, t1: this.t, k, p: [ri(x), ri(y)] };
    if (o.color) track.c = o.color;
    this.tracks.push(track);
    const e: Ent = {
      kind,
      mode: "fly",
      x,
      y,
      vx,
      vy,
      g: 1,
      wind: 1,
      ax: 0,
      rad: 3,
      r: 34,
      dmg: 30,
      cr: 28,
      fx: "fire",
      age: 0,
      born: this.t,
      grace: 8,
      n: 0,
      life: 0,
      still: 0,
      dir: Math.sign(vx) || 1,
      dx: 0,
      dy: 0,
      apexDone: false,
      hit: [],
      track,
      ...o,
    };
    this.ents.push(e);
    return e;
  }

  sample(e: Ent) {
    const tr = e.track;
    if ((this.t - tr.t0) % tr.k === 0) tr.p.push(ri(e.x), ri(e.y));
  }

  kill(e: Ent) {
    if (e.mode === "dead") return;
    e.mode = "dead";
    const tr = e.track;
    tr.t1 = this.t;
    if ((this.t - tr.t0) % tr.k !== 0 || tr.p.length === 2) tr.p.push(ri(e.x), ri(e.y));
  }

  /* ---------------- damage ---------------- */

  hurt(seat: number, n: number) {
    n = Math.round(n);
    const t = this.tank(seat);
    if (!t || n <= 0) return;
    this.ev({ t: this.t, k: "dmg", seat, n, x: ri(t.x), y: ri(t.y + 34) });
    this.taken[seat] += n;
    if (seat === this.shooter) this.delta[seat] -= n;
    else {
      this.delta[this.shooter] += n;
      this.dealt += n;
    }
  }

  /** An explosion: crater, falloff damage to every tank in range, then let things settle. */
  boom(x: number, y: number, r: number, dmg: number, fx: FxStyle, cr = r * 0.8) {
    x = ri(x);
    y = ri(y);
    this.ev({ t: this.t, k: "boom", x, y, r: ri(r), fx });
    if (cr > 0) this.op({ k: "carve", x, y, r: r1(cr) });
    if (dmg > 0) {
      for (const t of this.tanks) {
        const d = Math.hypot(x - t.x, y - (t.y + TANK_CY));
        const eff = Math.max(0, d - TANK_R);
        if (eff < r) this.hurt(t.seat, dmg * (1 - eff / r));
      }
    }
    this.settle();
  }

  /** Drop (or lift) every tank onto whatever ground is under it now. */
  settle() {
    for (const t of this.tanks) {
      const ny = tankGround(this.g, t.x);
      if (ny < t.y) {
        const drop = t.y - ny;
        const d = Math.max(6, Math.round(Math.sqrt((2 * drop) / (G * this.grav)) * TPS));
        this.ev({ t: this.t, k: "tank", seat: t.seat, x: r1(t.x), y: ny, how: "fall", d });
        t.y = ny;
      } else if (ny > t.y) {
        this.ev({ t: this.t, k: "tank", seat: t.seat, x: r1(t.x), y: ny, how: "rise", d: 10 });
        t.y = ny;
      }
    }
  }

  moveTank(t: SimTank, x: number, how: "push" | "toss", d: number) {
    t.x = r1(clampX(x));
    t.y = tankGround(this.g, t.x);
    this.ev({ t: this.t, k: "tank", seat: t.seat, x: t.x, y: t.y, how, d });
  }

  flushBurn() {
    for (let s = 0; s < this.burn.length; s++) {
      const n = Math.min(Math.floor(this.burn[s]), this.burnLeft[s]);
      if (n >= 1) {
        this.burn[s] -= n;
        this.burnLeft[s] -= n;
        this.hurt(s, n);
      }
    }
  }

  /* ---------------- motion ---------------- */

  tankAt(x: number, y: number, r: number, ignore: number): number {
    for (const t of this.tanks) {
      if (t.seat === ignore) continue;
      const dx = x - t.x;
      const dy = y - (t.y + TANK_CY);
      if (dx * dx + dy * dy < (TANK_R + r) * (TANK_R + r)) return t.seat;
    }
    return -1;
  }

  advance(e: Ent, dx: number, dy: number): Hit | null {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2.5));
    for (let k = 0; k < n; k++) {
      e.x += dx / n;
      e.y += dy / n;
      if (e.x < -120 || e.x > W + 120 || e.y < -60) return { type: "out" };
      const seat = this.tankAt(e.x, e.y, e.rad, e.age < e.grace ? this.shooter : -1);
      if (seat >= 0) return { type: "tank", seat };
      if (e.x >= 0 && e.x <= W) {
        const h = heightAt(this.g, e.x);
        if (e.y <= h) {
          e.y = h;
          return { type: "ground" };
        }
      }
    }
    return null;
  }

  fly(e: Ent): Hit | null {
    e.vx += (this.wind * WIND_ACC * e.wind + e.ax) * DT;
    e.vy -= G * this.grav * e.g * DT;
    return this.advance(e, e.vx * DT, e.vy * DT);
  }

  /* ---------------- the trigger ---------------- */

  /** The nearest live enemy tank within `range` of (x, y), measured to its centre. */
  enemyNear(x: number, y: number, range: number): SimTank | null {
    let best: SimTank | null = null;
    let bd = range;
    for (const t of this.tanks) {
      if (t.seat === this.shooter) continue;
      const d = Math.hypot(t.x - x, t.y + TANK_CY - y);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  fire() {
    const { weapon, angle, power } = this.inp;
    const me = this.tank(this.shooter)!;
    const a = rad(angle);
    const px = me.x + Math.cos(a) * BARREL;
    const py = me.y + PIVOT_Y + Math.sin(a) * BARREL;
    const v = (Math.max(0, Math.min(100, power)) / 100) * V_MAX;
    const vel = (deg: number, mul = 1): [number, number] => [Math.cos(rad(deg)) * v * mul, Math.sin(rad(deg)) * v * mul];
    const color = WEAPONS[weapon].hue;

    switch (weapon) {
      case "three":
        for (const off of [-4, 0, 4]) this.spawn("shell", px, py, ...vel(angle + off), "bullet", { r: 32, dmg: 18, cr: 27, color });
        return;
      case "five":
        for (const off of [-8, -4, 0, 4, 8]) this.spawn("shell", px, py, ...vel(angle + off), "bullet", { r: 30, dmg: 11, cr: 26, color });
        return;
      case "tracer":
        for (const off of [-2, -1, 0, 1, 2]) {
          this.spawn("tracer", px, py, ...vel(angle + off), "tracer", { label: off === 0 ? "0" : off > 0 ? `+${off}` : `${off}`, color, rad: 1.5 });
        }
        return;
      case "tommygun":
        for (let i = 0; i < 15; i++) {
          const go = () => {
            const t = this.tank(this.shooter)!;
            const jitter = angle + this.rand(-1.5, 1.5);
            const ja = rad(jitter);
            if (i > 0) this.ev({ t: this.t, k: "muzzle", seat: this.shooter });
            this.spawn("shell", t.x + Math.cos(ja) * BARREL, t.y + PIVOT_Y + Math.sin(ja) * BARREL, ...vel(jitter, this.rand(0.97, 1.03)), "round", {
              r: 14,
              dmg: 5,
              cr: 10,
              fx: "small",
              rad: 2,
              color,
            });
          };
          if (i === 0) go();
          else this.at(i * 4, go);
        }
        return;
      case "sniper":
        this.spawn("sniper", px, py, ...vel(angle, 1.4), "bullet", { rad: 1.5, color });
        return;
    }

    const P: Partial<Record<WeaponId, Partial<Ent>>> = {
      single: { r: 38, dmg: 40, cr: 34 },
      big: { r: 70, dmg: 30, cr: 60, fx: "big", rad: 4 },
      heatseeker: { r: 34, dmg: 40, cr: 30 },
      homingmissile: { r: 34, dmg: 40, cr: 30 },
      groundhog: { r: 40, dmg: 36, cr: 34 },
      worm: { r: 34, dmg: 30, cr: 28 },
      homingworm: { r: 34, dmg: 42, cr: 28 },
      skipper: { r: 36, dmg: 34, cr: 30 },
      cruiser: { r: 44, dmg: 40, cr: 36, rad: 4 },
      jackhammer: { r: 26, dmg: 10, cr: 22 },
    };
    const kind = weapon === "single" || weapon === "big" ? "shell" : weapon;
    this.spawn(kind, px, py, ...vel(angle), weapon === "homingmissile" ? "missile" : "bullet", { ...P[weapon], color });
  }

  /* ---------------- per-tick behaviour ---------------- */

  step(e: Ent) {
    e.age++;
    switch (e.mode) {
      case "fly":
        return this.stepFly(e);
      case "dig":
        return this.stepDig(e);
      case "cruise":
        return this.stepCruise(e);
      case "flow":
        return this.stepFlow(e);
    }
  }

  stepFly(e: Ent) {
    if (e.age > 900) return this.kill(e);
    // proximity triggers
    if (e.age > 10) {
      switch (e.kind) {
        case "zapper": {
          const t = this.enemyNear(e.x, e.y, 120);
          if (t) return this.zap(e, t);
          break;
        }
        case "crazyivan":
          if (this.enemyNear(e.x, e.y, 150)) return this.ivan(e);
          break;
        case "pineapple":
          if (this.enemyNear(e.x, e.y, 90)) return this.pineapple(e);
          break;
        case "homingmissile": {
          // stops dead over a tank and drops onto it
          if (e.n === 0) {
            const t = this.tanks.find((q) => q.seat !== this.shooter && Math.abs(q.x - e.x) < 7 && e.y > q.y + 20);
            if (t) {
              e.n = 1;
              e.vx = 0;
              e.vy = Math.min(e.vy, -40);
            }
          }
          break;
        }
        case "heatseeker": {
          const t = this.enemyNear(e.x, e.y, 140);
          if (t) {
            // a weak pull toward the tank: precision still matters
            const want = Math.atan2(t.y + TANK_CY - e.y, t.x - e.x);
            const cur = Math.atan2(e.vy, e.vx);
            let diff = want - cur;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const ang = cur + Math.max(-0.05, Math.min(0.05, diff));
            const sp = Math.max(160, Math.hypot(e.vx, e.vy));
            e.vx = Math.cos(ang) * sp;
            e.vy = Math.sin(ang) * sp;
            const hit = this.advance(e, e.vx * DT, e.vy * DT);
            if (hit) this.impact(e, hit);
            return;
          }
          break;
        }
      }
    }
    const hit = this.fly(e);
    if (hit) this.impact(e, hit);
  }

  impact(e: Ent, hit: Hit) {
    if (hit.type === "out") return this.kill(e);
    const ground = hit.type === "ground";
    const { x, y } = e;
    switch (e.kind) {
      case "shell":
      case "heatseeker":
      case "homingmissile":
        this.kill(e);
        return this.boom(x, y, e.r, e.dmg, e.fx, e.cr);

      case "sniper":
        this.kill(e);
        if (hit.seat !== undefined) {
          // no blast at all — just a hard round that knocks the tank flying
          const t = this.tank(hit.seat)!;
          this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 12, fx: "sniper" });
          this.hurt(hit.seat, 60);
          this.moveTank(t, t.x + (Math.sign(e.vx) || 1) * 70, "toss", 40);
          return this.settle();
        }
        return this.boom(x, y, 8, 0, "spark", 5);

      case "tracer":
        this.kill(e);
        this.ev({ t: this.t, k: "mark", x: ri(x), y: ri(y), label: e.label ?? "0", seat: this.shooter });
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 6, fx: "spark" });
        return;

      case "jackhammer":
        // goes off, then bounces straight up — five times
        this.boom(x, y, e.r, e.dmg, "fire", e.cr);
        if (++e.n > 5) return this.kill(e);
        e.vx = 0;
        e.vy = 250 - e.n * 26;
        e.y = (e.x >= 0 && e.x <= W ? Math.max(heightAt(this.g, e.x), e.y) : e.y) + 2;
        return;

      case "piledriver": {
        this.kill(e);
        this.boom(x, y, 18, 6, "small", 16);
        for (let k = 1; k <= 6; k++) this.at(k * 6, () => this.boom(x, Math.max(FLOOR, y - k * 13), 18, 6, "small", 16));
        return;
      }

      case "dirtmover": {
        this.kill(e);
        // the dirt goes the way the shot was fired, down into the ground
        const fa = rad(this.inp.angle);
        let dx = Math.cos(fa);
        let dy = -Math.abs(Math.sin(fa));
        if (Math.abs(dx) < 0.2) dx = 0.2 * (Math.sign(dx) || 1);
        const l = Math.hypot(dx, dy);
        dx /= l;
        dy /= l;
        const L = 180;
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 26, fx: "dirt" });
        for (let k = 0; k < 6; k++) {
          const go = () => {
            const x1 = x + dx * (L * k) / 6;
            const y1 = y + dy * (L * k) / 6;
            const x2 = x + dx * (L * (k + 1)) / 6;
            const y2 = y + dy * (L * (k + 1)) / 6;
            this.op({ k: "line", x1: r1(x1), y1: r1(Math.max(FLOOR, y1)), x2: r1(x2), y2: r1(Math.max(FLOOR, y2)), r: 18 });
            this.ev({ t: this.t, k: "boom", x: ri(x2), y: ri(y2), r: 18, fx: "dirt" });
            this.settle();
          };
          if (k === 0) go();
          else this.at(k * 3, go);
        }
        return;
      }

      case "crazyivan":
        return this.ivan(e);

      case "pineapple":
        return this.pineapple(e);

      case "zapper":
        this.kill(e);
        return this.boom(x, y, 22, 8, "zap", 18);

      case "spider":
        this.kill(e);
        return this.spider(x, y);

      case "magicwall":
        this.kill(e);
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 16, fx: "pop" });
        this.op({ k: "bump", x: r1(Math.max(0, Math.min(W, x))), r: 20, h: 170 });
        return this.settle();

      case "dirtslinger": {
        this.kill(e);
        this.boom(x, y, 22, 0, "dirt", 18);
        for (let i = 0; i < 14; i++) {
          const side = i % 2 ? 1 : -1;
          this.spawn("clod", x, y + 6, side * this.rand(90, 230), this.rand(150, 270), "clod", { rad: 3, grace: 0, color: "#8d6e63" }, 3);
        }
        return;
      }

      case "clod":
        this.kill(e);
        if (e.x < 0 || e.x > W) return;
        this.op({ k: "dirt", x: r1(e.x), y: r1(heightAt(this.g, e.x)), r: 13 });
        return this.settle();

      case "napalm":
        this.kill(e);
        this.boom(x, y, 18, 8, "napalm", 12);
        for (let i = 0; i < 22; i++) {
          this.spawn("drop", x, y + 4, this.rand(-110, 110) + e.vx * 0.15, this.rand(60, 190), "flame", { rad: 2, grace: 0 }, 4);
        }
        return;

      case "drop":
        e.mode = "flow";
        e.life = 0;
        e.y = (e.x >= 0 && e.x <= W ? heightAt(this.g, e.x) : e.y) + 2;
        return;

      case "hailstorm":
        this.kill(e);
        this.boom(x, y, 16, 4, "ice", 10);
        for (let i = 0; i < 54; i++) {
          this.at(1 + Math.floor(i / 3), () =>
            this.spawn("hail", x + this.rand(-6, 6), y + 6, this.rand(-170, 170), this.rand(140, 330), "ice", { rad: 1.5, grace: 0 }, 5)
          );
        }
        return;

      case "hail": {
        if (hit.seat !== undefined) this.chill(e, hit.seat);
        if (!ground && hit.seat === undefined) return this.kill(e);
        // bounce off the ground (or the tank) and lose some life each time
        const sl = e.x >= 0 && e.x <= W ? slopeAt(this.g, e.x) : 0;
        const nl = Math.hypot(sl, 1);
        const nx = -sl / nl;
        const ny = 1 / nl;
        const dot = e.vx * nx + e.vy * ny;
        if (dot < 0) {
          e.vx -= 2 * dot * nx;
          e.vy -= 2 * dot * ny;
        }
        e.vx *= 0.6;
        e.vy *= 0.45;
        e.n++;
        if (e.x >= 0 && e.x <= W) e.y = Math.max(e.y, heightAt(this.g, e.x)) + 1.5;
        if (e.n >= 3 || Math.hypot(e.vx, e.vy) < 70) {
          e.mode = "flow";
          e.life = 0;
        }
        return;
      }

      case "groundhog":
      case "worm":
      case "homingworm": {
        if (!ground) {
          this.kill(e);
          return this.boom(x, y, e.r, e.dmg, "fire", e.cr);
        }
        const l = Math.hypot(e.vx, e.vy) || 1;
        e.dx = e.vx / l;
        e.dy = e.vy / l;
        if (e.kind === "homingworm") {
          // level off just under the surface and hunt along it
          e.dx = Math.sign(e.vx) || 1;
          e.dy = -0.35;
        }
        if (e.dy > -0.1) e.dy = -0.1;
        e.mode = "dig";
        e.life = 0;
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 10, fx: "dirt" });
        return;
      }

      case "skipper":
        if (!ground || e.n >= 6) {
          this.kill(e);
          return this.boom(x, y, e.r, e.dmg, "fire", e.cr);
        }
        e.n++;
        this.ev({ t: this.t, k: "bounce", x: ri(x), y: ri(y) });
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 8, fx: "dirt" });
        e.vy = Math.max(Math.abs(e.vy) * 0.5, 90);
        e.vx *= 0.92;
        e.y = heightAt(this.g, Math.max(0, Math.min(W, e.x))) + 2;
        return;

      case "chainreaction":
        this.kill(e);
        this.boom(x, y, 24, 10, "fire", 20);
        for (let k = 1; k <= 8; k++) {
          this.at(k * 6, () => {
            const cx = Math.max(0, Math.min(W, x + this.rand(-95, 95)));
            this.boom(cx, heightAt(this.g, cx), 24, 10, "fire", 20);
          });
        }
        return;

      case "firecracker":
        this.kill(e);
        this.boom(x, y, 18, 8, "pop", 14);
        for (let k = 1; k <= 5; k++) {
          this.at(k * 5, () => {
            for (const side of [-1, 1]) {
              const cx = x + side * 24 * k;
              if (cx >= 0 && cx <= W) this.boom(cx, heightAt(this.g, cx), 18, 8, "pop", 14);
            }
          });
        }
        return;

      case "dirtball":
        this.kill(e);
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 30, fx: "dirt" });
        this.op({ k: "dirt", x: r1(x), y: r1(e.x >= 0 && e.x <= W ? heightAt(this.g, e.x) : y), r: 55 });
        return this.settle();

      case "mountainmover":
        this.kill(e);
        return this.boom(x, y, 100, 0, "big", 100);

      case "scattershot":
        this.kill(e);
        this.boom(x, y, 18, 6, "fire", 14);
        for (const deg of [50, 70, 90, 110, 130]) {
          this.spawn("shell", x, y + 6, Math.cos(rad(deg)) * 210, Math.sin(rad(deg)) * 210, "warhead", { r: 26, dmg: 14, cr: 22, grace: 0, rad: 2, color: e.color });
        }
        return;

      case "cruiser":
        if (!ground) {
          this.kill(e);
          return this.boom(x, y, e.r, e.dmg, "fire", e.cr);
        }
        e.mode = "cruise";
        e.dir = Math.sign(e.vx) || 1;
        e.life = 0;
        e.y = heightAt(this.g, e.x) + 3;
        return;

      default:
        this.kill(e);
        return this.boom(x, y, 30, 20, "fire", 24);
    }
  }

  /* ---------------- set pieces ---------------- */

  /** Zapper: a laser leaps from the bullet to the tank. */
  zap(e: Ent, t: SimTank) {
    this.kill(e);
    this.ev({ t: this.t, k: "beam", x1: ri(e.x), y1: ri(e.y), x2: ri(t.x), y2: ri(t.y + TANK_CY), fx: "zap", d: 30 });
    this.ev({ t: this.t, k: "boom", x: ri(t.x), y: ri(t.y + TANK_CY), r: 16, fx: "zap" });
    this.hurt(t.seat, 30);
  }

  /** Crazy Ivan: the warheads go wherever they like. */
  ivan(e: Ent) {
    this.kill(e);
    this.ev({ t: this.t, k: "boom", x: ri(e.x), y: ri(e.y), r: 14, fx: "pop" });
    for (let i = 0; i < 6; i++) {
      this.spawn("shell", e.x, e.y + 4, e.vx * 0.3 + this.rand(-220, 220), this.rand(-60, 280), "warhead", {
        r: 22,
        dmg: 12,
        cr: 18,
        fx: "pop",
        grace: 0,
        rad: 2,
        g: this.rand(0.6, 1.4),
        color: e.color,
      });
    }
  }

  /** Pineapple: dozens of tiny explosions. */
  pineapple(e: Ent) {
    this.kill(e);
    this.ev({ t: this.t, k: "boom", x: ri(e.x), y: ri(e.y), r: 18, fx: "pop" });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + this.rand(-0.1, 0.1);
      const sp = this.rand(90, 200);
      this.spawn("shell", e.x, e.y + 3, Math.cos(a) * sp, Math.sin(a) * sp + 40, "warhead", { r: 12, dmg: 4, cr: 8, fx: "small", grace: 0, rad: 1.5, color: e.color });
    }
  }

  /** Spider: silk sprays out at whichever tank is closest — even yours. */
  spider(x: number, y: number) {
    this.boom(x, y, 20, 6, "web", 14);
    let near: SimTank | null = null;
    for (const t of this.tanks) if (!near || Math.hypot(t.x - x, t.y - y) < Math.hypot(near.x - x, near.y - y)) near = t;
    if (!near) return;
    const target = near;
    for (let k = 0; k < 8; k++) {
      this.at(2 + k * 3, () => {
        const tx = Math.max(0, Math.min(W, target.x + this.rand(-26, 26)));
        const ty = Math.max(heightAt(this.g, tx), target.y + this.rand(0, 18));
        this.ev({ t: this.t, k: "beam", x1: ri(x), y1: ri(y + 4), x2: ri(tx), y2: ri(ty), fx: "web", d: 90 });
        this.boom(tx, ty, 14, 7, "web", 8);
      });
    }
  }

  /** Hail: each pellet stings a tank once. */
  chill(e: Ent, seat: number) {
    if (e.hit.includes(seat) || this.hailLeft[seat] <= 0) return;
    e.hit.push(seat);
    this.hailLeft[seat] -= 1;
    this.hurt(seat, 1);
  }

  /* ---------------- ground-bound modes ---------------- */

  stepDig(e: Ent) {
    e.life++;
    if (e.kind === "worm") {
      // tries to dig upward, wriggling as it goes
      const cur = Math.atan2(e.dy, e.dx);
      let diff = Math.PI / 2 - cur;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const ang = cur + Math.max(-0.03, Math.min(0.03, diff)) + Math.sin(e.life * 0.35) * 0.06;
      e.dx = Math.cos(ang);
      e.dy = Math.sin(ang);
    } else if (e.kind === "homingworm") {
      if (e.n === 0) {
        const depth = heightAt(this.g, Math.max(0, Math.min(W, e.x))) - e.y;
        if (depth > 18) e.dy = 0; // cruise level under the surface
        if (this.tanks.some((t) => t.seat !== this.shooter && Math.abs(t.x - e.x) < 4) || e.life > 160) {
          e.n = 1; // under a tank: straight up
          e.dx = 0;
          e.dy = 1;
        }
      }
    }
    e.x += e.dx * 3.4;
    e.y += e.dy * 3.4;
    if (e.x < 0 || e.x > W) return this.kill(e);
    if (e.y < FLOOR + 4) {
      this.kill(e);
      return this.boom(e.x, FLOOR + 4, e.r, e.dmg, "fire", e.cr);
    }
    const h = heightAt(this.g, e.x);
    const seat = this.tankAt(e.x, e.y, 3, -1);
    if (seat >= 0 || (e.y > h + 1 && e.life > 3) || e.life > 260) {
      // out the other side
      this.kill(e);
      this.boom(e.x, Math.min(e.y, h), e.r, e.dmg, "fire", e.cr);
    }
  }

  stepCruise(e: Ent) {
    e.x += e.dir * 2.8;
    e.life++;
    if (e.x < 0 || e.x > W) return this.kill(e);
    e.y = heightAt(this.g, e.x) + 3;
    const seat = this.tankAt(e.x, e.y, e.rad, e.life < 12 ? this.shooter : -1);
    if (seat >= 0 || e.life >= 100) {
      this.kill(e);
      this.boom(e.x, e.y, e.r, e.dmg, "fire", e.cr);
    }
  }

  /** Napalm droplets and spent hail: slide downhill along the surface. */
  stepFlow(e: Ent) {
    if (e.x < 0 || e.x > W) return this.kill(e);
    const s = slopeAt(this.g, e.x);
    e.vx += (-s / Math.sqrt(1 + s * s)) * G * this.grav * 1.2 * DT;
    e.vx *= e.kind === "hail" ? 0.975 : 0.965;
    const nx = e.x + e.vx * DT;
    if (nx < 0 || nx > W) return this.kill(e);
    const nh = heightAt(this.g, nx);
    if (nh - heightAt(this.g, e.x) > 3) e.vx = -e.vx * 0.2;
    else {
      e.x = nx;
      e.y = nh + (e.kind === "hail" ? 1.5 : 2);
    }
    for (const t of this.tanks) {
      if (Math.hypot(e.x - t.x, e.y - (t.y + 6)) >= 19) continue;
      if (e.kind === "hail") this.chill(e, t.seat);
      else this.burn[t.seat] += 0.12;
    }
    if (++e.life > (e.kind === "hail" ? 90 : 150)) this.kill(e);
  }

  /* ---------------- the loop ---------------- */

  run(): SimResult {
    this.fire();
    while (this.t < MAX_TICKS) {
      if (!this.ents.some((e) => e.mode !== "dead") && this.timers.length === 0) break;
      this.t++;
      for (;;) {
        const due = this.timers.filter((x) => x.t <= this.t);
        if (!due.length) break;
        this.timers = this.timers.filter((x) => x.t > this.t);
        due.sort((a, b) => a.t - b.t).forEach((x) => x.fn());
      }
      for (const e of this.ents.slice()) {
        if (e.mode === "dead" || e.born >= this.t) continue;
        this.step(e);
        if ((e.mode as Mode) !== "dead") this.sample(e);
      }
      if (this.t % 12 === 0) this.flushBurn();
    }
    for (const e of this.ents) this.kill(e);
    this.flushBurn();
    this.settle();

    this.events.sort((a, b) => a.t - b.t);
    let end = 0;
    for (const e of this.events) end = Math.max(end, e.t + ("d" in e ? e.d : 0));
    for (const tr of this.tracks) end = Math.max(end, tr.t1);
    return {
      rec: { tracks: this.tracks, events: this.events, dur: end + 40 },
      ground: this.g,
      tanks: this.tanks,
      delta: this.delta,
      taken: this.taken,
      dealt: this.dealt,
    };
  }
}

export function simulateShot(inp: SimInput): SimResult {
  return new Shot(inp).run();
}

/** Pre-flight: where a shot fired with these settings sits after `ticks` (for the aim guide). */
export function aimGuide(x: number, y: number, angle: number, power: number, gravity: number, n: number, every: number): [number, number][] {
  const a = rad(angle);
  let px = x + Math.cos(a) * BARREL;
  let py = y + PIVOT_Y + Math.sin(a) * BARREL;
  const v = (power / 100) * V_MAX;
  const vx = Math.cos(a) * v;
  let vy = Math.sin(a) * v;
  const out: [number, number][] = [];
  for (let i = 1; i <= n * every; i++) {
    vy -= G * gravity * DT;
    px += vx * DT;
    py += vy * DT;
    if (i % every === 0) out.push([px, py]);
  }
  return out;
}
