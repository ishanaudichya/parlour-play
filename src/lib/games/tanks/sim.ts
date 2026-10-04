/* The ballistics. One call resolves an entire shot — every shell, bomblet,
   droplet, bolt and beam, every crater and every point of damage — at a fixed
   60 ticks a second, and writes it down as a ShotRecord: sampled flight paths
   plus a timeline of events. The server keeps the outcome; the client replays
   the record frame by frame, applying the same terrain ops at the same ticks.

   Pure apart from the passed rng. World units, y up (see terrain.ts). */

import {
  applyOp,
  BARREL,
  EDGE,
  FLOOR,
  H,
  heightAt,
  PIVOT_Y,
  slopeAt,
  TANK_CY,
  TANK_R,
  tankGround,
  W,
} from "./terrain";
import type { FxStyle, ShotEvent, ShotRecord, TerrainOp, Track, TrackStyle } from "./types";
import type { WeaponId } from "./weapons";

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

type Mode = "fly" | "roll" | "flow" | "dig" | "drill" | "saw" | "twist" | "home" | "cloud" | "dead";

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
        if (drop > 26) {
          const seat = t.seat;
          const n = Math.min(30, Math.floor((drop - 26) * 0.35));
          if (n > 0) this.at(d, () => this.hurt(seat, n));
        }
      } else if (ny > t.y) {
        this.ev({ t: this.t, k: "tank", seat: t.seat, x: r1(t.x), y: ny, how: "rise", d: 10 });
        t.y = ny;
      }
    }
  }

  moveTank(t: SimTank, x: number, how: "push" | "blink" | "toss", d: number) {
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

  fire() {
    const { weapon, angle, power } = this.inp;
    const me = this.tank(this.shooter)!;
    const a = rad(angle);
    const px = me.x + Math.cos(a) * BARREL;
    const py = me.y + PIVOT_Y + Math.sin(a) * BARREL;
    const v = (Math.max(0, Math.min(100, power)) / 100) * V_MAX;
    const vel = (deg: number, mul = 1): [number, number] => [Math.cos(rad(deg)) * v * mul, Math.sin(rad(deg)) * v * mul];

    switch (weapon) {
      case "trident":
        for (const off of [-6, 0, 6]) this.spawn("shell", px, py, ...vel(angle + off), "shell", { r: 28, dmg: 22, cr: 23 });
        return;
      case "fan":
        for (const off of [-10, -5, 0, 5, 10]) this.spawn("shell", px, py, ...vel(angle + off), "shell", { r: 24, dmg: 15, cr: 20 });
        return;
      case "gatling":
        for (let i = 0; i < 12; i++) {
          const go = () => {
            const t = this.tank(this.shooter)!;
            const jitter = angle + this.rand(-1.6, 1.6);
            const ja = rad(jitter);
            if (i > 0) this.ev({ t: this.t, k: "muzzle", seat: this.shooter });
            this.spawn(
              "shell",
              t.x + Math.cos(ja) * BARREL,
              t.y + PIVOT_Y + Math.sin(ja) * BARREL,
              ...vel(jitter, this.rand(0.97, 1.03)),
              "tracer",
              { r: 14, dmg: 6, cr: 9, fx: "spark", rad: 2 }
            );
          };
          if (i === 0) go();
          else this.at(i * 5, go);
        }
        return;
      case "lance":
        this.at(1, () => this.lance(px, py, a, power));
        return;
      case "prism":
        this.at(1, () => this.prism(px, py, a, power));
        return;
    }

    const [vx, vy] = vel(angle);
    const S: Partial<Record<WeaponId, [TrackStyle, Partial<Ent>]>> = {
      shell: ["shell", { r: 36, dmg: 34, cr: 30 }],
      howitzer: ["heavy", { r: 56, dmg: 46, cr: 46, fx: "big", rad: 4 }],
      sun: ["sun", { r: 112, dmg: 72, cr: 92, fx: "nuke", rad: 5 }],
      hydra: ["hydra", {}],
      mirv: ["shell", {}],
      cluster: ["bomblet", { rad: 4 }],
      daisy: ["shell", {}],
      roller: ["roller", { rad: 5, r: 44, dmg: 40, cr: 36 }],
      pinball: ["pinball", { rad: 4 }],
      tunneler: ["drill", { r: 42, dmg: 38, cr: 34, fx: "big" }],
      sinkhole: ["drill", {}],
      napalm: ["napalm", {}],
      acid: ["acid", {}],
      thunder: ["thunder", {}],
      airraid: ["flare", {}],
      meteors: ["summon", {}],
      skyspear: ["beacon", {}],
      singularity: ["void", { rad: 4 }],
      tremor: ["tremor", { rad: 4 }],
      volcano: ["volcano", { rad: 4 }],
      mudpie: ["mud", { rad: 5 }],
      rampart: ["rampart", { rad: 4 }],
      blink: ["blink", {}],
      seeker: ["seeker", { r: 34, dmg: 32, cr: 28 }],
      boomerang: ["boomerang", { r: 34, dmg: 36, cr: 28, g: 0.55, wind: 0.4, ax: -(Math.sign(vx) || 1) * 280 }],
      buzzsaw: ["saw", { rad: 5 }],
      fireworks: ["rocket", {}],
      jackhammer: ["piston", {}],
      twister: ["seed", {}],
    };
    const [style, o] = S[weapon] ?? ["shell", {}];
    const kind = weapon === "shell" || weapon === "howitzer" || weapon === "sun" ? "shell" : weapon;
    this.spawn(kind, px, py, vx, vy, style, o);
  }

  /* ---------------- beams ---------------- */

  lance(x: number, y: number, a: number, power: number) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const L = 260 + power * 9.4;
    let ex = x;
    let ey = y;
    const runs: [number, number, number, number][] = [];
    let runStart: [number, number] | null = null;
    for (let s = 0; s < L; s += 3) {
      const cx = x + dx * s;
      const cy = y + dy * s;
      if (cx < 0 || cx > W || cy < -20 || cy > H + 300) break;
      ex = cx;
      ey = cy;
      const inside = cy < heightAt(this.g, cx);
      if (inside && !runStart) runStart = [cx, cy];
      if (!inside && runStart) {
        runs.push([runStart[0], runStart[1], cx, cy]);
        runStart = null;
      }
    }
    if (runStart) runs.push([runStart[0], runStart[1], ex, ey]);
    this.ev({ t: this.t, k: "beam", pts: [ri(x), ri(y), ri(ex), ri(ey)], fx: "lance", d: 46 });

    // anything the beam passes through is cut
    for (const t of this.tanks) {
      if (t.seat === this.shooter) continue;
      const cx = t.x - x;
      const cy = t.y + TANK_CY - y;
      const along = Math.max(0, Math.min(Math.hypot(ex - x, ey - y), cx * dx + cy * dy));
      const px = x + dx * along;
      const py = y + dy * along;
      if (Math.hypot(t.x - px, t.y + TANK_CY - py) < TANK_R + 5) this.hurt(t.seat, 42);
    }
    for (const [x1, y1, x2, y2] of runs) {
      this.ev({ t: this.t, k: "boom", x: ri(x1), y: ri(y1), r: 12, fx: "spark" });
      this.op({ k: "line", x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2), r: 8 });
    }
    this.settle();
  }

  prism(x: number, y: number, a: number, power: number) {
    let dx = Math.cos(a);
    let dy = Math.sin(a);
    const L = 520 + power * 16;
    const pts = [ri(x), ri(y)];
    const bounces: { x: number; y: number; at: number }[] = [];
    let hitTank: { seat: number; x: number; y: number; at: number } | null = null;
    let cx = x;
    let cy = y;
    for (let s = 0; s < L; s += 2) {
      cx += dx * 2;
      cy += dy * 2;
      if (cx < 0 || cx > W || cy < 0 || cy > H + 400) break;
      const seat = this.tankAt(cx, cy, 2, s < 40 ? this.shooter : -1);
      if (seat >= 0) {
        hitTank = { seat, x: cx, y: cy, at: s };
        break;
      }
      const h = heightAt(this.g, cx);
      if (cy <= h) {
        if (bounces.length >= 5) break;
        const sl = slopeAt(this.g, cx);
        const nl = Math.hypot(sl, 1);
        const nx = -sl / nl;
        const ny = 1 / nl;
        const dot = dx * nx + dy * ny;
        dx -= 2 * dot * nx;
        dy -= 2 * dot * ny;
        cy = h + 1.5;
        bounces.push({ x: cx, y: h, at: s });
        pts.push(ri(cx), ri(cy));
      }
    }
    pts.push(ri(cx), ri(cy));
    this.ev({ t: this.t, k: "beam", pts, fx: "prism", d: 52 });
    // the beam travels 45 units a tick; each bounce detonates as it arrives
    for (const b of bounces) this.at(1 + b.at / 45, () => this.boom(b.x, b.y, 16, 8, "spark", 10));
    if (hitTank) {
      const ht = hitTank;
      this.at(1 + ht.at / 45, () => {
        this.ev({ t: this.t, k: "boom", x: ri(ht.x), y: ri(ht.y), r: 18, fx: "electric" });
        this.hurt(ht.seat, 38);
      });
    }
  }

  /* ---------------- per-tick behaviour ---------------- */

  step(e: Ent) {
    e.age++;
    switch (e.mode) {
      case "fly":
        return this.stepFly(e);
      case "home":
        return this.stepHome(e);
      case "roll":
        return this.stepRoll(e);
      case "flow":
        return this.stepFlow(e);
      case "dig":
        return this.stepDig(e);
      case "drill":
        return this.stepDrill(e);
      case "saw":
        return this.stepSaw(e);
      case "twist":
        return this.stepTwist(e);
      case "cloud":
        return this.stepCloud(e);
    }
  }

  stepFly(e: Ent) {
    if (e.kind === "pinball" && e.age > 540) {
      this.kill(e);
      return this.boom(e.x, e.y, 30, 22, "fire", 24);
    }
    // fireworks burst where people can see them: at the top of the arc or the top of the sky
    const ceiling = e.kind === "fireworks" && e.y > H - 90 && e.age > 3;
    if (!e.apexDone && ((e.vy <= 0 && e.age > 3) || ceiling)) {
      e.apexDone = true;
      if (this.apex(e)) return;
    }
    if (e.age > 900) return this.kill(e);
    const hit = this.fly(e);
    if (hit) this.impact(e, hit);
  }

  /** Top of the arc. Returns true if the entity was replaced. */
  apex(e: Ent): boolean {
    switch (e.kind) {
      case "hydra": {
        this.ev({ t: this.t, k: "burst", x: ri(e.x), y: ri(e.y), fx: "split" });
        for (const off of [-70, 0, 70]) this.spawn("shell", e.x, e.y, e.vx + off, e.vy, "hydra", { r: 30, dmg: 22, cr: 24, grace: 0 });
        this.kill(e);
        return true;
      }
      case "mirv": {
        this.ev({ t: this.t, k: "burst", x: ri(e.x), y: ri(e.y), fx: "split" });
        for (let i = 0; i < 6; i++) this.spawn("shell", e.x, e.y, e.vx - 150 + i * 60, -20, "bomblet", { r: 24, dmg: 15, cr: 20, grace: 0 });
        this.kill(e);
        return true;
      }
      case "acid":
        this.cloud(e.x, Math.min(e.y, H - 40));
        this.kill(e);
        return true;
      case "fireworks":
        this.stars(e.x, e.y, e.vx, false);
        this.kill(e);
        return true;
      case "seeker":
        if (this.tanks.some((t) => t.seat !== this.shooter)) {
          e.mode = "home";
          e.life = 0;
        }
        return false;
    }
    return false;
  }

  impact(e: Ent, hit: Hit) {
    if (hit.type === "out") return this.kill(e);
    const ground = hit.type === "ground";
    const { x, y } = e;
    switch (e.kind) {
      case "shell":
      case "seeker":
      case "boomerang":
        this.kill(e);
        return this.boom(x, y, e.r, e.dmg, e.fx, e.cr);

      case "hydra":
      case "mirv":
        // never reached the top of its arc — goes off whole
        this.kill(e);
        return this.boom(x, y, 40, 34, "fire", 32);

      case "cluster":
        this.kill(e);
        this.boom(x, y, 26, 16, "fire", 22);
        for (let i = 0; i < 6; i++) {
          this.spawn("shell", x, y + 5, this.rand(-160, 160), this.rand(170, 300), "bomblet", { r: 18, dmg: 9, cr: 14, grace: 0, rad: 2 });
        }
        return;

      case "daisy": {
        this.kill(e);
        this.boom(x, y, 16, 8, "pop", 13);
        const dir = e.dir;
        for (let i = 1; i <= 6; i++) {
          this.at(i * 7, () => {
            const px = x + dir * 26 * i;
            if (px < 0 || px > W) return;
            this.boom(px, heightAt(this.g, px), 18, 9, "pop", 14);
          });
        }
        return;
      }

      case "roller":
        if (!ground) {
          this.kill(e);
          return this.boom(x, y, e.r, e.dmg, "fire", e.cr);
        }
        e.mode = "roll";
        e.vx = e.vx * 0.6;
        e.life = 0;
        e.y = heightAt(this.g, x) + 5;
        return;

      case "pinball":
        if (!ground || e.n >= 4) {
          this.kill(e);
          return this.boom(x, y, 30, 22, "fire", 24);
        }
        e.n++;
        this.ev({ t: this.t, k: "bounce", x: ri(x), y: ri(y) });
        this.boom(x, y, 16, 8, "spark", 11);
        {
          const sl = slopeAt(this.g, x);
          const nl = Math.hypot(sl, 1);
          const nx = -sl / nl;
          const ny = 1 / nl;
          const dot = e.vx * nx + e.vy * ny;
          if (dot < 0) {
            e.vx -= 2 * dot * nx;
            e.vy -= 2 * dot * ny;
          }
          e.vx *= 0.8;
          e.vy = Math.max(e.vy * 0.8, 70);
          e.y = heightAt(this.g, e.x) + 2;
          if (Math.hypot(e.vx, e.vy) < 50) {
            this.kill(e);
            this.boom(e.x, e.y, 30, 22, "fire", 24);
          }
        }
        return;

      case "tunneler": {
        if (!ground) {
          this.kill(e);
          return this.boom(x, y, e.r, e.dmg, e.fx, e.cr);
        }
        const l = Math.hypot(e.vx, e.vy) || 1;
        let dx = e.vx / l;
        let dy = e.vy / l;
        if (dy > -0.18) dy = -0.18;
        const l2 = Math.hypot(dx, dy);
        dx /= l2;
        dy /= l2;
        e.dx = dx;
        e.dy = dy;
        e.mode = "dig";
        e.life = 0;
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 14, fx: "dirt" });
        return;
      }

      case "sinkhole":
        if (!ground) {
          this.kill(e);
          return this.boom(x, y, 30, 20, "fire", 24);
        }
        e.mode = "drill";
        e.life = 0;
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 14, fx: "dirt" });
        return;

      case "napalm":
        this.kill(e);
        this.boom(x, y, 16, 8, "fire", 12);
        for (let i = 0; i < 22; i++) {
          const vx = this.rand(-110, 110) + e.vx * 0.15;
          this.spawn("drop", x, y + 4, vx, this.rand(60, 190), "flame", { rad: 2, grace: 0 }, 4);
        }
        return;

      case "drop":
        e.mode = "flow";
        e.life = 0;
        e.y = (e.x >= 0 && e.x <= W ? heightAt(this.g, e.x) : e.y) + 2;
        return;

      case "acid":
        this.kill(e);
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 12, fx: "acid" });
        return this.cloud(x, Math.min(H - 40, y + 160));

      case "raindrop":
        this.kill(e);
        return this.boom(x, y, 10, 3, "acid", 7);

      case "thunder":
        this.kill(e);
        this.boom(x, y, 18, 8, "electric", 12);
        return this.storm(x);

      case "airraid":
        this.kill(e);
        return this.airRaid(x, y);

      case "meteors":
        this.kill(e);
        this.ev({ t: this.t, k: "flare", x: ri(x), y: ri(y), d: 80, fx: "summon" });
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 12, fx: "spark" });
        return this.meteors(x);

      case "skyspear":
        this.kill(e);
        this.ev({ t: this.t, k: "flare", x: ri(x), y: ri(y), d: 58, fx: "target" });
        return this.at(55, () => this.spear(x));

      case "singularity":
        this.kill(e);
        return this.singularity(x, y);

      case "tremor":
        this.kill(e);
        this.boom(x, y, 18, 6, "dirt", 12);
        return this.tremor(x);

      case "volcano":
        this.kill(e);
        return this.volcano(x);

      case "mudpie":
        this.kill(e);
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 34, fx: "mud" });
        this.op({ k: "dirt", x: r1(x), y: r1(heightAt(this.g, Math.max(0, Math.min(W, x)))), r: 62 });
        return this.settle();

      case "rampart":
        this.kill(e);
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 30, fx: "mud" });
        this.op({ k: "bump", x: r1(x), r: 30, h: 150 });
        return this.settle();

      case "blink":
        this.kill(e);
        return this.blink(x, hit.seat);

      case "buzzsaw":
        if (!ground) {
          this.kill(e);
          if (hit.seat !== undefined) this.hurt(hit.seat, 24);
          return this.boom(x, y, 22, 10, "fire", 16);
        }
        e.mode = "saw";
        e.life = 0;
        this.ev({ t: this.t, k: "boom", x: ri(x), y: ri(y), r: 14, fx: "spark" });
        return;

      case "fireworks":
        this.kill(e);
        return this.stars(x, y + 6, e.vx, true);

      case "jackhammer":
        if (!ground || e.n >= 4) {
          this.kill(e);
          return this.boom(x, y, 28, 16, "fire", 22);
        }
        e.n++;
        this.boom(x, y, 20, 10, "dirt", 16);
        e.vx = 0;
        e.vy = 150;
        e.y = heightAt(this.g, e.x) + 2;
        return;

      case "twister":
        e.mode = "twist";
        e.life = 0;
        e.y = e.x >= 0 && e.x <= W ? heightAt(this.g, e.x) : e.y;
        return;

      default:
        this.kill(e);
        return this.boom(x, y, 30, 24, "fire", 24);
    }
  }

  /* ---------------- ground-bound modes ---------------- */

  stepRoll(e: Ent) {
    const s = slopeAt(this.g, e.x);
    e.vx += (-s / Math.sqrt(1 + s * s)) * G * this.grav * 0.9 * DT;
    e.vx *= 0.992;
    const nx = e.x + e.vx * DT;
    if (nx < 0 || nx > W) return this.kill(e);
    const nh = heightAt(this.g, nx);
    if (nh - heightAt(this.g, e.x) > 4) {
      // a wall: knock back, and give up after a few
      e.vx = -e.vx * 0.4;
      e.n++;
      if (e.n > 3) {
        this.kill(e);
        return this.boom(e.x, e.y, e.r, e.dmg, "fire", e.cr);
      }
    } else {
      e.x = nx;
      e.y = nh + 5;
    }
    e.life++;
    e.still = Math.abs(e.vx) < 8 ? e.still + 1 : 0;
    const seat = this.tankAt(e.x, e.y, e.rad, e.life < 20 ? this.shooter : -1);
    if (seat >= 0 || e.still > 20 || e.life > 260) {
      this.kill(e);
      this.boom(e.x, e.y, e.r, e.dmg, "fire", e.cr);
    }
  }

  stepFlow(e: Ent) {
    if (e.x < 0 || e.x > W) return this.kill(e);
    const s = slopeAt(this.g, e.x);
    e.vx += (-s / Math.sqrt(1 + s * s)) * G * this.grav * 1.2 * DT;
    e.vx *= 0.965;
    const nx = e.x + e.vx * DT;
    if (nx < 0 || nx > W) return this.kill(e);
    const nh = heightAt(this.g, nx);
    if (nh - heightAt(this.g, e.x) > 3) e.vx = -e.vx * 0.2;
    else {
      e.x = nx;
      e.y = nh + 2;
    }
    for (const t of this.tanks) {
      if (Math.hypot(e.x - t.x, e.y - (t.y + 6)) < 19) this.burn[t.seat] += 0.12;
    }
    if (++e.life > 150) this.kill(e);
  }

  stepDig(e: Ent) {
    e.x += e.dx * 3.6;
    e.y += e.dy * 3.6;
    e.life++;
    if (e.x < 0 || e.x > W || e.y < FLOOR) {
      this.kill(e);
      return this.boom(Math.max(0, Math.min(W, e.x)), Math.max(FLOOR, e.y), e.r, e.dmg, e.fx, e.cr);
    }
    if (e.life % 3 === 0) {
      this.op({ k: "carve", x: r1(e.x), y: r1(e.y), r: 10 });
      this.settle();
    }
    const seat = this.tankAt(e.x, e.y, 4, -1);
    if (seat >= 0 || e.life >= 66) {
      this.kill(e);
      this.boom(e.x, e.y, e.r, e.dmg, e.fx, e.cr);
    }
  }

  stepDrill(e: Ent) {
    e.y -= 4;
    e.life++;
    if (e.life % 2 === 0) {
      this.op({ k: "carve", x: r1(e.x), y: r1(e.y), r: 11 });
      this.settle();
    }
    if (e.life >= 26 || e.y < FLOOR + 12) {
      this.kill(e);
      // the cavity gives way
      this.ev({ t: this.t, k: "quake", d: 30 });
      this.ev({ t: this.t, k: "boom", x: ri(e.x), y: ri(heightAt(this.g, e.x)), r: 28, fx: "dirt" });
      this.op({ k: "carve", x: r1(e.x), y: r1(e.y + 10), r: 64 });
      this.settle();
    }
  }

  stepSaw(e: Ent) {
    e.x += e.dir * 3.8;
    e.life++;
    if (e.x < 0 || e.x > W) return this.kill(e);
    e.y = heightAt(this.g, e.x) + 5;
    if (e.life % 3 === 0) {
      this.op({ k: "carve", x: r1(e.x), y: r1(e.y - 4), r: 10 });
      this.settle();
    }
    const seat = this.tankAt(e.x, e.y, 9, -1);
    if (seat >= 0) {
      this.hurt(seat, 26);
      this.kill(e);
      return this.boom(e.x, e.y, 22, 10, "fire", 16);
    }
    if (e.life >= 80) {
      this.kill(e);
      this.boom(e.x, e.y, 22, 10, "fire", 16);
    }
  }

  stepTwist(e: Ent) {
    e.x += e.dir * 2.2;
    e.life++;
    if (e.x < 0 || e.x > W || e.life > 170) return this.kill(e);
    e.y = heightAt(this.g, e.x);
    if (e.life % 6 === 0) {
      this.op({ k: "carve", x: r1(e.x), y: r1(e.y - 2), r: 9 });
      this.settle();
    }
    for (const t of this.tanks) {
      if (e.hit.includes(t.seat)) continue;
      if (Math.abs(t.x - e.x) < 22 && Math.abs(t.y - e.y) < 70) {
        e.hit.push(t.seat);
        this.hurt(t.seat, 24);
        this.moveTank(t, t.x + e.dir * 70, "toss", 44);
      }
    }
  }

  stepHome(e: Ent) {
    let best: SimTank | null = null;
    let bd = Infinity;
    for (const t of this.tanks) {
      if (t.seat === this.shooter) continue;
      const d = Math.hypot(t.x - e.x, t.y - e.y);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    e.life++;
    if (!best || e.life > 260) {
      e.mode = "fly";
      return this.stepFly(e);
    }
    const want = Math.atan2(best.y + TANK_CY - e.y, best.x - e.x);
    const cur = Math.atan2(e.vy, e.vx);
    let diff = want - cur;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const ang = cur + Math.max(-0.055, Math.min(0.055, diff));
    const sp = Math.min(380, Math.hypot(e.vx, e.vy) + 4);
    e.vx = Math.cos(ang) * sp + this.wind * 0.3;
    e.vy = Math.sin(ang) * sp;
    const hit = this.advance(e, e.vx * DT, e.vy * DT);
    if (hit) this.impact(e, hit);
  }

  stepCloud(e: Ent) {
    e.x += this.wind * 0.06;
    e.life++;
    if (e.life <= 102 && e.life % 3 === 0) {
      this.spawn("raindrop", e.x + this.rand(-55, 55), e.y - 10, this.wind * 2, -80, "raindrop", { g: 1.3, wind: 0.6, rad: 2, grace: 0 });
    }
    if (e.life >= 116) this.kill(e);
  }

  /* ---------------- set pieces ---------------- */

  cloud(x: number, y: number) {
    this.ev({ t: this.t, k: "burst", x: ri(x), y: ri(y), fx: "split" });
    const c = this.spawn("cloud", x, y, 0, 0, "acidcloud", {}, 4);
    c.mode = "cloud";
  }

  stars(x: number, y: number, vx: number, upward: boolean) {
    this.ev({ t: this.t, k: "burst", x: ri(x), y: ri(y), fx: "firework" });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + this.rand(-0.12, 0.12);
      const sp = this.rand(130, 200);
      let svy = Math.sin(a) * sp + 40;
      if (upward) svy = Math.abs(Math.sin(a)) * sp + 60;
      const style = (`star${i % 4}` as TrackStyle);
      this.spawn("shell", x, y, vx * 0.3 + Math.cos(a) * sp, svy, style, { r: 16, dmg: 6, cr: 10, fx: "firework", g: 0.55, wind: 0.7, grace: 0, rad: 2 });
    }
  }

  storm(x: number) {
    const cy = Math.min(H - 50, heightAt(this.g, Math.max(0, Math.min(W, x))) + 230);
    this.ev({ t: this.t, k: "cloud", x: ri(x), y: ri(cy), d: 96 });
    for (const dt of [36, 52, 68]) {
      this.at(dt, () => {
        let best: SimTank | null = null;
        for (const t of this.tanks) {
          if (t.seat === this.shooter || Math.abs(t.x - x) > 190) continue;
          if (!best || Math.abs(t.x - x) < Math.abs(best.x - x)) best = t;
        }
        const tx = best ? best.x : Math.max(0, Math.min(W, x + this.rand(-100, 100)));
        const ty = best ? best.y + 16 : heightAt(this.g, tx);
        this.ev({ t: this.t, k: "bolt", x1: ri(x + this.rand(-40, 40)), y1: ri(cy - 12), x2: ri(tx), y2: ri(ty), seed: Math.floor(this.rng() * 1e6) });
        this.boom(tx, ty, 22, 15, "electric", 14);
      });
    }
  }

  airRaid(x: number, y: number) {
    this.ev({ t: this.t, k: "flare", x: ri(x), y: ri(y), d: 160, fx: "smoke" });
    const me = this.tank(this.shooter)!;
    const dir = x >= me.x ? 1 : -1;
    const speed = 8; // units per tick
    const py = H - 46;
    const x0 = dir > 0 ? -90 : W + 90;
    const x1 = dir > 0 ? W + 90 : -90;
    const start = 30;
    this.at(start, () => this.ev({ t: this.t, k: "plane", x0, x1, y: py, d: Math.round(Math.abs(x1 - x0) / speed) }));
    const bvx = dir * 120;
    for (let i = 0; i < 6; i++) {
      const tx = x + dir * (i - 2.5) * 34;
      const hg = heightAt(this.g, Math.max(0, Math.min(W, tx)));
      const T = Math.sqrt((2 * Math.max(10, py - 8 - hg)) / (G * this.grav));
      const rx = dir > 0 ? Math.max(x0, tx - bvx * T) : Math.min(x0, tx - bvx * T);
      const when = start + Math.abs(rx - x0) / speed;
      this.at(when, () => this.spawn("shell", rx, py - 8, bvx, 0, "bomb", { r: 30, dmg: 18, cr: 25, wind: 0, grace: 0, rad: 3 }));
    }
  }

  meteors(x: number) {
    for (let i = 0; i < 8; i++) {
      this.at(24 + i * 6, () => {
        const tx = x + this.rand(-150, 150);
        const side = this.rng() < 0.5 ? -1 : 1;
        const sy = H + 50;
        const hg = heightAt(this.g, Math.max(0, Math.min(W, tx)));
        const gg = G * this.grav;
        const T = (-240 + Math.sqrt(240 * 240 + 2 * gg * (sy - hg))) / gg;
        const sx = Math.max(-100, Math.min(W + 100, tx - side * 130 * T));
        const vx = (tx - sx) / T;
        this.spawn("shell", sx, sy, vx, -240, "meteor", { r: 28, dmg: 14, cr: 22, fx: "meteor", wind: 0, grace: 0, rad: 4 });
      });
    }
  }

  spear(x: number) {
    const cx = Math.max(0, Math.min(W, x));
    const gy = heightAt(this.g, cx);
    this.ev({ t: this.t, k: "beam", pts: [ri(cx), H + 40, ri(cx), ri(Math.max(FLOOR, gy - 150))], fx: "orbital", d: 50 });
    this.ev({ t: this.t, k: "boom", x: ri(cx), y: ri(gy), r: 36, fx: "orbital" });
    for (const t of this.tanks) {
      const dx = Math.abs(t.x - cx);
      if (dx < 44) this.hurt(t.seat, 60 * (dx < 8 ? 1 : 1 - (dx - 8) / 36));
    }
    this.op({ k: "line", x1: r1(cx), y1: r1(gy + 6), x2: r1(cx), y2: r1(Math.max(FLOOR, gy - 150)), r: 20 });
    this.settle();
  }

  singularity(x: number, y: number) {
    this.ev({ t: this.t, k: "well", x: ri(x), y: ri(y), d: 86 });
    for (let k = 1; k <= 6; k++) {
      this.at(k * 10, () => {
        this.op({ k: "carve", x: r1(x), y: r1(y), r: 12 + k * 9 });
        this.settle();
      });
    }
    this.at(40, () => {
      for (const t of this.tanks) {
        const dx = x - t.x;
        const ad = Math.abs(dx);
        if (ad >= 240) continue;
        const pull = Math.sign(dx) * Math.min(Math.max(0, ad - 16), 90 * (1 - ad / 240));
        if (Math.abs(pull) > 1) this.moveTank(t, t.x + pull, "push", 30);
      }
    });
    this.at(72, () => this.boom(x, y, 46, 40, "void", 26));
  }

  tremor(x: number) {
    this.ev({ t: this.t, k: "quake", d: 86 });
    const seed = Math.floor(this.rng() * 1e6);
    this.at(8, () => {
      this.op({ k: "quake", x: r1(x), r: 430, amp: 30, seed });
      this.settle();
    });
    this.at(18, () => {
      for (const t of this.tanks) {
        const dx = Math.abs(t.x - x);
        if (dx < 430) this.hurt(t.seat, 22 * (1 - dx / 430));
      }
    });
  }

  volcano(x: number) {
    const cx = Math.max(0, Math.min(W, x));
    this.ev({ t: this.t, k: "quake", d: 40 });
    this.op({ k: "bump", x: r1(cx), r: 74, h: 78 });
    this.settle();
    this.at(18, () => this.ev({ t: this.t, k: "burst", x: ri(cx), y: ri(heightAt(this.g, cx)), fx: "erupt" }));
    for (let i = 0; i < 9; i++) {
      this.at(20 + i * 7, () => {
        const top = heightAt(this.g, cx) + 6;
        this.spawn("shell", cx + this.rand(-6, 6), top, this.rand(-170, 170), this.rand(260, 400), "lava", { r: 20, dmg: 10, cr: 14, fx: "lava", grace: 0, rad: 3 });
      });
    }
  }

  blink(x: number, onSeat: number | undefined) {
    const me = this.tank(this.shooter)!;
    let nx = clampX(x);
    for (const t of this.tanks) {
      if (t.seat === this.shooter) continue;
      if (Math.abs(t.x - nx) < 34 || t.seat === onSeat) nx = clampX(t.x + (nx >= t.x ? 34 : -34));
    }
    this.ev({ t: this.t, k: "boom", x: ri(me.x), y: ri(me.y + 10), r: 20, fx: "blink" });
    this.moveTank(me, nx, "blink", 24);
    this.at(12, () => this.ev({ t: this.t, k: "boom", x: ri(me.x), y: ri(me.y + 10), r: 20, fx: "blink" }));
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
