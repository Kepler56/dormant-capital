// app/api/buyer-fit/route.ts
// Why: the buyer-fit seam — scores ONE asset against ONE mandate's thesis. Same BYO-only
// contract as /api/analyze: no llmConfig, no call. The LLM extracts fit evidence via
// extractJson (schema-validated, never a bare score); buyerFitScore (deterministic) turns
// that evidence into the number. The apiKey is only ever used to build the LLM call and to
// redact itself out of any error message headed for the response — never logged, never
// persisted, never echoed back verbatim.
import { NextResponse } from "next/server";
import { get } from "@/lib/db/connection";
import { insertJudgment, appendEvent } from "@/lib/db/queries";
import { getMandate } from "@/lib/mandates/queries";
import { factsToParsed } from "@/lib/pipeline/analyze";
import { buyerFitPrompt, BUYER_FIT_PROMPT_VERSION } from "@/lib/prompts/buyer-fit";
import { buyerFitScore } from "@/lib/scoring/buyer-fit";
import { BuyerFitEvidence } from "@/lib/types";
import { extractJson } from "@/lib/llm/model";
import { parseLLMConfig } from "@/lib/llm/config";
import { redactSecret } from "@/lib/llm/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { assetId?: number; mandateId?: number; llmConfig?: unknown };
  const cfg = parseLLMConfig(body.llmConfig);

  // BYO is required — there is no shared server model to fall back on (same message style
  // as /api/analyze).
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: "Add your provider, model and API key in Settings before analyzing." },
      { status: 400 }
    );
  }

  const assetId = Number(body.assetId);
  const mandateId = Number(body.mandateId);

  const asset = await get<{ id: number; external_id: string }>("SELECT * FROM asset WHERE id=?", [assetId]);
  if (!asset) return NextResponse.json({ ok: false, error: "Unknown asset." }, { status: 404 });

  const mandate = await getMandate(mandateId);
  if (!mandate) return NextResponse.json({ ok: false, error: "Unknown mandate." }, { status: 404 });

  try {
    const patent = await factsToParsed(assetId, asset.external_id);
    const prompt = buyerFitPrompt({
      thesis: mandate.thesis,
      patent: { number: patent.patentNumber, title: patent.title, abstract: patent.abstract, assignee: patent.assignee, cpcClasses: patent.cpcClasses },
    });
    const { data, model } = await extractJson("extract", prompt, BuyerFitEvidence, cfg);
    const { score, reasons } = buyerFitScore(data);

    await insertJudgment(assetId, {
      dimension: "buyer_fit",
      subDimension: `mandate:${mandateId}`,
      score,
      rationale: [data.fit_summary, ...reasons].filter(Boolean).join(" "),
      sources: [data.thesis_alignment.snippet, data.blocking_mismatch.snippet].filter(Boolean),
      modelVersion: model,
      promptVersion: BUYER_FIT_PROMPT_VERSION,
    });
    await appendEvent("buyer_fit_computed", assetId, { mandateId, score, engine: { provider: cfg.provider, model: cfg.model } });

    return NextResponse.json({ ok: true, score, reasons, summary: data.fit_summary ?? null });
  } catch (e) {
    const msg = redactSecret((e as Error).message, cfg.apiKey);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
