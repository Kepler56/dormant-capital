// components/ui/Gauge.tsx
// Why: the donut/ring gauge is the signature visual of this style of analytics product —
// it turns a bare 0–100 into something instantly legible and trustworthy. Pure inline SVG
// (no chart dependency), with a soft track, a coloured progress arc, and a centred value.
// Renders server-side fine (no client hooks) so it works in Server Components.
type GaugeProps = {
  value: number; // 0–100
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
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
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
        <span className={`font-display font-bold tabular-nums leading-none text-ink ${big ? "text-4xl" : "text-2xl"}`}>
          {v}
          {suffix && <span className="ml-0.5 text-xs font-semibold text-muted">{suffix}</span>}
        </span>
        {label && <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>}
      </div>
    </div>
  );
}
