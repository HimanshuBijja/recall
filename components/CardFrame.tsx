"use client";
import { useState } from "react";

export function CardFrame({ url }: { url?: string }) {
  const [shown, setShown] = useState(false);
  if (!url) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="text-sm px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        {shown ? "Hide frame" : "Show frame"}
      </button>
      {shown && (
        <img
          src={url}
          loading="lazy"
          alt="Captured video frame"
          className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 max-w-full"
        />
      )}
    </div>
  );
}
