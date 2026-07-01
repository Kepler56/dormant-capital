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

export function chatModel(o: { provider: Provider; model: string; apiKey: string }): BaseChatModel {
  if (_override) return _override(o);
  switch (o.provider) {
    case "openai":
      return new ChatOpenAI({ model: o.model, apiKey: o.apiKey, temperature: 0 });
    case "anthropic":
      return new ChatAnthropic({ model: o.model, apiKey: o.apiKey, temperature: 0 });
    case "gemini":
      return new ChatGoogleGenerativeAI({ model: o.model, apiKey: o.apiKey, temperature: 0 });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function isTransient(err: unknown): boolean {
  const m = String((err as Error)?.message ?? err).toLowerCase();
  return /429|rate|quota|500|502|503|504|timeout|fetch failed|network|unavailable|overloaded/.test(m);
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
      if (attempt < MAX - 1 && isTransient(err)) { await sleep(500 * 2 ** attempt); continue; }
      throw err;
    }
  }
  throw lastErr;
}
