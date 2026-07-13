// components/BuyerFitPanel.tsx
// Why: the demand-side counterpart to AnalyzeButton — scores THIS asset against a chosen
// buyer mandate. Same BYO-engine contract (getActiveEngine/toLLMConfig, same "no engine"
// hint pointing at Settings) and the same rule everywhere else in the app: the LLM only
// ever supplies evidence: POST /api/buyer-fit runs the extraction + deterministic mapping
// server-side and hands back a number this component just displays. Previous buyer-fit
// judgments are shown below so a user can see every mandate this asset has been scored
// against without leaving the page; the mandate name is resolved from sub_dimension
// ("mandate:{id}") since the judgment row itself only stores the id.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MandateRow } from "@/lib/mandates/queries";
import type { JudgmentRow } from "@/lib/types";
import { loadEngines, getActiveEngine, toLLMConfig, type EngineProfile } from "@/lib/client/engines";

function mandateIdFromSubDimension(subDimension: string): number | null {
  const m = /^mandate:(\d+)$/.exec(subDimension);
  return m ? Number(m[1]) : null;
}

export default function BuyerFitPanel({
  assetId,
  mandates,
  judgments,
}: {
  assetId: number;
  mandates: MandateRow[];
  judgments: JudgmentRow[];
}) {
  const [engines, setEngines] = useState<EngineProfile[]>([]);
  const [selectedEngineId, setSelectedEngineId] = useState<string | null>(null);
  const [mandateId, setMandateId] = useState<number | null>(mandates[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ score: number; summary: string | null } | null>(null);
  const router = useRouter();

  useEffect(() => {
    setEngines(loadEngines());
    setSelectedEngineId(getActiveEngine()?.id ?? null);
  }, []);

  const selectedEngine = engines.find((e) => e.id === selectedEngineId) ?? null;
  const mandateName = (id: number) => mandates.find((m) => m.id === id)?.name ?? `Mandate #${id}`;

  async function scoreFit() {
    if (!selectedEngine || !mandateId) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/buyer-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, mandateId, llmConfig: toLLMConfig(selectedEngine) }),
      });
      const data = (await res.json()) as { ok: boolean; score?: number; summary?: string | null; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Failed to score fit");
        return;
      }
      setResult({ score: data.score!, summary: data.summary ?? null });
      router.refresh();
    } catch {
      setError("Failed to score fit");
    } finally {
      setBusy(false);
    }
  }

  if (mandates.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <span className="text-sm font-bold text-ink">Buyer fit</span>
        <p className="mt-2 text-sm text-ink-soft">
          No mandates yet —{" "}
          <Link href="/mandates" className="font-semibold text-action hover:underline">add a buyer mandate</Link>{" "}
          to score this patent against a thesis.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-ink">Buyer fit</span>
        {result && (
          <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-dark">
            Score {result.score}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">Mandate</span>
          <select
            value={mandateId ?? ""}
            onChange={(e) => setMandateId(Number(e.target.value))}
            className="rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft"
          >
            {mandates.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>

        {engines.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted">Engine</span>
            <select
              value={selectedEngineId ?? ""}
              onChange={(e) => setSelectedEngineId(e.target.value)}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft"
            >
              {engines.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </label>
        )}

        <button
          onClick={scoreFit}
          disabled={busy || !selectedEngine || !mandateId}
          className="rounded-xl bg-action px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-action-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Scoring…" : "Score fit"}
        </button>
      </div>

      {!selectedEngine && (
        <p className="mt-2 text-[11px] text-muted">
          <Link href="/settings" className="font-semibold text-action hover:underline">Add your model in Settings</Link> to score fit
        </p>
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      {result?.summary && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{result.summary}</p>}

      {judgments.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Previous buyer-fit scores</div>
          <ul className="space-y-1.5">
            {[...judgments].reverse().map((j) => {
              const id = mandateIdFromSubDimension(j.sub_dimension);
              return (
                <li key={j.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-ink">{id !== null ? mandateName(id) : j.sub_dimension}</span>
                  <span className="rounded bg-idle-soft px-1.5 py-0.5 font-semibold text-ink-soft">{j.score ?? "—"}</span>
                  <span className="text-muted">{j.model_version}</span>
                  <span className="text-muted">{j.created_at}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
