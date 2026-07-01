// components/EngineField.tsx
// Why: the bring-your-own-model control. There is NO server model — every analysis runs on the
// user's own provider/model/API key, so this control is REQUIRED before analysis works. The
// whole contract is `localStorage.llmConfig` — AnalyzeButton reads it verbatim at analyze time.
// The key NEVER leaves this browser through this component: it is only ever read locally and
// handed to the analyze request when the user next clicks Analyze.
"use client";
import { useEffect, useState } from "react";
import type { Provider } from "@/lib/llm/config";

const PROVIDERS: Provider[] = ["openai", "anthropic", "gemini"];
const PROVIDER_LABEL: Record<Provider, string> = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini" };
const PLACEHOLDER: Record<Provider, string> = { openai: "gpt-4o", anthropic: "claude-sonnet-4-5", gemini: "gemini-2.5-flash" };

export default function EngineField() {
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [stored, setStored] = useState<{ provider: Provider } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("llmConfig");
    if (!raw) return;
    try {
      const cfg = JSON.parse(raw) as { provider: Provider; model: string; apiKey: string };
      if (cfg?.provider && cfg?.model && cfg?.apiKey) {
        setProvider(cfg.provider);
        setModel(cfg.model);
        setApiKey(cfg.apiKey);
        setStored({ provider: cfg.provider });
      }
    } catch {
      // malformed value — ignore, treat as unset
    }
  }, []);

  function save() {
    if (model.trim() && apiKey.trim()) {
      localStorage.setItem("llmConfig", JSON.stringify({ provider, model: model.trim(), apiKey }));
      setStored({ provider });
    } else {
      localStorage.removeItem("llmConfig");
      setStored(null);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function clear() {
    localStorage.removeItem("llmConfig");
    setStored(null);
    setModel("");
    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
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

      {/* Model + key */}
      <div className="grid gap-3 sm:grid-cols-2">
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
          onClick={save}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Save engine
        </button>
        <button
          onClick={clear}
          className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink-soft transition hover:border-ink/20 hover:text-ink"
        >
          Clear
        </button>
        {saved && <span className="text-sm font-medium text-brand-dark">Saved ✓</span>}
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-4 text-sm">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stored ? "bg-brand" : "bg-watch"}`} />
        <span className="text-ink-soft">
          {stored ? (
            <>Using your <span className="font-semibold text-ink">{PROVIDER_LABEL[stored.provider]}</span> key</>
          ) : (
            "No model configured — analysis is disabled until you add one."
          )}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Your key stays in this browser, is sent only with each analysis, and is never stored on our servers.
      </p>
    </div>
  );
}
