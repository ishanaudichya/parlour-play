"use client";

/* The Parlour's background music: a short playlist for its own rooms — the
   door, the invitation, the lobby. Browsers only let a page make sound after
   a tap, so the door asks first ("enter with music"); after that the music
   starts on the next tap anywhere. It fades away while a game is on (every
   game brings its own sound) and comes back in the lobby. The site-wide mute
   silences it too.

   The tracks play in order from a random starting point, round and round,
   through one audio element and a gain node on the shared AudioContext so the
   music can fade everywhere — iOS ignores HTMLAudioElement.volume. */

import { useSyncExternalStore } from "react";
import { audioContext, isMuted, subscribeMuted } from "./synthCore";

export interface Track {
  /** file under /public */
  src: string;
  title: string;
}

export interface Music {
  artist: string;
  /** the credit line the licence (or the artist) asks for */
  credit: string;
  tracks: Track[];
}

/** The lobby's music. `null` turns music (and the door's ask) off entirely.
    Louie Zong lets anyone use his music as long as he's credited
    (x.com/everydaylouie/status/1253021154857508864); this is the free download
    from his Bandcamp, louiezong.bandcamp.com/album/ghost-songs. */
export const MUSIC: Music | null = {
  artist: "Louie Zong",
  credit: "“Ghost Duet” by Louie Zong · louiezong.bandcamp.com",
  tracks: [{ src: "/music/ghost-duet.mp3", title: "Ghost Duet" }],
};

const LEVEL = 0.3;
const FADE_S = 1.6;
const PREF = "parlour.music";

let audio: HTMLAudioElement | null = null;
let gain: GainNode | null = null;
let at = 0; // the track playing, or next to play
let wanted: boolean | null = null; // the listener's choice, remembered
let ducked = false; // a game is on
let playing = false;
let armed = false;
let pauseTimer: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((cb) => cb());

function pref(): boolean {
  if (wanted === null) {
    try {
      wanted = localStorage.getItem(PREF) !== "off";
    } catch {
      wanted = true;
    }
  }
  return wanted;
}

function audible() {
  return !!MUSIC && pref() && !isMuted() && !ducked;
}

/** Build the element and its gain node; only ever from a user gesture. */
function ensure(): boolean {
  if (!MUSIC) return false;
  if (audio && gain) return true;
  const ctx = audioContext();
  if (!ctx) return false;
  const { tracks } = MUSIC;
  at = Math.floor(Math.random() * tracks.length);
  audio = new Audio(tracks[at].src);
  audio.loop = tracks.length === 1;
  audio.preload = "auto";
  gain = ctx.createGain();
  gain.gain.value = 0;
  ctx.createMediaElementSource(audio).connect(gain);
  gain.connect(ctx.destination);
  audio.addEventListener("playing", () => {
    playing = true;
    emit();
  });
  audio.addEventListener("pause", () => {
    playing = false;
    emit();
  });
  // one song ends, the next begins
  audio.addEventListener("ended", () => {
    if (!audio) return;
    at = (at + 1) % tracks.length;
    audio.src = tracks[at].src;
    if (audible()) audio.play().catch(() => arm());
    emit();
  });
  return true;
}

/** Fade toward whatever the current state calls for. */
function apply() {
  if (!audio || !gain) return;
  const ctx = gain.context;
  const now = ctx.currentTime;
  const target = audible() ? LEVEL : 0;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + FADE_S);
  if (pauseTimer) window.clearTimeout(pauseTimer);
  pauseTimer = null;
  if (target > 0) {
    if (audio.paused) audio.play().catch(() => arm());
  } else if (!audio.paused) {
    // let the fade finish, then stop decoding
    pauseTimer = window.setTimeout(() => audio?.pause(), FADE_S * 1000 + 100);
  }
}

/** Start (or resume) the music. Call from a click/tap/keypress. */
export function startMusic() {
  if (!audible()) return;
  if (!ensure()) return;
  apply();
}

/** Wait for the next tap or key anywhere, then start the music. */
export function armMusic() {
  if (armed || typeof window === "undefined" || !MUSIC) return;
  armed = true;
  const go = () => {
    window.removeEventListener("pointerdown", go, true);
    window.removeEventListener("keydown", go, true);
    armed = false;
    startMusic();
  };
  window.addEventListener("pointerdown", go, true);
  window.addEventListener("keydown", go, true);
}
const arm = armMusic;

export function setMusicOn(on: boolean) {
  wanted = on;
  try {
    localStorage.setItem(PREF, on ? "on" : "off");
  } catch {}
  if (on) startMusic();
  else apply();
  emit();
}

/** Fade out while a game is on; back in the lobby. */
export function duckMusic(on: boolean) {
  if (ducked === on) return;
  ducked = on;
  apply();
}

// the site-wide mute silences the music as well
if (typeof window !== "undefined") subscribeMuted(() => apply());

/* ---------------- React ---------------- */

function subscribe(cb: () => void) {
  listeners.add(cb);
  const unMute = subscribeMuted(cb);
  return () => {
    listeners.delete(cb);
    unMute();
  };
}
const snapshot = () => (MUSIC ? `${pref() ? "on" : "off"}:${playing && audible() ? "playing" : "idle"}:${at}` : "none");

/** { on: the listener wants music, playing: it's actually sounding, track: the song (playing or next) } */
export function useMusic() {
  const s = useSyncExternalStore(subscribe, snapshot, () => "none");
  const [on, state, i] = s.split(":");
  return { available: s !== "none", on: on === "on", playing: state === "playing", track: MUSIC?.tracks[Number(i) || 0] ?? null };
}
