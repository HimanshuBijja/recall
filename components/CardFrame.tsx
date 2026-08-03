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

  const selectImage = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx(idx);
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
          <span className="text-xs text-zinc-500 font-medium select-none">
            Image {activeIdx + 1} of {images.length}
          </span>
        )}
      </div>

      {shown && activeUrl && (
        <div className="mt-3 flex flex-col items-center">
          {/* Image Container with Prev/Next Overlay */}
          <div className="relative group max-w-full rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-zinc-950/40">
            <img
              src={activeUrl}
              loading="lazy"
              alt={`Card reference visualization ${activeIdx + 1} of ${images.length}`}
              className="max-w-full max-h-[400px] object-contain block mx-auto"
            />
            
            {/* Overlay Navigation (only if > 1 image) */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center font-bold transition-opacity select-none border-0 cursor-pointer"
                  aria-label="Previous image"
                >
                  &lsaquo;
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center font-bold transition-opacity select-none border-0 cursor-pointer"
                  aria-label="Next image"
                >
                  &rsaquo;
                </button>
              </>
            )}
          </div>

          {/* Dots Indicator / Selector Navigation */}
          {images.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-2">
              {images.map((_, idx) => {
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => selectImage(idx, e)}
                    className={`h-1.5 transition-all duration-300 rounded-full border-0 p-0 cursor-pointer ${
                      isActive 
                        ? "w-4 bg-indigo-600 dark:bg-indigo-400" 
                        : "w-1.5 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-500"
                    }`}
                    aria-label={`Go to image ${idx + 1}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
