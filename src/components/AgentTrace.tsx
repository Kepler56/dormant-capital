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
          <li key={i} className="flex items-start gap-3 animate-fade-up">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[e.status]} ${live && i === events.length - 1 ? "animate-pulse" : ""}`} />
            <span className="min-w-0">
              <span className="text-sm text-ink">{e.label}</span>
              {e.detail && <span className="ml-2 text-xs text-muted">{e.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
