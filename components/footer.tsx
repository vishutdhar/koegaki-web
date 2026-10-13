import { SITE } from "@/lib/site";
import { COMPARISONS } from "@/lib/compare";
import { LANDING_PAGES } from "@/lib/pages";

/**
 * Link groups to every landing and comparison page, generated from the same
 * lists that create those pages, so a new page is linked the moment it exists.
 * The home page and every landing and comparison page render them, so a
 * crawler that lands on any of those reaches all the others in one hop.
 */
function LinkGroups() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 pt-12 sm:grid-cols-2">
      <div>
        <p className="font-display text-sm font-medium tracking-tight">Platforms</p>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          {LANDING_PAGES.map(({ path, linkLabel }) => (
            <li key={path}>
              <a href={path} className="transition-colors hover:text-ink">
                {linkLabel}
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
  const link = "transition-colors hover:text-ink";
  const download = (href: string, platform: string) => (
    <a href={href} className={link} target="_blank" rel="noopener noreferrer">
      {platform}
    </a>
  );
  const contact = (
    <a href={`mailto:${SITE.contactEmail}`} className={link}>
      Contact
    </a>
  );
  const privacy = (
    <a href="/privacy" className={link}>
      Privacy
    </a>
  );
  const freedomTerminal = (
    <a href="https://freedom-terminal.com" className={link} target="_blank" rel="noopener">
      Freedom Terminal
    </a>
  );
  // The blurb and the links are each chosen as a whole, never given a
  // conditional child, so without a Linux release they are byte for byte today's.
  return (
    <footer className="mt-auto border-t border-hairline">
      {extended && <LinkGroups />}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-xl text-ink">{SITE.mark}</span>
          {SITE.linuxDownloadUrl ? (
            <span className="text-sm text-muted">{SITE.name}. Local, private dictation for Mac, Windows and Linux.</span>
          ) : (
            <span className="text-sm text-muted">{SITE.name}. Local, private dictation for Mac and Windows.</span>
          )}
        </div>
        {SITE.linuxDownloadUrl ? (
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted">
            {download(SITE.downloadUrl, "Mac")}
            {download(SITE.windowsDownloadUrl, "Windows")}
            {download(SITE.linuxDownloadUrl, "Linux")}
            {contact}
            {privacy}
            {freedomTerminal}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted">
            {download(SITE.downloadUrl, "Mac")}
            {download(SITE.windowsDownloadUrl, "Windows")}
            {contact}
            {privacy}
            {freedomTerminal}
          </div>
        )}
      </div>
    </footer>
  );
}
