// components/RouteBadge.tsx
// Why: the route is Gate 0's headline output — what KIND of deal this asset can be.
// Rendered next to the verdict so a non-transactable asset reads as "public-domain
// intel product", never as a failed acquisition.
const STYLE: Record<string, { label: string; cls: string }> = {
  LICENSE_OR_ACQUIRE: { label: "License / Acquire", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REVIVAL: { label: "Revival candidate", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PUBLIC_DOMAIN_INTEL: { label: "Public-domain intel", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  TECH_INFO: { label: "Technical info only", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  TECHNOLOGY_PACKAGE: { label: "Technology package", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  UNKNOWN: { label: "Status unverified", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};
export default function RouteBadge({ route, flags = [] }: { route: string; flags?: string[] }) {
  const s = STYLE[route] ?? STYLE.UNKNOWN;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
      {flags.includes("needs_legal_verification") && (
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          Pending legal verification
        </span>
      )}
    </span>
  );
}
