// lib/client/analyze-stream.ts
// Why: single source of SSE-parsing for /api/analyze. Both AnalyzeButton (one patent) and
// BatchAnalyzePanel (many, sequentially) need to POST the analyze request and consume the
// "data: {json}\n\n" frame stream identically — trace events surfacing live, an error frame
// short-circuiting to a message, and a clean stream end meaning success. Extracted verbatim from
// AnalyzeButton's original run() so behavior does not change; only the caller decides what to do
// with the trace events (setLive for a single button, per-row status for the batch runner) and
// with the final {ok, error} result. Client-only — never import from server code.
import type { TraceEvent } from "@/lib/agent/state";

export async function streamAnalyze(
  body: { assetId: number; num: string; llmConfig: unknown },
  onTrace: (e: TraceEvent) => void
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.body) return { ok: false, error: "No stream" };

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let error: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.replace(/^data: /, "").trim();
      if (!line) continue;
      let frame: { type: string; event?: TraceEvent; message?: string };
      try {
        frame = JSON.parse(line);
      } catch {
        continue;
      }
      if (frame.type === "trace" && frame.event) onTrace(frame.event);
      else if (frame.type === "error") error = frame.message ?? "Failed";
    }
  }
  return error !== undefined ? { ok: false, error } : { ok: true };
}
