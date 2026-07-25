"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Home,
  LayoutGrid,
  GraduationCap,
  FolderOpen,
  Clock,
  Tags,
  Bookmark,
  Trash2,
  BarChart3,
  Download,
  Settings,
  MoreHorizontal,
  ChevronDown,
  X,
  Sun,
  Moon,
  BookOpen,
  LogOut,
} from "lucide-react";

/* ── Nav data ─────────────────────────────────────────────── */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const studyItems: NavItem[] = [
  { href: "/test/setup", label: "Start a Test", icon: <GraduationCap size={16} /> },
  { href: "/subjects", label: "Subjects", icon: <BookOpen size={16} /> },
  { href: "/groups", label: "Groups", icon: <FolderOpen size={16} /> },
  { href: "/test/due", label: "Due Cards", icon: <Clock size={16} /> },
];

const browseItems: NavItem[] = [
  { href: "/cards", label: "All Cards", icon: <LayoutGrid size={16} /> },
  { href: "/tags", label: "Tags", icon: <Tags size={16} /> },
  { href: "/bookmarks", label: "Bookmarks", icon: <Bookmark size={16} /> },
  { href: "/bin", label: "Bin", icon: <Trash2 size={16} /> },
];

const analyticsItems: NavItem[] = [
  { href: "/analytics", label: "Dashboard", icon: <BarChart3 size={16} /> },
];

const moreItems: NavItem[] = [
  { href: "/import", label: "Import", icon: <Download size={16} /> },
  { href: "/settings", label: "Settings", icon: <Settings size={16} /> },
];

/* Mobile bottom nav — 5 primary items */
const mobilePrimary: NavItem[] = [
  { href: "/", label: "Home", icon: <Home size={18} /> },
  { href: "/cards", label: "Cards", icon: <LayoutGrid size={18} /> },
  { href: "/groups", label: "Groups", icon: <FolderOpen size={18} /> },
  { href: "/subjects", label: "Subjects", icon: <BookOpen size={18} /> },
  { href: "#more", label: "More", icon: <MoreHorizontal size={18} /> },
];

/* Items inside the mobile More sheet */
const mobileMoreItems: { section: string; items: NavItem[] }[] = [
  { section: "Study", items: studyItems },
  { section: "Browse", items: browseItems.filter((i) => i.href !== "/cards") },
  { section: "Analytics", items: analyticsItems },
  { section: "Tools", items: moreItems },
];

/* ── Dropdown component ───────────────────────────────────── */

