// components/MandateManager.tsx
// Why: the demand-side counterpart to EngineField — this is where a buyer mandate (name +
// standing thesis) is created and retired. Mandates back the per-(mandate, asset) Buyer-Fit
// Score (BuyerFitPanel on the patent detail page), so this list is what populates that
// panel's mandate picker. Server-authoritative: every mutation round-trips through
// /api/mandates rather than trusting optimistic local state, since insertMandate can 400 on
// empty name/thesis.
"use client";
import { useState } from "react";
import type { MandateRow } from "@/lib/mandates/queries";

export default function MandateManager({ initial }: { initial: MandateRow[] }) {
  const [mandates, setMandates] = useState<MandateRow[]>(initial);
  const [name, setName] = useState("");
  const [thesis, setThesis] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const res = await fetch("/api/mandates");
    const data = (await res.json()) as { mandates: MandateRow[] };
    setMandates(data.mandates);
  }

  async function create() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/mandates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, thesis }),
      });
      const data = (await res.json()) as { id?: number; ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        setError(data.error ?? "Failed to create mandate");
        return;
      }
      setName("");
      setThesis("");
      await refresh();
    } catch {
      setError("Failed to create mandate");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await fetch(`/api/mandates?id=${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="space-y-6">
      {/* Existing mandates */}
      {mandates.length === 0 ? (
        <p className="text-sm text-ink-soft">No mandates yet — add a buyer thesis below to start scoring fit.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {mandates.map((m) => (
            <li key={m.id} className="flex flex-wrap items-start gap-3 bg-surface px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{m.name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{m.thesis}</p>
                <p className="mt-1 text-[11px] text-muted">Added {m.created_at}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="shrink-0 text-xs font-semibold text-ink-soft transition hover:text-bad"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Create form */}
      <div className="space-y-3 border-t border-line pt-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">Buyer name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Grid Storage Buyer"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">Thesis</span>
          <textarea
            value={thesis}
            onChange={(e) => setThesis(e.target.value)}
            rows={3}
            placeholder="Long-duration energy storage compatible with existing gas plants; US jurisdiction; TRL 4+"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={create}
            disabled={busy || !name.trim() || !thesis.trim()}
            className="rounded-xl bg-action px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-action-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add mandate"}
          </button>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}
