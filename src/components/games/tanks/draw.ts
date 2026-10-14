/* The art. Everything here paints in world units (y up, flipped through Y),
   procedurally: the sky and far hills for each battlefield, the rock texture
   the ridge is cut from, the tanks, and every projectile and set piece the
   armoury can put in the air. No image assets — it is all drawn.

   Static layers (sky, rock) are rendered once into offscreen canvases; the
   tanks and projectiles are drawn live each frame. */

import { hash01, H, W } from "@/lib/games/tanks/terrain";
import type { FxStyle, TankColor, TrackStyle } from "@/lib/games/tanks/types";
import { soft, withAlpha } from "./fx";
import { BIOME, TANK, type Look } from "./palette";

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

/** A heart centred on (x, y), `r` across — used by the Love theme. */
export function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.35);
  ctx.bezierCurveTo(x - r * 0.05, y + r * 0.3, x - r * 0.55, y + r * 0.05, x - r * 0.5, y - r * 0.2);
  ctx.bezierCurveTo(x - r * 0.45, y - r * 0.5, x - r * 0.05, y - r * 0.5, x, y - r * 0.22);
  ctx.bezierCurveTo(x + r * 0.05, y - r * 0.5, x + r * 0.45, y - r * 0.5, x + r * 0.5, y - r * 0.2);
  ctx.bezierCurveTo(x + r * 0.55, y + r * 0.05, x + r * 0.05, y + r * 0.3, x, y + r * 0.35);
  ctx.closePath();
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/* ================= the sky ================= */

