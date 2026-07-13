// components/AnalyzeButton.tsx
// Why: the ONLY control that spends tokens. It consumes an SSE stream: as the agent works,
// trace events render live beneath the button, so the user WATCHES the analysis think. Analysis
// always runs on the user's own BYO model — one of possibly several saved engine profiles
// (src/lib/client/engines.ts), defaulting to the active one but switchable per run so the same
// patent can be compared across engines. If no engine is configured the button points the user to
// Settings rather than firing a request that would only bounce back a 400.
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AgentTrace from "./AgentTrace";
import type { TraceEvent } from "@/lib/agent/state";
import { loadEngines, getActiveEngine, toLLMConfig, type EngineProfile } from "@/lib/client/engines";
import { streamAnalyze } from "@/lib/client/analyze-stream";

export default function AnalyzeButton({ assetId, num }: { assetId: number; num: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [engines, setEngines] = useState<EngineProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<TraceEvent[]>([]);
  const router = useRouter();

  useEffect(() => {
    setEngines(loadEngines());
    setSelectedId(getActiveEngine()?.id ?? null);
  }, []);

  const selected = engines.find((e) => e.id === selectedId) ?? null;

  async function run() {
    if (!selected) return; // no engine configured — the hint below tells the user what to do
    const llmConfig = toLLMConfig(selected);
    setBusy(true); setMsg(""); setLive([]);
    try {
      const result = await streamAnalyze({ assetId, num, llmConfig }, (e) => setLive((p) => [...p, e]));
      if (!result.ok) setMsg(result.error ?? "Failed");
    } catch (e) {
      // streamAnalyze REJECTS (rather than resolving ok:false) on fetch failure or a mid-stream
      // connection drop — without this catch, busy would stay true forever ("Analyzing…").
      setMsg((e as Error).message || "Analysis failed");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex w-full flex-col items-end gap-3">
      {engines.length > 0 && !busy && (
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
      <button
        onClick={run}
        disabled={busy || !selected}
        className="inline-flex items-center gap-2 rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-action-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
        )}
        {busy ? "Analyzing…" : "Analyze patent"}
      </button>
      {!busy && (
        selected ? (
          <span className="text-[11px] text-muted">Engine: {selected.label}</span>
        ) : (
          <span className="text-[11px] text-muted">
            <Link href="/settings" className="font-semibold text-action hover:underline">Add your model in Settings</Link> to analyze
          </span>
        )
      )}
      {msg && <p className="text-sm text-bad">{msg}</p>}
      {live.length > 0 && <div className="w-full"><AgentTrace events={live} live={busy} /></div>}
    </div>
  );
}
