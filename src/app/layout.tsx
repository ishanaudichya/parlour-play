import type { Metadata, Viewport } from "next";
import { Cinzel, Fraunces, Inter } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PARLOUR — four games, one table",
  description:
    "Game night without the apps. Coup, UNO, Monopoly Deal and Teen Patti, played live with friends — one party link, no accounts.",
  openGraph: {
    title: "PARLOUR",
    description: "Four games, one table. Coup · UNO · Monopoly Deal · Teen Patti — live with friends, just a code.",
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
    <html lang="en" className={`${cinzel.variable} ${fraunces.variable} ${inter.variable} h-full antialiased`}>
      <body className="relative min-h-full flex flex-col">
        <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>
      </body>
    </html>
  );
}