function Dropdown({
  label,
  icon,
  items,
  pathname,
  isOpen,
  onToggle,
  onClose,
}: {
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        onClose();
        return;
      }
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handle);
    window.addEventListener("keydown", handle);
    return () => {
      window.removeEventListener("mousedown", handle);
      window.removeEventListener("keydown", handle);
    };
  }, [isOpen, onClose]);

  const categoryActive = items.some(
    (i) => i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
          categoryActive
            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
            : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
        ].join(" ")}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-52 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-1.5 z-50">
          {items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={[
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                ].join(" ")}
              >
                <span className="text-zinc-500 dark:text-zinc-400 w-4 flex items-center justify-center">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Mobile More Sheet ────────────────────────────────────── */

function MobileMoreSheet({
  open,
  onClose,
  pathname,
  dark,
  onToggleTheme,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  dark: boolean;
  onToggleTheme: () => void;
}) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-zinc-900 rounded-t-2xl border-t border-zinc-200 dark:border-zinc-800 pb-[env(safe-area-inset-bottom)] max-h-[85vh] overflow-y-auto animate-slide-up">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        <div className="px-4 pb-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
              More
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {mobileMoreItems.map((section) => (
            <div key={section.section}>
              <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-2 font-semibold">
                {section.section}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={[
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                        active
                          ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                      ].join(" ")}
                    >
                      <span className="text-zinc-500 dark:text-zinc-400 w-4 flex items-center justify-center">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Theme toggle inside sheet */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-2 font-semibold">
              Appearance
            </div>
            <button
              onClick={onToggleTheme}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 w-full mb-4"
            >
              <span className="text-zinc-500 dark:text-zinc-400 w-4 flex items-center justify-center">
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </span>
              <span>{dark ? "Light mode" : "Dark mode"}</span>
            </button>
          </div>

          {/* Logout inside sheet */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-2 font-semibold">
              Session
            </div>
            <a
              href="/api/auth/logout"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 w-full"
            >
              <span className="text-red-500 dark:text-red-400 w-4 flex items-center justify-center">
                <LogOut size={16} />
              </span>
              <span>Log out</span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Main Nav component ───────────────────────────────────── */

export function Nav() {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setDark(document.documentElement.classList.contains("dark"));
    }, 0);
  }, []);

  const toggleTheme = () => {
    const isDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
    setDark(isDark);
  };

  const closeDropdowns = () => setOpenDropdown(null);

  if (pathname === "/login") return null;

  return (
    <>
      {/* ── Desktop header ── */}
      <header className="sticky top-0 z-40 bg-background border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="font-bold tracking-tight text-lg shrink-0"
            onClick={closeDropdowns}
          >
            <span className="text-indigo-600 dark:text-indigo-400">Re</span>call
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
            <Dropdown
              label="Study"
              icon={<GraduationCap size={16} />}
              items={studyItems}
              pathname={pathname}
              isOpen={openDropdown === "study"}
              onToggle={() =>
                setOpenDropdown(openDropdown === "study" ? null : "study")
              }
              onClose={closeDropdowns}
            />
            <Dropdown
              label="Browse"
              icon={<LayoutGrid size={16} />}
              items={browseItems}
              pathname={pathname}
              isOpen={openDropdown === "browse"}
              onToggle={() =>
                setOpenDropdown(openDropdown === "browse" ? null : "browse")
              }
              onClose={closeDropdowns}
            />
            <Dropdown
              label="Analytics"
              icon={<BarChart3 size={16} />}
              items={analyticsItems}
              pathname={pathname}
              isOpen={openDropdown === "analytics"}
              onToggle={() =>
                setOpenDropdown(openDropdown === "analytics" ? null : "analytics")
              }
              onClose={closeDropdowns}
            />
            <Dropdown
              label="More"
              icon={<MoreHorizontal size={16} />}
              items={moreItems}
              pathname={pathname}
              isOpen={openDropdown === "more"}
              onToggle={() =>
                setOpenDropdown(openDropdown === "more" ? null : "more")
              }
              onClose={closeDropdowns}
            />
          </nav>

          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <a
              href="/api/auth/logout"
              aria-label="Log out"
              className="p-2 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-600 dark:hover:text-red-400"
            >
              <LogOut size={18} />
            </a>
          </div>
        </div>
      </header>

      {/* ── Mobile bottom nav ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-zinc-200 dark:border-zinc-800 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {mobilePrimary.map((l) => {
            if (l.href === "#more") {
              return (
                <button
                  key="more"
                  onClick={() => setMobileMoreOpen(true)}
                  className={[
                    "py-2.5 text-[10px] font-medium text-center min-h-[44px] flex flex-col items-center justify-center gap-0.5",
                    mobileMoreOpen
                      ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30"
                      : "text-zinc-500 dark:text-zinc-400 active:bg-zinc-100 dark:active:bg-zinc-800",
                  ].join(" ")}
                >
                  {l.icon}
                  <span>{l.label}</span>
                </button>
              );
            }
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "py-2.5 text-[10px] font-medium text-center min-h-[44px] flex flex-col items-center justify-center gap-0.5",
                  active
                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30"
                    : "text-zinc-500 dark:text-zinc-400 active:bg-zinc-100 dark:active:bg-zinc-800",
                ].join(" ")}
              >
                {l.icon}
                <span>{l.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Mobile More sheet ── */}
      <MobileMoreSheet
        open={mobileMoreOpen}
        onClose={() => setMobileMoreOpen(false)}
        pathname={pathname}
        dark={dark}
        onToggleTheme={toggleTheme}
      />

      {/* Slide-up animation keyframes */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
      `}</style>
    </>
  );
}