// app/api/analyze/route.ts
// Why: the single token-spending seam, STREAMING. Analysis always runs on the user's own BYO
// model (provider/model/key from the request body — never logged or persisted; only the model
// id is recorded downstream). With no server default there is nothing to rate-limit: a missing
// or invalid BYO config is rejected up front. We log 'analyze_requested' BEFORE the work (the
// append-only ledger records every attempt), then stream the agent's trace events over SSE and
// a final 'done' frame with the score. Node runtime is required for streaming + the LLM SDKs.
import { runAnalysis } from "@/lib/pipeline/analyze";
import { appendEvent } from "@/lib/db/queries";
import { parseLLMConfig } from "@/lib/llm/config";
import { redactSecret } from "@/lib/llm/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { assetId?: number; num?: string; llmConfig?: unknown };
  const cfg = parseLLMConfig(body.llmConfig);

  const enc = new TextEncoder();
  const frame = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

  // BYO is required — there is no shared server model to fall back on.
  if (!cfg) {
    return new Response(
      frame({ type: "error", message: "Add your provider, model and API key in Settings before analyzing." }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }
  const assetId = Number(body.assetId), num = String(body.num ?? "");

  // Record the attempt in the append-only ledger first (fail-closed). The key is never logged.
  appendEvent("analyze_requested", assetId, { num, provider: cfg.provider, model: cfg.model });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = runAnalysis(assetId, num, cfg);
        let r = await gen.next();
        while (!r.done) { controller.enqueue(frame({ type: "trace", event: r.value })); r = await gen.next(); }
        const out = r.value;
        controller.enqueue(frame({ type: "done", ...out }));
      } catch (e) {
        const msg = redactSecret((e as Error).message, cfg.apiKey);
        appendEvent("analyze_failed", assetId, { error: msg });
        controller.enqueue(frame({ type: "error", message: msg }));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
