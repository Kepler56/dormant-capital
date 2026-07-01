// scripts/load-uspto.ts
// Why: CLI entrypoint. `npm run load:uspto`. Downloads (if needed) + loads, then reports.
import { runLoad } from "./uspto/run";

runLoad()
  .then(({ subsetSize, loaded }) => { console.log(`USPTO load complete: subset=${subsetSize}, materialized=${loaded}`); })
  .catch((e) => { console.error("USPTO load failed:", e); process.exit(1); });
