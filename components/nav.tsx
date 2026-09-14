import { SITE } from "@/lib/site";
import { DownloadCta } from "./download-cta";

/**
 * `home` is true on the landing page, where the links are in-page anchors and
 * the markup is unchanged. A secondary page passes false so the same links
 * point back at the home page sections instead of at anchors that do not exist.
 */
export function Nav({ home = true }: { home?: boolean }) {
  const to = (hash: string) => (home ? hash : `/${hash}`);
  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-canvas/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <a href={home ? "#top" : "/"} className="flex items-center gap-2.5">
          <span className="font-display text-2xl leading-none text-ink">{SITE.mark}</span>
          <span className="font-display text-base font-medium tracking-tight">{SITE.name}</span>
        </a>
        <div className="flex items-center gap-7">
          <div className="hidden items-center gap-7 text-sm text-muted sm:flex">
            <a href={to("#features")} className="transition-colors hover:text-ink">
              Features
            </a>
            <a href={to("#pricing")} className="transition-colors hover:text-ink">
              Pricing
            </a>
            <a href={to("#faq")} className="transition-colors hover:text-ink">
              FAQ
            </a>
          </div>
          <DownloadCta variant="secondary">Download</DownloadCta>
        </div>
      </nav>
    </header>
  );
}
