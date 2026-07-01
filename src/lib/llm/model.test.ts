import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseLLMConfig } from "./config";
import { chatModel, extractJson } from "./model";

describe("parseLLMConfig", () => {
  it("returns null when fields missing or provider invalid", () => {
    expect(parseLLMConfig(null)).toBeNull();
    expect(parseLLMConfig({ provider: "openai", model: "" , apiKey: "k" })).toBeNull();
    expect(parseLLMConfig({ provider: "bogus", model: "m", apiKey: "k" })).toBeNull();
  });
  it("parses a full config", () => {
    expect(parseLLMConfig({ provider: "anthropic", model: "claude-x", apiKey: "sk" }))
      .toEqual({ provider: "anthropic", model: "claude-x", apiKey: "sk" });
  });
});

describe("chatModel", () => {
  it("builds a chat model exposing withStructuredOutput for each provider", () => {
    for (const provider of ["openai", "anthropic", "gemini"] as const) {
      const m = chatModel({ provider, model: "x", apiKey: "sk-test" });
      expect(typeof m.withStructuredOutput).toBe("function");
    }
  });
});

describe("extractJson", () => {
  it("validates and returns structured data via an injected fake model", async () => {
    // extractJson must accept a 4th hidden seam for tests: we pass a cfg whose provider
    // is 'gemini' but override the underlying invoke through the exported __setChatFactory.
    const schema = z.object({ ok: z.boolean() });
    const { __setChatFactory } = await import("./model");
    __setChatFactory(() => ({
      withStructuredOutput: () => ({ invoke: async () => ({ ok: true }) }),
    }) as never);
    const out = await extractJson("extract", "p", schema, { provider: "gemini", model: "fake", apiKey: "k" });
    expect(out.data).toEqual({ ok: true });
    expect(out.model).toBe("fake");
    __setChatFactory(null); // restore real factory
  });

  it("throws a clear error when no BYO config is supplied", async () => {
    const schema = z.object({ ok: z.boolean() });
    await expect(extractJson("extract", "p", schema, null)).rejects.toThrow(/Settings/);
  });
});
