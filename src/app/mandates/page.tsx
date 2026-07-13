// app/mandates/page.tsx
// Why: the demand-side control room (brief Upgrade 3). A buyer mandate is just a name + a
// standing thesis; this page is where those get created and retired. Layout copies the
// settings page's header + single-card convention. Server Component (reads the DB directly),
// same as settings.
import { listMandates } from "@/lib/mandates/queries";
import MandateManager from "@/components/MandateManager";

export const dynamic = "force-dynamic";

export default async function MandatesPage() {
  const mandates = await listMandates();
  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Mandates</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Buyer theses that drive per-mandate Buyer-Fit scoring on each patent.
        </p>
      </div>

      <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lift">
        <div className="border-b border-line bg-canvas/60 px-6 py-5 sm:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-action-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-action-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-action" />
            Demand
          </span>
          <h2 className="mt-3 font-display text-xl font-bold text-ink">Buyer mandates</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Each mandate is a buyer&apos;s standing thesis — what they&apos;re looking to acquire and where
            the hard limits are. Score any patent against a mandate from its detail page; the LLM
            extracts fit evidence and deterministic code turns it into a Buyer-Fit number, never the
            other way around.
          </p>
        </div>
        <div className="px-6 py-6 sm:px-8">
          <MandateManager initial={mandates} />
        </div>
      </section>
    </div>
  );
}
