import { auth, readParty, viewFor } from "@/lib/api";
import { subscribeChanges } from "@/lib/realtime";

export const dynamic = "force-dynamic";
// Fluid Compute holds the stream open; client reconnects when it ends.
export const maxDuration = 300;

const STREAM_LIFETIME_MS = 280_000;
const HEARTBEAT_MS = 20_000;
/** Safety net: periodically re-read even without a signal — this also drives
    game timers (tick) when nobody is acting, and heals missed pub/sub frames. */
const SAFETY_POLL_MS = 5_000;

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await ctx.params;
  const code = rawCode.toUpperCase();

  const initial = await readParty(code);
  if (!initial) return new Response("not found", { status: 404 });
  const viewer = auth(req, initial);
  if (!viewer) return new Response("unauthorized", { status: 401 });
  const viewerId = viewer.id;

  const encoder = new TextEncoder();
  const abort = new AbortController();
  let lastVersion = 0;
  let closed = false;
  let reading = false;
  let pendingSignal = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        abort.abort();
        timers.forEach(clearInterval);
        try {
          controller.close();
        } catch {}
      };

      const push = async () => {
        if (closed) return;
        if (reading) {
          pendingSignal = true;
          return;
        }
        reading = true;
        try {
          const state = await readParty(code);
          if (!state) {
            send({ t: "gone" });
            cleanup();
            return;
          }
          if (!state.members.some((m) => m.id === viewerId)) {
            send({ t: "kicked" });
            cleanup();
            return;
          }
          if (state.version > lastVersion) {
            lastVersion = state.version;
            send({ t: "state", v: state.version, view: viewFor(state, viewerId) });
          }
        } catch {
          // transient read failure — safety poll will retry
        } finally {
          reading = false;
          if (pendingSignal && !closed) {
            pendingSignal = false;
            void push();
          }
        }
      };

      // initial state
      lastVersion = initial.version;
      send({ t: "state", v: initial.version, view: viewFor(initial, viewerId) });

      // realtime signals (Redis pub/sub relay + in-process bus)
      subscribeChanges(code, abort.signal, () => void push());

      // safety poll: drives timers, heals missed frames
      timers.push(setInterval(() => void push(), SAFETY_POLL_MS));
      // heartbeat so the client can detect a dead stream
      timers.push(setInterval(() => send({ t: "hb" }), HEARTBEAT_MS));
      // bounded lifetime — the client transparently reconnects
      timers.push(
        setTimeout(() => {
          send({ t: "bye" });
          cleanup();
        }, STREAM_LIFETIME_MS)
      );

      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      closed = true;
      abort.abort();
      timers.forEach(clearInterval);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
