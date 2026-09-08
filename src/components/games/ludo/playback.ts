"use client";

/* The board's replay. The server sends settled positions plus the last roll
   and the last move; this hook turns them back into motion — the die
   tumbles and shows its face, the token hops square by square, victims fly
   back to their yard — then snaps to whatever the server says now. Segments
   queue up, so a roll-and-auto-move that arrives in one frame plays as two
   beats, and a fast opponent never makes the board jump. */

import { useEffect, useRef, useState } from "react";
import type { LudoView } from "@/lib/games/ludo/types";
import { CAPTURE_GAP_MS, FLY_MS, HOP_MS, OUT_MS, ROLL_MS } from "./paint";

export type TokenMode = "snap" | "hop" | "out" | "fly";

export interface LudoPlayback {
  /** displayed position per token, keyed `${seat}:${token}` */
  pos: Record<string, number>;
  /** how each token got where it is — drives the motion */
  mode: Record<string, TokenMode>;
  /** the face the die shows, or null before the first roll */
  dieFace: number | null;
  rolling: boolean;
  /** the token mid-journey, drawn on top */
  moving: string | null;
  animating: boolean;
}

export const tokenKey = (seat: number, token: number) => `${seat}:${token}`;

function positionsOf(v: LudoView): { pos: Record<string, number>; mode: Record<string, TokenMode> } {
  const pos: Record<string, number> = {};
  const mode: Record<string, TokenMode> = {};
  for (const p of v.players) {
    p.tokens.forEach((x, t) => {
      const k = tokenKey(p.seat, t);
      pos[k] = x;
      mode[k] = "snap";
    });
  }
  return { pos, mode };
}

const settled = (v: LudoView): LudoPlayback => ({
  ...positionsOf(v),
  dieFace: v.lastRoll?.value ?? null,
  rolling: false,
  moving: null,
  animating: false,
});

export function useLudoPlayback(view: LudoView): LudoPlayback {
  const [pb, setPb] = useState<LudoPlayback>(() => settled(view));
  const latest = useRef(view);
  const timers = useRef<number[]>([]);
  const dieCycle = useRef<number | null>(null);
  /** epoch ms when the queued replay finishes */
  const endAt = useRef(0);
  const shown = useRef({ started: view.startedAt, roll: view.lastRoll?.n ?? 0, move: view.lastMove?.n ?? 0 });

  useEffect(() => {
    latest.current = view;
  }, [view]);

  useEffect(() => {
    const clearAll = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      if (dieCycle.current !== null) window.clearInterval(dieCycle.current);
      dieCycle.current = null;
    };
    const at = (when: number, fn: () => void) =>
      timers.current.push(window.setTimeout(fn, Math.max(0, when - Date.now())));

    const v = view;
    if (v.startedAt !== shown.current.started) {
      clearAll();
      endAt.current = 0;
      shown.current = { started: v.startedAt, roll: v.lastRoll?.n ?? 0, move: v.lastMove?.n ?? 0 };
      setPb(settled(v));
      return;
    }

    const newRoll = v.lastRoll && v.lastRoll.n > shown.current.roll ? v.lastRoll : null;
    const newMove = v.lastMove && v.lastMove.n > shown.current.move ? v.lastMove : null;
    if (newRoll) shown.current.roll = newRoll.n;
    if (newMove) shown.current.move = newMove.n;

    if (!newRoll && !newMove) {
      // nothing moved (a clock re-armed, a leaver was swept…): sync when idle
      if (Date.now() >= endAt.current) setPb((cur) => ({ ...cur, ...positionsOf(v), moving: null, animating: false }));
      return;
    }

    let t = Math.max(Date.now(), endAt.current);

    if (newRoll) {
      at(t, () => {
        setPb((cur) => ({ ...cur, rolling: true, animating: true }));
        if (dieCycle.current !== null) window.clearInterval(dieCycle.current);
        dieCycle.current = window.setInterval(() => {
          setPb((cur) => {
            let f = 1 + Math.floor(Math.random() * 6);
            if (f === cur.dieFace) f = (f % 6) + 1;
            return { ...cur, dieFace: f };
          });
        }, 70);
      });
      at(t + ROLL_MS, () => {
        if (dieCycle.current !== null) window.clearInterval(dieCycle.current);
        dieCycle.current = null;
        setPb((cur) => ({ ...cur, rolling: false, dieFace: newRoll.value }));
      });
      t += ROLL_MS;
    }

    if (newMove) {
      const key = tokenKey(newMove.seat, newMove.token);
      at(t, () =>
        setPb((cur) => ({
          ...cur,
          pos: { ...cur.pos, [key]: newMove.from },
          mode: { ...cur.mode, [key]: "snap" },
          moving: key,
          animating: true,
        }))
      );
      if (newMove.from < 0) {
        at(t + 16, () => setPb((cur) => ({ ...cur, pos: { ...cur.pos, [key]: 0 }, mode: { ...cur.mode, [key]: "out" } })));
        t += OUT_MS;
      } else {
        const steps = newMove.to - newMove.from;
        for (let k = 1; k <= steps; k++) {
          const step = newMove.from + k;
          at(t + (k - 1) * HOP_MS + 16, () =>
            setPb((cur) => ({ ...cur, pos: { ...cur.pos, [key]: step }, mode: { ...cur.mode, [key]: "hop" } }))
          );
        }
        t += steps * HOP_MS;
      }
      if (newMove.captured.length) {
        at(t + CAPTURE_GAP_MS, () =>
          setPb((cur) => {
            const pos = { ...cur.pos };
            const mode = { ...cur.mode };
            for (const c of newMove.captured) {
              const ck = tokenKey(c.seat, c.token);
              pos[ck] = -1;
              mode[ck] = "fly";
            }
            return { ...cur, pos, mode };
          })
        );
        t += CAPTURE_GAP_MS + FLY_MS;
      }
      const finish = t;
      at(finish, () =>
        setPb((cur) => ({
          ...cur,
          ...positionsOf(latest.current),
          moving: null,
          animating: endAt.current > finish + 5,
        }))
      );
    } else {
      const finish = t;
      at(finish, () => setPb((cur) => ({ ...cur, animating: endAt.current > finish + 5 })));
    }
    endAt.current = t;
    // deliberately no cleanup: queued segments must outlive this render
  }, [view]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      if (dieCycle.current !== null) window.clearInterval(dieCycle.current);
    },
    []
  );

  return pb;
}
