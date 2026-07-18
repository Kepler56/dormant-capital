// components/FactTable.tsx
// Why: facts are the immutable, sourced ground truth — so we show the value AND a link
// to the exact source for every row. That source link is the whole point of the
// facts/judgments split: anyone can verify the number came from somewhere real.
import type { FactRow } from "@/lib/types";

// snake_case DB keys are not user-facing language. Anything unmapped falls back to a
// de-underscored version rather than being hidden, so a new fact key still reads sensibly.
const KEY_LABELS: Record<string, string> = {
  title: "Title",
  assignee: "Last known owner",
  filing_date: "Filed",
  grant_date: "Granted",
  expiry_date: "Expires",
  priority_date: "Priority date",
  maintenance_lapsed: "Maintenance fees lapsed",
  anticipated_expiration: "Reached full term",
  legal_events: "Legal events",
  cpc_classes: "CPC classes",
  forward_citations: "Forward citations",
  backward_citations: "Backward citations",
  inventors: "Inventors",
};
const prettyKey = (k: string) => KEY_LABELS[k] ?? k.replace(/_/g, " ");

// The link text names the SOURCE, not the word "source" — a reader scanning the column needs to
// see at a glance that the maintenance-lapse fact came from the USPTO and not from a blog.
function sourceLabel(row: FactRow): string {
  if (row.source) return row.source;
  try {
    return new URL(row.source_url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

export default function FactTable({ facts }: { facts: FactRow[] }) {
  if (!facts.length) return <p className="text-sm text-slate-500">No facts yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
          <th scope="col" className="py-2 pr-4 font-semibold">Fact</th>
          <th scope="col" className="py-2 pr-4 font-semibold">Value</th>
          <th scope="col" className="py-2 text-right font-semibold">Source</th>
        </tr>
      </thead>
      <tbody>
        {facts.map((f) => (
          <tr key={f.id} className="border-t border-slate-100 align-top">
            <td className="py-2 pr-4 font-medium text-slate-600 whitespace-nowrap">{prettyKey(f.key)}</td>
            <td className="py-2 pr-4 text-ink">{typeof f.value === "object" ? JSON.stringify(f.value) : String(f.value)}</td>
            <td className="py-2 text-right">
              {/* Guarded: a row with no usable URL renders plain text. Rendering a live-looking
                  anchor to nowhere is worse than showing nothing on a table whose whole promise
                  is that every value traces to a source. */}
              {f.source_url ? (
                <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                  {sourceLabel(f)}
                </a>
              ) : (
                <span className="text-xs text-muted">{f.source || "no source"}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
