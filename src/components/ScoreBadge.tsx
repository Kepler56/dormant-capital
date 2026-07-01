// components/ScoreBadge.tsx
// Why: bands must be instantly scannable in a table or header — but in the USER'S
// language, not the internal ROUTE/WATCH/PASS jargon. A small dotted pill in the verdict
// tone keeps it quiet but legible. (The raw band is still used internally for logic.)
const MAP: Record<string, { label: string; cls: string; dot: string }> = {
  ROUTE: { label: "Strong opportunity", cls: "bg-good-soft text-brand-dark ring-good/30", dot: "bg-brand" },
  WATCH: { label: "Worth watching", cls: "bg-watch-soft text-amber-700 ring-watch/30", dot: "bg-watch" },
  PASS: { label: "Not a fit", cls: "bg-idle-soft text-ink-soft ring-idle/30", dot: "bg-idle" },
};

export default function ScoreBadge({ band, compact }: { band?: string | null; compact?: boolean }) {
  if (!band) return <span className="text-xs text-muted">—</span>;
  const m = MAP[band] ?? MAP.PASS;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {compact ? m.label.split(" ")[0] : m.label}
    </span>
  );
}
