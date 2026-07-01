// components/ui/Card.tsx
// Why: one rounded, soft-shadowed surface primitive used everywhere so spacing, radius
// and elevation stay consistent across the app. `Section` pairs a small label with a card
// for the detail page's stacked layout.
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface shadow-soft ${className}`}>{children}</div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{children}</h2>
  );
}
