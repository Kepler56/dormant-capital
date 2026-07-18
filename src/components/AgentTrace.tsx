// components/AgentTrace.tsx
// Why: the marquee surface — it makes the agent's reasoning VISIBLE. Renders the trace as a
// clean, professional step log (planning → searching → extracting → critiquing → verifying →
// scoring), colored by status. Reused for BOTH the live stream (live) and the persisted trace
// on the patent page, so a past analysis is fully replayable.
"use client";
import type { TraceEvent } from "@/lib/agent/state";

const DOT: Record<TraceEvent["status"], string> = {
  ok: "bg-brand", warn: "bg-watch", info: "bg-idle", start: "bg-action",
};

// A warn step carries the things a reader must not skim past — chiefly "this search never ran,
// so what follows is ungrounded". A 2px dot in a different color is not enough signal for that,
// so warn rows get emphasized text and a tinted background; every other status stays quiet.
const ROW: Partial<Record<TraceEvent["status"], string>> = {
  warn: "rounded-lg bg-watch-soft px-2.5 py-1.5 -mx-2.5",
};
const LABEL: Partial<Record<TraceEvent["status"], string>> = {
  warn: "font-semibold text-amber-800",
};
const DETAIL: Partial<Record<TraceEvent["status"], string>> = {
  warn: "text-amber-700",
};

export default function AgentTrace({ events, live = false }: { events: TraceEvent[]; live?: boolean }) {
  if (!events.length) return null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-bold text-ink">Agent reasoning</span>
        {live && <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-action" />}
      </div>
      <ol className="space-y-2.5">
        {events.map((e, i) => (
          <li key={i} className={`flex items-start gap-3 animate-fade-up ${ROW[e.status] ?? ""}`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[e.status]} ${live && i === events.length - 1 ? "animate-pulse" : ""}`} />
            <span className="min-w-0">
              <span className={`text-sm ${LABEL[e.status] ?? "text-ink"}`}>{e.label}</span>
              {e.detail && <span className={`ml-2 text-xs ${DETAIL[e.status] ?? "text-muted"}`}>{e.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
