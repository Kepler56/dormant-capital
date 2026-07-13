import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseLLMConfig } from "./config";
import { chatModel, extractJson, buildModelOptions, markNoTemperature, isTemperatureError, __setChatFactory } from "./model";

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

describe("model capability: temperature", () => {
  it("omits temperature for OpenAI reasoning-model families", () => {
    for (const m of ["o1-mini", "o3", "o4-mini", "gpt-5", "gpt-5.2-pro", "gpt-5-mini"]) {
      expect(buildModelOptions("openai", m)).not.toHaveProperty("temperature");
    }
  });
  it("keeps temperature 0 for classic models", () => {
    expect(buildModelOptions("openai", "gpt-4o")).toMatchObject({ temperature: 0 });
    expect(buildModelOptions("anthropic", "claude-sonnet-4-5")).toMatchObject({ temperature: 0 });
    expect(buildModelOptions("gemini", "gemini-2.5-flash")).toMatchObject({ temperature: 0 });
  });
  it("markNoTemperature makes the decision sticky for that model", () => {
    expect(buildModelOptions("openai", "some-future-model")).toMatchObject({ temperature: 0 });
    markNoTemperature("openai", "some-future-model");
    expect(buildModelOptions("openai", "some-future-model")).not.toHaveProperty("temperature");
  });
  it("recognises the provider 400 for unsupported temperature", () => {
    expect(isTemperatureError(new Error("400 Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported."))).toBe(true);
    expect(isTemperatureError(new Error("429 rate limit"))).toBe(false);
  });
});

describe("extractJson temperature auto-recovery", () => {
  it("retries once without temperature after an unsupported-temperature 400", async () => {
    let calls = 0;
    const good = { value: "yes", snippet: "", confidence: "high" };
    __setChatFactory(() => ({
      withStructuredOutput: () => ({
        invoke: async () => {
          calls += 1;
          if (calls === 1) throw new Error("400 Unsupported value: 'temperature' does not support 0 with this model.");
          return good;
        },
      }),
    }) as never);
    try {
      const schema = z.object({ value: z.string(), snippet: z.string(), confidence: z.enum(["low", "medium", "high"]) });
      const r = await extractJson("extract", "p", schema, { provider: "openai", model: "gpt-5.3-magic", apiKey: "k" });
      expect(r.data).toEqual(good);
      expect(calls).toBe(2);
      expect(buildModelOptions("openai", "gpt-5.3-magic")).not.toHaveProperty("temperature");
    } finally { __setChatFactory(null); }
  });
});
