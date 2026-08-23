import type { Metadata } from "next";
import { Orbitron, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const orbitron = Orbitron({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Torvik Site",
  description: "Personal P4 college basketball stats, powered by Barttorvik data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${orbitron.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <h1 className="font-display text-xl font-bold tracking-wide">
              TORVIK<span className="text-accent">SITE</span>
            </h1>
          </div>
        </header>
        <Nav />
        <main className="max-w-6xl mx-auto w-full px-4 py-6 flex-1">{children}</main>
      </body>
    </html>
  );
}
