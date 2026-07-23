import { useState, useRef, useCallback } from "react";

interface UseSwipeOpts {
  onLeft?: () => void;
  onRight?: () => void;
  threshold?: number;
}

export function useSwipe({ onLeft, onRight, threshold = 80 }: UseSwipeOpts = {}) {
  const [dx, setDx] = useState(0);
  const [active, setActive] = useState(false);
  const startX = useRef<number | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    startX.current = e.clientX;
    setActive(true);
    setDx(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (startX.current === null) return;
    const diff = e.clientX - startX.current;
    setDx(diff);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (startX.current === null) return;
    const finalDx = e.clientX - startX.current;
    
    e.currentTarget.releasePointerCapture(e.pointerId);
    startX.current = null;
    setActive(false);
    setDx(0);

    if (finalDx > threshold) {
      onRight?.();
    } else if (finalDx < -threshold) {
      onLeft?.();
    }
  }, [onLeft, onRight, threshold]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    startX.current = null;
    setActive(false);
    setDx(0);
  }, []);

  return {
    dx,
    active,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style: {
        touchAction: "none",
      },
    },
  };
}
