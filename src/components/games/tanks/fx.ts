/* Particles and light. Everything that flies, glows, drifts or burns for a
   moment lives here: debris that bounces off the ridge, sparks, fireballs,
   smoke that leans with the wind, embers, shockwave rings, confetti, acid
   droplets, electric arcs. World units, y up; drawn through `Y()`.

   Glows are drawn with cached soft sprites (one radial gradient per colour,
   rendered once) under additive blending — cheap enough for a thousand
   particles on a phone. */

import { H } from "@/lib/games/tanks/terrain";

export type PKind = "debris" | "spark" | "smoke" | "fire" | "ember" | "ring" | "glitter" | "drop" | "confetti" | "bubble" | "arc" | "flash" | "streak";

export interface P {
  k: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** seconds lived / to live */
  life: number;
  max: number;
  size: number;
  /** size change per second */
  grow: number;
  color: string;
  /** gravity multiplier (world units / s²) */
  g: number;
  /** velocity kept per second (1 = no drag) */
  drag: number;
  rot: number;
  vr: number;
  alpha: number;
  /** settled on the ground (debris) */
  rest?: boolean;
  /** random phase for flicker */
  ph: number;
}

export interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  max: number;
  alpha: number;
}

const GRAV = 300;
const MAX_PARTICLES = 1800;

const Y = (y: number) => H - y;

/* ---------------- soft sprites ---------------- */

const softCache = new Map<string, HTMLCanvasElement>();

