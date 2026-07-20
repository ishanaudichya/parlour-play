"use client";

/* The action tray: See / Blind / Blind x2 / Chaal / Chaal x2 / Show / Fold,
   each with its exact chip cost. Amounts clamp to an all-in when short. */

import type { TeenPattiMove, TeenPattiView } from "@/lib/games/teenpatti/types";
import { ChipSvg } from "./Chips";

const btnBase =
  "flex min-w-[86px] flex-col items-center gap-0.5 rounded-md border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35";

function AmountTag({ amount, allIn }: { amount: number; allIn: boolean }) {
  return (
    <span className="flex items-center gap-1 text-[10px] normal-case tracking-normal opacity-90">
      <ChipSvg denom={allIn ? 25 : 5} className="w-[11px]" />
      {allIn ? `All-in ${amount}` : amount}
    </span>
  );
}

export function ActionTray({
  v,
  youId,
  spectating,
  send,
}: {
  v: TeenPattiView;
  youId: string;
  spectating: boolean;
  send: (m: TeenPattiMove) => void;
}) {
  const me = v.players.find((p) => p.id === youId);

  if (spectating || !me) return null;
  if (v.phase === "session_over") return null;

  const playing = v.phase === "playing";
  const myTurn = playing && v.turn === youId;
  const inHand = me.inHand && !me.folded;
  const alive = v.players.filter((p) => p.inHand && !p.folded);

  const base = (me.seen ? 2 : 1) * v.stake; // chaal for seen, stake for blind
  const betAmt = Math.min(base, me.chips);
  const raiseAmt = Math.min(base * 2, me.chips);
  const showCost = base; // stake if blind, 2x stake if seen
  const canShow = myTurn && alive.length === 2 && me.chips >= showCost;

  let status: string;
  if (me.left) status = "You have left the table";
  else if (me.busted) status = "Out of chips — spectating the rest of the session";
  else if (!me.inHand) status = "Sitting out this hand";
  else if (me.folded) status = "Folded — waiting for the next hand";
  else if (v.phase === "hand_over") status = "Hand over";
  else if (myTurn) status = `Your move — stake ${v.stake}`;
  else {
    const turnP = v.players.find((p) => p.id === v.turn);
    status = turnP ? `Waiting for ${turnP.name}…` : "Waiting…";
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-2 pb-3">
      <div
        className={`mb-1.5 text-center text-[11px] tracking-[0.2em] uppercase ${
          myTurn ? "text-[#e9cf8e]" : "text-[#8fa396]"
        }`}
      >
        {status}
      </div>

      {inHand && playing && (
        <div className="flex flex-wrap items-stretch justify-center gap-1.5 sm:gap-2">
          {!me.seen && (
            <button
              type="button"
              onClick={() => send({ type: "see" })}
              className={`${btnBase} border-[#7ea0c2]/60 bg-[#101c2a]/90 text-[#b9d4ee] hover:border-[#9fc0e0]`}
            >
              See cards
              <span className="text-[10px] normal-case tracking-normal opacity-80">free</span>
            </button>
          )}

          {!me.seen ? (
            <>
              <button
                type="button"
                disabled={!myTurn}
                onClick={() => send({ type: "bet" })}
                className={`${btnBase} border-[#c9a961]/70 bg-[#123328]/95 text-[#e9d9ae] hover:border-[#e9cf8e] hover:bg-[#17402f]`}
              >
                Blind
                <AmountTag amount={betAmt} allIn={betAmt < base} />
              </button>
              <button
                type="button"
                disabled={!myTurn || me.chips <= betAmt}
                onClick={() => send({ type: "bet", raise: true })}
                className={`${btnBase} border-[#c9a961]/70 bg-[#123328]/95 text-[#e9d9ae] hover:border-[#e9cf8e] hover:bg-[#17402f]`}
              >
                Blind ×2
                <AmountTag amount={raiseAmt} allIn={raiseAmt < base * 2} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!myTurn}
                onClick={() => send({ type: "bet" })}
                className={`${btnBase} border-[#c9a961]/70 bg-[#123328]/95 text-[#e9d9ae] hover:border-[#e9cf8e] hover:bg-[#17402f]`}
              >
                Chaal ×2
                <AmountTag amount={betAmt} allIn={betAmt < base} />
              </button>
              <button
                type="button"
                disabled={!myTurn || me.chips <= betAmt}
                onClick={() => send({ type: "bet", raise: true })}
                className={`${btnBase} border-[#c9a961]/70 bg-[#123328]/95 text-[#e9d9ae] hover:border-[#e9cf8e] hover:bg-[#17402f]`}
              >
                Chaal ×4
                <AmountTag amount={raiseAmt} allIn={raiseAmt < base * 2} />
              </button>
            </>
          )}

          {alive.length === 2 && (
            <button
              type="button"
              disabled={!canShow}
              onClick={() => send({ type: "show" })}
              className={`${btnBase} border-[#c9a961] bg-[#3a2c10]/95 text-[#e9cf8e] hover:bg-[#4a3a16]`}
              title={me.chips < showCost ? "Not enough chips — bet all-in instead" : "Reveal both hands"}
            >
              Show
              <AmountTag amount={showCost} allIn={false} />
            </button>
          )}

          <button
            type="button"
            disabled={!myTurn}
            onClick={() => send({ type: "fold" })}
            className={`${btnBase} border-[#8a3a46]/70 bg-[#2a0d13]/95 text-[#d99a9a] hover:border-[#b85a66]`}
          >
            Fold
            <span className="text-[10px] normal-case tracking-normal opacity-80">give up pot</span>
          </button>
        </div>
      )}
    </div>
  );
}
