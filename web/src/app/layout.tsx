import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Torvik Site",
  description: "Personal P4 college basketball stats, powered by Barttorvik data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <h1 className="text-xl font-bold tracking-wide">
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
