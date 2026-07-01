// llm/model.ts
// Why: ONE provider-agnostic seam for every LLM call. There is NO server default model — the
// user always brings their own provider/model/key (so no .env is required to deploy). A
// BaseChatModel is built per request from that BYO config. Structured extraction uses
// LangChain's provider-agnostic withStructuredOutput(zod), so OpenAI, Anthropic and Gemini all
// return the same validated shape. Hardening: transient-retry with backoff + one schema-repair
// round-trip; temperature 0 for reproducibility. A test-only factory override (__setChatFactory)
// lets the graph and this module be tested without keys.
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ZodSchema } from "zod";
import type { LLMConfig, Provider } from "./config";

// Tiers are kept as a semantic label on each call (screen/extract/deep) even though a single
// BYO model now serves every tier — the agent nodes still reason in these terms.
export type Tier = "screen" | "extract" | "deep";

type ChatFactory = (o: { provider: Provider; model: string; apiKey: string }) => BaseChatModel;

let _override: ChatFactory | null = null;
/** TEST-ONLY: inject a fake chat factory (pass null to restore). */
export function __setChatFactory(f: ChatFactory | null) { _override = f; }

// maxRetries is kept LOW so a rate-limited/unavailable model surfaces in seconds — this seam
// owns retries (below), and the whole run must fit a serverless time budget. LangChain's default
// of 6 internal retries with exponential backoff would otherwise stack minutes onto every call.
export function chatModel(o: { provider: Provider; model: string; apiKey: string }): BaseChatModel {
  if (_override) return _override(o);
  switch (o.provider) {
    case "openai":
      return new ChatOpenAI({ model: o.model, apiKey: o.apiKey, temperature: 0, maxRetries: 1 });
    case "anthropic":
      return new ChatAnthropic({ model: o.model, apiKey: o.apiKey, temperature: 0, maxRetries: 1 });
    case "gemini":
      return new ChatGoogleGenerativeAI({ model: o.model, apiKey: o.apiKey, temperature: 0, maxRetries: 1 });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function isTransient(err: unknown): boolean {
  const m = String((err as Error)?.message ?? err).toLowerCase();
  return /429|rate|quota|500|502|503|504|timeout|fetch failed|network|unavailable|overloaded/.test(m);
}

// A PERMANENT failure that retrying can never fix: the model isn't available to this key/plan
// (free-tier quota of 0, unknown model, bad key). We fail fast with a clear, actionable message
// instead of grinding through backoff. `limit: 0` is Gemini's tell that a model (e.g. 2.5-pro)
// is not free-tier eligible.
function permanentReason(err: unknown, model: string): string | null {
  const m = String((err as Error)?.message ?? err).toLowerCase();
  if (/limit:\s*0/.test(m))
    return `Model "${model}" isn't available on your API plan (quota 0). Pick a free-tier model like gemini-2.5-flash, or use a billing-enabled key.`;
  if (/api key not valid|invalid api key|invalid_api_key|unauthorized|permission denied|401|403/.test(m))
    return `Your API key was rejected for "${model}". Check the key and that it can access this model.`;
  if (/not found|does not exist|no such model|unknown model|model.*not supported/.test(m))
    return `Model "${model}" was not found for this provider. Check the exact model id in Settings.`;
  return null;
}

export async function extractJson<T>(
  tier: Tier, prompt: string, schema: ZodSchema<T>, cfg?: LLMConfig | null
): Promise<{ data: T; model: string }> {
  // BYO is mandatory: no config means no key to call with. Fail loud (and early) so the caller
  // can surface a clear "configure your model in Settings" message instead of a vague crash.
  if (!cfg) throw new Error("No model configured. Add your provider, model and API key in Settings.");
  void tier; // tier is informational only now — one BYO model serves every tier.
  const r = cfg;
  const structured = chatModel(r).withStructuredOutput(schema as never, { name: "extract" });

  const MAX = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX; attempt++) {
    try {
      const raw = await structured.invoke(prompt);
      const parsed = schema.safeParse(raw);
      if (parsed.success) return { data: parsed.data, model: r.model };
      // One repair round-trip: hand back the bad output + the validation error.
      const repairPrompt =
        `${prompt}\n\nYour previous reply did not match the required schema and was REJECTED.\n` +
        `Previous reply:\n${JSON.stringify(raw)}\n\nErrors:\n` +
        parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n") +
        `\n\nReturn ONLY a corrected object.`;
      const repaired = await structured.invoke(repairPrompt);
      return { data: schema.parse(repaired), model: r.model };
    } catch (err) {
      lastErr = err;
      const permanent = permanentReason(err, r.model);
      if (permanent) throw new Error(permanent);
      if (attempt < MAX - 1 && isTransient(err)) { await sleep(500 * 2 ** attempt); continue; }
      throw err;
    }
  }
  throw lastErr;
}
