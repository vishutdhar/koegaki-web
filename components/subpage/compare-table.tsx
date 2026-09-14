import { SITE } from "@/lib/site";

export type CompareRow = {
  /** What is being compared, e.g. "Where your voice is processed". */
  label: string;
  koegaki: string;
  other: string;
};

/**
 * A two-column ledger. Rows are facts, not adjectives: each cell states what the
 * product does, and the visitor draws the conclusion. The Koegaki column is
 * marked with the ember rule so the eye finds our side without a filled
 * "winner" highlight on every row.
 */
export function CompareTable({
  other,
  rows,
  asOf,
}: {
  other: string;
  rows: CompareRow[];
  asOf: string;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">
      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface/40">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="w-[30%] px-5 py-4 font-mono text-xs font-normal text-faint">
                As of {asOf}
              </th>
              <th
                scope="col"
                className="w-[35%] border-l border-hairline px-5 py-4 font-display text-base font-medium tracking-tight"
              >
                <span className="border-b-2 border-ember pb-1">{SITE.name}</span>
              </th>
              <th
                scope="col"
                className="w-[35%] border-l border-hairline px-5 py-4 font-display text-base font-medium tracking-tight text-muted"
              >
                {other}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, koegaki, other: o }) => (
              <tr key={label} className="border-b border-hairline last:border-b-0 align-top">
                <th scope="row" className="px-5 py-4 font-normal text-muted">
                  {label}
                </th>
                <td className="border-l border-hairline px-5 py-4 leading-relaxed text-ink">{koegaki}</td>
                <td className="border-l border-hairline px-5 py-4 leading-relaxed text-muted">{o}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
