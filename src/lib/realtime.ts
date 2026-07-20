/* Change notifications for parties.
   With Redis: Upstash pub/sub — PUBLISH via REST, SUBSCRIBE via the REST SSE endpoint.
   Without Redis (local dev): an in-process bus. */

import { redisRestCreds } from "./store";

const channel = (code: string) => `coup:ch:${code}`;

/* ---------------- in-process bus (dev fallback; also used alongside Redis
   so same-instance listeners get zero-latency signals) ---------------- */

type Listener = () => void;

function bus(): Map<string, Set<Listener>> {
  const g = globalThis as unknown as { __coupBus?: Map<string, Set<Listener>> };
  g.__coupBus ??= new Map();
  return g.__coupBus;
}

function localPublish(code: string) {
  bus()
    .get(code)
    ?.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
}

function localSubscribe(code: string, fn: Listener): () => void {
  const b = bus();
  if (!b.has(code)) b.set(code, new Set());
  b.get(code)!.add(fn);
  return () => b.get(code)?.delete(fn);
}

/* ---------------- public API ---------------- */

/** Fire-and-forget: tell every stream that this party changed. */
export function publishChange(code: string, version: number): void {
  localPublish(code);
  const creds = redisRestCreds();
  if (!creds) return;
  // REST publish; never let it block or fail the request
  void fetch(`${creds.url}/publish/${encodeURIComponent(channel(code))}/${version}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}` },
  }).catch(() => {});
}

/**
 * Listen for change signals for `code` until `signal` aborts.
 * Uses the in-process bus AND (when configured) an Upstash SSE subscription,
 * so cross-instance writes on Vercel are seen too.
 */
export function subscribeChanges(code: string, signal: AbortSignal, onSignal: () => void): void {
  const offLocal = localSubscribe(code, onSignal);
  signal.addEventListener("abort", offLocal, { once: true });

  const creds = redisRestCreds();
  if (!creds) return;

  // Long-lived SSE subscription to Upstash; reconnect while our stream lives.
  void (async () => {
    while (!signal.aborted) {
      try {
        const res = await fetch(`${creds.url}/subscribe/${encodeURIComponent(channel(code))}`, {
          headers: { Authorization: `Bearer ${creds.token}`, Accept: "text/event-stream" },
          signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) throw new Error(`subscribe ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            // Upstash SSE frames: "data: message,<channel>,<payload>"
            if (line.startsWith("data:") && line.includes("message,")) onSignal();
          }
        }
      } catch {
        // fall through to retry
      }
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, 1500));
    }
  })();
}
