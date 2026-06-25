"use client";

import { useEffect, useState } from "react";

/**
 * Hero demo: an autoplay/muted/looping video of Koegaki dictating (rendered with
 * Remotion; the scene includes its own window chrome + HUD). Honors reduced motion by
 * showing the poster still instead of the moving video. The poster is also the <video>
 * poster attr, so a static frame shows before the video plays (no blank box / no CLS).
 */
export function DemoVideo() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] bg-ember-soft blur-3xl"
      />
      <div className="overflow-hidden rounded-xl border border-hairline shadow-2xl">
        {reducedMotion ? (
          <img
            src="/demo-poster.png"
            alt="Koegaki dictating: an editor with text appearing and the Listening waveform."
            width={1280}
            height={800}
            className="block w-full"
          />
        ) : (
          <video
            className="block w-full"
            width={1280}
            height={800}
            autoPlay
            muted
            loop
            playsInline
            poster="/demo-poster.png"
            aria-label="Koegaki dictating: an editor with text appearing and the Listening waveform."
          >
            <source src="/demo.mp4" type="video/mp4" />
          </video>
        )}
      </div>
    </div>
  );
}
