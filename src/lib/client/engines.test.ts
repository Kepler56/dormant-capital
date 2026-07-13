import { describe, it, expect, beforeEach } from "vitest";

// vitest.config runs in the "node" environment, which has no localStorage global — stub a minimal
// in-memory implementation so engines.ts (written for the browser) can be exercised here.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

// Import after the localStorage stub is in place for every test (module functions read
// localStorage lazily at call time, so a static top-level import is safe here).
import {
  loadEngines,
  saveEngines,
  getActiveEngineId,
  setActiveEngineId,
  getActiveEngine,
  toLLMConfig,
  type EngineProfile,
} from "./engines";

const openai: EngineProfile = { id: "e1", label: "GPT-4o", provider: "openai", model: "gpt-4o", apiKey: "sk-abc123" };
const anthropic: EngineProfile = { id: "e2", label: "Sonnet", provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "sk-xyz789" };

describe("loadEngines migration", () => {
  it("returns [] when nothing is stored", () => {
    expect(loadEngines()).toEqual([]);
  });

  it("migrates a legacy llmConfig into a single 'legacy' profile and persists it", () => {
    localStorage.setItem("llmConfig", JSON.stringify({ provider: "openai", model: "gpt-4o", apiKey: "sk-legacy" }));
    const engines = loadEngines();
    expect(engines).toEqual([{ id: "legacy", label: "gpt-4o", provider: "openai", model: "gpt-4o", apiKey: "sk-legacy" }]);
    // Persisted, and set active — second call must not re-migrate or duplicate.
    expect(JSON.parse(localStorage.getItem("llmEngines")!)).toEqual(engines);
    expect(getActiveEngineId()).toBe("legacy");
    expect(loadEngines()).toEqual(engines);
  });

  it("does not migrate a corrupt/incomplete legacy llmConfig", () => {
    localStorage.setItem("llmConfig", JSON.stringify({ provider: "openai" })); // missing model/apiKey
    expect(loadEngines()).toEqual([]);
  });

  it("ignores corrupt JSON under llmEngines and falls back to legacy migration", () => {
    localStorage.setItem("llmEngines", "{not json");
    localStorage.setItem("llmConfig", JSON.stringify({ provider: "gemini", model: "gemini-2.5-flash", apiKey: "sk-g" }));
    const engines = loadEngines();
    expect(engines).toHaveLength(1);
    expect(engines[0].provider).toBe("gemini");
  });

  it("ignores llmEngines that is valid JSON but not an array of profiles", () => {
    localStorage.setItem("llmEngines", JSON.stringify({ oops: true }));
    expect(loadEngines()).toEqual([]);
  });
});

describe("saveEngines + active resolution", () => {
  it("persists the engines list verbatim", () => {
    saveEngines([openai, anthropic]);
    expect(loadEngines()).toEqual([openai, anthropic]);
  });

  it("keeps legacy llmConfig in sync with the active engine on save", () => {
    saveEngines([openai]);
    setActiveEngineId("e1");
    saveEngines([openai, anthropic]); // active still e1
    expect(JSON.parse(localStorage.getItem("llmConfig")!)).toEqual(toLLMConfig(openai));
  });

  it("updates legacy llmConfig when the active engine is switched", () => {
    saveEngines([openai, anthropic]);
    setActiveEngineId("e2");
    expect(JSON.parse(localStorage.getItem("llmConfig")!)).toEqual(toLLMConfig(anthropic));
    expect(getActiveEngine()).toEqual(anthropic);
  });

  it("falls back to the first profile when the active id points at a deleted profile", () => {
    saveEngines([openai, anthropic]);
    setActiveEngineId("e2");
    saveEngines([openai]); // e2 removed; active id "e2" is now dangling
    expect(getActiveEngine()).toEqual(openai);
    expect(JSON.parse(localStorage.getItem("llmConfig")!)).toEqual(toLLMConfig(openai));
  });

  it("falls back to the first profile when no active id has ever been set", () => {
    saveEngines([openai, anthropic]);
    expect(getActiveEngineId()).toBeNull();
    expect(getActiveEngine()).toEqual(openai);
  });

  it("returns null and clears legacy llmConfig when the engines list is emptied", () => {
    saveEngines([openai]);
    setActiveEngineId("e1");
    saveEngines([]);
    expect(getActiveEngine()).toBeNull();
    expect(localStorage.getItem("llmConfig")).toBeNull();
  });
});

describe("toLLMConfig", () => {
  it("maps an EngineProfile to the /api/analyze llmConfig shape", () => {
    expect(toLLMConfig(openai)).toEqual({ provider: "openai", model: "gpt-4o", apiKey: "sk-abc123" });
  });
});
