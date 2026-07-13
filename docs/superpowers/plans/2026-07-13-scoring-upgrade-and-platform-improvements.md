# Scoring Upgrade v2 + Platform Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Scoring Engine Upgrade Brief v2 (Gate 0 transactability, split scores, micro-outcome logging, reason codes, buyer-fit) plus seven platform fixes: score recalibration above 75, model-compatibility fixes (OpenAI reasoning-model `temperature` 400, Gemini tool-schema 400), multi-model run comparison, richer patents filters, filter persistence across navigation, and batch analysis.

**Architecture:** The deterministic scoring layer (`src/lib/scoring/`) gains a new facts-only Gate 0 (legal status → route → transactability score) that runs BEFORE the dormancy gate, and all point values move into `config.ts` (scoring-v2). The LLM seam (`src/lib/llm/model.ts`) gets a model-capability layer that omits `temperature` for models that reject it and auto-recovers at runtime. The UI gains engine profiles (multiple BYO models), a run-history comparison, URL-persisted filters, batch analysis, a deal-journey (micro-outcome) panel, and a mandates/buyer-fit flow. New tables: `outcome`, `mandate` (idempotent DDL, no migration step needed).

**Tech Stack:** Next.js 15 (App Router, repo root — there is NO `web/` dir), React 19, TypeScript, Tailwind, LangChain/LangGraph, libSQL (`data/dormant.db` locally, Turso in prod), Zod, Vitest.

## Global Constraints

