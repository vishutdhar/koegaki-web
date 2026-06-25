"use client";

import Image from "next/image";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Hero demo: an autoplay/muted/looping video of Koegaki dictating (rendered with
 * Remotion; the scene includes its own window chrome + HUD). Honors reduced motion by
 * showing the poster still instead of the moving video. The poster is also the <video>
 * poster attr, so a static frame shows before the video plays (no blank box / no CLS).
 */
export function DemoVideo() {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-ember-soft opacity-60 blur-3xl"
      />
      {/* glass elevation: layered drop shadow + inner top highlight (lit from above) */}
      <div className="relative overflow-hidden rounded-xl shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9),0_8px_24px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.06] transition-transform duration-300 ease-out hover:-translate-y-1">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />
        {reducedMotion ? (
          <Image
            src="/demo-poster.png"
            alt="Koegaki dictating: an editor with text appearing and the Listening waveform."
            width={1280}
            height={800}
            priority
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
