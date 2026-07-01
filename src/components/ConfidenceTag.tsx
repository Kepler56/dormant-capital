// components/ConfidenceTag.tsx
// Why: every LLM evidence item shows its confidence so the reader weighs it correctly.
// Small, monochrome — confidence is metadata, not a headline.
export default function ConfidenceTag({ level }: { level?: string | null }) {
  if (!level) return null;
  return <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">{level}</span>;
}
