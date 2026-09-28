// Shared polling hook. Replaces the 8x copied
// `let active + setInterval + clearInterval + busyRef` boilerplate
// (8s tech jobs, 10s notifications/live-tracking, 12s progress,
// 15s profile, 30s inbox + 5s thread, 45s dashboard).
import { useEffect, useRef } from 'react';

export const usePolling = (callback: () => void | Promise<void>, intervalMs: number, enabled = true): void => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    let active = true;
    const tick = async () => {
      if (!active || busyRef.current) return;
      busyRef.current = true;
      try {
        await callbackRef.current();
      } finally {
        busyRef.current = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs, enabled]);
};
