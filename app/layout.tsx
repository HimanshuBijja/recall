import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ToastProvider } from "@/components/Toast";
import { ThemeScript } from "@/components/ThemeScript";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Recall — flashcard revision",
  description: "Local-first flashcard revision app.",
};

/**
 * Without this, phones render at ~980px and Tailwind's responsive breakpoints
 * treat them as desktop — the mobile bottom nav (`sm:hidden`) vanishes.
 * `viewportFit: "cover"` is also what makes `env(safe-area-inset-bottom)`
 * report a non-zero value on notched / home-indicator devices.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ToastProvider>
          <Nav />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
