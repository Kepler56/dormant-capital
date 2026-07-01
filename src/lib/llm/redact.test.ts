import { describe, it, expect } from "vitest";
import { redactSecret } from "./redact";

describe("redactSecret", () => {
  it("replaces the exact secret string wherever it occurs", () => {
    const msg = "Request failed with key sk-super-secret-123 in header";
    expect(redactSecret(msg, "sk-super-secret-123")).toBe(
      "Request failed with key [REDACTED] in header"
    );
  });

  it("redacts a ?key=SECRET query param even when the secret isn't passed explicitly", () => {
    const msg = "GET https://api.example.com/v1/models?key=sk-abc123&x=1 failed";
    expect(redactSecret(msg)).toBe(
      "GET https://api.example.com/v1/models?key=[REDACTED]&x=1 failed"
    );
  });

  it("returns the message unchanged when there is no secret and no key param", () => {
    const msg = "Network timeout after 30s";
    expect(redactSecret(msg)).toBe(msg);
    expect(redactSecret(msg, null)).toBe(msg);
  });

  it("handles undefined/empty secret safely", () => {
    const msg = "plain error message";
    expect(redactSecret(msg, undefined)).toBe(msg);
    expect(redactSecret(msg, "")).toBe(msg);
  });

  it("does not throw when the message is not a string (non-Error thrown)", () => {
    // A thrown non-Error yields message `undefined`; the redactor must coerce, not crash.
    expect(redactSecret(undefined as unknown as string, "sk-x")).toBe("");
  });
});
