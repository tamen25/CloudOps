"use client";

import { useEffect, useRef, useState } from "react";

interface ParallaxState {
  x: number;
  y: number;
}

export function useMouseParallax(amplitude: number = 8): ParallaxState {
  const [offset, setOffset] = useState<ParallaxState>({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    function handle(event: MouseEvent) {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        const nx = (event.clientX / window.innerWidth) * 2 - 1;
        const ny = (event.clientY / window.innerHeight) * 2 - 1;
        setOffset({ x: nx * amplitude, y: ny * amplitude });
      });
    }

    window.addEventListener("mousemove", handle, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handle);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [amplitude]);

  return offset;
}
