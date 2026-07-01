// Why: millions of patents have lapsed, so we sample a fixed-size subset. Sampling is a
// deterministic STRIDE across the pool (not the first N, not random) so the subset spreads
// across the file's ordering and an identical load reproduces an identical subset.
export type SubsetConfig = { dormantCap: number; paidCap: number; forceInclude: string[] };

function stride(pool: string[], cap: number): string[] {
  if (cap <= 0 || pool.length === 0) return [];
  if (pool.length <= cap) return [...pool];
  const step = pool.length / cap;
  const out: string[] = [];
  for (let i = 0; i < cap; i++) out.push(pool[Math.floor(i * step)]);
  return out;
}

export function selectSubset(dormant: string[], paid: string[], cfg: SubsetConfig): Set<string> {
  const s = new Set<string>();
  for (const n of stride(dormant, cfg.dormantCap)) s.add(n);
  for (const n of stride(paid, cfg.paidCap)) s.add(n);
  for (const n of cfg.forceInclude) s.add(n);
  return s;
}
