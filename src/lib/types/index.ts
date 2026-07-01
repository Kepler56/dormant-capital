// types/index.ts
// Why: one place for the row shapes and the Zod schemas that validate LLM output.
// The Zod schemas double as the contract we hand Gemini (structured output) AND the
// runtime guard — if the model drifts from the shape, parsing throws and we never
// persist an unvalidated judgment.
import { z } from "zod";

export type FactRow = { id: number; asset_id: number; key: string; value: unknown; source: string; source_url: string; retrieved_at: string; };
export type JudgmentRow = { id: number; asset_id: number; dimension: string; sub_dimension: string; score: number | null; confidence: string | null; rationale: string | null; flags: unknown; sources: unknown; model_version: string; prompt_version: string; created_at: string; };
export type EventRow = { id: number; event_type: string; asset_id: number | null; payload: unknown; created_at: string; };

export type NewFact = { key: string; value: unknown; source: string; sourceUrl: string; retrievedAt: string; };
export type NewJudgment = { dimension: string; subDimension: string; score?: number | null; confidence?: string | null; rationale?: string | null; flags?: unknown; sources?: unknown; modelVersion: string; promptVersion: string; };

// A single cited evidence item: the value, the snippet it came from, and confidence.
// This is the atomic unit of "LLM extracts evidence, not scores".
//
// Two Gemini function-calling constraints shape this schema:
//  1. `value` is a plain string (categorical: "yes"/"no"/"unknown" or "low"/"medium"/
//     "high"), NOT a boolean|number|string union. Gemini rejects array-typed `type`;
//     the downstream scorers normalise `value` anyway (see scoring/gate.ts), so a string
//     is lossless. Raw booleans are still tolerated at runtime by the gate.
//  2. `evidence()` is a FACTORY, not a shared const. Reusing one Zod object instance makes
//     zod-to-json-schema emit `$ref` for the 2nd+ occurrences, which Gemini also rejects.
//     A fresh instance per field forces every copy to be inlined.
export const evidence = () => z.object({
  value: z.string(),
  snippet: z.string().describe("verbatim text the value was drawn from, or '' if inferred"),
  confidence: z.enum(["low", "medium", "high"]),
});
export type Evidence = z.infer<ReturnType<typeof evidence>>;

// Residual dormancy question — the ONLY part of the gate the LLM touches.
// `market_summary` is optional buyer-facing prose; it never feeds the score.
export const DormancyResidual = z.object({
  product_exists: evidence(),
  active_development: evidence(),
  active_litigation: evidence(),
  market_summary: z.string().optional(),
});
export type DormancyResidual = z.infer<typeof DormancyResidual>;

// Opportunity + Execution evidence (still evidence, never a 0-100 score).
export const OppExecEvidence = z.object({
  commercial_relevance: evidence(),   // value: enum-ish string low/medium/high
  claim_breadth: evidence(),          // value: low/medium/high
  ownership_clarity: evidence(),      // value: low/medium/high
  value_summary: z.string().optional(),
});
export type OppExecEvidence = z.infer<typeof OppExecEvidence>;

// Parsed, structured facts the scraper produces (before they become fact rows).
export type ParsedPatent = {
  patentNumber: string;
  title: string | null;
  abstract: string | null;
  assignee: string | null;
  inventors: string[];
  filingDate: string | null;
  grantDate: string | null;
  priorityDate: string | null;
  expiryDate: string | null;
  cpcClasses: string[];
  forwardCitations: number | null;
  backwardCitations: number | null;
  legalEvents: { date: string; code: string; description: string }[];
  maintenanceLapsed: boolean;        // derived from legalEvents — the hero signal
  anticipatedExpiration: boolean;    // full-term expiry, NOT owner abandonment
};
