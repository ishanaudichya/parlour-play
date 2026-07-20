"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PartyMove, PartyPreview, PartyView } from "@/lib/party/types";
import { loadSession, saveSession, type Session } from "./session";

/** Connection quality: live = SSE stream, degraded = polling fallback, connecting = between */
export type Connection = "live" | "degraded" | "connecting";

const WATCHDOG_MS = 35_000; // heartbeats arrive every 20s
const FALLBACK_POLL_MS = 2_500;

export interface PartyApi {
  ready: boolean;
  session: Session | null;
  view: PartyView | null;
  preview: PartyPreview | null;
  notFound: boolean;
  connection: Connection;
  toast: string | null;
  clearToast: () => void;
  skew: number;
  join: (name: string) => Promise<string | null>;
  move: (m: PartyMove) => Promise<void>;
}

export function useParty(code: string): PartyApi {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setViewState] = useState<PartyView | null>(null);
  const [preview, setPreview] = useState<PartyPreview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [toast, setToast] = useState<string | null>(null);
  const [skew, setSkew] = useState(0);

  const viewRef = useRef<PartyView | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const abortRef = useRef<AbortController | null>(null); // aborts the CURRENT stream request

  const applyView = useCallback((next: PartyView) => {
    if (viewRef.current && next.version < viewRef.current.version) return; // stale
    viewRef.current = next;
    setViewState(next);
    setSkew(next.now - Date.now());
  }, []);

  const authHeaders = useCallback((): Record<string, string> | undefined => {
    const s = sessionRef.current;
    return s ? { "x-player-id": s.playerId, "x-player-secret": s.secret } : undefined;
  }, []);

  /** One plain state fetch (used before join, and as degraded fallback). */
  const pollOnce = useCallback(async (): Promise<boolean> => {
    try {
      const s = sessionRef.current;
      const v = viewRef.current?.version ?? 0;
      const res = await fetch(`/api/party/${code}/state${s ? `?v=${v}` : ""}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (res.status === 404) {
        setNotFound(true);
        return false;
      }
      if (!res.ok) return false;
      const data = await res.json();
      if (data.preview) setPreview(data.preview);
      else if (data.view) applyView(data.view);
      return true;
    } catch {
      return false;
    }
  }, [code, applyView, authHeaders]);

  /** The main loop: keep an SSE stream open; while it's down, poll. */
  const runLoop = useCallback(
    async (lifetime: AbortSignal) => {
      // when the hook unmounts, also cancel whatever stream request is in flight
      lifetime.addEventListener("abort", () => abortRef.current?.abort(), { once: true });
      let failures = 0;
      while (!lifetime.aborted) {
        if (!sessionRef.current) {
          // no session yet: keep the preview fresh at a slow cadence
          setConnection("degraded");
          await pollOnce();
          await sleep(4000);
          continue;
        }
        const ac = new AbortController();
        abortRef.current = ac;
        let watchdog: ReturnType<typeof setTimeout> | null = null;
        const armWatchdog = () => {
          if (watchdog) clearTimeout(watchdog);
          watchdog = setTimeout(() => ac.abort(), WATCHDOG_MS);
        };
        try {
          const res = await fetch(`/api/party/${code}/stream`, {
            headers: { ...authHeaders(), accept: "text/event-stream" },
            cache: "no-store",
            signal: ac.signal,
          });
          if (res.status === 404) {
            setNotFound(true);
            return;
          }
          if (res.status === 401) {
            // stale session (party recreated?) — drop to join gate
            sessionRef.current = null;
            setSession(null);
            continue;
          }
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

          setConnection("live");
          failures = 0;
          armWatchdog();
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            armWatchdog();
            buf += decoder.decode(value, { stream: true });
            const frames = buf.split("\n\n");
            buf = frames.pop() ?? "";
            for (const frame of frames) {
              const line = frame.split("\n").find((l) => l.startsWith("data:"));
              if (!line) continue;
              let msg: { t: string; view?: PartyView };
              try {
                msg = JSON.parse(line.slice(5));
              } catch {
                continue;
              }
              if (msg.t === "state" && msg.view) applyView(msg.view);
              else if (msg.t === "gone") {
                setNotFound(true);
                return;
              } else if (msg.t === "kicked") {
                sessionRef.current = null;
                setSession(null);
              }
              // "hb" and "bye" only feed the watchdog
            }
          }
        } catch {
          failures++;
        } finally {
          if (watchdog) clearTimeout(watchdog);
        }
        if (lifetime.aborted) return;

        // stream ended: normal rotation reconnects immediately; real failures
        // back off and keep the UI fresh by polling in the meantime.
        if (failures > 0) {
          setConnection("degraded");
          const backoff = Math.min(10_000, 1000 * 2 ** Math.min(failures - 1, 3)) + Math.random() * 400;
          const until = Date.now() + backoff;
          while (Date.now() < until && !lifetime.aborted) {
            await sleep(Math.min(FALLBACK_POLL_MS, until - Date.now()));
            await pollOnce();
          }
        }
      }
    },
    [code, applyView, authHeaders, pollOnce]
  );

  useEffect(() => {
    const lifetime = new AbortController();
    const boot = setTimeout(() => {
      const s = loadSession(code);
      sessionRef.current = s;
      setSession(s);
      setReady(true);
      void runLoop(lifetime.signal);
    }, 0);
    const onVisible = () => {
      // force a fresh stream (and instant state) when the tab wakes up
      if (document.visibilityState === "visible") abortRef.current?.abort();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(boot);
      lifetime.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, runLoop]);

  const join = useCallback(
    async (name: string): Promise<string | null> => {
      try {
        const res = await fetch(`/api/party/${code}/join`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok) return data.error ?? "Could not join.";
        const s: Session = { playerId: data.playerId, secret: data.secret, name };
        saveSession(code, s);
        sessionRef.current = s;
        setSession(s);
        abortRef.current?.abort(); // restart loop with auth
        return null;
      } catch {
        return "Network error — try again.";
      }
    },
    [code]
  );

  const move = useCallback(
    async (m: PartyMove) => {
      const s = sessionRef.current;
      if (!s) return;
      try {
        const res = await fetch(`/api/party/${code}/move`, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify(m),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.error) setToast(data.error);
          void pollOnce();
          return;
        }
        applyView(data.view);
      } catch {
        setToast("Network error — try again.");
      }
    },
    [code, applyView, authHeaders, pollOnce]
  );

  return {
    ready,
    session,
    view,
    preview,
    notFound,
    connection,
    toast,
    clearToast: useCallback(() => setToast(null), []),
    skew,
    join,
    move,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
