import { type ReactNode } from "react";
import { SITE } from "@/lib/site";
import { CtaButton } from "./cta-button";

/*
 * Every Linux surface here is chosen as a whole element, never added as a
 * conditional child: React records a child that renders nothing in the page's
 * payload, so a page without a Linux release would no longer be byte for byte
 * the page before Linux (docs/specs/2026-10-13-linux-site.md rule 8).
 */

/**
 * The download button, already pointing at the visitor's platform.
 *
 * Both anchors are rendered and CSS hides the one that does not apply, so the
 * page is correct before any script runs and correct for crawlers. Choosing the
 * platform in JavaScript at click time would leave the wrong file one stale
 * render away, and choosing it on the server would break static caching. Once
 * a Linux release exists a third anchor offers its deb, the same way.
 */
export function DownloadCta({
  children,
  variant = "primary",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const mac = (
    <CtaButton href={SITE.downloadUrl} variant={variant} className="os-mac" external>
      {children}
    </CtaButton>
  );
  const windows = (
    <CtaButton href={SITE.windowsDownloadUrl} variant={variant} className="os-win" external>
      {children}
    </CtaButton>
  );
  if (!SITE.linuxDownloadUrl) {
    return (
      <>
        {mac}
        {windows}
      </>
    );
  }
  return (
    <>
      {mac}
      {windows}
      <CtaButton href={SITE.linuxDownloadUrl} variant={variant} className="os-linux" external>
        {children}
      </CtaButton>
    </>
  );
}

/**
 * The system-detail line under a download button: what this build needs, and a
 * way to reach the other platform. A visitor on a Mac who wants the Windows
 * installer, or the reverse, must never hit a dead end. Once a Linux release
 * exists each line links the other two platforms, and the Linux line also
 * links the Linux page, which says how to install the deb.
 */
export function PlatformNote({
  className = "",
  macRequirements = SITE.requirements,
}: {
  className?: string;
  /** The Mac requirement line. Defaults to the shared string; a page whose copy states a stricter fact passes its own. */
  macRequirements?: string;
}) {
  const link =
    "underline decoration-hairline underline-offset-4 transition-colors hover:text-muted";
  if (!SITE.linuxDownloadUrl || !SITE.linuxRequirements) {
    return (
      <p className={`font-mono text-xs text-faint ${className}`.trim()}>
        <span className="os-mac">
          {macRequirements} ·{" "}
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
  const download = (href: string, platform: string) => (
    <a href={href} className={link} target="_blank" rel="noopener noreferrer">
      {`Download for ${platform}`}
    </a>
  );
  return (
    <p className={`font-mono text-xs text-faint ${className}`.trim()}>
      <span className="os-mac">
        {macRequirements} · {download(SITE.windowsDownloadUrl, "Windows")} ·{" "}
        {download(SITE.linuxDownloadUrl, "Linux")}
      </span>
      <span className="os-win">
        {SITE.windowsRequirements} · {download(SITE.downloadUrl, "Mac")} ·{" "}
        {download(SITE.linuxDownloadUrl, "Linux")}
      </span>
      <span className="os-linux">
        {SITE.linuxRequirements} ·{" "}
        <a href="/linux" className={link}>
          Install steps
        </a>{" "}
        · {download(SITE.downloadUrl, "Mac")} · {download(SITE.windowsDownloadUrl, "Windows")}
      </span>
    </p>
  );
}
