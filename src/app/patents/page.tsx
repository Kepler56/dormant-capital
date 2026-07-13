// app/patents/page.tsx
// Why: server component shell for the patent catalogue browser. The heading is rendered
// server-side; all interactive state (filters, table, ingest) lives in the PatentSearch client
// component, which reads the local, offline catalogue via /api/index.
import { Suspense } from "react";
import PatentSearch from "@/components/PatentSearch";

export default function PatentsPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Patents</h1>
      <Suspense fallback={null}>
        <PatentSearch />
      </Suspense>
    </div>
  );
}
