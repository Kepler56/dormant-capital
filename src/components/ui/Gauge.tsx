// components/ui/Gauge.tsx
// Why: the donut/ring gauge is the signature visual of this style of analytics product —
// it turns a bare 0–100 into something instantly legible and trustworthy. Pure inline SVG
// (no chart dependency), with a soft track, a coloured progress arc, and a centred value.
// Renders server-side fine (no client hooks) so it works in Server Components.
type GaugeProps = {
  value: number | null; // 0–100; null = "no score yet" → empty arc, a dash instead of a digit
  size?: number;
  stroke?: number;
  color?: string; // arc colour (hex)
  label?: string; // small caption under the number
  suffix?: string; // e.g. "/100" — defaults to none
  big?: boolean; // larger centre number
};

export default function Gauge({
  value,
  size = 120,
  stroke = 11,
  color = "#1D4ED8",
  label,
  suffix,
  big,
}: GaugeProps) {
  // null means "not scored", which must never read as "scored zero" — show a dash
  // over an empty arc instead of a bold 0.
  const v = value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = ((v ?? 0) / 100) * c;
  const center = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={center} cy={center} r={r} fill="none" stroke="#EDF1F5" strokeWidth={stroke} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display font-bold tabular-nums leading-none ${v === null ? "text-muted" : "text-ink"} ${big ? "text-4xl" : "text-2xl"}`}>
          {v ?? "—"}
          {v !== null && suffix && <span className="ml-0.5 text-xs font-semibold text-muted">{suffix}</span>}
        </span>
        {label && <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>}
      </div>
    </div>
  );
}
