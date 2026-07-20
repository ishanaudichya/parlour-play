"use client";

import { CHARACTER_INFO } from "@/lib/games/coup/meta";
import type { Character, LogEntry } from "@/lib/games/coup/types";

export function Nm({ children }: { children: React.ReactNode }) {
  return <b className="font-semibold text-parch-100">{children}</b>;
}

export function Ch({ ch }: { ch: Character }) {
  const info = CHARACTER_INFO[ch];
  return (
    <b className="font-semibold" style={{ color: info.bright }}>
      {info.name}
    </b>
  );
}

export function logLine(l: LogEntry): React.ReactNode {
  switch (l.kind) {
    case "start":
      return (
        <>
          The game begins — <Nm>{l.actor}</Nm> moves first
        </>
      );
    case "income":
      return (
        <>
          <Nm>{l.actor}</Nm> takes income <i className="text-gold-400">+1</i>
        </>
      );
    case "foreign_aid":
      return (
        <>
          <Nm>{l.actor}</Nm> requests foreign aid
        </>
      );
    case "foreign_aid_resolved":
      return (
        <>
          <Nm>{l.actor}</Nm> receives foreign aid <i className="text-gold-400">+2</i>
        </>
      );
    case "tax":
      return (
        <>
          <Nm>{l.actor}</Nm> claims the <Ch ch="duke" /> — tax
        </>
      );
    case "tax_resolved":
      return (
        <>
          <Nm>{l.actor}</Nm> collects tax <i className="text-gold-400">+3</i>
        </>
      );
    case "steal":
      return (
        <>
          <Nm>{l.actor}</Nm> claims the <Ch ch="captain" /> — stealing from <Nm>{l.target}</Nm>
        </>
      );
    case "steal_resolved":
      return (
        <>
          <Nm>{l.actor}</Nm> steals <i className="text-gold-400">{l.n}</i> from <Nm>{l.target}</Nm>
        </>
      );
    case "assassinate":
      return (
        <>
          <Nm>{l.actor}</Nm> pays 3 and sends the <Ch ch="assassin" /> after <Nm>{l.target}</Nm>
        </>
      );
    case "assassinate_hit":
      return (
        <>
          the <Ch ch="assassin" /> reaches <Nm>{l.target}</Nm>
        </>
      );
    case "exchange":
      return (
        <>
          <Nm>{l.actor}</Nm> claims the <Ch ch="ambassador" /> — exchange
        </>
      );
    case "exchange_done":
      return (
        <>
          <Nm>{l.actor}</Nm> returns two cards to the deck
        </>
      );
    case "coup":
      return (
        <>
          <Nm>{l.actor}</Nm> pays 7 and launches a coup against <Nm>{l.target}</Nm>
        </>
      );
    case "block":
      return (
        <>
          <Nm>{l.actor}</Nm> claims the <Ch ch={l.ch!} /> to block <Nm>{l.target}</Nm>
        </>
      );
    case "challenge":
      return (
        <>
          <Nm>{l.actor}</Nm> challenges <Nm>{l.target}</Nm>&apos;s <Ch ch={l.ch!} />
        </>
      );
    case "challenge_failed":
      return (
        <>
          <Nm>{l.actor}</Nm> reveals the <Ch ch={l.ch!} /> — <Nm>{l.target}</Nm> pays the price
        </>
      );
    case "challenge_success":
      return (
        <>
          <Nm>{l.target}</Nm> was bluffing — the <Ch ch={l.ch!} /> was a lie
        </>
      );
    case "lose_influence":
      return (
        <>
          <Nm>{l.actor}</Nm> surrenders the <Ch ch={l.ch!} />
        </>
      );
    case "eliminated":
      return (
        <>
          <Nm>{l.actor}</Nm> has been eliminated
        </>
      );
    case "left":
      return (
        <>
          <Nm>{l.actor}</Nm> left the table — their influence is forfeit
        </>
      );
    case "consolation":
      return (
        <>
          <Nm>{l.actor}</Nm> pockets <i className="text-gold-400">+1</i> in consolation
        </>
      );
    case "action_blocked":
      return <>the action is blocked</>;
    case "timeout":
      return <i className="text-parch-500">time expires — the court allows it</i>;
    case "win":
      return (
        <>
          <Nm>{l.actor}</Nm> seizes power
        </>
      );
    default:
      return null;
  }
}
