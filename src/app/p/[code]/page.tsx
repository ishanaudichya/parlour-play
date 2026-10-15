import type { Metadata } from "next";
import { PartyRoom } from "@/components/party/PartyRoom";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Party ${code.toUpperCase()} — PARLOUR`,
    description: "You're on the list for game night — fourteen games, played live on everyone's phone. No accounts, just a code.",
  };
}

export default async function PartyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PartyRoom code={code.toUpperCase()} />;
}
