import { useState } from "react";
import type { CardSource } from "@/types";
import { isVideoSource } from "@/lib/source";

function formatTimestamp(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

export function CardFrame({
  url,
  urls,
  source,
}: {
  url?: string;
  urls?: string[];
  source?: CardSource;
}) {
  const [shown, setShown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const urlsArray = Array.isArray(urls) ? urls : [];
  const images = [url, ...urlsArray].filter((u): u is string => typeof u === "string" && !!u);

  const videoSource = isVideoSource(source) ? source : null;

  if (images.length === 0 && !videoSource) return null;

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
  const targetSec = Math.floor(videoSource?.timestamp ?? 0);
  const ytUrl = videoSource
    ? `https://www.youtube.com/watch?v=${videoSource.videoId}&t=${targetSec}s`
    : "";

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 flex-wrap">
        {images.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShown((s) => !s);
            }}
            className="text-sm px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold"
          >
            {shown ? "Hide frame" : `Show frame${images.length > 1 ? ` (${images.length} images)` : ""}`}
          </button>
        )}

        {videoSource && (
          <a
            href={ytUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-semibold transition-colors no-underline"
            title="Open video on YouTube at this exact timestamp"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            YouTube ({formatTimestamp(videoSource.timestamp)})
          </a>
        )}

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

