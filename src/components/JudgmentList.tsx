// components/JudgmentList.tsx
// Why: this is the "show your work" surface for a NON-technical reader — the evidence the
// AI actually found, in plain rows, never raw JSON. Each evidence field becomes a readable
// question, a coloured answer chip, a confidence tag, and the verbatim snippet it relied
// on. When the analysis carries cited web sources we list them as real outbound links —
// that is the trust payload: every claim is checkable. Model/prompt provenance is kept as
// a single muted footer line (rigor signalling, not a headline).
import type { JudgmentRow } from "@/lib/types";
import ConfidenceTag from "./ConfidenceTag";

const FIELD_LABELS: Record<string, string> = {
  product_exists: "Is there a product on the market today?",
  active_development: "Is anyone still developing it?",
  active_litigation: "Is the patent being litigated?",
  commercial_relevance: "Commercial relevance of the technology",
  claim_breadth: "How broad / foundational the claims read",
  ownership_clarity: "How clear the current ownership is",
};

// Plain-language reading of each value, so "no" doesn't look like a negative result.
function readValue(value: boolean | number | string): { text: string; tone: "good" | "watch" | "idle" } {
  const v = typeof value === "boolean" ? (value ? "yes" : "no") : String(value).toLowerCase();
  if (v === "yes" || v === "high") return { text: v === "yes" ? "Yes" : "High", tone: "good" };
  if (v === "no" || v === "none") return { text: "No", tone: "idle" };
  if (v === "low") return { text: "Low", tone: "idle" };
  if (v === "medium") return { text: "Medium", tone: "watch" };
  if (v === "unknown") return { text: "Unclear", tone: "watch" };
  return { text: String(value), tone: "watch" };
}

function ValueChip({ value }: { value: boolean | number | string }) {
  const { text, tone } = readValue(value);
  const cls =
    tone === "good"
      ? "bg-good-soft text-brand-dark ring-good/30"
      : tone === "watch"
      ? "bg-watch-soft text-amber-700 ring-watch/30"
      : "bg-idle-soft text-ink-soft ring-idle/30";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {text}
    </span>
  );
}

function EvidenceRow({ fieldKey, item }: { fieldKey: string; item: { value: boolean | number | string; snippet?: string; confidence?: string } }) {
  const label = FIELD_LABELS[fieldKey] ?? fieldKey;
  return (
    <div className="border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">{label}</span>
        <ValueChip value={item.value} />
        {item.confidence && <ConfidenceTag level={item.confidence} />}
      </div>
      {item.snippet && (
        <p className="mt-1.5 border-l-2 border-line pl-3 text-xs italic leading-relaxed text-muted">
          &ldquo;{item.snippet}&rdquo;
        </p>
      )}
    </div>
  );
}

function isEvidenceMap(flags: unknown): flags is Record<string, { value: boolean | number | string; snippet?: string; confidence?: string }> {
  return (
    typeof flags === "object" &&
    flags !== null &&
    !Array.isArray(flags) &&
    Object.values(flags).length > 0 &&
    Object.values(flags).every((v) => typeof v === "object" && v !== null && "value" in (v as object))
  );
}

type SourceRef = { source?: string; url?: string; title?: string };
function isSourceList(s: unknown): s is SourceRef[] {
  return Array.isArray(s) && s.every((x) => typeof x === "object" && x !== null);
}

const DIM_TITLES: Record<string, string> = {
  dormancy: "Is it really dormant?",
  opportunity: "Is it worth something?",
  execution: "Can a buyer actually take it on?",
};

export default function JudgmentList({ judgments }: { judgments: JudgmentRow[] }) {
  if (!judgments.length) {
    return (
      <p className="text-sm text-ink-soft">
        No evidence yet — run an analysis to see what the AI found, with sources.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {judgments.map((j) => {
        // The model's optional plain-language summary is stored on the flags object.
        const flags = j.flags as Record<string, unknown> | null;
        const summary =
          flags && typeof flags === "object"
            ? (flags["market_summary"] as string) || (flags["value_summary"] as string) || (flags["summary"] as string)
            : undefined;
        const sources = isSourceList(j.sources)
          ? j.sources.filter((x) => typeof x.url === "string" && x.url!.startsWith("http"))
          : [];

        return (
          <div key={j.id} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-ink">{DIM_TITLES[j.dimension] ?? j.dimension}</span>
            </div>

            {summary && <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{summary}</p>}

            {isEvidenceMap(j.flags) ? (
              <div className="mt-3">
                {Object.entries(j.flags)
                  .filter(([k]) => !["market_summary", "value_summary", "summary"].includes(k))
                  .map(([key, item]) => (
                    <EvidenceRow key={key} fieldKey={key} item={item} />
                  ))}
              </div>
            ) : null}

            {sources.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Sources checked</div>
                <ul className="space-y-1">
                  {sources.map((src, i) => (
                    <li key={i} className="truncate text-xs">
                      <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-action hover:underline">
                        {src.title || src.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 text-[10px] text-muted">
              Verified by {j.model_version} · {j.created_at}
            </div>
          </div>
        );
      })}
    </div>
  );
}
