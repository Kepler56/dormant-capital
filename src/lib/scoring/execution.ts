// scoring/execution.ts
// Why: Execution = how cleanly a buyer could actually acquire/deploy this. Ownership
// clarity (clean single assignee) and remaining time-to-expiry dominate. Evidence in,
// deterministic sub-score out.
import { config } from "./config";
import type { OppExecEvidence, ParsedPatent } from "@/lib/types";

const band = (v: unknown): number =>
  v === "high" ? config.bandPoints.high : v === "medium" ? config.bandPoints.medium : config.bandPoints.low;

export function executionScore(p: ParsedPatent, ev?: OppExecEvidence): number {
  // Time-to-expiry: full-term expiry is public domain (unusable as exclusive IP); a fee
  // lapse is recoverable via revival petition, so it is penalised rather than floored.
  const t = config.executionTime;
  const timeComponent = p.anticipatedExpiration ? t.expired : p.maintenanceLapsed ? t.lapsed : t.active;
  if (!ev) return timeComponent;
  return Math.round(0.5 * band(ev.ownership_clarity.value) + 0.5 * timeComponent);
}