- **Test command:** `npm test` (vitest run). Single file: `npx vitest run <path>`.
- **Dev server:** NEVER use port 3000 (user's own server). Verify on port 3100: `npx next dev -p 3100`.
- **Facts vs judgments is inviolable:** Gate 0 and all scoring is deterministic, facts-only. The LLM only produces evidence (bands/values + snippets), never a 0–100 score.
- **No server default model:** BYO only. API keys live in `localStorage` client-side, are sent per-request, and are NEVER persisted server-side or logged (see `src/lib/llm/redact.ts`).
- **Schema changes** go in `src/lib/db/schema.ts` as `CREATE TABLE IF NOT EXISTS` (idempotent; app boots on fresh DB with no migration step).
- **The dormancy floor (40) and gated architecture stay exactly as designed** (brief, "What does not change"). Recalibration changes point values, not the mechanism.
- **Client components must not import server modules** (`@/lib/db`, etc.) — all server work goes through `fetch` to `/api/*`.
- **Every judgment/score written must record model + scoring version** (existing pattern: `judgment.model_version`, `SCORING_VERSION`).
- Commit after every task with a conventional-commit message. Do not push.
- Style: match existing file-header comment convention (`// path — Why: ...`), Tailwind token classes (`text-ink`, `bg-surface`, `border-line`, `text-muted`, `bg-action`, etc.).

---

### Task 1: Model-compatibility layer (temperature 400 fix + Gemini schema fix + friendlier errors)

The user hit `400 Unsupported value: 'temperature' does not support 0 with this model` (OpenAI reasoning models: o1/o3/o4/gpt-5 family only accept default temperature 1) and a Gemini `400 Invalid JSON payload ... Unknown name "type" at 'tools[0].function_declarations[0].parameters...'` (old `@langchain/google-genai@^0.1.0` schema conversion). Both are logged in `event_log` (`analyze_failed`).

**Files:**
- Modify: `src/lib/llm/model.ts`
- Modify: `src/lib/llm/model.test.ts`
- Modify: `package.json` (bump `@langchain/google-genai` from `^0.1.0` to `^0.2.16`)

**Interfaces:**
- Produces: `buildModelOptions(provider: Provider, model: string): { temperature?: number }` (exported, pure — decides whether temperature is sent); `markNoTemperature(provider: Provider, model: string): void`; `isTemperatureError(err: unknown): boolean` (exported for tests). `chatModel` and `extractJson` signatures unchanged — nothing downstream changes.

- [ ] **Step 1: Write failing tests** in `src/lib/llm/model.test.ts` (append to existing describe blocks):

```ts
import { buildModelOptions, markNoTemperature, isTemperatureError, extractJson, __setChatFactory } from "./model";
// (merge with the existing import line for this module)

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
```

Match the existing test file's imports (it already imports `z`, `describe/it/expect` per vitest config — check and reuse its patterns; the fake factory shape must satisfy the code path: only `withStructuredOutput(...).invoke(...)` is used).

- [ ] **Step 2: Run to verify failure:** `npx vitest run src/lib/llm/model.test.ts` → FAIL ("buildModelOptions is not exported" / similar).

- [ ] **Step 3: Implement in `src/lib/llm/model.ts`:**

```ts
// ── Model capability: temperature ───────────────────────────────────────────
// OpenAI reasoning models (o-series, gpt-5 family) reject any non-default temperature
// with a 400. We (a) omit temperature proactively for known families and (b) learn at
// runtime: if a provider 400s on temperature, the model id is marked and the call is
// retried once without it — so future model families work without a code change.
const NO_TEMPERATURE = new Set<string>();
const NO_TEMP_PATTERNS = [/^o\d/i, /^gpt-5/i];

export function markNoTemperature(provider: Provider, model: string): void {
  NO_TEMPERATURE.add(`${provider}:${model}`);
}

export function buildModelOptions(provider: Provider, model: string): { temperature?: number } {
  if (NO_TEMPERATURE.has(`${provider}:${model}`)) return {};
  if (provider === "openai" && NO_TEMP_PATTERNS.some((re) => re.test(model))) return {};
  // temperature 0 for reproducibility everywhere it is accepted.
  return { temperature: 0 };
}

export function isTemperatureError(err: unknown): boolean {
  const m = String((err as Error)?.message ?? err).toLowerCase();
  return m.includes("temperature") && /unsupported|does not support|not supported/.test(m);
}
```

In `chatModel`, replace each `temperature: 0` with a spread of `buildModelOptions(o.provider, o.model)`:

```ts
case "openai":
  return new ChatOpenAI({ model: o.model, apiKey: o.apiKey, ...buildModelOptions("openai", o.model), maxRetries: 1 });
// same pattern for anthropic and gemini
```

In `extractJson`, move the `structured` construction INSIDE the retry loop (so a rebuilt model picks up the learned capability), and add the recovery branch in the catch, before the `permanentReason` check:

```ts
const MAX = 3;
let lastErr: unknown;
for (let attempt = 0; attempt < MAX; attempt++) {
  const structured = chatModel(r).withStructuredOutput(schema as never, { name: "extract" });
  try {
    // ... unchanged invoke/parse/repair logic ...
  } catch (err) {
    lastErr = err;
    if (isTemperatureError(err) && !NO_TEMPERATURE.has(`${r.provider}:${r.model}`)) {
      // Learn: this model rejects explicit temperature. Rebuild without it and retry.
      markNoTemperature(r.provider, r.model);
      continue; // does not consume a transient-retry: capability fix, not flake
    }
    const permanent = permanentReason(err, r.model);
    if (permanent) throw new Error(permanent);
    if (attempt < MAX - 1 && isTransient(err)) { await sleep(500 * 2 ** attempt); continue; }
    throw err;
  }
}
throw lastErr;
```

(Note: `continue` after `markNoTemperature` consumes one loop attempt; with MAX=3 that still leaves 2 real attempts — acceptable. Keep the code exactly this simple.)

Extend `permanentReason` with one more classification (after the not-found branch):

```ts
if (/unsupported value|unsupported parameter|does not support/.test(m))
  return `Model "${model}" rejected a request parameter (${(err as Error)?.message ?? ""}). This model may need different settings — try again; if it persists, report the model id.`;
```

- [ ] **Step 4: Bump the Gemini SDK.** In `package.json` change `"@langchain/google-genai": "^0.1.0"` → `"^0.2.16"`, then run `npm install`. This fixes the `Unknown name "type"` tool-schema 400 (old zod→genai schema conversion emitted fields the API rejects). Then run `npx vitest run src/lib/llm/web-evidence.test.ts src/lib/types/gemini-schema.test.ts src/lib/agent/graph.test.ts` — all must pass. If `npm install` reports a peer-dependency conflict with `@langchain/core@^0.3.0`, pick the newest `@langchain/google-genai` 0.2.x that accepts core 0.3 (check with `npm info @langchain/google-genai@0.2 peerDependencies`).

- [ ] **Step 5: Run all model tests:** `npx vitest run src/lib/llm/` → PASS.

- [ ] **Step 6: Commit:** `git add -A && git commit -m "fix(llm): omit temperature for reasoning models, auto-recover on 400, bump google-genai for tool-schema fix"`

---

### Task 2: Scoring recalibration (scoring-v2) — dormancy can exceed 75, execution un-squashed

Today a lapsed patent lands at exactly 75 dormancy (20 base + 55 hero) and the only lift is +10/+8 LLM nudges; execution maxes at 75 (`0.5·80 + 0.5·70`). Composite for a typical dormant hit ≈ 64 (barely WATCH). Recalibrate: move every point value into config, add a facts-based stale-lapse bonus, raise band ceilings.

**Files:**
- Modify: `src/lib/scoring/config.ts`
- Create: `src/lib/scoring/signals.ts` (shared date-math helpers, also used by Gate 0 in Task 3)
- Modify: `src/lib/scoring/gate.ts`
- Modify: `src/lib/scoring/opportunity.ts`
- Modify: `src/lib/scoring/execution.ts`
- Modify: `src/lib/scoring/compose.test.ts` (+ create `src/lib/scoring/gate.test.ts`, `src/lib/scoring/signals.test.ts`)

**Interfaces:**
- Produces: `config.dormancyPoints = { base: 20, maintenanceLapsed: 55, staleLapse: 8, noProduct: 12, noDevelopment: 10, activeLitigation: -40 }`; `config.bandPoints = { high: 85, medium: 55, low: 20 }`; `config.executionTime = { active: 80, lapsed: 45, expired: 25 }`; `SCORING_VERSION = "scoring-v2"`.
- Produces (signals.ts): `yearsSinceLapse(p: ParsedPatent, now?: Date): number | null` (scans `p.legalEvents` for the most recent event whose `code` starts with `"EXP"` or whose description matches `/expir/i`, returns fractional years since it, null if none/undated); `yearsRemaining(p: ParsedPatent, now?: Date): number | null` (from `p.expiryDate` if present, else `filingDate + 20y`, else null — may be negative when past term).
- `dormancyGate(p, residual?, now?: Date)` gains an optional `now` param (default `new Date()`) for testability. `composeScore` passes it through (see Task 4 signature).

- [ ] **Step 1: Write failing tests.**

`src/lib/scoring/signals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { yearsSinceLapse, yearsRemaining } from "./signals";
import type { ParsedPatent } from "@/lib/types";

const base: ParsedPatent = {
  patentNumber: "US1", title: null, abstract: null, assignee: null, inventors: [],
  filingDate: null, grantDate: null, priorityDate: null, expiryDate: null,
  cpcClasses: [], forwardCitations: null, backwardCitations: null,
  legalEvents: [], maintenanceLapsed: false, anticipatedExpiration: false,
};
const NOW = new Date("2026-07-13");

describe("yearsSinceLapse", () => {
  it("returns years since the most recent EXP event", () => {
    const p = { ...base, maintenanceLapsed: true, legalEvents: [
      { date: "2021-07-13", code: "EXP.", description: "Expired due to failure to pay maintenance fee" },
    ]};
    expect(yearsSinceLapse(p, NOW)).toBeCloseTo(5, 1);
  });
  it("returns null when there is no lapse event", () => {
    expect(yearsSinceLapse(base, NOW)).toBeNull();
  });
});

describe("yearsRemaining", () => {
  it("uses expiryDate when present", () => {
    expect(yearsRemaining({ ...base, expiryDate: "2031-07-13" }, NOW)).toBeCloseTo(5, 1);
  });
  it("falls back to filingDate + 20y", () => {
    expect(yearsRemaining({ ...base, filingDate: "2010-07-13" }, NOW)).toBeCloseTo(4, 1);
  });
  it("null when no dates", () => { expect(yearsRemaining(base, NOW)).toBeNull(); });
});
```

`src/lib/scoring/gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dormancyGate } from "./gate";
import type { ParsedPatent, DormancyResidual } from "@/lib/types";

const base: ParsedPatent = { /* same base literal as signals.test.ts */ };
const NOW = new Date("2026-07-13");
const ev = (value: string) => ({ value, snippet: "", confidence: "high" as const });
const residual = (product: string, dev: string, lit: string): DormancyResidual =>
  ({ product_exists: ev(product), active_development: ev(dev), active_litigation: ev(lit) });

describe("dormancyGate (scoring-v2)", () => {
  it("fresh bare lapse stays at 75 and passes the gate", () => {
    const p = { ...base, maintenanceLapsed: true };
    const r = dormancyGate(p, undefined, NOW);
    expect(r.dormancyScore).toBe(75);
    expect(r.passedGate).toBe(true);
  });
  it("stale lapse (>2y, unreinstated) adds the stale bonus -> 83", () => {
    const p = { ...base, maintenanceLapsed: true, legalEvents: [
      { date: "2020-01-01", code: "EXP.", description: "Expired for failure to pay" },
    ]};
    expect(dormancyGate(p, undefined, NOW).dormancyScore).toBe(83);
  });
  it("stale lapse + both residuals confirmed reaches 100 (clamped)", () => {
    const p = { ...base, maintenanceLapsed: true, legalEvents: [
      { date: "2020-01-01", code: "EXP.", description: "Expired for failure to pay" },
    ]};
    // 20 + 55 + 8 + 12 + 10 = 105 -> 100
    expect(dormancyGate(p, residual("no", "no", "no"), NOW).dormancyScore).toBe(100);
  });
  it("maintained patent can never clear the floor even with residuals", () => {
    // 20 + 12 + 10 = 42 would exceed the floor — residual lift alone must NOT open the gate.
    const r = dormancyGate(base, residual("no", "no", "no"), NOW);
    expect(r.passedGate).toBe(false);
  });
  it("active litigation slashes decisively", () => {
    const p = { ...base, maintenanceLapsed: true };
    expect(dormancyGate(p, residual("unknown", "unknown", "yes"), NOW).dormancyScore).toBe(35);
  });
});
```

**IMPORTANT calibration constraint discovered while writing this:** the old design kept residual lift (max +18) below the floor margin (40−20=20) so residuals alone can't open the gate. New residual lift is 12+10=22 > 20. To preserve the invariant, the gate must apply the upward residual nudges ONLY when `p.maintenanceLapsed` is true (litigation penalty always applies). This is also semantically right: residuals "refine" a hero-signal hit; they never manufacture dormancy. Encode exactly that in gate.ts and keep the 4th test above.

- [ ] **Step 2: Run to verify failures:** `npx vitest run src/lib/scoring/` → new files FAIL (module not found / wrong numbers).

- [ ] **Step 3: Implement.**

`src/lib/scoring/signals.ts`:

```ts
// scoring/signals.ts
// Why: shared, deterministic date-math over parsed FACTS (never LLM output). Both the
// dormancy gate (stale-lapse bonus) and Gate 0 (term remaining, restoration window)
// read these; keeping them here means the two gates can never disagree about a date.
import type { ParsedPatent } from "@/lib/types";

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** Years since the most recent maintenance-lapse legal event; null if none is dated. */
export function yearsSinceLapse(p: ParsedPatent, now: Date = new Date()): number | null {
  const lapses = p.legalEvents.filter(
    (e) => e.code.toUpperCase().startsWith("EXP") || /expir/i.test(e.description)
  ).filter((e) => e.date && !Number.isNaN(Date.parse(e.date)));
  if (lapses.length === 0) return null;
  const latest = Math.max(...lapses.map((e) => Date.parse(e.date)));
  return (now.getTime() - latest) / YEAR_MS;
}

/** Years of patent term remaining: expiryDate if known, else filing + 20y; null if undatable. */
export function yearsRemaining(p: ParsedPatent, now: Date = new Date()): number | null {
  let end: number | null = null;
  if (p.expiryDate && !Number.isNaN(Date.parse(p.expiryDate))) end = Date.parse(p.expiryDate);
  else if (p.filingDate && !Number.isNaN(Date.parse(p.filingDate))) {
    const d = new Date(p.filingDate); d.setFullYear(d.getFullYear() + 20); end = d.getTime();
  }
  if (end === null) return null;
  return (end - now.getTime()) / YEAR_MS;
}
```

`src/lib/scoring/config.ts` — bump `SCORING_VERSION` to `"scoring-v2"` and add to the `config` object (keep existing keys):

```ts
  // Dormancy gate point values (scoring-v2). Base + hero = 75; the stale-lapse bonus and
  // residual nudges let a strongly-confirmed dormant patent reach 100. Residual upward
  // nudges only apply when the hero signal fired (see gate.ts) so they can never open
  // the gate alone — the floor invariant survives the recalibration.
  dormancyPoints: { base: 20, maintenanceLapsed: 55, staleLapse: 8, noProduct: 12, noDevelopment: 10, activeLitigation: -40 },
  // Lapse older than this (years, unreinstated) counts as "settled abandonment".
  staleLapseYears: 2,
  // LLM evidence band -> points, shared by opportunity/execution/buyer-fit mappers.
  bandPoints: { high: 85, medium: 55, low: 20 },
  // Execution time component: full-term-expired IP is unusable as exclusive IP; a fee
  // lapse is recoverable (revival petition) so it is penalised, not floored.
  executionTime: { active: 80, lapsed: 45, expired: 25 },
```

`src/lib/scoring/gate.ts` — rewrite the scoring body to read `config.dormancyPoints` (`const pts = config.dormancyPoints;`), signature `dormancyGate(p, residual?, now: Date = new Date())`:
- `let score = pts.base;`
- hero: `score += pts.maintenanceLapsed` (same reason string).
- stale bonus (immediately after hero, inside the `if (p.maintenanceLapsed)` block):

```ts
const stale = yearsSinceLapse(p, now);
if (stale !== null && stale >= config.staleLapseYears) {
  score += pts.staleLapse;
  reasons.push(`Lapse is ${stale.toFixed(1)} years old with no reinstatement — abandonment is settled.`);
}
```

- residual block: keep the `isNo`/`isYes` helpers verbatim; upward nudges use `pts.noProduct`/`pts.noDevelopment` and are wrapped in `if (p.maintenanceLapsed)`; litigation uses `pts.activeLitigation` and applies unconditionally.

`src/lib/scoring/opportunity.ts` and `src/lib/scoring/execution.ts` — replace the local `band` helper in each with:

```ts
import { config } from "./config";
const band = (v: unknown): number =>
  v === "high" ? config.bandPoints.high : v === "medium" ? config.bandPoints.medium : config.bandPoints.low;
```

`execution.ts` time component becomes:

```ts
const t = config.executionTime;
const timeComponent = p.anticipatedExpiration ? t.expired : p.maintenanceLapsed ? t.lapsed : t.active;
```

- [ ] **Step 4: Fix `compose.test.ts` expectations.** Read the existing assertions and recompute with v2 numbers (bands 85/55/20; execution time 80/45/25; version string "scoring-v2"). Do NOT weaken tests — recompute exact expected integers and keep them exact.

- [ ] **Step 5: Run:** `npx vitest run src/lib/scoring/ src/lib/pipeline/ src/lib/agent/` → PASS (pipeline/agent tests exercise compose; update any fixture expectations there the same way).

- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat(scoring): scoring-v2 recalibration — config-driven points, stale-lapse bonus, dormancy can reach 100"`

---

### Task 3: Gate 0 — transactability & route (facts only, pure module)

Brief Upgrade 1 (CRITICAL). Classify legal status from facts BEFORE dormancy: what is this asset legally, and can it be transacted at all? No LLM anywhere in this module.

**Files:**
- Create: `src/lib/scoring/gate0.ts`
- Create: `src/lib/scoring/gate0.test.ts`
- Modify: `src/lib/scoring/config.ts` (gate0 thresholds + transactability score map)

**Interfaces:**
- Produces:

```ts
export type LegalStatus = "active" | "expired_fee" | "expired_term" | "abandoned" | "unknown";
export type RouteType = "LICENSE_OR_ACQUIRE" | "REVIVAL" | "PUBLIC_DOMAIN_INTEL" | "TECH_INFO" | "TECHNOLOGY_PACKAGE" | "UNKNOWN";
export type Gate0Result = {
  legalStatus: LegalStatus;
  route: RouteType;
  transactable: "yes" | "conditional" | "no";
  transactabilityScore: number;   // 0-100, deterministic from route + facts
  flags: string[];                // e.g. "needs_legal_verification", "stale_lapse_low_revival_odds"
  reasons: string[];              // human-readable fact citations
};
export function runGate0(p: ParsedPatent, now?: Date): Gate0Result;
```

- Consumes: `yearsSinceLapse`, `yearsRemaining` from `./signals` (Task 2); `config` from `./config`.

- [ ] **Step 1: Add config** (in the `config` object):

```ts
  // Gate 0 — transactability. An "active" patent needs at least this much term left to be
  // worth a license/acquisition route; a lapse younger than the restoration window is a
  // strong revival candidate (unintentional-delay petitions get harder as the lapse ages).
  gate0: { minTermYears: 3, restorationWindowYears: 2 },
  // Route -> transactability score. TECHNOLOGY_PACKAGE kept for forward-compat (needs
  // know-how/prototype facts we do not collect yet).
  transactability: { LICENSE_OR_ACQUIRE: 90, TECHNOLOGY_PACKAGE: 95, REVIVAL: 55, REVIVAL_STALE: 35, PUBLIC_DOMAIN_INTEL: 15, TECH_INFO: 5, UNKNOWN: 30 },
```

- [ ] **Step 2: Write failing tests** `src/lib/scoring/gate0.test.ts` (reuse the `base` ParsedPatent literal from Task 2 tests, `NOW = new Date("2026-07-13")`):

```ts
describe("runGate0", () => {
  it("full-term expiry -> PUBLIC_DOMAIN_INTEL, not transactable", () => {
    const r = runGate0({ ...base, anticipatedExpiration: true }, NOW);
    expect(r).toMatchObject({ legalStatus: "expired_term", route: "PUBLIC_DOMAIN_INTEL", transactable: "no", transactabilityScore: 15 });
    expect(r.reasons.join(" ")).toMatch(/public domain/i);
  });
  it("recent fee lapse -> REVIVAL, conditional, flagged for legal verification", () => {
    const p = { ...base, maintenanceLapsed: true, filingDate: "2015-01-01", legalEvents: [
      { date: "2025-06-01", code: "EXP.", description: "Expired for failure to pay" }] };
    const r = runGate0(p, NOW);
    expect(r).toMatchObject({ legalStatus: "expired_fee", route: "REVIVAL", transactable: "conditional", transactabilityScore: 55 });
    expect(r.flags).toContain("needs_legal_verification");
  });
  it("stale fee lapse -> REVIVAL with reduced score and extra flag", () => {
    const p = { ...base, maintenanceLapsed: true, filingDate: "2015-01-01", legalEvents: [
      { date: "2020-01-01", code: "EXP.", description: "Expired for failure to pay" }] };
    const r = runGate0(p, NOW);
    expect(r.transactabilityScore).toBe(35);
    expect(r.flags).toEqual(expect.arrayContaining(["needs_legal_verification", "stale_lapse_low_revival_odds"]));
  });
  it("fee lapse past natural term -> expired_term wins (nothing left to revive)", () => {
    const p = { ...base, maintenanceLapsed: true, filingDate: "2000-01-01" };
    expect(runGate0(p, NOW).legalStatus).toBe("expired_term");
  });
  it("in-force patent with enough term -> LICENSE_OR_ACQUIRE, transactable", () => {
    const p = { ...base, filingDate: "2018-01-01", grantDate: "2020-06-01" };
    const r = runGate0(p, NOW);
    expect(r).toMatchObject({ legalStatus: "active", route: "LICENSE_OR_ACQUIRE", transactable: "yes", transactabilityScore: 90 });
  });
  it("in-force but < minTermYears left -> still active, flagged short_term, reduced score", () => {
    const p = { ...base, filingDate: "2008-01-01" }; // ~1.5y left
    const r = runGate0(p, NOW);
    expect(r.legalStatus).toBe("active");
    expect(r.flags).toContain("short_remaining_term");
    expect(r.transactabilityScore).toBeLessThan(90);
  });
  it("no usable facts -> unknown, needs_data flag", () => {
    const r = runGate0(base, NOW);
    expect(r).toMatchObject({ legalStatus: "unknown", route: "UNKNOWN", transactable: "conditional" });
    expect(r.flags).toContain("needs_data");
  });
});
```

- [ ] **Step 3: Run to verify failure**, then **Step 4: Implement** `src/lib/scoring/gate0.ts`:

```ts
// scoring/gate0.ts
// Why: the FIRST gate (brief v2, Upgrade 1). Before asking "is it dormant/valuable", ask
// "what is this asset legally, and can it be transacted at all?" — a public-domain patent
// has no seller and no exclusivity to sell, and routing one to a buyer as an acquisition
// would be a credibility-ending mistake. FACTS ONLY: legal status, dates and maintenance
// history come from source data; no LLM judgment is consulted here, ever.
import { config } from "./config";
import { yearsSinceLapse, yearsRemaining } from "./signals";
import type { ParsedPatent } from "@/lib/types";

// (types exactly as in the Interfaces block above)

export function runGate0(p: ParsedPatent, now: Date = new Date()): Gate0Result {
  const flags: string[] = [];
  const reasons: string[] = [];
  const term = yearsRemaining(p, now);
  const t = config.transactability;

  // Full-term expiry beats everything, including a recorded fee lapse: once the natural
  // term is over there is nothing left to revive — the technology is public domain.
  const pastTerm = p.anticipatedExpiration || (term !== null && term <= 0);
  if (pastTerm && !(p.maintenanceLapsed && term !== null && term > 0)) {
    reasons.push("Reached full term — technology is in the public domain; there is no exclusivity to sell.");
    return { legalStatus: "expired_term", route: "PUBLIC_DOMAIN_INTEL", transactable: "no",
      transactabilityScore: t.PUBLIC_DOMAIN_INTEL, flags,
      reasons: [...reasons, "Route: sell technology intelligence (freely-usable tech scouting), not exclusivity."] };
  }

  if (p.maintenanceLapsed) {
    flags.push("needs_legal_verification");
    reasons.push("Maintenance-fee lapse on record — possibly restorable, NOT automatically sellable today.");
    const stale = yearsSinceLapse(p, now);
    const plausible = stale === null || stale <= config.gate0.restorationWindowYears;
    if (!plausible) {
      flags.push("stale_lapse_low_revival_odds");
      reasons.push(`Lapse is ${stale!.toFixed(1)} years old — an "unintentional delay" petition gets harder to sustain.`);
    }
    reasons.push("Verify before transacting: restoration realistically possible, lapse plausibly unintentional, chain of title clean, no security interests, claims still valid and broad enough to matter.");
    return { legalStatus: "expired_fee", route: "REVIVAL", transactable: "conditional",
      transactabilityScore: plausible ? t.REVIVAL : t.REVIVAL_STALE, flags, reasons };
  }

  // Application that never granted: technical information only.
  if (!p.grantDate && p.filingDate) {
    reasons.push("No grant on record — application without subsisting rights; technical information only.");
    return { legalStatus: "abandoned", route: "TECH_INFO", transactable: "no",
      transactabilityScore: t.TECH_INFO, flags, reasons };
  }

  if (term !== null && term > 0) {
    const short = term < config.gate0.minTermYears;
    if (short) { flags.push("short_remaining_term"); reasons.push(`Only ~${term.toFixed(1)} years of term remain.`); }
    else reasons.push(`In force with ~${term.toFixed(1)} years of term remaining — clean license/acquisition candidate.`);
    return { legalStatus: "active", route: "LICENSE_OR_ACQUIRE", transactable: "yes",
      transactabilityScore: short ? Math.round(t.LICENSE_OR_ACQUIRE / 2) : t.LICENSE_OR_ACQUIRE, flags, reasons };
  }

  flags.push("needs_data");
  reasons.push("Insufficient dated facts to classify legal status — treat as unverified.");
  return { legalStatus: "unknown", route: "UNKNOWN", transactable: "conditional",
    transactabilityScore: t.UNKNOWN, flags, reasons };
}
```

- [ ] **Step 5: Run:** `npx vitest run src/lib/scoring/gate0.test.ts` → PASS. Fix edge cases the tests reveal (e.g. the "fee lapse past natural term" precedence test).

- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat(scoring): Gate 0 transactability & route — facts-only legal classification before the dormancy gate"`

---

### Task 4: Wire Gate 0 into compose + pipeline; persist split scores + engine per run

Gate 0 precedes the dormancy gate in `composeScore`; a non-transactable asset exits with a useful route (public-domain intel is a product, not a dead end). Persist `transactability` as its own judgment row (Upgrade 4: split outputs), and record the engine (provider+model) in the `score_computed` payload so runs can be compared (user item 3).

**Files:**
- Modify: `src/lib/scoring/compose.ts`
- Modify: `src/lib/agent/nodes.ts` (gate_step: short-circuit LLM spend when Gate 0 says "no")
- Modify: `src/lib/pipeline/analyze.ts`
- Modify: `src/lib/scoring/compose.test.ts`, `src/lib/pipeline/analyze.test.ts`, `src/lib/agent/graph.test.ts` (expectations)

**Interfaces:**
- `ScoreResult` gains: `gate0: Gate0Result; transactability: number; route: RouteType;` (import types from `./gate0`). `composeScore(p, residual?, oppExec?, now?: Date)` — new optional `now`.
- `score_computed` event payload gains `engine: { provider: string; model: string } | null` alongside the existing fields.
- New judgment row per run: `dimension: "transactability", subDimension: "gate0"`, `score: transactabilityScore`, `rationale: reasons.join(" ")`, `flags: gate0.flags`, `modelVersion: "deterministic"`, `promptVersion: SCORING_VERSION`.

- [ ] **Step 1: Update `composeScore`.** Run `runGate0(p, now)` FIRST. Shape:

```ts
const g0 = runGate0(p, now);
const gate = dormancyGate(p, residual, now);
const common = { version: SCORING_VERSION, gate0: g0, transactability: g0.transactabilityScore, route: g0.route };
if (g0.transactable === "no") {
  // Non-transactable: exit with a useful route. Dormancy is still reported for context,
  // but no Opportunity/Execution tokens or meaning are spent on it.
  return { ...common, dormancy: gate.dormancyScore, opportunity: null, execution: null,
    composite: null, passedGate: false, band: "PASS", reasons: [...g0.reasons, ...gate.reasons] };
}
if (!gate.passedGate) { /* existing early return, spread ...common, prepend g0.reasons */ }
/* existing composite path, spread ...common, reasons: [...g0.reasons, ...gate.reasons] */
```

- [ ] **Step 2: Update compose tests** — add: full-term-expired patent → `route: "PUBLIC_DOMAIN_INTEL"`, `band: "PASS"`, `composite: null` even when residual/oppExec provided; lapsed patent → `route: "REVIVAL"`, `transactability: 55` (or 35 stale), composite computed as before. Run scoring tests → PASS.

- [ ] **Step 3: Short-circuit LLM spend in the graph.** Read `src/lib/agent/nodes.ts`. In the node that runs the dormancy gate decision (`gate_step`), add: run `runGate0(state.parsed)` (or the ParsedPatent the node already holds); if `transactable === "no"`, set the state flag that routes the conditional edge straight to `compose` (the same mechanism `passedGate: false` already uses — reuse it) and push a TraceEvent like `{ node: "gate_step", label: "Gate 0: <route> — skipping opportunity/execution analysis" }` matching the existing TraceEvent shape in `src/lib/agent/state.ts`. Do not restructure the graph topology; reuse the existing PASS path.

- [ ] **Step 4: Persist split scores + engine.** In `src/lib/pipeline/analyze.ts`: after the existing judgment inserts, add the `transactability` judgment row (Interfaces block above). In the `score_computed` `appendEvent` payload, add `engine: cfg ? { provider: cfg.provider, model: cfg.model } : null` (the llm config is already in scope — NEVER include `apiKey`; copy only the two fields explicitly).

- [ ] **Step 5: Run the full suite:** `npm test` → PASS (update any remaining fixture expectations).

- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat(pipeline): Gate 0 in compose + graph short-circuit; persist transactability judgment and engine per run"`

---

### Task 5: Detail-page UI — route badge, split scores, verification tag

Upgrade 4 UI: stop presenting one blended number as the story. Show Dormancy / Transactability / Opportunity / Execution as first-class, the route prominently, and a "pending legal verification" tag on REVIVAL assets (covers the CAES directive — never hard-code CAES itself).

**Files:**
- Create: `src/components/RouteBadge.tsx`
- Modify: `src/components/ScoreHero.tsx` (read it first; extend, don't rewrite)
- Modify: `src/app/patents/[id]/page.tsx` (pass gate0/route/transactability from the latest `score_computed` payload)

**Interfaces:**
- Consumes: `ScoreResult` fields from Task 4 (`route`, `transactability`, `gate0.flags`, `gate0.reasons`) — available in the `score_computed` payload the page already reads.
- Produces: `<RouteBadge route={RouteType} flags={string[]} />`.

- [ ] **Step 1: `RouteBadge.tsx`** (server-compatible, no hooks):

```tsx
// components/RouteBadge.tsx
// Why: the route is Gate 0's headline output — what KIND of deal this asset can be.
// Rendered next to the verdict so a non-transactable asset reads as "public-domain
// intel product", never as a failed acquisition.
const STYLE: Record<string, { label: string; cls: string }> = {
  LICENSE_OR_ACQUIRE: { label: "License / Acquire", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REVIVAL: { label: "Revival candidate", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PUBLIC_DOMAIN_INTEL: { label: "Public-domain intel", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  TECH_INFO: { label: "Technical info only", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  TECHNOLOGY_PACKAGE: { label: "Technology package", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  UNKNOWN: { label: "Status unverified", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};
export default function RouteBadge({ route, flags = [] }: { route: string; flags?: string[] }) {
  const s = STYLE[route] ?? STYLE.UNKNOWN;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
      {flags.includes("needs_legal_verification") && (
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          Pending legal verification
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Extend `ScoreHero`** (read the file first; it currently shows composite + D/O/E). Add: a `transactability` score chip styled like the existing subscore chips, and render `<RouteBadge/>` near the band/verdict. Keep the composite visible but visually secondary to the four component scores (smaller/muted label like "blended"). Backward compat: older `score_computed` payloads have no `route`/`transactability` — render nothing extra when absent (`route == null`).

- [ ] **Step 3: Wire the page.** In `src/app/patents/[id]/page.tsx`, the latest `score_computed` payload is already parsed — pass the new fields down to `ScoreHero`. Also surface `gate0.reasons` in the existing reasons list (they're already inside `result.reasons` from Task 4 — verify, don't duplicate).

- [ ] **Step 4: Verify visually:** `npx next dev -p 3100`, open a lapsed patent, run an analysis (or use an already-analyzed asset), confirm: route badge, verification tag, four score chips. Check an old pre-upgrade asset still renders (no crash on missing fields). Then `npx next build` → must succeed.

- [ ] **Step 5: Commit:** `git add -A && git commit -m "feat(ui): route badge, split score chips, pending-legal-verification tag on patent detail"`

---

### Task 6: Engine profiles — multiple saved models + per-run picker

User item 3+4 UX half: store MULTIPLE named engine configs (provider/model/key) instead of the single `llmConfig`, choose one per analysis run.

**Files:**
- Create: `src/lib/client/engines.ts`
- Modify: `src/components/EngineField.tsx` (read first — extend into a profile manager: list of saved engines, add/remove, set active; keep its provider segmented control + model + key inputs as the "add/edit" form)
- Modify: `src/app/settings/page.tsx` (copy tweaks if it describes a single engine)
- Modify: `src/components/AnalyzeButton.tsx` (engine select next to the button, defaults to active engine)

**Interfaces:**
- Produces (`src/lib/client/engines.ts`, client-only module — no server imports):

```ts
export type EngineProfile = { id: string; label: string; provider: "openai" | "anthropic" | "gemini"; model: string; apiKey: string };
export function loadEngines(): EngineProfile[];           // localStorage "llmEngines" (JSON array); MIGRATES legacy "llmConfig" into one profile (label = model, id = "legacy") on first load, then persists
export function saveEngines(engines: EngineProfile[]): void;
export function getActiveEngineId(): string | null;       // localStorage "llmActiveEngine"
export function setActiveEngineId(id: string): void;
export function getActiveEngine(): EngineProfile | null;  // resolves id -> profile, falls back to first profile
export function toLLMConfig(e: EngineProfile): { provider: string; model: string; apiKey: string };  // shape /api/analyze expects
```

All functions must be try/catch-safe around localStorage/JSON like the existing `readLLMConfig`. Keep writing legacy `"llmConfig"` in sync with the ACTIVE engine on every save (so nothing else that still reads it breaks).

- [ ] **Step 1: Implement `engines.ts`** exactly per the interface (use `crypto.randomUUID()` for ids).
- [ ] **Step 2: Rework `EngineField.tsx`:** render the saved-engines list (label, provider, model, masked key `••••` + last 4 chars, "active" radio, remove button) above the existing add form; the form gains a "Label" text input (default: the model id) and its save button appends a profile + sets it active. Keep all existing Tailwind classes/styles.
- [ ] **Step 3: `AnalyzeButton.tsx`:** replace `readLLMConfig()` with `getActiveEngine()`; add a compact `<select>` above the button listing `loadEngines()` (value = engine id, label = profile label), state defaults to active id; `run()` posts `toLLMConfig(selected)`. The "Using your own API key" hint becomes "Engine: {label}". No-engines case keeps the existing "Add your model in Settings" link.
- [ ] **Step 4: Manual verify on :3100:** legacy migration (existing llmConfig appears as a profile), add a second engine, switch per-run, analyze still works. `npx next build` → succeeds.
- [ ] **Step 5: Commit:** `git add -A && git commit -m "feat(engines): multiple saved engine profiles with per-run picker (migrates legacy llmConfig)"`

---

### Task 7: Run history & model comparison on the detail page

User item 3: run the same patent through different engines and compare. Every run is already a `score_computed` event; Task 4 added `engine` to the payload. Render all runs as a comparison table.

**Files:**
- Create: `src/components/RunHistory.tsx` (server-compatible, pure props)
- Modify: `src/app/patents/[id]/page.tsx` (collect ALL `score_computed` events, not just the latest; render `<RunHistory runs={...}/>` between the score hero and the audit section)

**Interfaces:**
- Consumes: `getEvents(assetId)` (existing, `src/lib/db/queries.ts`) — filter `event_type === "score_computed"`, parse payloads.
- Produces: `RunHistory({ runs }: { runs: Array<{ at: string; engine: { provider: string; model: string } | null; route: string | null; dormancy: number | null; transactability: number | null; opportunity: number | null; execution: number | null; composite: number | null; band: string }> })`.

- [ ] **Step 1: Build the run list in the page.** Map score_computed events (newest first) into the run shape; tolerate old payloads (missing engine/route → null). Only render `RunHistory` when `runs.length >= 1`.
- [ ] **Step 2: `RunHistory.tsx`:** a Card (reuse `src/components/ui/Card.tsx` conventions) titled "Analysis runs", one row per run: date (`new Date(at).toLocaleString()`), engine (`provider/model` mono font, "—" when null), RouteBadge (small), the four subscores, composite, band. When ≥2 runs, add a "spread" footer row: max−min per numeric column, highlighted `text-amber-700` when spread ≥ 10 with the caption "Runs disagree by ≥10 points on highlighted dimensions — evidence extraction differs between engines; the deterministic mapping is identical."
- [ ] **Step 3: Verify on :3100:** analyze one patent with two different engines (or seed two runs), confirm the table + spread row. `npx next build` → succeeds.
- [ ] **Step 4: Commit:** `git add -A && git commit -m "feat(ui): run history with cross-engine score comparison on patent detail"`

---

### Task 8: Richer patents filters (CPC, entity status, maintenance status, sort)

Verified data coverage (2026-07-13, local `data/dormant.db`): ALL 35,001 catalogue patents have `fact` rows for `maintenance_lapsed`, `legal_events`, `grant_date`, `filing_date`, `entity_status`; 34,999 have `cpc_classes`; 30,250 have `assignee`. `maintenance_event` covers all 35,001 patents (`entity_status` values: `N`=large 25,813, `Y`=small 8,806, `M`=micro 382). Forward-citation facts do NOT exist catalogue-wide — no citation filter (do not fake one).

**Files:**
- Modify: `src/lib/index/queries.ts` (extend `IndexFilters` + `where()` + sort whitelist)
- Create: `src/lib/index/queries.test.ts`
- Modify: `src/app/api/index/route.ts` (parse new params)
- Modify: `src/components/PatentSearch.tsx` (new filter controls)

**Interfaces:**
- `IndexFilters` gains: `cpc?: string` (CPC prefix, e.g. "H01L"); `entityStatus?: "large" | "small" | "micro"`; `status?: "lapsed" | "maintained"`; `sort?: "number" | "year_desc" | "year_asc"`. Existing `dormantOnly` stays accepted (API back-compat) and is treated as `status: "lapsed"`.
- SQL details (facts JSON-encode values):
  - CPC: `EXISTS (SELECT 1 FROM asset a JOIN fact f ON f.asset_id = a.id WHERE a.external_id = patent_index.number AND f.key = 'cpc_classes' AND f.value LIKE ?)` with param `'%"' + prefix + '%'` (prefix sanitised: strip `%_"` chars, uppercase).
  - entityStatus: `EXISTS (SELECT 1 FROM maintenance_event me WHERE me.patent_number = patent_index.number AND me.entity_status = ?)` mapping large→`'N'`, small→`'Y'`, micro→`'M'`.
  - status lapsed: existing `DORMANT_EXISTS`; maintained: `NOT ${DORMANT_EXISTS}`.
  - sort: whitelist map `{ number: "number", year_desc: "grant_year DESC, number", year_asc: "grant_year ASC, number" }` — NEVER interpolate user input into ORDER BY.

- [ ] **Step 1: Write failing tests** `src/lib/index/queries.test.ts`. Copy the setup pattern from `src/lib/db/queries.test.ts` (`:memory:` under VITEST + `ensureSchema`). Seed: 3 patent_index rows (US1 year 2000 CPC H01L lapsed small-entity; US2 year 2010 CPC G06F maintained large-entity; US3 year 2020 no facts) with matching `asset`+`fact` rows (`fact.value` is JSON: `'true'`/`'false'`, `'["H01L21/02"]'`) and `maintenance_event` rows (entity_status Y/N). Assert: cpc "H01L" → [US1]; entityStatus small → [US1]; status maintained → [US2]; sort year_desc → US3 first; combined cpc+status works; dormantOnly still works.
- [ ] **Step 2: Run → FAIL. Step 3: Implement** `where()` extensions + sort in `searchLocalIndex` (`ORDER BY ${SORT[f.sort ?? "number"]}`). **Step 4: Run → PASS.**
- [ ] **Step 5: API route:** parse `cpc`, `entityStatus`, `status`, `sort` from searchParams with the same validation style the route already uses (ignore invalid values).
- [ ] **Step 6: UI.** In `PatentSearch.tsx` extend `Filters`/`INITIAL`/`buildQS` with `cpc: ""`, `entityStatus: ""`, `status: ""`, `sort: "number"`. Add controls to the filter card, matching existing INPUT styling: CPC text input (placeholder "e.g. H01L"), Entity-status `<select>` (Any/Large/Small/Micro entity), Status `<select>` (Any status / Dormant — fee lapsed / Maintained) REPLACING the dormantOnly checkbox (send `status=lapsed` instead of `dormantOnly=1`), Sort `<select>` (Patent number / Newest first / Oldest first).
- [ ] **Step 7: Manual verify on :3100** (CPC "H01" + Dormant + Small entity returns plausible rows; counts change per filter). `npx next build` → succeeds.
- [ ] **Step 8: Commit:** `git add -A && git commit -m "feat(patents): CPC, entity-status, maintenance-status and sort filters (server-side, whole catalogue)"`

---

### Task 9: Filter persistence — filters/page survive navigation

User item 6: filters live in `useState` only; returning to /patents always refetches `INITIAL` (see `useEffect` mount call). Sync state to URL query params so back-navigation restores them.

**Files:**
- Modify: `src/components/PatentSearch.tsx`
- Modify: `src/app/patents/page.tsx` (Suspense boundary — `useSearchParams` in Next 15 requires it)

**Interfaces:**
- Consumes: `useSearchParams`, `useRouter`, `usePathname` from `next/navigation`.
- URL params mirror `buildQS` exactly (`q`, `assignee`, `yearAfter`, `yearBefore`, `cpc`, `entityStatus`, `status`, `sort`, `page`) — one param vocabulary for both fetch and address bar.

- [ ] **Step 1: Parse-from-URL.** Add `function filtersFromParams(sp: URLSearchParams): { filters: Filters; page: number }` (defaults = INITIAL / 0; validate numbers). On mount, initialize `filters`, `pending`, `page` from `useSearchParams()` and call `run(parsed.filters, parsed.page)` instead of `run(INITIAL, 0)`.
- [ ] **Step 2: Write-to-URL.** In `handleSearch`, `handleReset`, `prev`, `next`: after updating state, `router.replace(`${pathname}?${buildQS(f, p)}`, { scroll: false })` (reset → `router.replace(pathname)`). Keep the existing `run(...)` calls — do NOT re-fetch from a params effect (avoid double-fetch loops); the URL is written, never watched after mount.
- [ ] **Step 3: Suspense.** In `src/app/patents/page.tsx` wrap: `<Suspense fallback={null}><PatentSearch /></Suspense>` (import from react). Without this `next build` fails on `useSearchParams`.
- [ ] **Step 4: Verify on :3100:** set filters + page 2 → open a patent → browser Back → filters, results and page intact; hard refresh with params in URL also restores. `npx next build` → succeeds.
- [ ] **Step 5: Commit:** `git add -A && git commit -m "fix(patents): persist filters and page in URL so navigation round-trips keep search state"`

---

### Task 10: Batch analysis — select multiple patents and analyze them in sequence

User item 7. Client-driven runner (the BYO key lives client-side): select rows → ingest each → stream-analyze each sequentially with live progress.

**Files:**
- Create: `src/lib/client/analyze-stream.ts` (extract SSE consumption from AnalyzeButton)
- Modify: `src/components/AnalyzeButton.tsx` (use the extracted helper — single source of SSE parsing)
- Create: `src/components/BatchAnalyzePanel.tsx`
- Modify: `src/components/PatentSearch.tsx` (checkbox column + selection bar)

**Interfaces:**
- Produces (`analyze-stream.ts`, client-only):

```ts
import type { TraceEvent } from "@/lib/agent/state";
export async function streamAnalyze(
  body: { assetId: number; num: string; llmConfig: unknown },
  onTrace: (e: TraceEvent) => void
): Promise<{ ok: boolean; error?: string }>;
// POSTs /api/analyze, parses the "data: {json}\n\n" SSE frames exactly as AnalyzeButton does today
// ("trace" -> onTrace, "error" -> { ok:false, error: message }, stream end without error -> { ok:true }).
```

- Produces: `BatchAnalyzePanel({ numbers, onClose }: { numbers: string[]; onClose: () => void })` — fixed bottom sheet/card; for each number sequentially: POST `/api/ingest` `{ numbers: [n] }` → `assetId`; `streamAnalyze` with `getActiveEngine()` (Task 6 — panel also shows the engine select like AnalyzeButton); per-row status machine `queued → ingesting → analyzing (last trace label) → done | error(message)`; done rows link to `/patents/{assetId}`. Abortable: a "Stop" button stops advancing the queue after the current item.
- PatentSearch: `const [selected, setSelected] = useState<Set<string>>(new Set())`; leading checkbox column (header checkbox = toggle page); when `selected.size > 0` show a bar: "N selected — Analyze selected" (cap 10 with a "max 10 per batch" note, disable beyond) + Clear. Row-click navigation must NOT fire from checkbox clicks (`e.stopPropagation()` on the checkbox cell).

- [ ] **Step 1: Extract `streamAnalyze`** and refactor `AnalyzeButton.run()` to use it (identical behavior; `router.refresh()` stays in the component).
- [ ] **Step 2: Build `BatchAnalyzePanel`** per the interface (sequential loop; no concurrency — provider rate limits).
- [ ] **Step 3: Wire selection UI** into `PatentSearch`.
- [ ] **Step 4: Verify on :3100:** select 2–3 cheap patents, run a batch with a working engine, watch statuses progress, open a done link; test Stop mid-batch and an invalid-key error row. `npx next build` → succeeds.
- [ ] **Step 5: Commit:** `git add -A && git commit -m "feat(batch): multi-select batch analysis with sequential SSE runner and per-patent progress"`

---

### Task 11: Micro-outcome logging + reason codes (deal journey)

Brief Upgrades 2 & 5: log every step of the asset-buyer journey as a timestamped row; terminal outcomes REQUIRE a coded reason. Schema + write path now (retrofitting later loses exactly the data we need).

**Files:**
- Modify: `src/lib/db/schema.ts` (outcome table)
- Create: `src/lib/outcomes/types.ts`
- Create: `src/lib/outcomes/queries.ts` + `src/lib/outcomes/queries.test.ts`
- Create: `src/app/api/outcomes/route.ts`
- Create: `src/components/DealJourney.tsx`
- Modify: `src/app/patents/[id]/page.tsx` (render the panel)

**Interfaces:**

```ts
// src/lib/outcomes/types.ts
export const OUTCOME_EVENTS = [
  "owner_identified", "owner_reachable", "owner_willing",
  "price_captured", "legal_verification_passed",
  "buyer_interest", "nda_signed", "diligence_started",
  "offer_made", "loi", "closed", "rejected",
] as const;
export type OutcomeEvent = (typeof OUTCOME_EVENTS)[number];
export const TERMINAL_EVENTS: readonly OutcomeEvent[] = ["closed", "rejected"];
export const REASON_CODES = [
  "price_gap", "owner_unwilling", "legal_issue", "timing",
  "buyer_strategy_change", "technical_fit", "other",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
export const OUTCOME_LABELS: Record<OutcomeEvent, string> = { /* human labels, e.g. owner_identified: "Owner identified", loi: "LOI signed" */ };
export const REASON_LABELS: Record<ReasonCode, string> = { /* e.g. price_gap: "Price gap" */ };
```

```ts
// src/lib/outcomes/queries.ts
export type OutcomeRow = { id: number; asset_id: number; mandate_id: number | null; event_type: string; reason_code: string | null; note: string | null; created_at: string };
export async function insertOutcome(o: { assetId: number; mandateId?: number | null; eventType: OutcomeEvent; reasonCode?: ReasonCode | null; note?: string | null }): Promise<void>;
// throws Error("A coded reason is mandatory on terminal outcomes (closed/rejected).") when terminal && !reasonCode
// throws on unknown eventType / reasonCode; also appendEvent("outcome_logged", assetId, {eventType, reasonCode}) — the append-only moat ledger
export async function listOutcomes(assetId: number): Promise<OutcomeRow[]>; // oldest first (a journey reads top-down)
```

DDL (append inside `ensureSchema`):

```sql
    -- outcome: the micro-outcome ledger (brief v2, Upgrade 2). Every step of an
    -- asset-buyer journey is one timestamped row — fifty signals per deal, not one.
    -- reason_code is MANDATORY on terminal events (Upgrade 5), enforced in queries.
    CREATE TABLE IF NOT EXISTS outcome (
      id INTEGER PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES asset(id),
      mandate_id INTEGER,
      event_type TEXT NOT NULL,
      reason_code TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_outcome_asset ON outcome(asset_id);
```

API `POST /api/outcomes` body `{ assetId, eventType, reasonCode?, note?, mandateId? }` → 400 with the thrown message on validation failure, 200 `{ ok: true }`; `GET /api/outcomes?assetId=N` → `{ outcomes: OutcomeRow[] }`. Follow the request-parsing/error style of `src/app/api/ingest/route.ts`.

- [ ] **Step 1: Failing tests** (`queries.test.ts`, `:memory:` pattern): insert non-terminal without reason → ok; `rejected` without reason → throws the exact message; `rejected` with `price_gap` → ok; unknown event → throws; `listOutcomes` returns rows oldest-first; `event_log` gains an `outcome_logged` row per insert.
- [ ] **Step 2: Run → FAIL. Step 3: Implement DDL + types + queries + API. Step 4: Run → PASS** (`npx vitest run src/lib/outcomes/`).
- [ ] **Step 5: `DealJourney.tsx`** (client): props `{ assetId: number; initial: OutcomeRow[] }` (server page passes `await listOutcomes(id)`). Renders a Card "Deal journey": vertical timeline of rows (label, reason badge if any, note, timestamp) + inline form: event `<select>` (OUTCOME_LABELS), reason `<select>` (visible whenever set, REQUIRED styling when a terminal event is selected), note `<input>`, Log button → POST → on ok re-GET the list. Show the API's 400 message on failure. Render on the detail page above the audit `<details>`.
- [ ] **Step 6: Verify on :3100** (log a few steps, verify rejected-without-reason is blocked with the message, journey persists across reloads). `npx next build` → succeeds.
- [ ] **Step 7: Commit:** `git add -A && git commit -m "feat(outcomes): micro-outcome ledger with mandatory reason codes on terminal events + deal-journey UI"`

---

### Task 12: Mandates + buyer-fit scoring (demand-first)

Brief Upgrade 3: a buyer mandate (thesis) + per-(mandate, asset) Buyer-Fit Score. LLM extracts fit EVIDENCE; a deterministic mapper produces the number (same pattern as opportunity/execution).

**Files:**
- Modify: `src/lib/db/schema.ts` (mandate table)
- Create: `src/lib/mandates/queries.ts` (+ test)
- Create: `src/app/api/mandates/route.ts`
- Create: `src/app/mandates/page.tsx` + `src/components/MandateManager.tsx`
- Modify: `src/components/Sidebar.tsx` (add "Mandates" link between Patents and Settings)
- Create: `src/lib/prompts/buyer-fit.ts`
- Create: `src/lib/scoring/buyer-fit.ts` + `src/lib/scoring/buyer-fit.test.ts`
- Create: `src/app/api/buyer-fit/route.ts`
- Create: `src/components/BuyerFitPanel.tsx`
- Modify: `src/app/patents/[id]/page.tsx` (render panel, pass mandates + past buyer-fit judgments)
- Modify: `src/lib/pipeline/analyze.ts` (EXPORT `factsToParsed` — currently module-private; the buyer-fit route reuses it)

**Interfaces:**

DDL: `CREATE TABLE IF NOT EXISTS mandate (id INTEGER PRIMARY KEY, name TEXT NOT NULL, thesis TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));`

```ts
// src/lib/mandates/queries.ts
export type MandateRow = { id: number; name: string; thesis: string; created_at: string };
export async function insertMandate(name: string, thesis: string): Promise<number>; // returns id; throws on empty name/thesis
export async function listMandates(): Promise<MandateRow[]>;
export async function deleteMandate(id: number): Promise<void>;
export async function getMandate(id: number): Promise<MandateRow | null>;
```

```ts
// src/lib/types (append): buyer-fit evidence — same evidence() factory pattern (Gemini constraints!)
export const BuyerFitEvidence = z.object({
  thesis_alignment: evidence(),   // value: "low" | "medium" | "high"
  blocking_mismatch: evidence(),  // value: "yes" | "no" | "unknown" — a disqualifier (wrong domain, wrong geography, incompatible tech)
  fit_summary: z.string().optional(),
});
export type BuyerFitEvidence = z.infer<typeof BuyerFitEvidence>;
```

```ts
// src/lib/scoring/buyer-fit.ts — deterministic, facts+evidence in, number out
export function buyerFitScore(ev: BuyerFitEvidence): { score: number; reasons: string[] };
// score = bandPoints[thesis_alignment.value] (85/55/20, default low)
// if blocking_mismatch is yes -> score = Math.min(score, config.bandPoints.low), reason "Blocking mismatch: <snippet>"
```

```ts
// src/lib/prompts/buyer-fit.ts — follow the style of src/lib/prompts/opportunity-execution.ts (read it first)
export const BUYER_FIT_PROMPT_VERSION = "buyer-fit-v1";
export function buyerFitPrompt(args: { thesis: string; patent: { number: string; title: string | null; abstract: string | null; assignee: string | null; cpcClasses: string[] } }): string;
// Instructs: judge how well THIS patent matches THIS buyer thesis; return evidence bands + snippets, never a score.
```

API `POST /api/buyer-fit` body `{ assetId: number, mandateId: number, llmConfig }`:
1. 400 if no llmConfig (same message style as /api/analyze). 404 unknown mandate/asset.
2. Load facts → `factsToParsed` → prompt → `extractJson("extract", prompt, BuyerFitEvidence, llmConfig)` → `buyerFitScore`.
3. `insertJudgment(assetId, { dimension: "buyer_fit", subDimension: `mandate:${mandateId}`, score, rationale: [fit_summary, ...reasons].filter(Boolean).join(" "), sources: [thesis_alignment.snippet, blocking_mismatch.snippet].filter(Boolean), modelVersion: <model from extractJson>, promptVersion: BUYER_FIT_PROMPT_VERSION })` (match `insertJudgment`'s real signature in `src/lib/db/queries.ts`).
4. `appendEvent("buyer_fit_computed", assetId, { mandateId, score, engine: { provider, model } })`.
5. Return `{ ok: true, score, reasons, summary }`. On extractJson error → 502 `{ ok: false, error: redact(message) }` (use `src/lib/llm/redact.ts` like /api/analyze does).

`GET /api/mandates` → `{ mandates }`; `POST` `{ name, thesis }` → `{ id }`; `DELETE ?id=` → `{ ok: true }`.

- [ ] **Step 1: Failing tests:** `buyer-fit.test.ts` (high/no-block → 85; medium → 55; high + blocking yes → 20 with blocking reason; low/unknown values → 20) and `mandates/queries.test.ts` (insert/list/get/delete round-trip; empty thesis throws). **Step 2: Run → FAIL. Step 3: Implement** DDL, queries, scoring, prompt, APIs. **Step 4: Run → PASS** (`npm test` — full suite).
- [ ] **Step 5: UI.** `MandateManager.tsx` (client): list mandates (name, thesis, delete) + create form (name input, thesis textarea, e.g. placeholder "Long-duration energy storage compatible with existing gas plants; US jurisdiction; TRL 4+"); page `src/app/mandates/page.tsx` renders header + manager (copy layout conventions from `src/app/settings/page.tsx`); Sidebar link "Mandates". `BuyerFitPanel.tsx` (client) on patent detail: props `{ assetId, mandates: MandateRow[], judgments: JudgmentRow[] }` (server page passes `listMandates()` and existing buyer_fit judgments it already loads judgments for — filter `dimension === "buyer_fit"`); mandate `<select>` + "Score fit" button using `getActiveEngine()` (Task 6; same no-engine hint as AnalyzeButton) → POST /api/buyer-fit → show score chip + summary; below, list previous buyer-fit judgments (mandate name via `subDimension` `mandate:{id}` lookup, score, model, date).
- [ ] **Step 6: Verify on :3100:** create a mandate, score a patent against it, see the judgment persist on reload. `npx next build` → succeeds.
- [ ] **Step 7: Commit:** `git add -A && git commit -m "feat(buyer-fit): mandates + per-mandate buyer-fit scoring (LLM evidence, deterministic mapping)"`

---

### Task 13: Integration pass — full suite, build, smoke, docs

**Files:**
- Modify: `README.md` (if it documents scoring/filters/engines — update the changed behavior; add a short "Scoring v2" section: Gate 0 routes, split scores, and the calibration table from config.ts)

- [ ] **Step 1:** `npm test` → entire suite PASS.
- [ ] **Step 2:** `npx next build` → clean production build (no type errors, no useSearchParams/Suspense warnings).
- [ ] **Step 3: End-to-end smoke on :3100:** (a) patents page: apply CPC+status filters, sort, paginate, navigate away and Back → state intact; (b) analyze a lapsed patent with an OpenAI reasoning-model id (e.g. the one that previously 400'd) → completes or fails with a FRIENDLY message, never the raw temperature 400; (c) detail page shows route badge + 4 score chips + run history; (d) second run with a different engine → comparison row appears; (e) batch-analyze 2 patents; (f) log a deal-journey outcome, verify rejected requires a reason; (g) create a mandate and score buyer-fit. Check `event_log` for the new run: `python -c "..."` query or sqlite CLI on `data/dormant.db` — `score_computed` payload contains `engine`, `transactability` judgment rows exist.
- [ ] **Step 4:** Final commit: `git add -A && git commit -m "docs: scoring v2 + platform improvements integration pass"`.

---

## Coverage check (spec ↔ tasks)

| Requirement | Task |
|---|---|
| Dormancy rating hardly above 75 | 2 |
| Temperature 400 / model compat errors | 1 |
| Compare runs across models | 4, 6, 7 |
| Bigger models fail — logs reviewed | 1 (fixes: temperature 400, Gemini schema 400, friendlier permanent errors; log review done during planning) |
| More patent filters | 8 |
| Filters survive navigation | 9 |
| Analyze multiple patents | 10 |
| Brief U1: Gate 0 transactability & route | 3, 4, 5 |
| Brief U2: micro-outcome logging | 11 |
| Brief U3: buyer-fit (demand-first) | 12 |
| Brief U4: split score outputs | 4, 5, 7 |
| Brief U5: reason codes, mandatory on terminal | 11 |
| CAES "pending legal verification" (no hard-coding) | 3, 5 (every REVIVAL asset auto-flagged) |
| "What does not change": floor 40, gated arch, facts-vs-judgments, rules-first | 2 (floor + residual invariant), 3 (facts-only Gate 0) |
