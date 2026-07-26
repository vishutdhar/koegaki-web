import { type ReactNode } from "react";
import { SITE } from "@/lib/site";
import { CtaButton } from "./cta-button";

/**
 * The download button, already pointing at the visitor's platform.
 *
 * Both anchors are rendered and CSS hides the one that does not apply, so the
 * page is correct before any script runs and correct for crawlers. Choosing the
 * platform in JavaScript at click time would leave the wrong file one stale
 * render away, and choosing it on the server would break static caching.
 */
export function DownloadCta({
  children,
  variant = "primary",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <>
      <CtaButton href={SITE.downloadUrl} variant={variant} className="os-mac" external>
        {children}
      </CtaButton>
      <CtaButton href={SITE.windowsDownloadUrl} variant={variant} className="os-win" external>
        {children}
      </CtaButton>
    </>
  );
}

/**
 * The system-detail line under a download button: what this build needs, and a
 * way to reach the other platform. A visitor on a Mac who wants the Windows
 * installer, or the reverse, must never hit a dead end.
 */
export function PlatformNote({ className = "" }: { className?: string }) {
  const link =
    "underline decoration-hairline underline-offset-4 transition-colors hover:text-muted";
  return (
    <p className={`font-mono text-xs text-faint ${className}`.trim()}>
      <span className="os-mac">
        {SITE.requirements} ·{" "}
        <a
          href={SITE.windowsDownloadUrl}
          className={link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Download for Windows
        </a>
      </span>
      <span className="os-win">
        {SITE.windowsRequirements} ·{" "}
        <a href={SITE.downloadUrl} className={link} target="_blank" rel="noopener noreferrer">
          Download for Mac
        </a>
      </span>
    </p>
  );
}
