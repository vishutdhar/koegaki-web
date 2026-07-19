"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Scroll-reveal: fades + rises its children when they enter the viewport (once).
 * Respects reduced motion (shows immediately, no transition). `delay` staggers siblings.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      // Pre-fire ~15% of a viewport BELOW the fold (positive bottom margin) so the
      // animation is already running by the time content scrolls into view — fast
      // mobile scrolling in either direction never catches a still-hidden block.
      { threshold: 0.01, rootMargin: "0px 0px 15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const shown = reduced || inView;

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
