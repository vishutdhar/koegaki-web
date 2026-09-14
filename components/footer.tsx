import { SITE } from "@/lib/site";
import { COMPARISONS } from "@/lib/compare";

const PLATFORM_LINKS = [
  { href: "/mac", label: "Dictation for Mac" },
  { href: "/windows", label: "Dictation for Windows" },
  { href: "/offline-dictation", label: "Offline dictation" },
];

/**
 * Link groups for the secondary pages: every one of them links to all the
 * others, so a crawler that lands on any of them reaches the rest in one hop.
 * The landing page keeps its original footer.
 */
function LinkGroups() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 pt-12 sm:grid-cols-2">
      <div>
        <p className="font-display text-sm font-medium tracking-tight">Platforms</p>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          {PLATFORM_LINKS.map(({ href, label }) => (
            <li key={href}>
              <a href={href} className="transition-colors hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-display text-sm font-medium tracking-tight">Compare</p>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          {COMPARISONS.map(({ slug, other }) => (
            <li key={slug}>
              <a href={`/vs/${slug}`} className="transition-colors hover:text-ink">
                {SITE.name} vs {other}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Footer({ extended = false }: { extended?: boolean }) {
  return (
    <footer className="mt-auto border-t border-hairline">
      {extended && <LinkGroups />}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-xl text-ink">{SITE.mark}</span>
          <span className="text-sm text-muted">
            {SITE.name}. Local, private dictation for Mac and Windows.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm text-muted">
          <a
            href={SITE.downloadUrl}
            className="transition-colors hover:text-ink"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mac
          </a>
          <a
            href={SITE.windowsDownloadUrl}
            className="transition-colors hover:text-ink"
            target="_blank"
            rel="noopener noreferrer"
          >
            Windows
          </a>
          <a href={`mailto:${SITE.contactEmail}`} className="transition-colors hover:text-ink">
            Contact
          </a>
          <a href="/privacy" className="transition-colors hover:text-ink">
            Privacy
          </a>
          <a
            href="https://freedom-terminal.com"
            className="transition-colors hover:text-ink"
            target="_blank"
            rel="noopener"
          >
            Freedom Terminal
          </a>
        </div>
      </div>
    </footer>
  );
}
