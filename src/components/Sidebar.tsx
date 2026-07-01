// components/Sidebar.tsx
// Why: the single navigation surface. A plain DORMANT CAPITAL wordmark anchors identity (no
// logo mark), and nav items are icon + label so the rail reads as a real product, not a list
// of links. Items are grouped into labelled sections (Workspace / Configure) the way a SaaS
// product rail organizes pages by job. The active route gets a soft-blue pill AND a left
// accent bar so the eye catches "you are here" even at a glance. The user profile anchors the
// bottom-left corner. Data-driven so adding a page or section is a one-line change.
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Minimal stroke icons keep the rail light and consistent.
const Icon = ({ path, className = "" }: { path: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={path} />
  </svg>
);

const ICONS = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z",
  patents: "M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h5M9 13h7M9 17h5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.2-1.8l2-1.5-2-3.4-2.3 1a8 8 0 0 0-3-1.8L14 1h-4l-.5 2.7a8 8 0 0 0-3 1.8l-2.3-1-2 3.4 2 1.5A8 8 0 0 0 4 12c0 .6 0 1.2.2 1.8l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 3 1.8L10 23h4l.5-2.7a8 8 0 0 0 3-1.8l2.3 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8Z",
} as const;

type NavSection = "Workspace" | "Configure";

const NAV: { href: string; label: string; icon: keyof typeof ICONS; section: NavSection }[] = [
  { href: "/", label: "Dashboard", icon: "dashboard", section: "Workspace" },
  { href: "/patents", label: "Patents", icon: "patents", section: "Workspace" },
  { href: "/settings", label: "Settings", icon: "settings", section: "Configure" },
];

// Preserve section order of first appearance in NAV rather than alphabetizing, so the
// groups read Workspace-first the way a user thinks about the product.
const SECTIONS: NavSection[] = Array.from(new Set(NAV.map((n) => n.section)));

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 md:flex">
      {/* Brand wordmark */}
      <Link href="/" className="mb-8 block px-2 leading-tight">
        <span className="block font-display text-[15px] font-extrabold uppercase tracking-[0.14em] text-ink">Dormant</span>
        <span className="block font-display text-[15px] font-extrabold uppercase tracking-[0.14em] text-brand">Capital</span>
      </Link>

      <nav className="space-y-5">
        {SECTIONS.map((section) => (
          <div key={section}>
            <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-muted">
              {section}
            </p>
            <div className="space-y-1">
              {NAV.filter((n) => n.section === section).map((n) => {
                const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`group relative flex items-center gap-3 rounded-xl py-2.5 pl-3 pr-3 text-sm transition ${
                      active
                        ? "bg-brand-soft font-semibold text-brand-dark"
                        : "font-medium text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand" aria-hidden />
                    )}
                    <Icon
                      path={ICONS[n.icon]}
                      className={`h-[18px] w-[18px] transition ${active ? "text-brand" : "text-muted group-hover:text-ink-soft"}`}
                    />
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User profile — anchors the bottom-left corner */}
      <div className="mt-auto flex items-center gap-3 rounded-2xl border border-line bg-canvas/60 px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-xs font-bold text-white">
          A
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-ink">Analyst</span>
          <span className="block truncate text-[11px] text-muted">Dormant Capital</span>
        </span>
      </div>
    </aside>
  );
}
