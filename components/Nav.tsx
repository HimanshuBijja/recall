"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/cards", label: "Cards" },
  { href: "/tags", label: "Tags" },
  { href: "/groups", label: "Groups" },
  { href: "/test/setup", label: "Test" },
  { href: "/analytics", label: "Analytics" },
  { href: "/import", label: "Import" },
];

export function Nav() {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const isDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
    setDark(isDark);
  };

  return (
    <>
      <header className="sticky top-0 z-40 backdrop-blur bg-background/80 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="font-bold tracking-tight text-lg">
            <span className="text-indigo-600 dark:text-indigo-400">Re</span>call
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={[
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                  ].join(" ")}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {dark ? "☼" : "☾"}
          </button>
        </div>
      </header>
      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-zinc-200 dark:border-zinc-800 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-7">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "py-2.5 text-[10px] font-medium text-center min-h-[44px] flex items-center justify-center",
                  active
                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30"
                    : "text-zinc-500 dark:text-zinc-400 active:bg-zinc-100 dark:active:bg-zinc-800",
                ].join(" ")}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
