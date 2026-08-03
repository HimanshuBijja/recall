"use client";
import { useState } from "react";

export function CardFrame({ url, urls = [] }: { url?: string; urls?: string[] }) {
  const [shown, setShown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const images = [url, ...urls].filter((u): u is string => typeof u === "string" && !!u);

  if (images.length === 0) return null;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx((prev) => (prev + 1) % images.length);
  };

  const activeUrl = images[activeIdx];

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="text-sm px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold"
        >
          {shown ? "Hide frame" : `Show frame${images.length > 1 ? ` (${images.length} images)` : ""}`}
        </button>

        {shown && images.length > 1 && (
          <div className="flex items-center gap-1 border border-zinc-200 dark:border-zinc-800 rounded-md p-0.5 bg-zinc-50 dark:bg-zinc-950/40 text-xs font-mono">
            <button
              type="button"
              onClick={handlePrev}
              className="px-2 py-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 font-bold text-foreground"
            >
              &lt;
            </button>
            <span className="px-2 text-muted">
              {activeIdx + 1} / {images.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="px-2 py-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 font-bold text-foreground"
            >
              &gt;
            </button>
          </div>
        )}
      </div>

      {shown && activeUrl && (
        <img
          src={activeUrl}
          loading="lazy"
          alt={`Card reference visualization ${images.length > 1 ? `${activeIdx + 1} of ${images.length}` : ""}`}
          className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 max-w-full max-h-[400px] object-contain"
        />
      )}
    </div>
  );
}
