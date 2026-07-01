// components/EventTimeline.tsx
// Why: the append-only event_log rendered as a chronological audit trail — ingest,
// analyze_requested, score_computed. This is the "log everything" moat made legible.
import type { EventRow } from "@/lib/types";

export default function EventTimeline({ events }: { events: EventRow[] }) {
  if (!events.length) return <p className="text-sm text-slate-500">No events yet.</p>;
  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span className="w-40 shrink-0 text-xs text-slate-400">{e.created_at}</span>
          <span className="font-medium text-slate-600">{e.event_type}</span>
        </li>
      ))}
    </ol>
  );
}
