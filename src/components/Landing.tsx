"use client";

import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CardFace as CoupCard } from "@/components/games/coup/CardArt";
import { MdCardFace } from "@/components/games/monodeal/cards";
import { CardFace as TeenPattiCard } from "@/components/games/teenpatti/PlayingCard";
import { CardFace as UnoCard } from "@/components/games/uno/cards";
import { NeonMark, S_INPUT, SButton, SPanel } from "@/components/party/shell";
import { saveSession, useSavedName } from "@/lib/client/session";
import { primeSound } from "@/lib/client/synthCore";
import { sfx } from "@/lib/client/sound";
import { GAME_META } from "@/lib/games/registry";

/* One artifact from each game, fanned on the table: the whole pitch in one image. */
const FAN = [
  { key: "coup", rot: -21, x: -196, y: 36, w: 82 },
  { key: "uno", rot: -13, x: -118, y: 14, w: 80 },
  { key: "mafia", rot: -4, x: -40, y: 0, w: 80 },
  { key: "battleship", rot: 4, x: 40, y: 0, w: 80 },
  { key: "monodeal", rot: 13, x: 118, y: 14, w: 82 },
  { key: "teenpatti", rot: 21, x: 196, y: 36, w: 82 },
] as const;

function HeroArtifact({ k }: { k: (typeof FAN)[number]["key"] }) {
  switch (k) {
    case "coup":
      return <CoupCard ch="duke" className="h-auto w-full" />;
    case "uno":
      return <UnoCard card={{ id: "hero-uno", color: "red", symbol: "7" }} w={92} className="h-auto w-full" />;
    case "monodeal":
      return (
        <MdCardFace
          card={{ id: "hero-md", kind: "property", value: 4, color: "dark_blue", name: "Boardwalk" }}
          w={94}
          className="h-auto w-full"
        />
      );
    case "teenpatti":
      return <TeenPattiCard card={{ r: 14, s: "S" }} className="h-auto w-full" />;
    case "mafia":
      return (
        <div className="flex aspect-5/7 w-full flex-col items-center justify-center border border-[#9d8256] bg-[radial-gradient(circle_at_50%_25%,#33242a,#101214_68%)] text-[#dcc69b]">
          <span className="text-3xl text-[#c75164]">◆</span>
          <span className="mt-2 text-[10px] font-semibold tracking-[0.28em]">MAFIA</span>
          <span className="mt-1 text-[6px] uppercase tracking-[0.18em] text-[#827c72]">sealed role</span>
        </div>
      );
    case "battleship":
      return (
        <div className="relative aspect-5/7 w-full overflow-hidden border border-[#2e5d4a] bg-[radial-gradient(circle_at_50%_30%,#0c1d2b,#050b12_75%)]">
          <svg viewBox="0 0 50 70" className="h-full w-full" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <line key={`v${i}`} x1={7 + i * 7.2} y1="10" x2={7 + i * 7.2} y2="46" stroke="#3dde9b" strokeOpacity="0.22" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={`h${i}`} x1="7" y1={10 + i * 7.2} x2="43" y2={10 + i * 7.2} stroke="#3dde9b" strokeOpacity="0.22" strokeWidth="0.5" />
            ))}
            <rect x="14" y="24.4" width="21.6" height="7.2" rx="3.6" fill="#3dde9b" fillOpacity="0.3" stroke="#3dde9b" strokeWidth="0.6" />
            <circle cx="32.2" cy="20.8" r="2" fill="#ff7a45" />
            <circle cx="18" cy="42" r="1.2" fill="#7ba8c0" fillOpacity="0.7" />
            <text x="25" y="59" textAnchor="middle" fontSize="4.6" fontWeight="700" letterSpacing="1.6" fill="#6dffc0">
              BATTLESHIP
            </text>
            <text x="25" y="65" textAnchor="middle" fontSize="2.6" letterSpacing="0.9" fill="#5b7a8c">
              B-7 · DIRECT HIT
            </text>
          </svg>
        </div>
      );
  }
}

