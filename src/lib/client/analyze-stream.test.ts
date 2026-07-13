import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TraceEvent } from "@/lib/agent/state";
import { streamAnalyze } from "./analyze-stream";

// Builds a Response whose body streams the given raw SSE text in one or more chunks, mirroring
// what /api/analyze actually sends over the wire (see app/api/analyze/route.ts's `frame` helper).
function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream);
}

function frame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

const body = { assetId: 1, num: "US1234567", llmConfig: { provider: "openai", model: "gpt-4o", apiKey: "sk-x" } };

describe("streamAnalyze", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs to /api/analyze with the given body", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(sseResponse([]));
    await streamAnalyze(body, () => {});
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/analyze",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  });

  it("forwards trace events to onTrace in order and resolves ok:true on clean stream end", async () => {
    const e1: TraceEvent = { step: "plan", label: "Planning", status: "start" };
    const e2: TraceEvent = { step: "search", label: "Searching", status: "ok" };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([frame({ type: "trace", event: e1 }), frame({ type: "trace", event: e2 })])
    );
    const seen: TraceEvent[] = [];
    const result = await streamAnalyze(body, (e) => seen.push(e));
    expect(seen).toEqual([e1, e2]);
    expect(result).toEqual({ ok: true });
  });

  it("resolves ok:false with the message from an error frame", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([frame({ type: "error", message: "bad key" })])
    );
    const result = await streamAnalyze(body, () => {});
    expect(result).toEqual({ ok: false, error: "bad key" });
  });

  it("defaults the error message to 'Failed' when the error frame omits one", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(sseResponse([frame({ type: "error" })]));
    const result = await streamAnalyze(body, () => {});
    expect(result).toEqual({ ok: false, error: "Failed" });
  });

  it("handles a frame split across multiple chunks (partial buffer carries over)", async () => {
    const e1: TraceEvent = { step: "plan", label: "Planning", status: "start" };
    const whole = frame({ type: "trace", event: e1 });
    const mid = Math.floor(whole.length / 2);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([whole.slice(0, mid), whole.slice(mid)])
    );
    const seen: TraceEvent[] = [];
    const result = await streamAnalyze(body, (e) => seen.push(e));
    expect(seen).toEqual([e1]);
    expect(result).toEqual({ ok: true });
  });

  it("silently skips malformed JSON lines and blank frames", async () => {
    const e1: TraceEvent = { step: "plan", label: "Planning", status: "start" };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse(["data: {not json\n\n", "\n\n", frame({ type: "trace", event: e1 })])
    );
    const seen: TraceEvent[] = [];
    const result = await streamAnalyze(body, (e) => seen.push(e));
    expect(seen).toEqual([e1]);
    expect(result).toEqual({ ok: true });
  });

  it("ignores trace frames whose event field is missing", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(sseResponse([frame({ type: "trace" })]));
    const seen: unknown[] = [];
    const result = await streamAnalyze(body, (e) => seen.push(e));
    expect(seen).toEqual([]);
    expect(result).toEqual({ ok: true });
  });

  it("keeps the last error message when multiple error frames arrive", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponse([frame({ type: "error", message: "first" }), frame({ type: "error", message: "second" })])
    );
    const result = await streamAnalyze(body, () => {});
    expect(result).toEqual({ ok: false, error: "second" });
  });

  it("resolves ok:false with 'No stream' when the response has no body", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(null));
    const result = await streamAnalyze(body, () => {});
    expect(result).toEqual({ ok: false, error: "No stream" });
  });
});
