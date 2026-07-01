// gemini-schema.test.ts
// Why: Gemini's function-calling endpoint accepts only a restricted OpenAPI subset. Two
// JSON-Schema constructs it rejects outright — and which @langchain/google-genai passes
// through untouched — are `$ref` (reused Zod object instances) and array-typed `type`
// (primitive unions like boolean|number|string). Every schema we hand the LLM via
// withStructuredOutput must therefore be $ref-free and union-free, or the default Gemini
// provider 400s. This guards against reintroducing either.
import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { DormancyResidual, OppExecEvidence } from "./index";
import { PLAN_SCHEMA } from "@/lib/prompts/research-plan";
import { CRITIQUE_SCHEMA } from "@/lib/prompts/critique";
import { VERIFY_SCHEMA } from "@/lib/prompts/verify";
import { SHADOW_SCHEMA } from "@/lib/prompts/shadow-score";

// Walk a JSON-schema object collecting every violation of Gemini's constraints.
function geminiViolations(node: unknown, path = "$"): string[] {
  const out: string[] = [];
  if (Array.isArray(node)) {
    node.forEach((n, i) => out.push(...geminiViolations(n, `${path}[${i}]`)));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "$ref") out.push(`${path}.$ref (Gemini forbids $ref)`);
      if (k === "type" && Array.isArray(v)) out.push(`${path}.type is an array (Gemini forbids union types)`);
      out.push(...geminiViolations(v, `${path}.${k}`));
    }
  }
  return out;
}

const SCHEMAS: [string, ZodTypeAny][] = [
  ["DormancyResidual", DormancyResidual],
  ["OppExecEvidence", OppExecEvidence],
  ["PLAN_SCHEMA", PLAN_SCHEMA],
  ["CRITIQUE_SCHEMA", CRITIQUE_SCHEMA],
  ["VERIFY_SCHEMA", VERIFY_SCHEMA],
  ["SHADOW_SCHEMA", SHADOW_SCHEMA],
];

describe("LLM schemas are Gemini function-calling compatible", () => {
  for (const [name, schema] of SCHEMAS) {
    it(`${name} has no $ref and no union-typed fields`, () => {
      const json = zodToJsonSchema(schema);
      expect(geminiViolations(json)).toEqual([]);
    });
  }
});
