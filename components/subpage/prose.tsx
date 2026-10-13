import { type ReactNode } from "react";

export type ProseSection = {
  heading: string;
  /**
   * One paragraph per entry. Plain strings only; the copy is data, not markup.
   * An entry that is a command a visitor types (the Linux page's install line)
   * is `{ command }`, shown as a command rather than as prose.
   */
  paragraphs: (string | { command: string })[];
};

/**
 * Long-form explanatory copy for the secondary pages. Headings are real h2s
 * with the answers underneath, because the pages exist to answer a question a
 * visitor typed into a search box, and the answer is the content.
 */
export function Prose({ sections, children }: { sections: ProseSection[]; children?: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
      <div className="max-w-2xl space-y-12">
        {sections.map(({ heading, paragraphs }) => (
          <div key={heading}>
            <h2 className="font-display text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">
              {heading}
            </h2>
            <div className="mt-4 space-y-4">
              {paragraphs.map((p) =>
                typeof p === "string" ? (
                  <p key={p} className="leading-relaxed text-muted">
                    {p}
                  </p>
                ) : (
                  <pre
                    key={p.command}
                    className="overflow-x-auto rounded-lg border border-hairline bg-surface/40 px-5 py-3 font-mono text-xs leading-relaxed text-ink"
                  >
                    <code>{p.command}</code>
                  </pre>
                ),
              )}
            </div>
          </div>
        ))}
        {children}
      </div>
    </section>
  );
}