export function Landing() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useSavedName();
  const [code, setCode] = useState(params.get("join")?.toUpperCase() ?? "");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validName = name.trim().length >= 1;

  async function createParty() {
    if (!validName || busy) return;
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/party", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create a party.");
        setBusy(null);
        return;
      }
      saveSession(data.code, { playerId: data.playerId, secret: data.secret, name: name.trim() });
      sfx("start");
      router.push(`/p/${data.code}`);
    } catch {
      setError("Network error — try again.");
      setBusy(null);
    }
  }

  function joinParty() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) {
      setError("Enter the party code.");
      return;
    }
    setBusy("join");
    router.push(`/p/${c}`);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      {/* hero: one card from each game under the neon sign */}
      <div className="relative mb-9 flex flex-col items-center">
        <div
          className="relative h-[130px] w-[360px] origin-bottom scale-[0.68] sm:h-[176px] sm:w-[520px] sm:scale-100"
          aria-hidden
        >
          {FAN.map((f, i) => (
            <div key={f.key} className="absolute left-1/2 top-4" style={{ width: f.w, marginLeft: -f.w / 2 }}>
              <motion.div
                style={{ transformOrigin: "50% 130%" }}
                initial={{ opacity: 0, y: 52, rotate: 0 }}
                animate={{ opacity: 1, y: f.y, x: f.x, rotate: f.rot }}
                transition={{ delay: 0.15 + i * 0.11, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: f.y - 14, rotate: f.rot / 2, transition: { duration: 0.2 } }}
              >
                <div className="overflow-hidden rounded-[8px] shadow-[0_18px_32px_rgba(0,0,0,0.6)]">
                  <HeroArtifact k={f.key} />
                </div>
                <div
                  className="mt-2 text-center text-[9px] font-semibold uppercase tracking-[0.24em]"
                  style={{ color: GAME_META[f.key].accent }}
                >
                  {GAME_META[f.key].title}
                </div>
              </motion.div>
            </div>
          ))}
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 mt-6"
        >
          <NeonMark className="text-[64px] leading-none sm:text-[84px]" />
        </motion.h1>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.6 }}
          className="mt-4 flex items-center gap-3"
        >
          <span className="shairline w-12" />
          <span className="slabel">six games · one table</span>
          <span className="shairline w-12" />
        </motion.div>
      </div>

      {/* entry panel */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <SPanel className="p-6 sm:p-7">
          <label className="slabel mb-2 block" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createParty()}
            onFocus={() => primeSound()}
            placeholder="e.g. Machiavelli"
            className={`${S_INPUT} mb-4`}
          />
          <SButton
            variant="primary"
            className="w-full py-3.5 text-[13px]"
            disabled={!validName || busy !== null}
            onClick={createParty}
          >
            {busy === "create" ? "Opening the parlour…" : "Start a party"}
          </SButton>

          <div className="my-5 flex items-center gap-3">
            <span className="shairline flex-1" />
            <span className="slabel">or join with a code</span>
            <span className="shairline flex-1" />
          </div>

          <div className="flex gap-2">
            <input
              value={code}
              maxLength={5}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && joinParty()}
              placeholder="CODE"
              className={`${S_INPUT} w-0 flex-1 text-center font-shell text-lg font-semibold tracking-[0.4em] !text-coral-300 placeholder:tracking-[0.2em]`}
            />
            <SButton className="px-5" disabled={busy !== null || code.trim().length < 4} onClick={joinParty}>
              Join
            </SButton>
          </div>

          {error && <p className="mt-3 text-center text-[13px] text-blood-300">{error}</p>}
        </SPanel>

        {/* how it works */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.05, duration: 0.6 }}
          className="mt-7 grid grid-cols-3 gap-2 text-center"
        >
          {[
            ["1", "Gather", "share one link — everyone joins in seconds"],
            ["2", "Pick a game", "the host deals a new game every round"],
            ["3", "Keep score", "victories tally up all night long"],
          ].map(([n, title, sub]) => (
            <div key={title} className="px-1">
              <div className="font-shell text-[15px] italic text-coral-400">{n}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-linen-100">{title}</div>
              <div className="mt-1 text-[10.5px] leading-snug text-linen-500">{sub}</div>
            </div>
          ))}
        </motion.div>

        <div className="mt-7 flex items-center justify-center">
          <span className="slabel">2–8 friends · no accounts · free</span>
        </div>
      </motion.div>
    </main>
  );
}
