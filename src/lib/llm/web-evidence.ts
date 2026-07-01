// llm/web-evidence.ts
// Why: grounding is what separates "the model guessed" from "the model read the web and here
// are the links". Search is now PROVIDER-NATIVE so the agentic system grounds with whatever
// model the user brought:
//   • Gemini    → the built-in Google Search grounding tool (groundingMetadata → cited chunks)
//   • OpenAI    → the Responses API `web_search_preview` server tool (url_citation annotations)
//   • Anthropic → the `web_search` server tool (web_search_result blocks + citations)
// Each path is best-effort and bounded: one call, a hard timeout, a global result cap, and a
// graceful empty fallback — search NEVER throws into the analysis path. Sources are parsed into
// STRUCTURED {title,url,snippet} so the extract nodes reason over labelled evidence and we
// persist the URLs as the judgment's citations.
import { GoogleGenAI } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { LLMConfig } from "./config";

export type WebSource = { title: string; url: string; snippet: string };
export type WebEvidence = { sources: WebSource[]; text: string };

const EMPTY: WebEvidence = { sources: [], text: "(no web results found)" };

// Cap on results kept per single search, and on how many times a provider may call its own
// search tool inside one request. The agent enforces a separate cap on the NUMBER of searches.
export const MAX_SEARCH_RESULTS = 5;
const MAX_TOOL_USES = 3;
const DEFAULT_TIMEOUT_MS = 20000;

const searchInstruction = (query: string) =>
  `Search the web and report concise, factual findings for the query below. ` +
  `Prefer primary/authoritative sources and cite what you find.\n\nQUERY: ${query}`;

// Pure: turn a Gemini grounded response into numbered, cited sources. Snippets are drawn from
// groundingSupports — the exact sentences Gemini attributed to each chunk — so the downstream
// prompt sees real, source-anchored text, not just bare links.
export function parseGroundingResponse(resp: GenerateContentResponse, maxResults = MAX_SEARCH_RESULTS): WebEvidence {
  const meta = resp.candidates?.[0]?.groundingMetadata;
  const chunks = meta?.groundingChunks ?? [];

  // chunk index -> the supporting segment texts that cite it.
  const snippetByIdx = new Map<number, string[]>();
  for (const sup of meta?.groundingSupports ?? []) {
    const t = sup.segment?.text?.trim();
    if (!t) continue;
    for (const idx of sup.groundingChunkIndices ?? []) {
      const arr = snippetByIdx.get(idx) ?? [];
      arr.push(t);
      snippetByIdx.set(idx, arr);
    }
  }

  const sources: WebSource[] = [];
  chunks.forEach((c, i) => {
    const url = c.web?.uri ?? "";
    if (!url) return;
    const title = c.web?.title?.trim() || url;
    const snippet = (snippetByIdx.get(i) ?? []).join(" ").replace(/\s+/g, " ").slice(0, 320);
    sources.push({ title, url, snippet });
  });

  return toEvidence(sources, maxResults);
}

// Dedupe by url, cap to maxResults, and render the numbered/labelled block the prompt can
// reference unambiguously ("per source [2]"). Shared by every provider path.
export function toEvidence(raw: WebSource[], maxResults = MAX_SEARCH_RESULTS): WebEvidence {
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (const s of raw) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    sources.push(s);
    if (sources.length >= maxResults) break;
  }
  if (sources.length === 0) return EMPTY;
  const text = sources
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.snippet || "(no snippet)"}`)
    .join("\n\n");
  return { sources, text };
}

// Best-effort recursive harvester for OpenAI/Anthropic messages. Their web-search results and
// citations surface as nested content blocks / annotations whose exact shape varies by SDK
// version, so rather than hard-code a path we walk the structure and collect any object that
// carries an http(s) url plus (optionally) a title and cited text. Depth-guarded; messages are
// plain JSON so there are no cycles.
export function harvestSources(root: unknown): WebSource[] {
  const out: WebSource[] = [];
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 10) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const o = node as Record<string, unknown>;
    const url = (typeof o.url === "string" && o.url) || (typeof o.uri === "string" && o.uri) || "";
    if (url && /^https?:\/\//.test(url)) {
      const title = (typeof o.title === "string" && o.title.trim()) || url;
      const snippetRaw =
        (typeof o.cited_text === "string" && o.cited_text) ||
        (typeof o.snippet === "string" && o.snippet) ||
        (typeof o.text === "string" && o.text) ||
        "";
      out.push({ title, url, snippet: String(snippetRaw).replace(/\s+/g, " ").slice(0, 320) });
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v, depth + 1);
  };
  visit(root, 0);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("grounding timeout")), ms)),
  ]);
}

async function geminiSearch(query: string, cfg: LLMConfig, maxResults: number, timeoutMs: number): Promise<WebEvidence> {
  const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
  const resp = await withTimeout(
    ai.models.generateContent({
      model: cfg.model,
      contents: searchInstruction(query),
      config: { tools: [{ googleSearch: {} }], temperature: 0 },
    }),
    timeoutMs
  );
  return parseGroundingResponse(resp, maxResults);
}

async function openaiSearch(query: string, cfg: LLMConfig, maxResults: number, timeoutMs: number): Promise<WebEvidence> {
  // web search rides on the Responses API server tool; url_citation annotations carry the sources.
  const client = new OpenAI({ apiKey: cfg.apiKey });
  const resp = await withTimeout(
    client.responses.create({
      model: cfg.model,
      tools: [{ type: "web_search_preview" }],
      input: searchInstruction(query),
    }),
    timeoutMs
  );
  return toEvidence(harvestSources(resp), maxResults);
}

async function anthropicSearch(query: string, cfg: LLMConfig, maxResults: number, timeoutMs: number): Promise<WebEvidence> {
  // The web_search server tool returns web_search_result blocks + citations on the text blocks.
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const resp = await withTimeout(
    client.messages.create({
      model: cfg.model,
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_TOOL_USES }],
      messages: [{ role: "user", content: searchInstruction(query) }],
    }),
    timeoutMs
  );
  return toEvidence(harvestSources(resp), maxResults);
}

// Provider-native web search dispatched off the BYO config. Any failure (no key, tool
// unsupported for the chosen model, timeout, network) degrades to empty so analysis proceeds
// ungrounded rather than crashing.
export async function webEvidence(
  query: string,
  cfg: LLMConfig | null | undefined,
  maxResults = MAX_SEARCH_RESULTS,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WebEvidence> {
  if (!cfg) return EMPTY;
  try {
    switch (cfg.provider) {
      case "gemini":
        return await geminiSearch(query, cfg, maxResults, timeoutMs);
      case "openai":
        return await openaiSearch(query, cfg, maxResults, timeoutMs);
      case "anthropic":
        return await anthropicSearch(query, cfg, maxResults, timeoutMs);
      default:
        return EMPTY;
    }
  } catch {
    return EMPTY;
  }
}
