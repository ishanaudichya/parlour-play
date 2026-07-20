"use client";

import { Button, Modal } from "@/components/ui";

const ROLES = [
  {
    name: "Mafia",
    mark: "M",
    tone: "border-[#9f4e4e]/45 bg-[#321719]/75 text-[#e8a0a0]",
    copy: "Wake after dark and agree unanimously on a victim. Reach parity with the town to win.",
  },
  {
    name: "Detective",
    mark: "D",
    tone: "border-[#71889d]/45 bg-[#17232e]/75 text-[#aec9df]",
    copy: "Investigate one living player each night. Your findings are yours alone.",
  },
  {
    name: "Doctor",
    mark: "+",
    tone: "border-[#758c77]/45 bg-[#18251c]/75 text-[#b4d3b7]",
    copy: "Protect anyone, including yourself, but never the same player on consecutive nights.",
  },
  {
    name: "Villager",
    mark: "V",
    tone: "border-[#9b8764]/45 bg-[#292218]/75 text-[#dbc59d]",
    copy: "Watch, question, and vote carefully. Find every Mafia member to win.",
  },
] as const;

export function MafiaRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} wide>
      <div className="text-[#d8d2c5]">
        <div className="mb-6 border-b border-[#8f7855]/25 pb-4 text-center">
          <div className="text-[10px] uppercase tracking-[0.34em] text-[#9f8a65]">Case file 01</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[0.16em] text-[#f0e4cd]">HOW TO SURVIVE</h2>
        </div>

        <p className="text-sm leading-6 text-[#b9b4aa]">
          The town alternates between secret nights and public days. Keep your role hidden, read the room, and do not
          assume a confident witness is an honest one.
        </p>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {ROLES.map((role) => (
            <div key={role.name} className={`border p-3 ${role.tone}`}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-current/35 font-mono text-xs">
                  {role.mark}
                </span>
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em]">{role.name}</h3>
              </div>
              <p className="text-[12px] leading-5 text-[#b9b4aa]">{role.copy}</p>
            </div>
          ))}
        </div>

        <ol className="mt-6 space-y-3 text-[13px] leading-5 text-[#b9b4aa]">
          <li>
            <b className="text-[#e2d6bf]">1 · Night.</b> Mafia, Detective, and Doctor secretly choose targets. The
            night ends when choices are locked or the clock expires.
          </li>
          <li>
            <b className="text-[#e2d6bf]">2 · Dawn.</b> The town learns what happened, but not who acted. Saved victims
            and private investigations remain secret.
          </li>
          <li>
            <b className="text-[#e2d6bf]">3 · Discussion.</b> Share evidence, bluff, accuse, or stay quiet. Eliminated
            players may observe but cannot vote.
          </li>
          <li>
            <b className="text-[#e2d6bf]">4 · Vote.</b> Secretly choose one living suspect. A tied verdict triggers one
            runoff; a second tie eliminates nobody.
          </li>
        </ol>

        <div className="mt-6 border border-[#8f7855]/25 bg-black/20 p-3 text-[12px] leading-5 text-[#9e9a92]">
          Town wins when every Mafia member is eliminated. Mafia wins when its living members equal or outnumber the
          rest of the town. Leaving the game counts as elimination.
        </div>

        <div className="mt-6 flex justify-center">
          <Button variant="primary" onClick={onClose} className="min-w-40">
            Close case file
          </Button>
        </div>
      </div>
    </Modal>
  );
}
