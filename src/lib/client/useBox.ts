"use client";

/* Measuring hooks for the fit-to-viewport game screens. A game screen never
   scrolls, so its board, seats and cards are sized from the room they actually
   get rather than from fixed breakpoints. */

import { useLayoutEffect, useRef, useState } from "react";

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Size of an element (its content box, or its border box), kept current by a
    ResizeObserver. 0×0 until the first measurement. */
export function useBox<T extends HTMLElement>(box: "content" | "border" = "content") {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (w: number, h: number) =>
      setSize((b) => (Math.abs(b.w - w) < 0.5 && Math.abs(b.h - h) < 0.5 ? b : { w, h }));
    if (box === "border") {
      const r = el.getBoundingClientRect();
      read(r.width, r.height);
    } else {
      const cs = getComputedStyle(el);
      read(
        el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      );
    }
    const ro = new ResizeObserver(([entry]) => {
      const bb = entry.borderBoxSize?.[0];
      if (box === "border" && bb) read(bb.inlineSize, bb.blockSize);
      else read(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el, box === "border" ? { box: "border-box" } : undefined);
    return () => ro.disconnect();
  }, [box]);
  return [ref, size] as const;
}

/** The same for a callback ref, for elements that mount later: the size is
    null until the element has been measured. */
export function useBoxSize() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const read = (w: number, h: number) =>
      setSize((s) => (s && Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h }));
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    read(
      r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    );
    const ro = new ResizeObserver(([e]) => read(e.contentRect.width, e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size] as const;
}
