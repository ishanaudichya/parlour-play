"use client";

/* The canvas host. Owns the animation loop and the sizing; the Scene owns
   everything drawn. When it is your shot you can aim right on the field:
   press anywhere and drag — direction from your turret sets the angle,
   distance sets the power. */

import { useEffect, useRef } from "react";
import { H, W } from "@/lib/games/tanks/terrain";
import type { Scene } from "./scene";

export function Battlefield({
  scene,
  font,
  canAim,
  mySeat,
  angle,
  power,
  straight,
  onAim,
  children,
}: {
  scene: Scene;
  font: string;
  canAim: boolean;
  mySeat: number | null;
  angle: number;
  power: number;
  straight: boolean;
  onAim: (angle: number, power: number, done: boolean) => void;
  children?: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // attach + loop + resize
  useEffect(() => {
    const c = cvs.current;
    const w = wrap.current;
    if (!c || !w) return;
    scene.attach(c, font);
    const fit = () => scene.resize(w.clientWidth, Math.min(2.5, window.devicePixelRatio || 1));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(w);
    let raf = 0;
    const loop = (t: number) => {
      scene.frame(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scene, font]);

  // keep the scene's idea of my aim current
  useEffect(() => {
    scene.setAim(canAim && mySeat !== null ? { seat: mySeat, angle, power, guide: true, straight, drag: drag.current } : null);
  }, [scene, canAim, mySeat, angle, power, straight]);

  const aimAt = (clientX: number, clientY: number, done: boolean) => {
    if (mySeat === null) return;
    const p = scene.toWorld(clientX, clientY);
    const t = scene.tankPos(mySeat);
    if (!p || !t) return;
    const dx = p.x - t.x;
    const dy = p.y - (t.y + 15);
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (dy < 0) a = dx >= 0 ? 0 : 180;
    const pw = Math.max(0, Math.min(100, Math.hypot(dx, dy) / 3.2));
    drag.current = done ? null : p;
    onAim(Math.round(Math.max(0, Math.min(180, a))), Math.round(pw), done);
  };

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ aspectRatio: `${W} / ${H}`, touchAction: canAim ? "none" : "auto" }}>
      <canvas
        ref={cvs}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: canAim ? "crosshair" : "default" }}
        onPointerDown={(e) => {
          if (!canAim) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          aimAt(e.clientX, e.clientY, false);
        }}
        onPointerMove={(e) => {
          if (!canAim || !drag.current) return;
          aimAt(e.clientX, e.clientY, false);
        }}
        onPointerUp={(e) => {
          if (!canAim || !drag.current) return;
          aimAt(e.clientX, e.clientY, true);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      {children}
    </div>
  );
}
