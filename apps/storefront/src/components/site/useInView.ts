"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

interface Options {
  threshold?: number | number[];
  rootMargin?: string;
  once?: boolean;
}

export function useInView<T extends HTMLElement | SVGElement>(
  options: Options = {},
): { ref: RefObject<T | null>; inView: boolean } {
  const { threshold = 0.2, rootMargin = "0px", once = true } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, inView };
}
