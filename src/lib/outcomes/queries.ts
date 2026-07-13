// lib/outcomes/queries.ts
// Why: the micro-outcome ledger (brief v2, Upgrade 2) — one timestamped row per
// asset-buyer journey step, never overwritten. reason_code is MANDATORY on terminal
// events (Upgrade 5) so every closed/rejected deal carries a coded, queryable reason
// instead of a free-text postmortem nobody can aggregate. Every insert also appends an
// "outcome_logged" row to the append-only event_log — the same moat ledger everything
// else in the app writes to.
import { all, run } from "@/lib/db/connection";
import { appendEvent } from "@/lib/db/queries";
import {
  OUTCOME_EVENTS, TERMINAL_EVENTS, REASON_CODES,
  type OutcomeEvent, type ReasonCode,
} from "./types";

export type OutcomeRow = {
  id: number;
  asset_id: number;
  mandate_id: number | null;
  event_type: string;
  reason_code: string | null;
  note: string | null;
  created_at: string;
};

export async function insertOutcome(o: {
  assetId: number;
  mandateId?: number | null;
  eventType: OutcomeEvent;
  reasonCode?: ReasonCode | null;
  note?: string | null;
}): Promise<void> {
  if (!OUTCOME_EVENTS.includes(o.eventType)) {
    throw new Error(`Unknown outcome event type: ${o.eventType}`);
  }
  const reasonCode = o.reasonCode ?? null;
  if (reasonCode !== null && !REASON_CODES.includes(reasonCode)) {
    throw new Error(`Unknown reason code: ${reasonCode}`);
  }
  if (TERMINAL_EVENTS.includes(o.eventType) && !reasonCode) {
    throw new Error("A coded reason is mandatory on terminal outcomes (closed/rejected).");
  }

  await run(
    `INSERT INTO outcome (asset_id, mandate_id, event_type, reason_code, note)
     VALUES (?, ?, ?, ?, ?)`,
    [o.assetId, o.mandateId ?? null, o.eventType, reasonCode, o.note ?? null]
  );
  await appendEvent("outcome_logged", o.assetId, { eventType: o.eventType, reasonCode });
}

export async function listOutcomes(assetId: number): Promise<OutcomeRow[]> {
  return all<OutcomeRow>(`SELECT * FROM outcome WHERE asset_id=? ORDER BY id`, [assetId]);
}
