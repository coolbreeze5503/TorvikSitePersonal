"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Team Stats" },
  { href: "/team-compare", label: "Team Compare" },
  { href: "/roster", label: "Roster" },
  { href: "/player-compare", label: "Player Compare" },
  { href: "/glossary", label: "Glossary" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border">
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`font-display px-4 py-3 text-xs uppercase tracking-wider font-semibold border-b-2 transition-colors ${
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-foreground/70 hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
