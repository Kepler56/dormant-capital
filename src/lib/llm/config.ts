// llm/config.ts
// Why: the BYO contract lives here. Every request must carry the user's own provider/model/key
// (there is no server default); this parses it defensively (all three fields required, provider
// whitelisted) and returns null to mean "not configured" (the caller then refuses to analyze).
// The key is a transient value — it is NEVER stored, logged, or written to the ledger; only the
// model id string is ever persisted downstream.
export const PROVIDERS = ["openai", "anthropic", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type LLMConfig = { provider: Provider; model: string; apiKey: string };

export function parseLLMConfig(raw: unknown): LLMConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const provider = o.provider, model = o.model, apiKey = o.apiKey;
  if (typeof provider !== "string" || !PROVIDERS.includes(provider as Provider)) return null;
  if (typeof model !== "string" || model.trim() === "") return null;
  if (typeof apiKey !== "string" || apiKey.trim() === "") return null;
  return { provider: provider as Provider, model: model.trim(), apiKey };
}
