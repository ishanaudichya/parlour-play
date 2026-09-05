"use client";

/* The cascade replay. The server sends the settled board plus the list of
   cells that burst in each wave; this hook turns that back into motion:
   the new orb lands, the critical cells shed their orbs, the orbs fly to the
   neighbours, and whatever that pushed over the edge bursts in the next
   wave — using the engine's own `applyWave`, so the replay ends exactly on
   the board the server sent. If it wouldn't (a frame was missed, or a
   forfeit swept the board in between), we simply snap. */

import { useEffect, useRef, useState } from "react";
import { applyWave, criticalMass, neighbours } from "@/lib/games/chainreaction/engine";
import type { ChainBoard, ChainView } from "@/lib/games/chainreaction/types";
import { cascadeTimeline } from "./palette";

export interface Flight {
  key: string;
  from: number;
  to: number;
  seat: number;
}

export interface Playback {
  /** the orbs to draw as sitting still */
  board: ChainBoard;
  /** orbs in the air right now */
  flights: Flight[];
  /** cells flashing right now */
  bursting: number[];
  /** how long the current flights take, ms */
  flightMs: number;
  /** the mover, while a replay is running */
  seat: number | null;
  /** the cell whose orb just landed (for the pop-in), or null */
  landed: number | null;
  animating: boolean;
}

const cloneBoard = (b: ChainBoard): ChainBoard => b.map((c) => ({ ...c }));

const sameBoard = (a: ChainBoard, b: ChainBoard) =>
  a.length === b.length && a.every((c, i) => c.n === b[i].n && c.owner === b[i].owner);

function still(board: ChainBoard, landed: number | null = null): Playback {
  return { board, flights: [], bursting: [], flightMs: 0, seat: null, landed, animating: false };
}

const keyOf = (v: ChainView) => `${v.startedAt}:${v.lastMove?.n ?? 0}`;

export function useCascadePlayback(view: ChainView): Playback {
  const [pb, setPb] = useState<Playback>(() => still(view.board));
  const timers = useRef<number[]>([]);
  const latest = useRef(view);
  const animating = useRef(false);
  /** the server's board for the last frame we processed — the pre-move board of the next one */
  const settled = useRef<ChainBoard>(view.board);
  const shownKey = useRef(keyOf(view));

  const moveKey = keyOf(view);

  /* declared first so it runs before the effects below read it */
  useEffect(() => {
    latest.current = view;
  }, [view]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  /* frames that carry no new move: a leaver swept the board, a clock re-armed… */
  useEffect(() => {
    if (moveKey !== shownKey.current) return;
    settled.current = view.board;
    if (!animating.current) setPb((cur) => (sameBoard(cur.board, view.board) ? cur : still(view.board)));
  }, [moveKey, view.board]);

  /* a new move */
  useEffect(() => {
    if (moveKey === shownKey.current) return;
    const v = latest.current;
    const prevBoard = settled.current;
    shownKey.current = moveKey;
    settled.current = v.board;
    clear();
    animating.current = false;

    const lm = v.lastMove;
    if (!lm || lm.waves.length === 0) {
      // a plain placement: just let the orb pop in
      setPb(still(v.board, lm ? lm.row * v.cols + lm.col : null));
      return;
    }

    // rebuild the pre-move board and check the recorded cascade really ends
    // on the board we were sent; if not, don't pretend — snap
    const idx = lm.row * v.cols + lm.col;
    if (prevBoard.length !== v.board.length || !(prevBoard[idx].n === 0 || prevBoard[idx].owner === lm.seat)) {
      setPb(still(v.board, idx));
      return;
    }
    const start = cloneBoard(prevBoard);
    start[idx] = { n: start[idx].n + 1, owner: lm.seat };
    const check = cloneBoard(start);
    for (const w of lm.waves) applyWave(check, v.cols, v.rows, w, lm.seat);
    if (lm.totalWaves === lm.waves.length && !sameBoard(check, v.board)) {
      setPb(still(v.board, idx));
      return;
    }

    // schedule the replay
    const tl = cascadeTimeline(lm.waves.length);
    animating.current = true;
    setPb({ board: start, flights: [], bursting: [], flightMs: 0, seat: lm.seat, landed: idx, animating: true });

    let board = start;
    lm.waves.forEach((wave, k) => {
      const dur = tl.durations[k];
      // the bursting cells shed their critical mass; the orbs are in the air
      const shed = cloneBoard(board);
      const flights: Flight[] = [];
      for (const i of wave) {
        const left = shed[i].n - criticalMass(v.cols, v.rows, i);
        shed[i] = { n: Math.max(0, left), owner: left > 0 ? lm.seat : null };
        for (const j of neighbours(v.cols, v.rows, i)) {
          flights.push({ key: `${k}:${i}>${j}`, from: i, to: j, seat: lm.seat });
        }
      }
      const landedBoard = cloneBoard(board);
      applyWave(landedBoard, v.cols, v.rows, wave, lm.seat);
      board = landedBoard;

      timers.current.push(
        window.setTimeout(() => {
          setPb({ board: shed, flights, bursting: wave, flightMs: dur, seat: lm.seat, landed: null, animating: true });
        }, tl.starts[k])
      );
    });

    // the last landing: snap to whatever the server says NOW — this covers
    // truncated cascades and any frame that arrived while we were busy
    timers.current.push(
      window.setTimeout(() => {
        animating.current = false;
        setPb(still(latest.current.board));
      }, tl.end)
    );
    // reads the view through `latest` on purpose: only a new move re-runs this
  }, [moveKey]);

  useEffect(() => clear, []);

  return pb;
}
