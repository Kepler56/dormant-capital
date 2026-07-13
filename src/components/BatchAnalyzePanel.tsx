// components/BatchAnalyzePanel.tsx
// Why: the multi-select runner. PatentSearch lets a user check up to 10 rows; this panel takes
// those patent numbers and works through them ONE AT A TIME — ingest, then stream-analyze, then
// the next — because BYO providers have per-key rate limits a concurrent fan-out would trip.
// Each row gets its own status machine (queued -> ingesting -> analyzing -> done|error) so the
// user watches the whole batch progress like a checklist. Stop only stops ADVANCING the queue;
// the item already in flight is allowed to finish so its status lands cleanly rather than being
// torn off mid-request. Reuses streamAnalyze (Task 10 Step 1) for identical SSE handling to a
// single AnalyzeButton run, and the same engine-profile picker as AnalyzeButton (Task 6).
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { streamAnalyze } from "@/lib/client/analyze-stream";
import { loadEngines, getActiveEngine, toLLMConfig, type EngineProfile } from "@/lib/client/engines";

type RowStatus =
  | { kind: "queued" }
  | { kind: "ingesting" }
  | { kind: "analyzing"; label: string }
  | { kind: "done"; assetId: number }
  | { kind: "error"; message: string };

type Row = { num: string; status: RowStatus };

const STATUS_DOT: Record<RowStatus["kind"], string> = {
  queued: "bg-line",
  ingesting: "bg-action animate-pulse",
  analyzing: "bg-action animate-pulse",
  done: "bg-brand",
  error: "bg-bad",
};

function statusLabel(status: RowStatus): string {
  switch (status.kind) {
    case "queued": return "Queued";
    case "ingesting": return "Ingesting…";
    case "analyzing": return status.label || "Analyzing…";
    case "done": return "Done";
    case "error": return status.message;
  }
}

export default function BatchAnalyzePanel({ numbers, onClose }: { numbers: string[]; onClose: () => void }) {
  const [engines, setEngines] = useState<EngineProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() => numbers.map((num) => ({ num, status: { kind: "queued" } })));
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    setEngines(loadEngines());
    setSelectedId(getActiveEngine()?.id ?? null);
  }, []);

  const selected = engines.find((e) => e.id === selectedId) ?? null;

  function updateRow(num: string, status: RowStatus) {
    setRows((prev) => prev.map((r) => (r.num === num ? { ...r, status } : r)));
  }

  async function start() {
    if (!selected || running) return;
    stopRef.current = false;
    setRunning(true);
    setFinished(false);
    const llmConfig = toLLMConfig(selected);

    // The queue runs inside try/finally so running/finished ALWAYS settle, and each phase in
    // the loop catches its own failures: one patent's thrown rejection (dropped connection,
    // transient network error — realistic over a long sequential run) must mark THAT row as
    // error and let the queue continue, never kill the loop and freeze the panel on "Stop".
    try {
      for (const num of numbers) {
        if (stopRef.current) break; // Stop was pressed — the prior item finished; don't start the next.

        updateRow(num, { kind: "ingesting" });
        let assetId: number;
        try {
          const res = await fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ numbers: [num] }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const first = data?.results?.[0];
          if (!first?.ok || !first?.assetId) throw new Error(first?.error ?? "Could not ingest this patent");
          assetId = first.assetId as number;
        } catch (e) {
          updateRow(num, { kind: "error", message: (e as Error).message });
          continue;
        }

        updateRow(num, { kind: "analyzing", label: "Starting…" });
        try {
          const result = await streamAnalyze(
            { assetId, num, llmConfig },
            (ev) => updateRow(num, { kind: "analyzing", label: ev.label })
          );
          if (result.ok) updateRow(num, { kind: "done", assetId });
          else updateRow(num, { kind: "error", message: result.error ?? "Analysis failed" });
        } catch (e) {
          // streamAnalyze resolves error FRAMES to { ok:false }; this catch is for the fetch or
          // stream reader throwing outright (e.g. the connection dropping mid-stream).
          updateRow(num, { kind: "error", message: (e as Error).message || "Analysis failed" });
        }
      }
    } finally {
      setRunning(false);
      setFinished(true);
    }
  }

  function stop() {
    stopRef.current = true;
  }

  function close() {
    stopRef.current = true; // if a batch is mid-run, closing also stops it from advancing further
    onClose();
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="w-full max-w-3xl rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink">Batch analysis</h2>
            <p className="text-xs text-muted">{numbers.length} patent{numbers.length === 1 ? "" : "s"} selected</p>
          </div>
          <div className="flex items-center gap-2">
            {engines.length > 0 && !running && (
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft"
              >
                {engines.map((e) => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>
            )}
            {!running && (
              <button
                onClick={start}
                disabled={!selected || finished}
                className="rounded-xl bg-action px-4 py-2 text-xs font-semibold text-white transition hover:bg-action-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {finished ? "Batch complete" : "Run batch"}
              </button>
            )}
            {running && (
              <button
                onClick={stop}
                className="rounded-xl border border-bad px-4 py-2 text-xs font-semibold text-bad transition hover:bg-bad/10"
              >
                Stop
              </button>
            )}
            <button
              onClick={close}
              className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink-soft transition hover:bg-canvas"
            >
              Close
            </button>
          </div>
        </div>

        {!selected && engines.length === 0 && (
          <p className="mt-3 text-xs text-muted">
            <Link href="/settings" className="font-semibold text-action hover:underline">Add your model in Settings</Link> to run a batch.
          </p>
        )}

        <ul className="mt-4 max-h-64 divide-y divide-line/60 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.num} className="flex items-center gap-3 py-2 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[row.status.kind]}`} />
              <span className="w-36 shrink-0 font-mono text-xs text-ink-soft">{row.num}</span>
              <span className={`min-w-0 flex-1 truncate ${row.status.kind === "error" ? "text-bad" : "text-ink-soft"}`}>
                {statusLabel(row.status)}
              </span>
              {row.status.kind === "done" && (
                <Link href={`/patents/${row.status.assetId}`} className="shrink-0 text-xs font-semibold text-action hover:underline">
                  View →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
