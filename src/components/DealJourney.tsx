// components/DealJourney.tsx
// Why: the micro-outcome ledger made legible (brief v2, Upgrade 2 — "fifty signals per
// deal, not one"). A vertical timeline of every logged step, plus the inline form that
// writes new ones. Reason is required styling kicks in the moment a terminal event
// (closed/rejected) is selected — the same rule /api/outcomes enforces server-side, so
// the UI just previews it; the 400 message is still shown verbatim if someone bypasses it.
"use client";
import { useState } from "react";
import {
  OUTCOME_EVENTS, TERMINAL_EVENTS, REASON_CODES,
  OUTCOME_LABELS, REASON_LABELS,
  type OutcomeEvent, type ReasonCode,
} from "@/lib/outcomes/types";
import type { OutcomeRow } from "@/lib/outcomes/queries";
import { Card, SectionLabel } from "@/components/ui/Card";

export default function DealJourney({ assetId, initial }: { assetId: number; initial: OutcomeRow[] }) {
  const [rows, setRows] = useState<OutcomeRow[]>(initial);
  const [eventType, setEventType] = useState<OutcomeEvent>(OUTCOME_EVENTS[0]);
  const [reasonCode, setReasonCode] = useState<ReasonCode | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isTerminal = TERMINAL_EVENTS.includes(eventType);

  async function refresh() {
    const res = await fetch(`/api/outcomes?assetId=${assetId}`);
    const data = (await res.json()) as { outcomes: OutcomeRow[] };
    setRows(data.outcomes);
  }

  async function logStep() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          eventType,
          reasonCode: reasonCode || null,
          note: note || null,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Failed to log step");
        return;
      }
      setNote("");
      setReasonCode("");
      await refresh();
    } catch {
      setError("Failed to log step");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionLabel>Deal journey</SectionLabel>
      <Card className="p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No steps logged yet.</p>
        ) : (
          <ol className="space-y-3 border-l border-line pl-4">
            {rows.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-surface" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {OUTCOME_LABELS[r.event_type as OutcomeEvent] ?? r.event_type}
                  </span>
                  {r.reason_code && (
                    <span className="rounded bg-idle-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                      {REASON_LABELS[r.reason_code as ReasonCode] ?? r.reason_code}
                    </span>
                  )}
                  <span className="text-xs text-muted">{r.created_at}</span>
                </div>
                {r.note && <p className="mt-0.5 text-xs text-ink-soft">{r.note}</p>}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted">Event</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as OutcomeEvent)}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft"
            >
              {OUTCOME_EVENTS.map((ev) => (
                <option key={ev} value={ev}>{OUTCOME_LABELS[ev]}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={`text-[11px] font-medium ${isTerminal ? "text-bad" : "text-muted"}`}>
              Reason{isTerminal ? " (required)" : ""}
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as ReasonCode | "")}
              className={`rounded-xl border bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 ${
                isTerminal && !reasonCode
                  ? "border-bad focus:border-bad focus:ring-bad/20"
                  : "border-line focus:border-action focus:ring-action-soft"
              }`}
            >
              <option value="">—</option>
              {REASON_CODES.map((r) => (
                <option key={r} value={r}>{REASON_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-1 min-w-[160px] flex-col gap-1">
            <label className="text-[11px] font-medium text-muted">Note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
              className="w-full rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft"
            />
          </div>

          <button
            onClick={logStep}
            disabled={busy}
            className="rounded-xl bg-action px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-action-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Logging…" : "Log"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      </Card>
    </section>
  );
}
