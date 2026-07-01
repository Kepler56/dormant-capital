// components/FactTable.tsx
// Why: facts are the immutable, sourced ground truth — so we show the value AND a link
// to the exact source for every row. That source link is the whole point of the
// facts/judgments split: anyone can verify the number came from somewhere real.
import type { FactRow } from "@/lib/types";

export default function FactTable({ facts }: { facts: FactRow[] }) {
  if (!facts.length) return <p className="text-sm text-slate-500">No facts yet.</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {facts.map((f) => (
          <tr key={f.id} className="border-t border-slate-100 align-top">
            <td className="py-2 pr-4 font-medium text-slate-600 whitespace-nowrap">{f.key}</td>
            <td className="py-2 pr-4 text-ink">{typeof f.value === "object" ? JSON.stringify(f.value) : String(f.value)}</td>
            <td className="py-2 text-right"><a href={f.source_url} target="_blank" className="text-xs text-accent hover:underline">source</a></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