export function renderSky(biome: Look, seed: number, scale: number): HTMLCanvasElement {
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
  if (biome !== "mesa" && biome !== "love" && biome !== "slate") {
    const n = biome === "lunar" ? 420 : biome === "tundra" ? 220 : biome === "classic" ? 70 : 40;
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

  if (biome === "love") {
    for (let i = 0; i < 9; i++) {
      const x = rng() * W;
      const y = H * (0.08 + rng() * 0.4);
      const r = 7 + rng() * 12;
      ctx.globalAlpha = 0.12 + rng() * 0.12;
      ctx.fillStyle = "#ffffff";
      heart(ctx, x, y, r);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
  const shapes: Record<Look, (u: number, i: number, layer: number) => number> = {
    classic: (u) => u * 0.5,
    love: (u) => u * 0.6,
    slate: (u) => u * 0.45,
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

export function renderRock(biome: Look, seed: number, scale: number): HTMLCanvasElement {
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
  for (let i = 0; i < (paint.calm ? 2500 : 9000); i++) {
    const x = rng() * W;
    const y = rng() * H;
    ctx.globalAlpha = 0.05 + rng() * 0.12;
    ctx.fillStyle = rng() < 0.5 ? "#000" : paint.fleck;
    ctx.fillRect(x, y, 0.6 + rng() * 1.2, 0.6 + rng() * 1.2);
  }
  ctx.globalAlpha = 1;

  // pebbles with a little highlight
  for (let i = 0; i < (paint.calm ? 0 : 420); i++) {
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

/* Pocket Tanks' bullets are small bright dots; what tells them apart is their
   colour and what they do, so the heads stay simple and the colour comes from
   the track (the weapon's hue). */

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 1) {
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a;
  ctx.drawImage(soft(color), x - r, Y(y) - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** A short fading tail behind a bullet. `pts` runs oldest → newest. */
export function drawTail(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number) {
  if (pts.length < 2) return;
  ctx.lineCap = "round";
  for (let i = 1; i < pts.length; i++) {
    const u = i / (pts.length - 1);
    ctx.globalAlpha = u * u * 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (0.3 + 0.7 * u);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], Y(pts[i - 1][1]));
    ctx.lineTo(pts[i][0], Y(pts[i][1]));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** The Tracer's dotted flight path. */
export function drawDotted(ctx: CanvasRenderingContext2D, pts: [number, number][], alpha: number) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    let d = carry;
    while (d < l) {
      const u = d / l;
      ctx.beginPath();
      ctx.arc(x0 + (x1 - x0) * u, Y(y0 + (y1 - y0) * u), 1.3, 0, TAU);
      ctx.fill();
      d += 7;
    }
    carry = d - l;
  }
}

/**
 * Draw a projectile's head. `vx, vy` give its heading; `age` is ticks since
 * launch (for spin); `under` means it is travelling through the dirt.
 */
export function drawHead(ctx: CanvasRenderingContext2D, style: TrackStyle, color: string, x: number, y: number, vx: number, vy: number, age: number, time: number, under: boolean) {
  const sy = Y(y);
  switch (style) {
    case "bullet":
    case "warhead": {
      const r = style === "bullet" ? 3.2 : 2.3;
      if (under) {
        // tunnelling: a dim marker in the dirt
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 20);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, sy, r + 2.5, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      glow(ctx, x, y, r * 3, color, under ? 0.35 : 0.6);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, sy, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x - r * 0.25, sy - r * 0.25, r * 0.42, 0, TAU);
      ctx.fill();
      return;
    }
    case "tracer":
      glow(ctx, x, y, 6, "#ffffff", 0.6);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, sy, 2, 0, TAU);
      ctx.fill();
      return;
    case "round": {
      const l = Math.hypot(vx, vy) || 1;
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - (vx / l) * 7, sy + (vy / l) * 7);
      ctx.lineTo(x, sy);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      return;
    }
    case "ice": {
      ctx.fillStyle = "#e8f8ff";
      ctx.save();
      ctx.translate(x, sy);
      ctx.rotate(age * 0.3);
      ctx.fillRect(-1.5, -1.5, 3, 3);
      ctx.restore();
      glow(ctx, x, y, 4, "#b3e5fc", 0.5);
      return;
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
      return;
    }
    case "clod": {
      ctx.save();
      ctx.translate(x, sy);
      ctx.rotate(age * 0.25);
      ctx.fillStyle = "#7a5638";
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        const r = 3.6 + hash01(i, 31) * 1.4;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,240,220,0.25)";
      ctx.beginPath();
      ctx.arc(-1, -1.2, 1.3, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    case "missile": {
      const heading = Math.atan2(-vy, vx);
      ctx.save();
      ctx.translate(x, sy);
      ctx.rotate(heading);
      const f = 0.7 + Math.random() * 0.5;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(soft("#ff8a2a"), -15 * f, -4.5, 11 * f, 9);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#eceff1";
      ctx.fillRect(-6, -1.8, 9, 3.6);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(3, -1.8);
      ctx.lineTo(7, 0);
      ctx.lineTo(3, 1.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#546e7a";
      ctx.beginPath();
      ctx.moveTo(-6, -1.8);
      ctx.lineTo(-8, -4);
      ctx.lineTo(-4, -1.8);
      ctx.moveTo(-6, 1.8);
      ctx.lineTo(-8, 4);
      ctx.lineTo(-4, 1.8);
      ctx.fill();
      ctx.restore();
      return;
    }
  }
}

/* ================= explosions ================= */

/** Explosion palettes: the rings cycle through these. */
export const PALETTE: Record<FxStyle, string[]> = {
  fire: ["#ffffff", "#fff59d", "#ffeb3b", "#ffc107", "#ff9800", "#ff5722", "#e53935", "#ffca28"],
  big: ["#ffffff", "#ffecb3", "#ffca28", "#ff8f00", "#f4511e", "#c62828", "#ff7043", "#ffe082"],
  small: ["#ffffff", "#ffe082", "#ffb74d", "#ff8a65"],
  ice: ["#ffffff", "#e1f5fe", "#81d4fa", "#4fc3f7", "#b3e5fc"],
  zap: ["#ffffff", "#80d8ff", "#40c4ff", "#00b0ff", "#b388ff"],
  napalm: ["#fff3e0", "#ffcc80", "#ff9800", "#ff6d00", "#dd2c00"],
  dirt: ["#d7ccc8", "#a1887f", "#8d6e63", "#6d4c41", "#bcaaa4"],
  web: ["#ffffff", "#f5f5f5", "#e0e0e0", "#bdbdbd"],
  pop: ["#ffffff", "#ff1744", "#ffea00", "#ff9100"],
  spark: ["#ffffff", "#fff59d"],
  sniper: ["#ffffff", "#cfd8dc", "#90a4ae"],
};

/**
 * Pocket Tanks' explosion: a disc of concentric rings that blooms out, holds,
 * and collapses, its colours cycling fast the whole time. `u` runs 0 → 1.
 */
export function drawBlast(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number, pal: string[], time: number) {
  const size = u < 0.32 ? Math.sqrt(u / 0.32) : u < 0.62 ? 1 : Math.max(0, 1 - (u - 0.62) / 0.38);
  const rad = r * size;
  if (rad < 0.5) return;
  const rings = Math.max(3, Math.min(8, Math.round(r / 7)));
  const shift = Math.floor(time * 26);
  ctx.globalAlpha = u > 0.8 ? (1 - u) / 0.2 : 1;
  for (let k = 0; k < rings; k++) {
    ctx.fillStyle = pal[(k + shift) % pal.length];
    ctx.beginPath();
    ctx.arc(x, Y(y), rad * (1 - k / rings), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ================= beams ================= */

/** Zapper: a crackling bolt from bullet to tank. */
export function drawZap(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, a: number, seed: number) {
  const n = 9;
  const pts: [number, number][] = [[x1, y1]];
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const j = (hash01(seed, i) - 0.5) * 14 * Math.sin(u * Math.PI);
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const nl = Math.hypot(nx, ny) || 1;
    pts.push([x1 + (x2 - x1) * u + (nx / nl) * j, y1 + (y2 - y1) * u + (ny / nl) * j]);
  }
  pts.push([x2, y2]);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [w, col, al] of [
    [8, "#2979ff", 0.3],
    [3.2, "#80d8ff", 0.8],
    [1.2, "#ffffff", 1],
  ] as [number, string, number][]) {
    ctx.globalAlpha = a * al;
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, Y(y)) : ctx.moveTo(x, Y(y))));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** Spider: a strand of silk, shot out along a sagging curve. `reveal` 0 → 1. */
export function drawSilk(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, reveal: number, a: number) {
  const mx = (x1 + x2) / 2;
  const my = Math.max(y1, y2) + Math.hypot(x2 - x1, y2 - y1) * 0.18;
  ctx.globalAlpha = a;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.7;
  ctx.shadowColor = "rgba(255,255,255,0.8)";
  ctx.shadowBlur = 4;
  ctx.beginPath();
  const steps = 18;
  const upto = Math.max(1, Math.round(steps * reveal));
  for (let i = 0; i <= upto; i++) {
    const u = i / steps;
    const px = (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * mx + u * u * x2;
    const py = (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * my + u * u * y2;
    if (i) ctx.lineTo(px, Y(py));
    else ctx.moveTo(px, Y(py));
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}
