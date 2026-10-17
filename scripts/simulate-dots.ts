/* Dots and Boxes engine fuzz test: thousands of random games on random page
   sizes (2×2 … 12×12) at every table size (2–8), with the whole page
   re-derived every step — a box is claimed exactly when its four sides are
   drawn, by whoever drew the fourth; scores equal boxes; the mover goes again
   after a box and only then; the client's optimistic page matches the
   server's exactly — plus setup, timeouts, walk-outs and rule cases.
   Run: npx tsx scripts/simulate-dots.ts */
import { applyDotsMove, autoLine, forfeitDots, initDots, lineAt, openLines, predictDots, redactDots, sidesDrawn, tickDots, totalLines, dotsModule } from "../src/lib/games/dots/engine";
import { MAX_SIDE, MIN_SIDE, type DotsMove, type DotsState } from "../src/lib/games/dots/types";
import { MoveError, type GamePlayer } from "../src/lib/games/types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fail = (m: string): never => {
  throw new Error(m);
};
const players = (n: number): GamePlayer[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i }));

function expectReject(s: DotsState, id: string, mv: DotsMove, why: string) {
  try {
    applyDotsMove(s, id, mv, 1, () => 0.5);
  } catch (e) {
    if (e instanceof MoveError) return;
    throw e;
  }
  fail(`accepted: ${why}`);
}

function invariants(s: DotsState, where: string) {
  if (s.hLines.length !== (s.h + 1) * s.w || s.vLines.length !== s.h * (s.w + 1) || s.boxes.length !== s.w * s.h) fail(`${where}: array sizes`);
  let drawn = 0;
  for (const x of [...s.hLines, ...s.vLines]) if (x >= 0) drawn++;
  if (drawn !== s.moves) fail(`${where}: ${drawn} lines drawn, ${s.moves} moves`);
  const counts = s.players.map(() => 0);
  for (let r = 0; r < s.h; r++)
    for (let c = 0; c < s.w; c++) {
      const own = s.boxes[r * s.w + c];
      const full = sidesDrawn(s, r, c) === 4;
      if (full !== own >= 0) fail(`${where}: box ${r},${c} owner ${own} with ${sidesDrawn(s, r, c)} sides`);
      if (own >= 0) counts[own]++;
    }
  s.players.forEach((p, i) => {
    if (p.score !== counts[i]) fail(`${where}: ${p.name} scores ${p.score} but owns ${counts[i]}`);
  });
  if (s.phase === "play") {
    const t = s.players.find((p) => p.id === s.turn);
    if (!t || t.left) fail(`${where}: turn with ${s.turn}`);
    if (s.moves >= totalLines(s.w, s.h)) fail(`${where}: page full but still playing`);
  }
  if (s.log.length > 60) fail(`${where}: log uncapped`);
}

const stats = { games: 0, wins: 0, draws: 0, walkovers: 0, timeouts: 0, extra: 0, sizes: new Set<string>() };

function playGame(n: number, seed: number): DotsState {
  const rng = mulberry32(seed);
  let now = 1000;
  const s = initDots(players(n), now);
  if (s.phase !== "setup" || s.turn !== "p0") fail("setup belongs to the host");
  invariants(s, "init");
  // only the host may set the page up
  if (n > 1) expectReject(s, "p1", { type: "size", w: 4, h: 4 }, "a guest sized the page");
  expectReject(s, "p0", { type: "size", w: MAX_SIDE + 1, h: 3 }, "oversized page");
  expectReject(s, "p0", { type: "line", o: "h", r: 0, c: 0 }, "drew during setup");
  const w = MIN_SIDE + Math.floor(rng() * (MAX_SIDE - MIN_SIDE + 1));
  const h = MIN_SIDE + Math.floor(rng() * (MAX_SIDE - MIN_SIDE + 1));
  applyDotsMove(s, "p0", { type: "size", w, h }, ++now, rng);
  if (rng() < 0.1) {
    now = s.deadline! + 1;
    tickDots(s, now, rng); // the setup clock opens the page
  } else applyDotsMove(s, "p0", { type: "start" }, ++now, rng);
  if (s.phase !== "play" || s.w !== w || s.h !== h) fail("page didn't open at the chosen size");
  stats.sizes.add(`${w}x${h}`);
  invariants(s, "start");

  const leaver = n > 2 && rng() < 0.15 ? Math.floor(rng() * n) : -1;
  const leaveAt = Math.floor(rng() * totalLines(w, h));
  for (let step = 0; s.phase === "play" && step < 2000; step++) {
    now += 500;
    if (step === leaveAt && leaver >= 0) {
      forfeitDots(s, `p${leaver}`, now, rng);
      invariants(s, `forfeit ${step}`);
      continue;
    }
    const p = s.players.find((q) => q.id === s.turn)!;
    const before = p.score;
    const turn = s.turn;
    if (rng() < 0.05) {
      now = s.deadline! + 1;
      if (!tickDots(s, now, rng)) fail("expired turn did not tick");
      stats.timeouts++;
    } else {
      const lines = openLines(s);
      const [o, r, c] = rng() < 0.5 ? autoLine(s, rng) : lines[Math.floor(rng() * lines.length)];
      const other = s.players.find((q) => q.id !== p.id && !q.left);
      if (other) {
        expectReject(s, other.id, { type: "line", o, r, c }, "out of turn");
        if (predictDots(redactDots(s, other.id, now), { type: "line", o, r, c }, now)) fail("predicted an out-of-turn line");
      }
      // the client's optimistic page must be exactly the page the server sends back
      const predicted = predictDots(redactDots(s, p.id, now), { type: "line", o, r, c }, now);
      applyDotsMove(s, p.id, { type: "line", o, r, c }, now, rng);
      if (JSON.stringify(predicted) !== JSON.stringify(redactDots(s, p.id, now))) fail(`step ${step}: prediction differs from the server's page`);
      if (lineAt(s, o, r, c) !== p.seat) fail("line not recorded");
      expectReject(s, s.turn || p.id, { type: "line", o, r, c }, "drew a line twice");
    }
    invariants(s, `step ${step}`);
    if (s.phase === "play") {
      // close a box → same player; otherwise the next
      const scored = p.score > before;
      if (scored && s.turn !== turn) fail("closed a box but lost the turn");
      if (!scored && s.turn === turn && s.players.filter((q) => !q.left).length > 1) fail("kept the turn without a box");
      if (scored) stats.extra++;
    }
  }
  if (s.phase !== "over") fail(`game ${seed} never ended`);
  const live = s.players.filter((p) => !p.left);
  if (s.winBy !== "forfeit") {
    if (s.moves !== totalLines(w, h)) fail("ended with lines left");
    const top = Math.max(...live.map((p) => p.score));
    const leaders = live.filter((p) => p.score === top);
    if (leaders.length > 1 ? s.winner !== null : s.winner !== leaders[0].id) fail("wrong winner");
  }
  if (!dotsModule.isOver!(s)) fail("isOver false");
  const v = redactDots(s, "spectator", now);
  if (v.youId !== "spectator" || v.boxes.length !== w * h) fail("view");
  stats.games++;
  if (s.winBy === "forfeit") stats.walkovers++;
  else if (s.winner) stats.wins++;
  else stats.draws++;
  return s;
}

