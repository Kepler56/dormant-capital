// next.config.ts
// Why: better-sqlite3 is a native Node addon. Bundling it breaks the build, so we
// declare it external; it is only ever imported from server code (API routes / RSC).
import type { NextConfig } from "next";
const config: NextConfig = { serverExternalPackages: ["better-sqlite3"] };
export default config;
