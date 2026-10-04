/* The art. Everything here paints in world units (y up, flipped through Y),
   procedurally: the sky and far hills for each battlefield, the rock texture
   the ridge is cut from, the tanks, and every projectile and set piece the
   armoury can put in the air. No image assets — it is all drawn.

   Static layers (sky, rock) are rendered once into offscreen canvases; the
   tanks and projectiles are drawn live each frame. */

import { hash01, H, W } from "@/lib/games/tanks/terrain";
import type { Biome, TankColor, TrackStyle } from "@/lib/games/tanks/types";
import { soft, withAlpha } from "./fx";
import { BIOME, TANK } from "./palette";

export const Y = (y: number) => H - y;
const TAU = Math.PI * 2;

/** Seeded rng for scenery, so every client paints the same hills. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise1(rng: () => number, step: number, n: number) {
  const knots = Array.from({ length: Math.ceil(n / step) + 2 }, () => rng());
  return (i: number) => {
    const f = i / step;
    const k = Math.floor(f);
    const u = f - k;
    const s = u * u * (3 - 2 * u);
    return knots[k] * (1 - s) + knots[k + 1] * s;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/* ================= the sky ================= */

export function renderSky(biome: Biome, seed: number, scale: number): HTMLCanvasElement {
  const paint = BIOME[biome];
  const c = canvas(W * scale, H * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  const rng = seeded(seed ^ 0x51ed);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  paint.sky.forEach((col, i) => g.addColorStop(i / (paint.sky.length - 1), col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // stars wherever the sky is dark enough
  if (biome !== "mesa") {
    const n = biome === "lunar" ? 420 : biome === "tundra" ? 220 : 40;
    for (let i = 0; i < n; i++) {
      const x = rng() * W;
      const y = Math.pow(rng(), 1.6) * H * (biome === "lunar" ? 0.95 : 0.6);
      const r = rng() < 0.08 ? 1.3 : 0.6 + rng() * 0.5;
      ctx.globalAlpha = 0.3 + rng() * 0.7;
      ctx.fillStyle = rng() < 0.15 ? "#ffe2c4" : rng() < 0.2 ? "#c4dcff" : "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (biome === "mesa") {
    // a low, swollen sun with a few violet streaks drawn across it
    const sx = W * (0.62 + rng() * 0.2);
    const sy = H * 0.5;
    ctx.drawImage(soft("#ffb36b"), sx - 260, sy - 260, 520, 520);
    const sg = ctx.createLinearGradient(0, sy - 64, 0, sy + 64);
    sg.addColorStop(0, "#fff3c4");
    sg.addColorStop(1, "#ff8a4a");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, 64, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const y = H * (0.18 + rng() * 0.32);
      const x = rng() * W;
      const w = 160 + rng() * 320;
      ctx.fillStyle = withAlpha("#5a2a5e", 0.35 + rng() * 0.3);
      ctx.beginPath();
      ctx.ellipse(x, y, w, 2.2 + rng() * 3, 0, 0, TAU);
      ctx.fill();
    }
  }

  if (biome === "tundra") {
    // a thin moon
    const mx = W * (0.15 + rng() * 0.2);
    const my = H * 0.18;
    ctx.drawImage(soft("rgba(200,225,255,0.5)"), mx - 70, my - 70, 140, 140);
    ctx.fillStyle = "#eef6ff";
    ctx.beginPath();
    ctx.arc(mx, my, 18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = paint.sky[1];
    ctx.beginPath();
    ctx.arc(mx + 7, my - 4, 16, 0, TAU);
    ctx.fill();
  }

  if (biome === "ashlands") {
    // the glow of something erupting beyond the horizon
    ctx.drawImage(soft("rgba(255,90,30,0.55)"), W * 0.2, H * 0.35, W * 0.6, H * 0.55);
    const vx = W * (0.25 + rng() * 0.5);
    ctx.fillStyle = "#170707";
    ctx.beginPath();
    ctx.moveTo(vx - 240, H * 0.72);
    ctx.lineTo(vx - 34, H * 0.42);
    ctx.lineTo(vx + 30, H * 0.42);
    ctx.lineTo(vx + 250, H * 0.72);
    ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(soft("rgba(255,120,40,0.8)"), vx - 60, H * 0.36, 120, 70);
    ctx.globalCompositeOperation = "source-over";
    // a smoke plume leaning away
    for (let i = 0; i < 26; i++) {
      const u = i / 26;
      ctx.globalAlpha = 0.5 * (1 - u);
      ctx.fillStyle = "#1a0a09";
      ctx.beginPath();
      ctx.arc(vx + u * 260 + Math.sin(u * 8) * 14, H * 0.4 - u * 240, 20 + u * 70, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (biome === "lunar") {
    // the Earth, hanging there
    const ex = W * (0.7 + rng() * 0.15);
    const ey = H * 0.2;
    const er = 34;
    ctx.drawImage(soft("rgba(110,170,255,0.45)"), ex - 90, ey - 90, 180, 180);
    const eg = ctx.createRadialGradient(ex - 10, ey - 10, 4, ex, ey, er);
    eg.addColorStop(0, "#7fb6ff");
    eg.addColorStop(1, "#1d4f9e");
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, TAU);
    ctx.clip();
    ctx.fillStyle = "#4f9a52";
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.ellipse(ex - er + rng() * er * 2, ey - er + rng() * er * 2, 6 + rng() * 10, 4 + rng() * 7, rng() * 3, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(ex - er + rng() * er * 2, ey - er + rng() * er * 2, 8 + rng() * 12, 1.5 + rng() * 2, rng() * 0.5, 0, TAU);
      ctx.fill();
    }
    // night side
    ctx.fillStyle = "rgba(0,0,8,0.72)";
    ctx.beginPath();
    ctx.arc(ex + 16, ey + 8, er + 4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // two ranges of far hills, the back one hazier
  const shapes: Record<Biome, (u: number, i: number, layer: number) => number> = {
    mesa: (u, _i, layer) => {
      const q = Math.round(u * 4) / 4;
      return q * (layer ? 0.75 : 1);
    },
    tundra: (u) => Math.pow(u, 1.4),
    ashlands: (u) => u,
    lunar: (u) => Math.pow(u, 2),
  };
  for (let layer = 0; layer < 2; layer++) {
    const nBig = noise1(rng, layer ? 90 : 150, W);
    const nFine = noise1(rng, layer ? 12 : 20, W);
    const base = H * (layer ? 0.66 : 0.6);
    const amp = layer ? 120 : 170;
    const pts: [number, number][] = [];
    for (let x = 0; x <= W; x += 4) {
      const u = nBig(x) * 0.8 + nFine(x) * 0.2;
      pts.push([x, base - shapes[biome](u, x, layer) * amp]);
    }
    ctx.fillStyle = paint.hills[layer];
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(W, H);
    ctx.fill();
    if (biome === "tundra") {
      // snow on the crests
      ctx.strokeStyle = withAlpha("#dce9ff", layer ? 0.35 : 0.22);
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    // haze between the ranges
    const hz = ctx.createLinearGradient(0, base - amp, 0, H);
    hz.addColorStop(0, withAlpha(paint.sky[paint.sky.length - 1], 0));
    hz.addColorStop(1, withAlpha(paint.sky[paint.sky.length - 1], layer ? 0.35 : 0.5));
    ctx.fillStyle = hz;
    ctx.fillRect(0, base - amp, W, H - base + amp);
  }
  return c;
}

/* ================= the rock ================= */

export function renderRock(biome: Biome, seed: number, scale: number): HTMLCanvasElement {
  const paint = BIOME[biome];
  const c = canvas(W * scale, H * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  const rng = seeded(seed ^ 0x7a11);

  // strata: bands of rock at fixed heights with wavy, sheared boundaries
  ctx.fillStyle = paint.strata[paint.strata.length - 1];
  ctx.fillRect(0, 0, W, H);
  let top = H;
  let band = 0;
  while (top > -20) {
    const thick = 22 + rng() * 46;
    const wave = noise1(rng, 60 + rng() * 80, W);
    const tilt = (rng() - 0.5) * 30;
    const color = paint.strata[Math.min(paint.strata.length - 1, Math.floor((band / 12) * paint.strata.length))];
    const shade = rng() < 0.4 ? (rng() < 0.5 ? 0.06 : -0.06) : 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H + 10);
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, Y(top) + (wave(x) - 0.5) * 22 + (x / W - 0.5) * tilt);
    ctx.lineTo(W, H + 10);
    ctx.fill();
    if (shade) {
      ctx.fillStyle = shade > 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
      ctx.fill();
    }
    // a fine sediment line on top of the band
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const y = Y(top) + (wave(x) - 0.5) * 22 + (x / W - 0.5) * tilt;
      if (x) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    top -= thick;
    band++;
  }

  // flecks and grit
  for (let i = 0; i < 9000; i++) {
    const x = rng() * W;
    const y = rng() * H;
    ctx.globalAlpha = 0.05 + rng() * 0.12;
    ctx.fillStyle = rng() < 0.5 ? "#000" : paint.fleck;
    ctx.fillRect(x, y, 0.6 + rng() * 1.2, 0.6 + rng() * 1.2);
  }
  ctx.globalAlpha = 1;

  // pebbles with a little highlight
  for (let i = 0; i < 420; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const r = 1 + rng() * 3.4;
    ctx.fillStyle = withAlpha(paint.strata[Math.floor(rng() * paint.strata.length)], 0.9);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.3, r, rng() * 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.35, r * 0.5, r * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.2, y + r * 0.6, r * 1.1, r * 0.35, 0, 0, TAU);
    ctx.fill();
  }

  if (biome === "ashlands") {
    // magma veins
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 46; i++) {
      let x = rng() * W;
      let y = rng() * H;
      ctx.strokeStyle = withAlpha(rng() < 0.5 ? "#ff6a1a" : "#ffa13a", 0.25 + rng() * 0.35);
      ctx.lineWidth = 0.6 + rng() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (rng() - 0.5) * 40;
        y += (rng() - 0.3) * 18;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  if (biome === "tundra") {
    // ice veins
    for (let i = 0; i < 60; i++) {
      let x = rng() * W;
      let y = rng() * H;
      ctx.strokeStyle = withAlpha("#e8f4ff", 0.12 + rng() * 0.2);
      ctx.lineWidth = 0.6 + rng();
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rng() - 0.5) * 50;
        y += (rng() - 0.5) * 12;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  if (biome === "lunar") {
    // little craters pocking the regolith
    for (let i = 0; i < 160; i++) {
      const x = rng() * W;
      const y = rng() * H;
      const r = 2 + rng() * 9;
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(x, y + 0.6, r, r * 0.55, 0, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
  }

  // depth: the deeper, the darker
  const dg = ctx.createLinearGradient(0, 0, 0, H);
  dg.addColorStop(0, "rgba(0,0,0,0)");
  dg.addColorStop(0.55, "rgba(0,0,0,0.12)");
  dg.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = dg;
  ctx.fillRect(0, 0, W, H);
  return c;
}

/* ================= tanks ================= */

export interface TankLook {
  x: number;
  y: number;
  tilt: number;
  /** barrel, degrees */
  angle: number;
  recoil: number;
  flash: number;
  color: TankColor;
  wheel: number;
  alpha: number;
  wind: number;
  /** blink: 0 normal, →1 dissolving */
  warp: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

export function drawTank(ctx: CanvasRenderingContext2D, t: TankLook, time: number) {
  const P = TANK[t.color];
  ctx.save();
  ctx.globalAlpha = t.alpha * (1 - t.warp);
  ctx.translate(t.x, Y(t.y));
  if (t.warp > 0) ctx.scale(1 - t.warp * 0.6, 1 + t.warp * 1.4);

  // contact shadow
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath();
  ctx.ellipse(0, 0.8, 19, 3, 0, 0, TAU);
  ctx.fill();

  // barrel — world angle, unaffected by the hull's tilt
  ctx.save();
  ctx.translate(0, -15);
  ctx.rotate((-t.angle * Math.PI) / 180);
  const rec = t.recoil * 5;
  const bg = ctx.createLinearGradient(0, -2, 0, 2);
  bg.addColorStop(0, "#9aa093");
  bg.addColorStop(0.45, "#4e534a");
  bg.addColorStop(1, "#23261f");
  ctx.fillStyle = bg;
  ctx.fillRect(2 - rec, -1.8, 17, 3.6);
  ctx.fillStyle = "#1d1f1a";
  ctx.fillRect(16.5 - rec, -2.7, 4.5, 5.4);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(16.5 - rec, -2.7, 4.5, 1);
  ctx.fillStyle = withAlpha(P.base, 0.9);
  ctx.fillRect(7 - rec, -1.9, 2.2, 3.8);
  ctx.restore();

  ctx.rotate(-t.tilt);

  // treads
  roundRect(ctx, -16.5, -8.5, 33, 8.5, 4.2);
  ctx.fillStyle = "#1b1d18";
  ctx.fill();
  ctx.strokeStyle = "#0a0b08";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = "#3b3f36";
  for (let i = 0; i < 12; i++) {
    const px = -14 + ((((i * 2.6 + t.wheel * 2.7) % 28) + 28) % 28);
    ctx.fillRect(px, -8.6, 1.2, 1);
    ctx.fillRect(-px - 0.6, -0.9, 1.2, 0.9);
  }
  // road wheels
  for (const wx of [-11.6, -5.8, 0, 5.8, 11.6]) {
    ctx.fillStyle = "#5c6056";
    ctx.beginPath();
    ctx.arc(wx, -4.2, 2.9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#2b2e27";
    ctx.beginPath();
    ctx.arc(wx, -4.2, 1.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#8c9086";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    const a = t.wheel;
    ctx.moveTo(wx + Math.cos(a) * 2.6, -4.2 + Math.sin(a) * 2.6);
    ctx.lineTo(wx - Math.cos(a) * 2.6, -4.2 - Math.sin(a) * 2.6);
    ctx.stroke();
  }

  // skirt
  ctx.fillStyle = P.deep;
  ctx.fillRect(-17, -10.2, 34, 2.4);
  ctx.fillStyle = withAlpha(P.light, 0.35);
  ctx.fillRect(-17, -10.2, 34, 0.7);

  // hull
  ctx.beginPath();
  ctx.moveTo(-15, -10);
  ctx.lineTo(15, -10);
  ctx.lineTo(12, -14.6);
  ctx.lineTo(-12.8, -14.6);
  ctx.closePath();
  const hg = ctx.createLinearGradient(0, -14.6, 0, -10);
  hg.addColorStop(0, P.light);
  hg.addColorStop(0.35, P.base);
  hg.addColorStop(1, P.deep);
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = withAlpha(P.deep, 0.9);
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // stencilled star + rivets
  ctx.fillStyle = withAlpha("#f3ecd6", 0.85);
  star(ctx, -7.5, -12.2, 1.8);
  ctx.fill();
  ctx.fillStyle = withAlpha(P.deep, 0.9);
  for (const rx of [5, 8, 11]) {
    ctx.beginPath();
    ctx.arc(rx, -11.6, 0.5, 0, TAU);
    ctx.fill();
  }

  // turret
  const tg = ctx.createRadialGradient(-2, -19, 1, 1, -15, 9);
  tg.addColorStop(0, P.light);
  tg.addColorStop(0.5, P.base);
  tg.addColorStop(1, P.deep);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.ellipse(1, -14.6, 7.8, 7, 0, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withAlpha(P.deep, 0.9);
  ctx.stroke();
  // hatch + periscope
  ctx.fillStyle = P.deep;
  ctx.beginPath();
  ctx.ellipse(2.5, -21, 3, 1.1, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#1d1f1a";
  ctx.fillRect(-2.6, -22.8, 1.6, 2.6);
  ctx.fillStyle = "rgba(160,220,255,0.8)";
  ctx.fillRect(-2.6, -22.8, 1.6, 0.8);

  // antenna + pennant, streaming with the wind
  ctx.strokeStyle = "#191a16";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-5, -18);
  ctx.lineTo(-6.5, -33);
  ctx.stroke();
  const stream = Math.max(-1, Math.min(1, t.wind / 12 || 0.3));
  const flap = Math.sin(time * (6 + Math.abs(t.wind) * 0.4)) * 1.6;
  ctx.fillStyle = P.base;
  ctx.beginPath();
  ctx.moveTo(-6.5, -33);
  ctx.quadraticCurveTo(-6.5 + stream * 4, -32 + flap, -6.5 + stream * 8.5, -31.2 + flap * 0.6);
  ctx.lineTo(-6.4, -29.4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  if (t.flash > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = t.flash * 0.9;
    ctx.drawImage(soft("#ffffff"), t.x - 26, Y(t.y + 12) - 26, 52, 52);
    ctx.restore();
  }
}

/* ================= projectiles ================= */

/** Trail looks: colour, width, how many ticks long, whether it glows. */
export const TRAIL: Partial<Record<TrackStyle, { c: string; w: number; len: number; glow?: boolean }>> = {
  shell: { c: "rgba(235,228,210,0.5)", w: 1.6, len: 14 },
  heavy: { c: "rgba(225,218,200,0.55)", w: 2.6, len: 18 },
  sun: { c: "#ffcf5a", w: 5, len: 22, glow: true },
  bomblet: { c: "rgba(255,170,120,0.45)", w: 1.2, len: 8 },
  hydra: { c: "#4dff9a", w: 2.6, len: 18, glow: true },
  pinball: { c: "#b8e8ff", w: 2, len: 14, glow: true },
  drill: { c: "rgba(200,170,130,0.5)", w: 1.6, len: 10 },
  napalm: { c: "#ff7a1a", w: 2.6, len: 14, glow: true },
  acid: { c: "#9bff3a", w: 2, len: 14, glow: true },
  raindrop: { c: "#b4ff5a", w: 1.1, len: 5, glow: true },
  thunder: { c: "#9cc4ff", w: 2.4, len: 16, glow: true },
  flare: { c: "#ff4d4d", w: 2, len: 20, glow: true },
  bomb: { c: "rgba(220,220,210,0.3)", w: 1, len: 6 },
  summon: { c: "#c08aff", w: 2.4, len: 18, glow: true },
  meteor: { c: "#ff8a2a", w: 5, len: 16, glow: true },
  beacon: { c: "#6fd3ff", w: 1.8, len: 18, glow: true },
  void: { c: "#a35bff", w: 3, len: 16, glow: true },
  tremor: { c: "rgba(210,190,150,0.5)", w: 2.4, len: 14 },
  volcano: { c: "#ff5a2a", w: 3, len: 16, glow: true },
  lava: { c: "#ff7a1a", w: 2.6, len: 12, glow: true },
  mud: { c: "rgba(160,120,80,0.45)", w: 2.4, len: 10 },
  rampart: { c: "rgba(190,180,160,0.4)", w: 2.4, len: 10 },
  blink: { c: "#59fff0", w: 2.4, len: 22, glow: true },
  seeker: { c: "rgba(235,235,235,0.55)", w: 2.4, len: 30 },
  boomerang: { c: "rgba(255,210,120,0.4)", w: 1.4, len: 12 },
  saw: { c: "rgba(220,225,235,0.35)", w: 1.4, len: 8 },
  rocket: { c: "#ffd27a", w: 1.6, len: 16, glow: true },
  star0: { c: "#ff6bd6", w: 1.8, len: 16, glow: true },
  star1: { c: "#62f0ff", w: 1.8, len: 16, glow: true },
  star2: { c: "#ffd34d", w: 1.8, len: 16, glow: true },
  star3: { c: "#8cff6b", w: 1.8, len: 16, glow: true },
  tracer: { c: "#ffe066", w: 1.6, len: 6, glow: true },
  piston: { c: "rgba(200,200,200,0.4)", w: 1.8, len: 10 },
  seed: { c: "rgba(200,215,230,0.45)", w: 2, len: 14 },
};

export function drawTrail(ctx: CanvasRenderingContext2D, style: TrackStyle, pts: [number, number][]) {
  const tr = TRAIL[style];
  if (!tr || pts.length < 2) return;
  if (tr.glow) ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < pts.length; i++) {
    const u = i / (pts.length - 1);
    ctx.globalAlpha = u * u * (tr.glow ? 0.85 : 0.7);
    ctx.strokeStyle = tr.c;
    ctx.lineWidth = tr.w * (0.3 + 0.7 * u);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], Y(pts[i - 1][1]));
    ctx.lineTo(pts[i][0], Y(pts[i][1]));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 1) {
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a;
  ctx.drawImage(soft(color), x - r, Y(y) - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function capsule(ctx: CanvasRenderingContext2D, len: number, w: number, body: string, tip: string) {
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-len / 2, -w / 2);
  ctx.lineTo(len / 2 - w * 0.6, -w / 2);
  ctx.quadraticCurveTo(len / 2 + w * 0.4, 0, len / 2 - w * 0.6, w / 2);
  ctx.lineTo(-len / 2, w / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tip;
  ctx.fillRect(-len / 2, -w / 2, len * 0.16, w);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(-len / 2, -w / 2, len * 0.9, w * 0.25);
}

/**
 * Draw a projectile's head. `vx, vy` give its heading; `age` is ticks since
 * launch (for spin); `grounded` means it is rolling, grinding or flowing.
 */
export function drawHead(ctx: CanvasRenderingContext2D, style: TrackStyle, x: number, y: number, vx: number, vy: number, age: number, time: number, grounded: boolean) {
  const heading = Math.atan2(-vy, vx); // canvas angle
  const sy = Y(y);
  ctx.save();
  switch (style) {
    case "shell":
    case "heavy":
    case "tremor": {
      const big = style === "heavy" ? 1.35 : style === "tremor" ? 1.5 : 1;
      ctx.translate(x, sy);
      ctx.rotate(heading);
      capsule(ctx, 8 * big, 3.4 * big, style === "tremor" ? "#6b5a3e" : "#4a4a40", "#c9a24a");
      if (style === "tremor") {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        for (let i = -1; i <= 1; i++) ctx.fillRect(i * 2.2, -2.6, 0.8, 5.2);
      }
      break;
    }
    case "sun": {
      const p = 1 + Math.sin(time * 14) * 0.12;
      glow(ctx, x, y, 26 * p, "#ffb43a", 0.9);
      glow(ctx, x, y, 12 * p, "#fff4c4", 1);
      ctx.translate(x, sy);
      ctx.rotate(time * 2);
      ctx.strokeStyle = "rgba(255,240,180,0.7)";
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 6; i++) {
        ctx.rotate(TAU / 6);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(13 * p, 0);
        ctx.stroke();
      }
      break;
    }
    case "bomblet": {
      ctx.fillStyle = "#2d2d28";
      ctx.beginPath();
      ctx.arc(x, sy, 2.8, 0, TAU);
      ctx.fill();
      if (Math.floor(time * 8) % 2) glow(ctx, x, y + 1.6, 4, "#ff3b3b", 1);
      break;
    }
    case "hydra": {
      glow(ctx, x, y, 9, "#3dff8a", 0.8);
      ctx.translate(x, sy);
      ctx.rotate(heading);
      capsule(ctx, 8, 3.6, "#1f5a37", "#4dff9a");
      ctx.fillStyle = "#e9ffef";
      ctx.fillRect(1.5, -1.2, 1, 0.8);
      ctx.fillRect(1.5, 0.4, 1, 0.8);
      break;
    }
    case "roller": {
      ctx.translate(x, sy);
      ctx.rotate(x / 5);
      const rg = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, 5.5);
      rg.addColorStop(0, "#f2efe6");
      rg.addColorStop(1, "#77736a");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, 5.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 5.2, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 5.2, Math.PI - 0.6, Math.PI + 0.6);
      ctx.stroke();
      break;
    }
    case "pinball": {
      glow(ctx, x, y, 10, "#9ad8ff", 0.5);
      const pg = ctx.createRadialGradient(x - 1.4, sy - 1.6, 0.4, x, sy, 4.6);
      pg.addColorStop(0, "#ffffff");
      pg.addColorStop(0.5, "#b8c4d4");
      pg.addColorStop(1, "#4a5566");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(x, sy, 4.4, 0, TAU);
      ctx.fill();
      break;
    }
    case "drill": {
      ctx.translate(x, sy);
      ctx.rotate(heading);
      ctx.fillStyle = "#6e7378";
      ctx.fillRect(-7, -2.6, 6, 5.2);
      const dg = ctx.createLinearGradient(0, -3, 0, 3);
      dg.addColorStop(0, "#e6e9ec");
      dg.addColorStop(1, "#5d6368");
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.moveTo(-1, -3);
      ctx.lineTo(7, 0);
      ctx.lineTo(-1, 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 0.5;
      const spin = (age * 0.9) % 2;
      for (let i = 0; i < 4; i++) {
        const sx2 = -1 + ((i * 2 + spin) % 8);
        ctx.beginPath();
        ctx.moveTo(sx2, -3 + sx2 * 0.37);
        ctx.lineTo(sx2 + 1.4, 3 - (sx2 + 1.4) * 0.37);
        ctx.stroke();
      }
      ctx.fillStyle = "#e0b040";
      ctx.fillRect(-7, -2.6, 1.2, 5.2);
      break;
    }
    case "napalm": {
      glow(ctx, x, y, 10, "#ff7a1a", 0.7);
      ctx.translate(x, sy);
      ctx.rotate(heading);
      capsule(ctx, 9, 4, "#7a2a10", "#ffb03a");
      ctx.fillStyle = "#1a1a14";
      ctx.fillRect(-1, -2, 1.4, 4);
      break;
    }
    case "flame": {
      const f = 0.75 + 0.25 * Math.sin(time * 26 + x);
      glow(ctx, x, y + 2, 9 * f, "#ff6a1a", 0.9);
      glow(ctx, x, y + 3.5, 4.5 * f, "#ffe08a", 1);
      ctx.fillStyle = "rgba(255,210,120,0.85)";
      ctx.beginPath();
      ctx.moveTo(x - 2.2, sy);
      ctx.quadraticCurveTo(x - 1, sy - 6 * f, x + Math.sin(time * 18 + x) * 1.4, sy - 9 * f);
      ctx.quadraticCurveTo(x + 1, sy - 5 * f, x + 2.2, sy);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "acid": {
      glow(ctx, x, y, 9, "#8cff2a", 0.7);
      ctx.translate(x, sy);
      ctx.rotate(heading);
      capsule(ctx, 8, 3.8, "#3a5a12", "#c6ff5a");
      ctx.fillStyle = "#c6ff5a";
      ctx.beginPath();
      ctx.arc(0, 0, 0.9, 0, TAU);
      ctx.fill();
      break;
    }
    case "acidcloud": {
      for (let i = 0; i < 9; i++) {
        const ox = Math.sin(i * 2.1 + time * 0.8) * 34 + (i - 4) * 9;
        const oy = Math.cos(i * 1.7 + time * 0.6) * 7;
        const r = 24 + (i % 3) * 7;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(soft(i % 2 ? "#3d5a1c" : "#557a26"), x + ox - r, sy + oy - r * 0.7, r * 2, r * 1.4);
      }
      ctx.globalAlpha = 1;
      glow(ctx, x, y - 6, 30, "#8cff2a", 0.18 + 0.08 * Math.sin(time * 9));
      break;
    }
    case "raindrop": {
      ctx.strokeStyle = "#c6ff6a";
      ctx.lineWidth = 1.3;
      ctx.lineCap = "round";
      const l = Math.hypot(vx, vy) || 1;
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.lineTo(x - (vx / l) * 6, sy + (vy / l) * 6);
      ctx.stroke();
      break;
    }
    case "thunder": {
      glow(ctx, x, y, 14, "#7fb0ff", 0.7);
      glow(ctx, x, y, 5, "#ffffff", 1);
      ctx.strokeStyle = "rgba(220,235,255,0.9)";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU;
        ctx.beginPath();
        ctx.moveTo(x, sy);
        ctx.lineTo(x + Math.cos(a) * 5 + (Math.random() - 0.5) * 3, sy + Math.sin(a) * 5);
        ctx.lineTo(x + Math.cos(a) * 10, sy + Math.sin(a) * 10);
        ctx.stroke();
      }
      break;
    }
    case "flare":
    case "beacon":
    case "summon": {
      const col = style === "flare" ? "#ff3b3b" : style === "beacon" ? "#6fd3ff" : "#c08aff";
      const blink = style === "beacon" ? (Math.floor(time * 10) % 2 ? 1 : 0.4) : 1;
      glow(ctx, x, y, 12 * blink, col, 0.9);
      glow(ctx, x, y, 4, "#ffffff", blink);
      if (style === "summon") {
        ctx.strokeStyle = withAlpha("#e0c8ff", 0.8);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(x, sy, 7, 2.6, time * 4, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case "bomb": {
      ctx.translate(x, sy);
      ctx.rotate(heading);
      ctx.fillStyle = "#3e4530";
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.4, 2.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#2b3022";
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-7.5, -2.8);
      ctx.lineTo(-7.5, 2.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#c9a24a";
      ctx.fillRect(1.6, -2.2, 0.9, 4.4);
      break;
    }
    case "meteor": {
      glow(ctx, x, y, 18, "#ff6a1a", 0.8);
      ctx.translate(x, sy);
      ctx.rotate(age * 0.2);
      ctx.fillStyle = "#4a3a32";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const r = 5 + hash01(i, 77) * 2.2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,150,60,0.6)";
      ctx.beginPath();
      ctx.arc(-1.4, -1, 1.6, 0, TAU);
      ctx.fill();
      break;
    }
    case "void": {
      glow(ctx, x, y, 16, "#8a3bff", 0.8);
      ctx.fillStyle = "#06020c";
      ctx.beginPath();
      ctx.arc(x, sy, 4.6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#d6b4ff";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(x, sy, 8.5, 2.8, time * 3, 0, TAU);
      ctx.stroke();
      break;
    }
    case "volcano":
    case "lava": {
      const big = style === "volcano" ? 1.2 : 1;
      glow(ctx, x, y, 11 * big, "#ff5a1a", 0.8);
      ctx.fillStyle = "#ffb347";
      ctx.beginPath();
      ctx.arc(x, sy, 3.6 * big, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(60,20,10,0.7)";
      ctx.beginPath();
      ctx.arc(x + 1, sy - 0.8, 1.3 * big, 0, TAU);
      ctx.arc(x - 1.4, sy + 1.2, 0.9 * big, 0, TAU);
      ctx.fill();
      break;
    }
    case "mud": {
      ctx.translate(x, sy);
      ctx.rotate(age * 0.15);
      ctx.fillStyle = "#7a5638";
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const r = 6 + hash01(i, 13) * 1.8;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#4e3622";
      ctx.beginPath();
      ctx.arc(1.8, 1.4, 1.6, 0, TAU);
      ctx.arc(-2.4, -1, 1.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,240,220,0.2)";
      ctx.beginPath();
      ctx.arc(-1.6, -2.4, 2, 0, TAU);
      ctx.fill();
      break;
    }
    case "rampart": {
      ctx.translate(x, sy);
      ctx.rotate(age * 0.12);
      ctx.fillStyle = "#8f8574";
      ctx.fillRect(-5, -4, 10, 8);
      ctx.strokeStyle = "#5e5649";
      ctx.lineWidth = 0.7;
      ctx.strokeRect(-5, -4, 10, 8);
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(5, 0);
      ctx.moveTo(0, -4);
      ctx.lineTo(0, 0);
      ctx.moveTo(-2.5, 0);
      ctx.lineTo(-2.5, 4);
      ctx.stroke();
      break;
    }
    case "blink": {
      glow(ctx, x, y, 14, "#59fff0", 0.75);
      ctx.translate(x, sy);
      ctx.rotate(time * 5);
      ctx.fillStyle = "#e6fffd";
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(3.4, 0);
      ctx.lineTo(0, 5);
      ctx.lineTo(-3.4, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "seeker": {
      ctx.translate(x, sy);
      ctx.rotate(heading);
      // exhaust
      const f = 0.7 + Math.random() * 0.5;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(soft("#ff8a2a"), -16 * f, -5, 12 * f, 10);
      ctx.drawImage(soft("#fff0b0"), -9, -2.5, 6, 5);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#e8e6df";
      ctx.fillRect(-6, -1.8, 10, 3.6);
      ctx.fillStyle = "#d33a2c";
      ctx.beginPath();
      ctx.moveTo(4, -1.8);
      ctx.lineTo(8, 0);
      ctx.lineTo(4, 1.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#555";
      ctx.beginPath();
      ctx.moveTo(-6, -1.8);
      ctx.lineTo(-8, -4);
      ctx.lineTo(-4, -1.8);
      ctx.moveTo(-6, 1.8);
      ctx.lineTo(-8, 4);
      ctx.lineTo(-4, 1.8);
      ctx.fill();
      break;
    }
    case "boomerang": {
      ctx.translate(x, sy);
      ctx.rotate(age * 0.55);
      ctx.strokeStyle = "#c98a3a";
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-6, 4);
      ctx.quadraticCurveTo(0, -3, 6, 4);
      ctx.stroke();
      ctx.strokeStyle = "#f2d38a";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      break;
    }
    case "saw": {
      ctx.translate(x, sy);
      ctx.rotate(age * (grounded ? 1.6 : 0.6));
      ctx.fillStyle = "#c9ced6";
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        const r = i % 2 ? 6 : 7.6;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7c838d";
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#e8b23a";
      ctx.beginPath();
      ctx.arc(0, 0, 1.3, 0, TAU);
      ctx.fill();
      break;
    }
    case "rocket": {
      glow(ctx, x, y, 6, "#ffd27a", 0.8);
      ctx.translate(x, sy);
      ctx.rotate(heading);
      ctx.fillStyle = "#d8344a";
      ctx.fillRect(-5, -1.6, 8, 3.2);
      ctx.fillStyle = "#f6e7c8";
      ctx.beginPath();
      ctx.moveTo(3, -1.6);
      ctx.lineTo(6, 0);
      ctx.lineTo(3, 1.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#a07a3a";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-13, 0);
      ctx.stroke();
      break;
    }
    case "star0":
    case "star1":
    case "star2":
    case "star3": {
      const col = TRAIL[style]!.c;
      glow(ctx, x, y, 7 + Math.sin(time * 30 + x) * 1.5, col, 0.95);
      glow(ctx, x, y, 2.6, "#ffffff", 1);
      break;
    }
    case "tracer": {
      ctx.translate(x, sy);
      ctx.rotate(heading);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "#fff3a0";
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(2, 0);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      break;
    }
    case "piston": {
      ctx.translate(x, sy);
      const squash = grounded ? 1 : 1;
      ctx.scale(1, squash);
      ctx.fillStyle = "#7d858e";
      ctx.fillRect(-3.2, -9, 6.4, 13);
      ctx.fillStyle = "#e8b23a";
      ctx.fillRect(-3.2, -6, 6.4, 3);
      ctx.fillStyle = "#1a1a14";
      for (let i = 0; i < 3; i++) ctx.fillRect(-3.2 + i * 2.4, -6, 1.1, 3);
      ctx.fillStyle = "#3b4047";
      ctx.beginPath();
      ctx.moveTo(-3.2, 4);
      ctx.lineTo(0, 7.5);
      ctx.lineTo(3.2, 4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "seed": {
      glow(ctx, x, y, 9, "#bcd4e6", 0.4);
      ctx.translate(x, sy);
      ctx.rotate(-age * 0.4);
      ctx.strokeStyle = "#dfeaf3";
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 3; i++) {
        ctx.rotate(TAU / 3);
        ctx.beginPath();
        ctx.arc(2.4, 0, 3, Math.PI, TAU);
        ctx.stroke();
      }
      break;
    }
    case "twister":
      ctx.restore();
      drawTwister(ctx, x, y, time, age);
      return;
  }
  ctx.restore();
}

export function drawTwister(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, age: number) {
  const grow = Math.min(1, age / 20);
  const n = 16;
  // dust skirt
  ctx.globalAlpha = 0.5 * grow;
  ctx.drawImage(soft("#b9a88a"), x - 34, Y(y + 10) - 16, 68, 26);
  for (let i = n - 1; i >= 0; i--) {
    const u = i / n;
    const h = u * 120 * grow;
    const w = (5 + u * u * 40 + u * 6) * grow;
    const off = Math.sin(time * 3 + i * 0.45) * u * 10;
    ctx.globalAlpha = 0.18 + 0.22 * (1 - u);
    ctx.strokeStyle = i % 3 === 0 ? "#e8f0f7" : "#9fb4c6";
    ctx.lineWidth = 1.2 + u * 1.6;
    ctx.beginPath();
    ctx.ellipse(x + off, Y(y + h), w, w * 0.22, 0, (time * 9 + i) % TAU, ((time * 9 + i) % TAU) + Math.PI * 1.4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ================= set pieces ================= */

/** A jagged bolt from a seed, with a couple of forks. */
export function boltPath(x1: number, y1: number, x2: number, y2: number, seed: number, flick: number): [number, number][][] {
  const main: [number, number][] = [[x1, y1]];
  const n = 14;
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const j = (hash01(seed + flick * 31, i) - 0.5) * 34 * Math.sin(u * Math.PI);
    main.push([x1 + (x2 - x1) * u + j, y1 + (y2 - y1) * u]);
  }
  main.push([x2, y2]);
  const paths = [main];
  for (let b = 0; b < 2; b++) {
    const at = 3 + Math.floor(hash01(seed, b + 40) * 7);
    const [bx, by] = main[at];
    const fork: [number, number][] = [[bx, by]];
    const dir = hash01(seed, b + 50) < 0.5 ? -1 : 1;
    for (let k = 1; k <= 4; k++) fork.push([bx + dir * k * 9 + (hash01(seed + flick, b * 9 + k) - 0.5) * 10, by - k * 14]);
    paths.push(fork);
  }
  return paths;
}

export function drawBolt(ctx: CanvasRenderingContext2D, paths: [number, number][][], a: number) {
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [w, col, al] of [
    [9, "#4a7dff", 0.25],
    [3.5, "#9cc4ff", 0.7],
    [1.4, "#ffffff", 1],
  ] as [number, string, number][]) {
    ctx.strokeStyle = col;
    paths.forEach((p, i) => {
      ctx.globalAlpha = a * al * (i ? 0.6 : 1);
      ctx.lineWidth = i ? w * 0.5 : w;
      ctx.beginPath();
      p.forEach(([x, y], k) => (k ? ctx.lineTo(x, Y(y)) : ctx.moveTo(x, Y(y))));
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** A beam as a polyline, revealed up to `reveal` units along it. */
export function drawBeam(ctx: CanvasRenderingContext2D, pts: number[], kind: "lance" | "prism" | "orbital", reveal: number, a: number, time: number) {
  const segs: [number, number, number, number][] = [];
  let left = reveal;
  for (let i = 0; i + 3 < pts.length && left > 0; i += 2) {
    const [x1, y1, x2, y2] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
    const l = Math.hypot(x2 - x1, y2 - y1);
    const u = Math.min(1, left / (l || 1));
    segs.push([x1, y1, x1 + (x2 - x1) * u, y1 + (y2 - y1) * u]);
    left -= l;
  }
  const flick = 0.85 + Math.sin(time * 60) * 0.15;
  const layers: [number, string, number][] =
    kind === "lance"
      ? [[16, "#ff2a4a", 0.22], [7, "#ff6a7a", 0.55], [2.4, "#fff2f2", 1]]
      : kind === "prism"
        ? [[14, "#2ad4ff", 0.22], [6, "#8af4ff", 0.55], [2, "#ffffff", 1]]
        : [[60, "#3aa0ff", 0.18], [30, "#8fd6ff", 0.45], [12, "#ffffff", 0.95]];
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const [w, col, al] of layers) {
    ctx.globalAlpha = a * al * flick;
    ctx.strokeStyle = col;
    ctx.lineWidth = w * (kind === "orbital" ? 0.6 + 0.4 * a : 1);
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of segs) {
      ctx.moveTo(x1, Y(y1));
      ctx.lineTo(x2, Y(y2));
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** The bomber: olive, twin props, a roundel in the caller's colour. */
export function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, roundel: string, time: number) {
  ctx.save();
  ctx.translate(x, Y(y));
  ctx.scale(dir * 1.45, 1.45);
  // contrail
  ctx.globalAlpha = 0.3;
  ctx.drawImage(soft("#ffffff"), -110, -4, 80, 8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#3f4630";
  // fuselage
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 5.2, 0, 0, TAU);
  ctx.fill();
  // tail
  ctx.beginPath();
  ctx.moveTo(-24, -1);
  ctx.lineTo(-33, -12);
  ctx.lineTo(-27, -12);
  ctx.lineTo(-18, -2);
  ctx.fill();
  // wing (foreshortened)
  ctx.fillStyle = "#4d5539";
  ctx.beginPath();
  ctx.moveTo(-6, 1);
  ctx.lineTo(8, 1);
  ctx.lineTo(2, 9);
  ctx.lineTo(-10, 9);
  ctx.closePath();
  ctx.fill();
  // engines + props
  for (const ex of [-1, 7]) {
    ctx.fillStyle = "#2f3524";
    ctx.fillRect(ex, 2, 6, 3.4);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#cfd5c2";
    ctx.beginPath();
    ctx.ellipse(ex + 6.6, 3.7, 0.8, 4.5 + Math.sin(time * 80 + ex) * 0.6, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // cockpit glint
  ctx.fillStyle = "#9ed2ff";
  ctx.beginPath();
  ctx.ellipse(22, -2.2, 5, 2, -0.2, 0, TAU);
  ctx.fill();
  // highlight + roundel
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(-26, -4.6, 48, 1.4);
  ctx.fillStyle = "#f3ecd6";
  ctx.beginPath();
  ctx.arc(-10, -0.5, 3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = roundel;
  ctx.beginPath();
  ctx.arc(-10, -0.5, 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A bank of storm cloud; `flicker` lights it from inside. */
export function drawStorm(ctx: CanvasRenderingContext2D, x: number, y: number, grow: number, flicker: number, time: number) {
  const n = 18;
  // a heavy anvil: dark underside, lighter billows on top
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5;
      const ox = u * 230 + Math.sin(i * 1.9 + time * 0.6) * 6;
      const oy = (layer ? -14 : 6) + Math.cos(i * 2.3 + time * 0.5) * 6 + Math.abs(u) * 26;
      const r = (34 + ((i * 7) % 4) * 9) * grow * (layer ? 0.85 : 1) * (1 - Math.abs(u) * 0.5);
      ctx.globalAlpha = (layer ? 0.75 : 0.95) * grow;
      ctx.drawImage(soft(layer ? "#3a4560" : "#141826"), x + ox - r, Y(y) + oy - r * 0.6, r * 2, r * 1.2);
    }
  }
  // rain curtain beneath
  ctx.globalAlpha = 0.18 * grow;
  ctx.strokeStyle = "#9fb4d6";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 40; i++) {
    const rx = x - 100 + ((i * 37 + time * 140) % 200);
    const ry = Y(y) + 20 + ((i * 53 + time * 400) % 140);
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 2, ry + 9);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  const inner = flicker > 0 ? flicker : Math.max(0, Math.sin(time * 7.3) * Math.sin(time * 3.1) - 0.75) * 2;
  if (inner > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = inner * grow;
    ctx.drawImage(soft("#9cc4ff"), x - 140, Y(y) - 60, 280, 120);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

/** A singularity: black core, a lensing rim and a tilted accretion disc. */
export function drawWell(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, time: number) {
  const s = u < 0.15 ? u / 0.15 : u > 0.85 ? Math.max(0, (1 - u) / 0.15) : 1;
  const r = (8 + 18 * Math.min(1, u * 1.6)) * s;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.9 * s;
  ctx.drawImage(soft("#7a2bff"), x - r * 3.2, Y(y) - r * 3.2, r * 6.4, r * 6.4);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = s;
  ctx.fillStyle = "#020005";
  ctx.beginPath();
  ctx.arc(x, Y(y), r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(225,200,255,0.85)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, Y(y), r + 1, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = withAlpha(i ? "#c58cff" : "#ffd6f5", 0.55 - i * 0.12);
    ctx.lineWidth = 2 - i * 0.5;
    ctx.beginPath();
    ctx.ellipse(x, Y(y), r * (1.9 + i * 0.45), r * (0.42 + i * 0.1), -0.25, time * (3 + i), time * (3 + i) + Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** The orbital target: rings closing in, a hairline to the sky. */
export function drawTarget(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, time: number) {
  const a = Math.floor(time * 12) % 2 ? 0.9 : 0.5;
  ctx.strokeStyle = withAlpha("#6fd3ff", a);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const r = (1 - u) * 60 * (1 + i * 0.5) + 6;
    ctx.beginPath();
    ctx.arc(x, Y(y), r, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.25 + 0.5 * u;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(x, Y(y));
  ctx.lineTo(x, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** A tear in the sky above the meteor call. */
export function drawRift(ctx: CanvasRenderingContext2D, x: number, u: number, time: number) {
  const s = u < 0.2 ? u / 0.2 : u > 0.8 ? (1 - u) / 0.2 : 1;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = s * 0.9;
  ctx.drawImage(soft("#a35bff"), x - 220, -40, 440, 120);
  ctx.globalAlpha = s;
  ctx.strokeStyle = "#f0dcff";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const px = x - 160 + i * 16;
    const py = 18 + Math.sin(i * 1.3 + time * 6) * 4;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
