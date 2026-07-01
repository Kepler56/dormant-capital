// scoring/execution.ts
// Why: Execution = how cleanly a buyer could actually acquire/deploy this. Ownership
// clarity (clean single assignee) and remaining time-to-expiry dominate. Evidence in,
// deterministic sub-score out.
import type { OppExecEvidence, ParsedPatent } from "@/lib/types";

const band = (v: unknown): number => (v === "high" ? 80 : v === "medium" ? 50 : 20);

export function executionScore(p: ParsedPatent, ev?: OppExecEvidence): number {
  // Time-to-expiry: an expired patent is hard to "execute" on as exclusive IP.
  const expired = p.anticipatedExpiration || p.maintenanceLapsed;
  const timeComponent = expired ? 25 : 70;
  if (!ev) return timeComponent;
  return Math.round(0.5 * band(ev.ownership_clarity.value) + 0.5 * timeComponent);
}
