import { SITE } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-hairline">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-xl text-ink">{SITE.mark}</span>
          <span className="text-sm text-muted">
            {SITE.name}. Local, private dictation for Mac.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm text-muted">
          <a href={SITE.downloadUrl} className="transition-colors hover:text-ink" target="_blank" rel="noopener noreferrer">
            Download
          </a>
          <a href={`mailto:${SITE.contactEmail}`} className="transition-colors hover:text-ink">
            Contact
          </a>
          <a href="/privacy" className="transition-colors hover:text-ink">
            Privacy
          </a>
        </div>
      </div>
    </footer>
  );
}
