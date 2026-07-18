import { describe, it, expect } from "vitest";
import { parseGroundingResponse, webEvidence, harvestSources } from "./web-evidence";

// Build a minimal Gemini GenerateContentResponse-shaped object for the parser.
const resp = (groundingMetadata: unknown) =>
  ({ candidates: [{ groundingMetadata }] }) as never;

describe("parseGroundingResponse", () => {
  it("maps grounding chunks to cited sources, drawing snippets from supports", () => {
    const r = parseGroundingResponse(resp({
      groundingChunks: [
        { web: { uri: "https://a.com", title: "A" } },
        { web: { uri: "https://b.com", title: "B" } },
      ],
      groundingSupports: [
        { segment: { text: "Alpha fact." }, groundingChunkIndices: [0] },
        { segment: { text: "Beta fact." }, groundingChunkIndices: [1] },
      ],
    }));
    expect(r.sources).toHaveLength(2);
    expect(r.sources[0]).toEqual({ title: "A", url: "https://a.com", snippet: "Alpha fact." });
    expect(r.text).toContain("[1] A");
    expect(r.text).toContain("https://b.com");
  });

  it("dedupes by url and skips chunks without a web uri", () => {
    const dup = parseGroundingResponse(resp({
      groundingChunks: [
        { web: { uri: "u", title: "x" } },
        { web: { uri: "u", title: "y" } },
        { retrievedContext: { uri: "ignored" } },
      ],
    }));
    expect(dup.sources).toHaveLength(1);
    expect(dup.sources[0].title).toBe("x");
  });

  it("returns empty when there are no grounding chunks or no metadata", () => {
    expect(parseGroundingResponse(resp({ groundingChunks: [] })).sources).toEqual([]);
    expect(parseGroundingResponse({} as never).sources).toEqual([]);
  });
});

describe("harvestSources", () => {
  it("pulls cited urls out of nested OpenAI/Anthropic message content", () => {
    const msg = {
      content: [
        { type: "text", text: "hello", annotations: [{ type: "url_citation", url: "https://o.com", title: "O" }] },
        { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.com", title: "A", page_age: "1d" }] },
        { type: "text", text: "cite", citations: [{ url: "https://a.com", title: "A", cited_text: "the fact" }] },
      ],
    };
    const sources = harvestSources(msg);
    const urls = sources.map((s) => s.url);
    expect(urls).toContain("https://o.com");
    expect(urls).toContain("https://a.com");
  });

  it("ignores non-http values and non-objects", () => {
    expect(harvestSources(null)).toEqual([]);
    expect(harvestSources({ content: [{ type: "text", text: "no urls here" }] })).toEqual([]);
  });
});

describe("webEvidence", () => {
  it("returns empty without touching the network when no BYO config is supplied", async () => {
    expect((await webEvidence("anything", null)).sources).toEqual([]);
    expect((await webEvidence("anything", undefined)).sources).toEqual([]);
  });

  // The distinction these lock down is the whole point of `status`: a run where grounding is
  // broken must never be reportable as a run where the web simply had nothing to say. Both
  // cases carry zero sources, so status is the ONLY thing that separates them.
  it("reports a missing engine as failed, not as an empty web", async () => {
    const r = await webEvidence("anything", null);
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/no LLM engine configured/);
  });

  it("reports an unsupported provider as failed and names it", async () => {
    const r = await webEvidence("q", { provider: "wat", model: "m", apiKey: "k" } as never);
    expect(r.status).toBe("failed");
    expect(r.error).toContain("wat");
  });

  it("reports a provider throw as failed, carrying the cause and the model id", async () => {
    // An invalid model id is exactly the real-world case that used to look like "0 sources / ok":
    // the SDK rejects, and the old bare `catch` erased both the failure and the reason.
    const r = await webEvidence("q", { provider: "gemini", model: "does-not-exist", apiKey: "" } as never, 5, 1);
    expect(r.status).toBe("failed");
    expect(r.error).toContain("does-not-exist");
    expect(r.sources).toEqual([]);
  });

  it("marks a genuinely sourceless-but-successful parse as empty, not failed", () => {
    // toEvidence is the shared success path for every provider.
    expect(parseGroundingResponse(resp({ groundingChunks: [] })).status).toBe("empty");
  });

  it("marks a parse that yielded sources as ok", () => {
    const r = parseGroundingResponse(resp({
      groundingChunks: [{ web: { uri: "https://a.com", title: "A" } }],
    }));
    expect(r.status).toBe("ok");
  });
});
