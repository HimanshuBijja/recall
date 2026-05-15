"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastKind = "success" | "error" | "info";
interface ToastMsg { id: number; kind: ToastKind; text: string }

const ToastCtx = createContext<(kind: ToastKind, text: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:bottom-6 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 sm:max-w-sm pointer-events-none [&>*]:pointer-events-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "px-4 py-3 rounded-lg shadow-lg text-sm font-medium border",
              t.kind === "success" && "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100",
              t.kind === "error" && "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100",
              t.kind === "info" && "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100",
            ].filter(Boolean).join(" ")}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
