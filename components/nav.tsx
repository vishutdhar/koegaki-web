import { SITE } from "@/lib/site";
import { CtaButton } from "./cta-button";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-base/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="font-display text-2xl leading-none text-ink">{SITE.mark}</span>
          <span className="font-display text-base font-medium tracking-tight">{SITE.name}</span>
        </a>
        <div className="flex items-center gap-7">
          <div className="hidden items-center gap-7 text-sm text-muted sm:flex">
            <a href="#features" className="transition-colors hover:text-ink">
              Features
            </a>
            <a href="#pricing" className="transition-colors hover:text-ink">
              Pricing
            </a>
            <a href="#faq" className="transition-colors hover:text-ink">
              FAQ
            </a>
          </div>
          <CtaButton href={SITE.downloadUrl} external>
            Download
          </CtaButton>
        </div>
      </nav>
    </header>
  );
}
