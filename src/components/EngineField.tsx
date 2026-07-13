// components/EngineField.tsx
// Why: the bring-your-own-model control. There is NO server model — every analysis runs on the
// user's own provider/model/API key, so this control is REQUIRED before analysis works. The
// contract is a list of named engine profiles (`localStorage.llmEngines`) plus one active id
// (`llmActiveEngine`); the legacy single `llmConfig` is migrated into a profile automatically and
// kept in sync with whichever profile is active, so AnalyzeButton (and anything else still
// reading it) keeps working. Keys NEVER leave this browser through this component: they are only
// ever read locally and handed to the analyze request when the user next clicks Analyze.
"use client";
import { useEffect, useState } from "react";
import type { Provider } from "@/lib/llm/config";
import {
  loadEngines,
  saveEngines,
  getActiveEngine,
  setActiveEngineId,
  type EngineProfile,
} from "@/lib/client/engines";

const PROVIDERS: Provider[] = ["openai", "anthropic", "gemini"];
const PROVIDER_LABEL: Record<Provider, string> = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini" };
const PLACEHOLDER: Record<Provider, string> = { openai: "gpt-4o", anthropic: "claude-sonnet-4-5", gemini: "gemini-2.5-flash" };

function maskKey(key: string): string {
  const tail = key.slice(-4);
  return tail.length === key.length ? "••••" : `•••• ${tail}`;
}

export default function EngineField() {
  const [engines, setEngines] = useState<EngineProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEngines(loadEngines());
    setActiveId(getActiveEngine()?.id ?? null);
  }, []);

  function addEngine() {
    if (!model.trim() || !apiKey.trim()) return;
    const profile: EngineProfile = {
      id: crypto.randomUUID(),
      label: label.trim() || model.trim(),
      provider,
      model: model.trim(),
      apiKey,
    };
    const updated = [...engines, profile];
    setActiveEngineId(profile.id);
    saveEngines(updated);
    setEngines(updated);
    setActiveId(profile.id);
    setLabel("");
    setModel("");
    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function removeEngine(id: string) {
    const updated = engines.filter((e) => e.id !== id);
    saveEngines(updated);
    setEngines(updated);
    setActiveId(getActiveEngine()?.id ?? null);
  }

  function makeActive(id: string) {
    setActiveEngineId(id);
    setActiveId(id);
  }

  return (
    <div className="space-y-6">
      {/* Saved engines — the profiles this browser knows about, one active at a time */}
      {engines.length > 0 && (
        <div className="space-y-2">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted">Saved engines</span>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {engines.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="active-engine"
                    checked={activeId === e.id}
                    onChange={() => makeActive(e.id)}
                    className="h-4 w-4 accent-action"
                  />
                  <span className="text-sm font-semibold text-ink">{e.label}</span>
                </label>
                <span className="rounded-full bg-action-soft px-2 py-0.5 text-[11px] font-semibold text-action-dark">
                  {PROVIDER_LABEL[e.provider]}
                </span>
                <span className="font-mono text-xs text-ink-soft">{e.model}</span>
                <span className="font-mono text-xs text-muted">{maskKey(e.apiKey)}</span>
                {activeId === e.id && (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-dark">Active</span>
                )}
                <button
                  type="button"
                  onClick={() => removeEngine(e.id)}
                  className="ml-auto text-xs font-semibold text-ink-soft transition hover:text-bad"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add engine form */}
      <div className="space-y-5">
      {/* Provider — segmented control, styled like a bank of engine switches */}
      <div>
        <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">Provider</span>
        <div className="inline-flex rounded-xl border border-line bg-canvas p-1">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              aria-pressed={provider === p}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                provider === p ? "bg-surface text-ink shadow-soft" : "text-ink-soft hover:text-ink"
              }`}
            >
              {PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Label + model + key */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={model.trim() || "e.g. My GPT-4o"}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">Model</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={PLACEHOLDER[provider]}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-••••••••••••••••"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted focus:border-action focus:outline-none focus:ring-2 focus:ring-action-soft"
          />
        </label>
      </div>

      {/* Actions + status */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={addEngine}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Add engine
        </button>
        {saved && <span className="text-sm font-medium text-brand-dark">Saved ✓</span>}
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-4 text-sm">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${engines.length > 0 ? "bg-brand" : "bg-watch"}`} />
        <span className="text-ink-soft">
          {engines.length > 0 ? (
            <>
              {engines.length} engine{engines.length === 1 ? "" : "s"} saved — using{" "}
              <span className="font-semibold text-ink">
                {engines.find((e) => e.id === activeId)?.label ?? engines[0].label}
              </span>
            </>
          ) : (
            "No model configured — analysis is disabled until you add one."
          )}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Your key stays in this browser, is sent only with each analysis, and is never stored on our servers.
      </p>
      </div>
    </div>
  );
}
