/* Shared WebAudio synth primitives. Each game builds its own sound bank on
   top of these; nothing here is game-flavored. All sound is synthesized —
   no assets, no network. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let loaded = false;
const muteListeners = new Set<() => void>();

function loadMuted() {
  if (loaded) return;
  loaded = true;
  try {
    muted = localStorage.getItem("coup.muted") === "1";
  } catch {}
}

export function isMuted(): boolean {
  loadMuted();
  return muted;
}

export function setMuted(m: boolean) {
  loadMuted();
  muted = m;
  try {
    localStorage.setItem("coup.muted", m ? "1" : "0");
  } catch {}
  muteListeners.forEach((cb) => cb());
}

/* useSyncExternalStore adapters for the mute state */
export function subscribeMuted(cb: () => void): () => void {
  muteListeners.add(cb);
  return () => muteListeners.delete(cb);
}
export const getMutedSnapshot = () => isMuted();
export const getMutedServerSnapshot = () => false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call once on a user gesture so iOS unlocks audio. */
export function primeSound() {
  loadMuted();
  ac();
}

export interface ToneOpts {
  f: number;
  f2?: number; // glide target
  type?: OscillatorType;
  at?: number; // start offset (s)
  dur: number;
  g?: number;
  attack?: number;
}

export function tone(o: ToneOpts) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(o.f2, 1), t0 + o.dur);
  const g = o.g ?? 0.12;
  const a = o.attack ?? 0.004;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(g, t0 + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

export interface NoiseOpts {
  at?: number;
  dur: number;
  g?: number;
  filter?: { type: BiquadFilterType; f: number; f2?: number; q?: number };
}

export function noise(o: NoiseOpts) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const len = Math.max(1, Math.floor(c.sampleRate * o.dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  const g = o.g ?? 0.1;
  gain.gain.setValueAtTime(g, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  let node: AudioNode = src;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.setValueAtTime(o.filter.f, t0);
    if (o.filter.f2) f.frequency.exponentialRampToValueAtTime(o.filter.f2, t0 + o.dur);
    f.Q.value = o.filter.q ?? 1;
    node.connect(f);
    node = f;
  }
  node.connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}

/** Wrap a bank function: respects mute, never throws. */
export function guarded(fn: () => void) {
  loadMuted();
  if (muted) return;
  try {
    fn();
  } catch {}
}

/** Generic UI click, shared by all designs. */
export function uiClick() {
  guarded(() => tone({ f: 1900, type: "square", dur: 0.022, g: 0.05 }));
}

/**
 * Build a typed sound bank: `const sfx = makeBank({ pop() {...}, ... })`.
 * Every entry is automatically mute-aware and exception-safe.
 */
export function makeBank<K extends string>(bank: Record<K, () => void>): (name: K) => void {
  return (name: K) => guarded(bank[name]);
}
