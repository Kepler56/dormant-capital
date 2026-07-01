// llm/redact.ts
// Why: BYO API keys must never be logged, persisted, or written to event_log — only model id
// strings. Provider SDK errors sometimes leak the key verbatim (e.g. in a request URL/query
// string), so any error message headed for appendEvent() or an SSE error frame must pass through
// this pure, dependency-free redactor first: it strips the exact known secret AND any generic
// key/token query parameter, even if the secret itself wasn't passed in.
const QUERY_KEY_PARAM = /([?&](?:key|api[_-]?key|access[_-]?token)=)[^&\s"']+/gi;

export function redactSecret(message: string, secret?: string | null): string {
  // Coerce defensively: a thrown non-Error yields a message of `undefined`, and redacting
  // nothing must never itself throw inside an error-handling path.
  let out = typeof message === "string" ? message : String(message ?? "");
  if (typeof secret === "string" && secret.length > 0) {
    out = out.split(secret).join("[REDACTED]");
  }
  out = out.replace(QUERY_KEY_PARAM, "$1[REDACTED]");
  return out;
}
