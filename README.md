# PARLOUR — six games, one table

A real-time multiplayer party-games platform built for Vercel. Create a **party**, share the
link or 5-letter code, and your group can play game after game — no accounts, no installs.

**Six games, six design languages:**

| Game | Players | Look |
| --- | --- | --- |
| **Coup** | 2–6 | ink & gold art-deco court |
| **UNO** | 2–8 | neon arcade playful |
| **Monopoly Deal** | 2–5 | cream banknote ledger |
| **Teen Patti** | 2–8 | midnight casino felt |
| **Mafia** | 6–8 | rain-soaked noir case file |
| **Battleship** | 2 | phosphor-green sonar ops room |

Everything is code — hand-drawn SVG card art, WebAudio-synthesized sound design, and
server-authoritative engines for every game (nobody can cheat by reading the network tab).

## How it works

- **Party layer** — a party is the durable thing: members join once, the host picks games
  repeatedly, win tallies accumulate per game. Friends who arrive mid-game spectate and get
  dealt into the next one.
- **Real-time, not polling** — clients hold a fetch-based **SSE stream**
  (`/api/party/[code]/stream`, Fluid Compute, 300 s max duration with transparent
  reconnects). Writers `PUBLISH` to **Upstash Redis pub/sub**; streams relay the signal and
  push freshly redacted state. Server-side game timers are driven by the streams themselves
  (a 5 s safety re-read inside each stream), so windows expire even when nobody acts.
- **Fault tolerant by design** — heartbeats every 20 s with a client watchdog, exponential
  backoff reconnects, version-gated resync (stale frames dropped), and if the stream is down
  the client **automatically degrades to polling** until it recovers — the game never
  freezes. All writes are atomic compare-and-set against Redis; conflicting writes retry.
- **Engines** — each game implements one `GameModule` contract (`init / applyMove / tick /
  redact / result`) in `src/lib/games/<game>/`. State is JSON in Redis (24 h TTL); every
  view is redacted per player server-side, so your cards are only ever sent to you.

## Stack

Next.js (App Router) · TypeScript · Tailwind v4 · framer-motion · @upstash/redis.
Local dev falls back to an in-memory store + in-process pub/sub — `npm run dev` works with
zero setup.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, then join your own party from a second private-browsing window.

## Deploy to Vercel

1. Push to GitHub and import in Vercel (or run `vercel`).
2. Add Redis env vars (any of these forms work — see `.env.example`):
   `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_*`, or just
   `REDIS_URL` with an Upstash `rediss://` string. The Vercel Marketplace Upstash
   integration injects them automatically.
3. Deploy. No other configuration.

## Engine testing

Every game engine is fuzz-tested: thousands of randomized games with invariants checked on
every step (card/chip conservation, no negative balances, redaction leak checks, guaranteed
termination, winner validity).

```bash
npm run simulate            # Coup        (3000 games)
npm run simulate:uno        # UNO         (3000 games)
npm run simulate:teenpatti  # Teen Patti  (2500 sessions + 30 ranking unit tests)
npm run simulate:monodeal   # Monopoly Deal (2000 games, deck-of-106 conservation)
npm run simulate:mafia      # Mafia       (1500 games + privacy/phase invariants)
npm run simulate:battleship # Battleship  (3000 games + secrecy leak checks)
npm run simulate:all
```

## Rules notes

- **Coup** — full base game: challenges on every claim, blocks (Duke / Contessa /
  Captain / Ambassador), challengeable blocks, forced coup at 10+, assassination coins spent
  even when blocked, proven cards reshuffled, 30 s reaction windows that auto-allow.
- **UNO** — standard 108-card rules, draw-then-play, no stacking; UNO call with
  catch penalty; 45 s turns auto-draw.
- **Monopoly Deal** — full 106-card deck, 3 plays/turn, payments from the table only,
  Just Say No counter-windows (JSN vs JSN), Deal Breaker / Sly / Forced Deal, houses &
  hotels, double-the-rent; buildings paid out convert to bank money (house rule).
- **Teen Patti** — blind/seen stakes (×1/×2 blind, ×2/×4 seen), show rules with
  asker-loses ties, full hand ranking (trail > pure sequence > sequence > colour > pair >
  high, A-K-Q > A-2-3 > K-Q-J); simplified all-in without side pots; sessions end when one
  player can post the boot or after 50 hands.
- **Mafia** — moderator-free 6–8 player social deduction with simultaneous Mafia /
  Detective / Doctor night actions, private investigations, 90 s in-person discussion,
  secret ballots, one tied-vote runoff, public role reveals, and faction-wide victories.
- **Battleship** — classic 10×10, fleet of 5/4/3/3/2, simultaneous private placement
  (90 s, auto-scatter), hit-shoots-again house rule, 45 s turns auto-fire; sunk ships are
  revealed, hidden ships never leave the server.
