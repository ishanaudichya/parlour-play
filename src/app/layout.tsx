import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Cinzel, Geist, Geist_Mono, Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/* the Parlour's own type: a gig-poster display face, a serif for asides,
   a clean sans and a mono for the small print */
const bigShoulders = Big_Shoulders({
  variable: "--font-bigshoulders",
  subsets: ["latin"],
  axes: ["opsz"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PARLOUR — fourteen games, one table",
  description:
    "Game night without the apps. Coup, UNO, Monopoly Deal, Teen Patti, Mafia, Battleship, Four in a Row, Avalon, Secret Hitler, Chain Reaction, Ludo, Pocket Tanks, STACCS and Dots and Boxes, played live with friends — one party link, no accounts.",
  openGraph: {
    title: "PARLOUR",
    description: "Fourteen games, one table. Coup · UNO · Monopoly Deal · Teen Patti · Mafia · Battleship · Four in a Row · Avalon · Secret Hitler · Chain Reaction · Ludo · Pocket Tanks · STACCS · Dots and Boxes — live with friends, just a code.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0a09",
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
      suppressHydrationWarning
      className={`${cinzel.variable} ${inter.variable} ${bigShoulders.variable} ${instrument.variable} ${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col">
        {/* a returning visit (this session) skips the door's "come in" — mark it before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(sessionStorage.getItem('parlour.entered'))document.documentElement.dataset.entered='1'}catch(e){}",
          }}
        />
        <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>
      </body>
    </html>
  );
}
