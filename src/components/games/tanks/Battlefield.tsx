"use client";

/* The canvas host. Owns the animation loop and the sizing; the Scene owns
   everything drawn. The host takes whatever room its parent gives it and
   fits the largest field of the world's proportions inside — bounded by
   width AND height, so the ridge is as big as the screen allows without
   ever pushing the page into a scroll. When it is your shot you can aim
   right on the field: press anywhere and drag — the barrel swings to point
   at your finger, all the way round. Power stays on the console. */

import { useEffect, useRef, useState } from "react";
import { H, W } from "@/lib/games/tanks/terrain";
import type { Scene } from "./scene";

/** Past this the field stops growing — huge monitors get a big ridge, not a mural. */
const MAX_W = 1760;

export function Battlefield({
  scene,
  font,
  canAim,
  mySeat,
  angle,
  onAim,
  onFit,
  className = "",
  boxStyle,
  frameStyle,
  children,
}: {
  scene: Scene;
  font: string;
  canAim: boolean;
  mySeat: number | null;
  angle: number;
  onAim: (angle: number, done: boolean) => void;
  /** the fitted field width in CSS px, so the chrome around it can line up */
  onFit?: (w: number) => void;
  /** classes for the outer box — give it room (e.g. flex-1 min-h-0) */
  className?: string;
  boxStyle?: React.CSSProperties;
  /** style for the fitted frame (border, radius) */
  frameStyle?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const fitCb = useRef(onFit);
  useEffect(() => {
    fitCb.current = onFit;
  });

  // attach + loop + fit
  useEffect(() => {
    const c = cvs.current;
    const b = box.current;
    if (!c || !b) return;
    scene.attach(c, font);
    let last = -1;
    const fit = () => {
      const w = Math.floor(Math.max(0, Math.min(b.clientWidth, (b.clientHeight * W) / H, MAX_W)));
      if (w === last) return;
      last = w;
      setSize({ w, h: Math.round((w * H) / W) });
      scene.resize(w, Math.min(2.5, window.devicePixelRatio || 1));
      fitCb.current?.(w);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(b);
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
    scene.setAim(canAim && mySeat !== null ? { seat: mySeat, angle } : null);
  }, [scene, canAim, mySeat, angle]);

  const aimAt = (clientX: number, clientY: number, done: boolean) => {
    if (mySeat === null) return;
    const p = scene.toWorld(clientX, clientY);
    const t = scene.tankPos(mySeat);
    if (!p || !t) return;
    const deg = (Math.atan2(p.y - (t.y + 15), p.x - t.x) * 180) / Math.PI;
    dragging.current = !done;
    onAim(((Math.round(deg) % 360) + 360) % 360, done);
  };

  return (
    <div ref={box} className={`flex min-h-0 min-w-0 items-center justify-center ${className}`} style={boxStyle}>
      <div
        className="relative shrink-0 select-none overflow-hidden"
        style={{ width: size?.w ?? 0, height: size?.h ?? 0, touchAction: canAim ? "none" : "auto", ...frameStyle }}
      >
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
            if (!canAim || !dragging.current) return;
            aimAt(e.clientX, e.clientY, false);
          }}
          onPointerUp={(e) => {
            if (!canAim || !dragging.current) return;
            aimAt(e.clientX, e.clientY, true);
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        />
        {children}
      </div>
    </div>
  );
}
