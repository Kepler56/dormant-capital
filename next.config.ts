// next.config.ts
// Why: @libsql/client pulls in optional native bindings (for local file: databases). Bundling
// those breaks the build, so we mark it external; it is only ever imported from server code
// (API routes / RSC). On Vercel the client talks to Turso over HTTP, so no native code loads.
import type { NextConfig } from "next";
const config: NextConfig = { serverExternalPackages: ["@libsql/client", "libsql"] };
export default config;