function cases() {
  const rng = mulberry32(3);
  // a 2×2: the fourth side claims the box and the mover goes again
  const s = initDots(players(2), 0);
  applyDotsMove(s, "p0", { type: "size", w: 2, h: 2 }, 1, rng);
  applyDotsMove(s, "p0", { type: "start" }, 2, rng);
  s.turn = "p0";
  const seq: [string, "h" | "v", number, number][] = [
    ["p0", "h", 0, 0],
    ["p1", "v", 0, 0],
    ["p0", "h", 1, 0],
  ];
  for (const [id, o, r, c] of seq) applyDotsMove(s, id, { type: "line", o, r, c }, 3, rng);
  if (s.turn !== "p1") fail("case: turn order");
  applyDotsMove(s, "p1", { type: "line", o: "v", r: 0, c: 1 }, 4, rng);
  if (s.boxes[0] !== 1 || s.players[1].score !== 1 || s.turn !== "p1") fail("case: closing a box");
  // one line can close two boxes at once
  const d = initDots(players(2), 0);
  applyDotsMove(d, "p0", { type: "size", w: 2, h: 2 }, 1, rng);
  applyDotsMove(d, "p0", { type: "start" }, 2, rng);
  const draws: ["h" | "v", number, number][] = [["h", 0, 0], ["h", 0, 1], ["h", 1, 0], ["h", 1, 1], ["v", 0, 0], ["v", 0, 2]];
  for (const [o, r, c] of draws) applyDotsMove(d, d.turn, { type: "line", o, r, c }, 3, rng);
  const mover = d.turn;
  applyDotsMove(d, mover, { type: "line", o: "v", r: 0, c: 1 }, 4, rng);
  if (d.last?.boxes.length !== 2 || d.players.find((p) => p.id === mover)!.score !== 2) fail("case: double box");
  // the auto line takes a free box, and otherwise avoids handing one over
  const a = initDots(players(2), 0);
  applyDotsMove(a, "p0", { type: "size", w: 3, h: 3 }, 1, rng);
  applyDotsMove(a, "p0", { type: "start" }, 2, rng);
  for (const [o, r, c] of [["h", 0, 0], ["h", 1, 0], ["v", 0, 0]] as ["h" | "v", number, number][]) applyDotsMove(a, a.turn, { type: "line", o, r, c }, 3, rng);
  const [o, r, c] = autoLine(a, rng);
  if (!(o === "v" && r === 0 && c === 1)) fail(`case: auto line skipped a free box (${o}${r},${c})`);
  // a walk-out in a two-player game hands it over
  const f = initDots(players(2), 0);
  applyDotsMove(f, "p0", { type: "start" }, 1, rng);
  forfeitDots(f, "p1", 2, rng);
  if (f.phase !== "over" || f.winner !== "p0" || f.winBy !== "forfeit") fail("case: walkover");
  // the host walking out during setup hands setup to the next seat
  const g = initDots(players(3), 0);
  forfeitDots(g, "p0", 1, rng);
  if (g.phase !== "setup" || g.turn !== "p1") fail("case: setup handover");
}

const t0 = Date.now();
cases();
console.log("rule cases ok");
for (const n of [2, 3, 4, 5, 6, 7, 8]) for (let i = 0; i < 160; i++) playGame(n, n * 10_000 + i);
console.log(
  `OK: ${stats.games} games on ${stats.sizes.size} page sizes — ${stats.wins} wins, ${stats.draws} draws, ${stats.walkovers} walkovers; ${stats.extra} extra turns, ${stats.timeouts} timeouts`
);
const x = playGame(3, 99);
const y = playGame(3, 99);
if (JSON.stringify(x) !== JSON.stringify(y)) fail("not deterministic");
console.log(`all Dots and Boxes checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
