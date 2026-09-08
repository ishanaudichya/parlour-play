import type { Metadata, Viewport } from "next";
import { Caveat, Cinzel, Inter, Young_Serif } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

const youngSerif = Young_Serif({
  variable: "--font-young",
  subsets: ["latin"],
  weight: ["400"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PARLOUR — eleven games, one table",
  description:
    "Game night without the apps. Coup, UNO, Monopoly Deal, Teen Patti, Mafia, Battleship, Four in a Row, Avalon, Secret Hitler, Chain Reaction and Ludo, played live with friends — one party link, no accounts.",
  openGraph: {
    title: "PARLOUR",
    description: "Eleven games, one table. Coup · UNO · Monopoly Deal · Teen Patti · Mafia · Battleship · Four in a Row · Avalon · Secret Hitler · Chain Reaction · Ludo — live with friends, just a code.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0a12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${youngSerif.variable} ${caveat.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col">
        <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>
      </body>
    </html>
  );
}