/** A 64px radial glow in `color`, fading to nothing. */
export function soft(color: string): HTMLCanvasElement {
  let c = softCache.get(color);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(0.35, withAlpha(color, 0.55));
  g.addColorStop(1, withAlpha(color, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  softCache.set(color, c);
  return c;
}

/** "#rrggbb" + alpha → rgba() */
export function withAlpha(hex: string, a: number): string {
  if (hex.startsWith("rgb")) {
    const n = hex.slice(hex.indexOf("(") + 1, hex.indexOf(")")).split(",").map((x) => parseFloat(x));
    return `rgba(${n[0]},${n[1]},${n[2]},${(n.length > 3 ? n[3] : 1) * a})`;
  }
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Mix two "#rrggbb" colours. */
export function mix(a: string, b: string, u: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((x >> s) & 255) * (1 - u) + ((y >> s) & 255) * u);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, "0")}`;
}

/* ---------------- the system ---------------- */

export class Fx {
  ps: P[] = [];
  lights: Light[] = [];

  add(p: Partial<P> & { k: PKind; x: number; y: number }) {
    if (this.ps.length >= MAX_PARTICLES) this.ps.splice(0, this.ps.length - MAX_PARTICLES + 1);
    this.ps.push({
      vx: 0,
      vy: 0,
      life: 0,
      max: 1,
      size: 3,
      grow: 0,
      color: "#ffffff",
      g: 0,
      drag: 1,
      rot: Math.random() * Math.PI * 2,
      vr: 0,
      alpha: 1,
      ph: Math.random() * 10,
      ...p,
    });
  }

  light(x: number, y: number, r: number, color: string, max: number, alpha = 1) {
    this.lights.push({ x, y, r, color, life: 0, max, alpha });
  }

  clear() {
    this.ps = [];
    this.lights = [];
  }

  update(dt: number, ground: (x: number) => number) {
    const keep: P[] = [];
    for (const p of this.ps) {
      p.life += dt;
      if (p.life >= p.max) continue;
      if (!p.rest && p.k !== "arc") {
        const d = Math.pow(p.drag, dt);
        p.vx *= d;
        p.vy *= d;
        p.vy -= GRAV * p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      p.size = Math.max(0, p.size + p.grow * dt);
      if ((p.k === "debris" || p.k === "drop" || p.k === "confetti") && !p.rest && p.x > 0 && p.x < 1200) {
        const h = ground(p.x);
        if (p.y < h) {
          if (p.k === "drop") continue; // splashes into the ground
          if (p.k === "debris" && Math.abs(p.vy) > 60) {
            p.y = h;
            p.vy = -p.vy * 0.32;
            p.vx *= 0.55;
            p.vr *= 0.5;
          } else {
            p.y = h;
            p.rest = true;
            p.max = Math.min(p.max, p.life + 0.6 + Math.random() * 0.8);
          }
        }
      }
      keep.push(p);
    }
    this.ps = keep;
    this.lights = this.lights.filter((l) => (l.life += dt) < l.max);
  }

  /** Smoke, debris and the like — drawn before the glows. */
  drawSolid(ctx: CanvasRenderingContext2D, time: number) {
    for (const p of this.ps) {
      const u = p.life / p.max;
      switch (p.k) {
        case "smoke": {
          const a = p.alpha * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85);
          if (a <= 0.01) break;
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, Y(p.y), p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "debris": {
          ctx.globalAlpha = p.alpha * (u > 0.75 ? (1 - u) / 0.25 : 1);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, Y(p.y));
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size * 0.35, p.size, p.size * 0.7);
          ctx.restore();
          break;
        }
        case "confetti": {
          ctx.globalAlpha = p.alpha * (u > 0.7 ? (1 - u) / 0.3 : 1);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, Y(p.y));
          ctx.rotate(p.rot);
          ctx.scale(1, Math.abs(Math.sin(time * 9 + p.ph)) + 0.15);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        }
        case "drop": {
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, Y(p.y), p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "bubble": {
          ctx.globalAlpha = p.alpha * (1 - u);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(p.x + Math.sin(time * 8 + p.ph) * 1.5, Y(p.y), p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "ring": {
          const a = p.alpha * (1 - u) * (1 - u);
          if (a <= 0.01) break;
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.5, p.vr * (1 - u));
          ctx.beginPath();
          ctx.arc(p.x, Y(p.y), p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Everything that emits light — drawn additively. */
  drawGlow(ctx: CanvasRenderingContext2D, time: number) {
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.ps) {
      const u = p.life / p.max;
      switch (p.k) {
        case "fire": {
          // white-hot → orange → ember red as it cools
          const a = p.alpha * (1 - u) * (u < 0.08 ? u / 0.08 : 1);
          if (a <= 0.01) break;
          ctx.globalAlpha = a;
          const s = p.size * 2.4;
          ctx.drawImage(soft(u < 0.2 ? "#fff3c4" : u < 0.5 ? p.color : "#c2381a"), p.x - s, Y(p.y) - s, s * 2, s * 2);
          break;
        }
        case "ember":
        case "glitter": {
          const tw = p.k === "glitter" ? 0.5 + 0.5 * Math.sin(time * 30 + p.ph) : 0.75 + 0.25 * Math.sin(time * 18 + p.ph);
          const a = p.alpha * (1 - u) * tw;
          if (a <= 0.01) break;
          ctx.globalAlpha = a;
          const s = p.size * 2.2;
          ctx.drawImage(soft(p.color), p.x - s, Y(p.y) - s, s * 2, s * 2);
          break;
        }
        case "flash": {
          const a = p.alpha * (1 - u) * (1 - u);
          if (a <= 0.01) break;
          ctx.globalAlpha = a;
          const s = p.size * (1 + u * 0.4);
          ctx.drawImage(soft(p.color), p.x - s, Y(p.y) - s, s * 2, s * 2);
          break;
        }
        case "spark":
        case "streak": {
          const a = p.alpha * (1 - u);
          if (a <= 0.01) break;
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = "round";
          const k = p.k === "streak" ? 0.06 : 0.025;
          ctx.beginPath();
          ctx.moveTo(p.x, Y(p.y));
          ctx.lineTo(p.x - p.vx * k, Y(p.y - p.vy * k));
          ctx.stroke();
          break;
        }
        case "arc": {
          const a = p.alpha * (1 - u);
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, Y(p.y));
          const segs = 5;
          for (let i = 1; i <= segs; i++) {
            const f = i / segs;
            const jx = i === segs ? 0 : (Math.random() - 0.5) * 8;
            const jy = i === segs ? 0 : (Math.random() - 0.5) * 8;
            ctx.lineTo(p.x + p.vx * f + jx, Y(p.y + p.vy * f + jy));
          }
          ctx.stroke();
          break;
        }
      }
    }
    for (const l of this.lights) {
      const u = l.life / l.max;
      ctx.globalAlpha = l.alpha * (1 - u) * (1 - u);
      ctx.drawImage(soft(l.color), l.x - l.r, Y(l.y) - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

/* ---------------- recipes ---------------- */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pickOf = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function debris(fx: Fx, x: number, y: number, n: number, colors: string[], speed: number) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0.15, Math.PI - 0.15);
    const s = rnd(0.35, 1) * speed;
    fx.add({ k: "debris", x: x + rnd(-4, 4), y: y + rnd(0, 4), vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 1, drag: 0.7, max: rnd(1.4, 2.6), size: rnd(1.6, 4.2), color: pickOf(colors), vr: rnd(-14, 14) });
  }
}

export function sparks(fx: Fx, x: number, y: number, n: number, color: string, speed: number, up = false) {
  for (let i = 0; i < n; i++) {
    const a = up ? rnd(0.2, Math.PI - 0.2) : rnd(0, Math.PI * 2);
    const s = rnd(0.3, 1) * speed;
    fx.add({ k: "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.6, drag: 0.25, max: rnd(0.25, 0.7), size: rnd(0.8, 1.6), color });
  }
}

export function smoke(fx: Fx, x: number, y: number, n: number, r: number, color: string, wind: number, rise = 26) {
  for (let i = 0; i < n; i++) {
    fx.add({
      k: "smoke",
      x: x + rnd(-r, r) * 0.6,
      y: y + rnd(-r, r) * 0.3,
      vx: rnd(-12, 12) + wind * 2.2,
      vy: rnd(rise * 0.4, rise),
      drag: 0.5,
      max: rnd(1.4, 2.8),
      size: rnd(r * 0.25, r * 0.5),
      grow: rnd(r * 0.25, r * 0.5),
      color,
      alpha: rnd(0.35, 0.6),
    });
  }
}

export function fireball(fx: Fx, x: number, y: number, r: number, color = "#ff9a3c", n = 14) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2);
    const s = rnd(0.2, 1) * r * 2.4;
    fx.add({ k: "fire", x: x + Math.cos(a) * r * 0.15, y: y + Math.sin(a) * r * 0.15, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 + r * 0.6, drag: 0.04, g: -0.05, max: rnd(0.35, 0.75), size: rnd(r * 0.18, r * 0.36), grow: r * 0.3, color });
  }
}

export function ring(fx: Fx, x: number, y: number, r: number, color: string, width = 2.5, max = 0.45) {
  fx.add({ k: "ring", x, y, size: r * 0.2, grow: r * 2.6, color, max, vr: width, alpha: 0.9 });
}

export function embers(fx: Fx, x: number, y: number, n: number, color: string, spread: number) {
  for (let i = 0; i < n; i++) {
    fx.add({ k: "ember", x: x + rnd(-spread, spread), y: y + rnd(0, spread * 0.5), vx: rnd(-40, 40), vy: rnd(30, 140), g: 0.3, drag: 0.4, max: rnd(0.8, 2), size: rnd(0.8, 1.8), color });
  }
}

export function glitter(fx: Fx, x: number, y: number, n: number, colors: string[], speed: number, g = 0.25) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2);
    const s = rnd(0.4, 1) * speed;
    fx.add({ k: "glitter", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g, drag: 0.35, max: rnd(0.8, 1.8), size: rnd(1, 2.2), color: pickOf(colors) });
  }
}

export function droplets(fx: Fx, x: number, y: number, n: number, color: string, speed: number, size = 1.6) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0.25, Math.PI - 0.25);
    const s = rnd(0.3, 1) * speed;
    fx.add({ k: "drop", x, y: y + 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 1, drag: 0.8, max: 2, size: rnd(size * 0.6, size), color });
  }
}

export function arcs(fx: Fx, x: number, y: number, n: number, color: string, len: number) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2);
    const l = rnd(0.4, 1) * len;
    fx.add({ k: "arc", x, y, vx: Math.cos(a) * l, vy: Math.sin(a) * l, max: rnd(0.08, 0.2), size: rnd(0.8, 1.6), color });
  }
}
