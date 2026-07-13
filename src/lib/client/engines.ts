// lib/client/engines.ts
// Why: multiple named BYO-model profiles instead of one llmConfig, so the same patent can be run
// through different engines and compared (Task 7 builds the comparison table on top). Client-only
// — never import this from server code. The legacy single "llmConfig" is migrated into one
// profile (id "legacy") the first time loadEngines() runs, and is then kept in sync with whichever
// profile is ACTIVE on every save/active-switch so any code still reading llmConfig directly keeps
// working. All storage access is try/catch-safe: a disabled/corrupt localStorage degrades to "no
// engines configured" rather than throwing.
import { PROVIDERS, type Provider } from "@/lib/llm/config";

export type EngineProfile = {
  id: string;
  label: string;
  provider: Provider;
  model: string;
  apiKey: string;
};

const ENGINES_KEY = "llmEngines";
const ACTIVE_KEY = "llmActiveEngine";
const LEGACY_KEY = "llmConfig";

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage disabled/quota exceeded — nothing more we can do client-side
  }
}

function isValidProfile(p: unknown): p is EngineProfile {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.length > 0 &&
    typeof o.label === "string" &&
    typeof o.provider === "string" &&
    PROVIDERS.includes(o.provider as Provider) &&
    typeof o.model === "string" &&
    typeof o.apiKey === "string"
  );
}

// Reads only "llmEngines" as-is — no migration side effects. Returns [] for anything malformed
// (missing key, corrupt JSON, not an array, entries that don't match the shape).
function readEnginesRaw(): EngineProfile[] {
  const stored = readJSON<unknown>(ENGINES_KEY);
  if (Array.isArray(stored) && stored.every(isValidProfile)) return stored;
  return [];
}

function resolveActive(engines: EngineProfile[], id: string | null): EngineProfile | null {
  if (engines.length === 0) return null;
  const found = id ? engines.find((e) => e.id === id) : undefined;
  return found ?? engines[0]; // unknown/deleted/missing id falls back to the first profile
}

function syncLegacyConfig(engines: EngineProfile[]): void {
  const active = resolveActive(engines, getActiveEngineId());
  if (active) {
    writeJSON(LEGACY_KEY, toLLMConfig(active));
  } else {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // ignore
    }
  }
}

export function loadEngines(): EngineProfile[] {
  const existing = readEnginesRaw();
  if (existing.length > 0) return existing;

  // Nothing valid under "llmEngines" yet — attempt a one-time migration from the legacy
  // single-config, if it's present and well-formed.
  const legacy = readJSON<Record<string, unknown>>(LEGACY_KEY);
  const provider = legacy?.provider;
  const model = legacy?.model;
  const apiKey = legacy?.apiKey;
  if (
    typeof provider === "string" &&
    PROVIDERS.includes(provider as Provider) &&
    typeof model === "string" &&
    model.trim() !== "" &&
    typeof apiKey === "string" &&
    apiKey.trim() !== ""
  ) {
    const migrated: EngineProfile = { id: "legacy", label: model, provider: provider as Provider, model, apiKey };
    saveEngines([migrated]);
    setActiveEngineId(migrated.id);
    return [migrated];
  }

  return [];
}

export function saveEngines(engines: EngineProfile[]): void {
  writeJSON(ENGINES_KEY, engines);
  syncLegacyConfig(engines);
}

export function getActiveEngineId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveEngineId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
  syncLegacyConfig(readEnginesRaw());
}

export function getActiveEngine(): EngineProfile | null {
  const engines = loadEngines();
  return resolveActive(engines, getActiveEngineId());
}

export function toLLMConfig(e: EngineProfile): { provider: string; model: string; apiKey: string } {
  return { provider: e.provider, model: e.model, apiKey: e.apiKey };
}
