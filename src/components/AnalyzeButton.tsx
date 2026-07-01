// components/AnalyzeButton.tsx
// Why: the ONLY control that spends tokens. It consumes an SSE stream: as the agent works,
// trace events render live beneath the button, so the user WATCHES the analysis think. Analysis
// always runs on the user's own BYO model, read from localStorage.llmConfig (set in Settings)
// and sent with the request. If no model is configured the button points the user to Settings
// rather than firing a request that would only bounce back a 400.
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AgentTrace from "./AgentTrace";
import type { TraceEvent } from "@/lib/agent/state";

function readLLMConfig(): unknown | null {
  try { const raw = localStorage.getItem("llmConfig"); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export default function AnalyzeButton({ assetId, num }: { assetId: number; num: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [hasByo, setHasByo] = useState(true); // optimistic until we read localStorage
  const [live, setLive] = useState<TraceEvent[]>([]);
  const router = useRouter();

  useEffect(() => { setHasByo(readLLMConfig() !== null); }, []);

  async function run() {
    const llmConfig = readLLMConfig();
    setHasByo(llmConfig !== null);
    if (!llmConfig) return; // no model configured — the hint below tells the user what to do
    setBusy(true); setMsg(""); setLive([]);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, num, llmConfig }),
    });
    if (!res.body) { setBusy(false); setMsg("No stream"); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
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
        try { frame = JSON.parse(line); } catch { continue; }
        if (frame.type === "trace" && frame.event) setLive((p) => [...p, frame.event!]);
        else if (frame.type === "error") setMsg(frame.message ?? "Failed");
      }
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col items-end gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-action-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
        )}
        {busy ? "Analyzing…" : "Analyze patent"}
      </button>
      {!busy && (
        hasByo ? (
          <span className="text-[11px] text-muted">Using your own API key</span>
        ) : (
          <span className="text-[11px] text-muted">
            <Link href="/settings" className="font-semibold text-action hover:underline">Add your model in Settings</Link> to analyze
          </span>
        )
      )}
      {msg && <p className="text-sm text-bad">{msg}</p>}
      {live.length > 0 && <div className="w-full"><AgentTrace events={live} live={busy} /></div>}
    </div>
  );
}
