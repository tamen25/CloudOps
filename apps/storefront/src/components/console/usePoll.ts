"use client";

import { useEffect, useRef, useState } from "react";

export interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

// usePoll fetches a JSON endpoint on an interval. Pauses when the tab is
// hidden so a backgrounded console does not hammer the BFF. The first load
// sets loading=true; subsequent refreshes keep the last data visible.
export function usePoll<T>(url: string, intervalMs = 4000): PollState<T> {
  const [state, setState] = useState<PollState<T>>({ data: null, error: null, loading: true });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(url, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as T;
        if (!cancelled) setState({ data: json, error: null, loading: false });
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({ data: prev.data, error: (err as Error).message, loading: false }));
        }
      }
    }

    void tick();
    timer.current = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [url, intervalMs]);

  return state;
}
