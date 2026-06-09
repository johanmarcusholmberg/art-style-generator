import { describe, it, expect } from "vitest";
import {
  sanitizeForDebug,
  redactSecretsInString,
  stripUrlSecrets,
  REDACTED,
} from "./debug-sanitize";

describe("redactSecretsInString", () => {
  it("redacts Bearer tokens inside Authorization headers", () => {
    const s = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig123456";
    const out = redactSecretsInString(s);
    // Either the Bearer rule or the JWT rule fires — both produce [redacted]
    expect(out).toContain("Bearer [redacted]");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9.payload.sig123456");
  });

  it("redacts standalone JWT-shaped tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.SflKxwRJSMeKKF2QT4f";
    const out = redactSecretsInString(`token was ${jwt} expired`);
    expect(out).toBe(`token was ${REDACTED} expired`);
  });

  it("redacts OpenAI-style sk- keys", () => {
    const s = "OpenAI error: invalid key sk-proj-AbCdEf0123456789AbCdEf0123 supplied";
    const out = redactSecretsInString(s);
    expect(out).toContain(REDACTED);
    expect(out).not.toContain("sk-proj-AbCdEf0123456789AbCdEf0123");
  });

  it("does NOT redact short dashed words like sk-design-system", () => {
    const s = "Loaded sk-design-system tokens";
    expect(redactSecretsInString(s)).toBe(s);
  });

  it("redacts presigned-URL signature params but keeps the param name", () => {
    const s =
      "https://example.s3.amazonaws.com/x?X-Amz-Signature=abcdef1234567890&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE/20240101/us-east-1/s3/aws4_request";
    const out = redactSecretsInString(s);
    expect(out).toContain("X-Amz-Signature=[redacted]");
    expect(out).toContain("X-Amz-Credential=[redacted]");
  });

  it("redacts ?token= and &access_token= values", () => {
    const out = redactSecretsInString(
      "GET /file?token=abc.def.ghi&access_token=XYZ123 returned 401",
    );
    expect(out).toContain("token=[redacted]");
    expect(out).toContain("access_token=[redacted]");
  });

  it("preserves normal error messages with no secrets", () => {
    const s = "Generation failed: model returned 500 Internal Server Error";
    expect(redactSecretsInString(s)).toBe(s);
  });

  it("preserves human numbers and short identifiers", () => {
    const s = "Job 42 failed after 3 retries (req_id=abc123)";
    expect(redactSecretsInString(s)).toBe(s);
  });

  it("is idempotent on already-redacted output", () => {
    const once = redactSecretsInString(
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig123456",
    );
    const twice = redactSecretsInString(once);
    expect(twice).toBe(once);
  });

  it("handles mixed text with multiple secret types", () => {
    const s =
      "POST /v1 failed: Authorization: Bearer eyJabcdefgh.payloadXYZ.sigQRS123 plus sk-proj-AbCdEf0123456789AbCdEfZZ";
    const out = redactSecretsInString(s);
    expect(out).not.toMatch(/eyJabcdefgh\.payloadXYZ\.sigQRS123/);
    expect(out).not.toMatch(/sk-proj-AbCdEf0123456789AbCdEfZZ/);
    expect(out).toContain("POST /v1 failed");
  });
});

describe("stripUrlSecrets", () => {
  it("removes query strings from bare URLs", () => {
    expect(stripUrlSecrets("see https://x.com/a?token=abc#frag for details")).toBe(
      "see https://x.com/a?[redacted] for details",
    );
  });
  it("leaves URLs without query strings alone", () => {
    expect(stripUrlSecrets("see https://x.com/a")).toBe("see https://x.com/a");
  });
});

describe("sanitizeForDebug", () => {
  it("redacts sensitive object keys wholesale", () => {
    const out = sanitizeForDebug({
      Authorization: "Bearer eyJabc.def.ghi",
      apiKey: "sk-real-key",
      ok: true,
      nested: { password: "hunter2", note: "fine" },
    }) as any;
    expect(out.Authorization).toBe(REDACTED);
    expect(out.apiKey).toBe(REDACTED);
    expect(out.ok).toBe(true);
    expect(out.nested.password).toBe(REDACTED);
    expect(out.nested.note).toBe("fine");
  });

  it("scrubs secrets embedded in free-form error message strings", () => {
    const out = sanitizeForDebug({
      error:
        "Upstream said: Authorization: Bearer eyJabcdefgh.payloadXYZ.sigQRS123 was rejected",
    }) as any;
    expect(out.error).toContain("Bearer [redacted]");
    expect(out.error).not.toContain("eyJabcdefgh");
  });

  it("strips signed-URL params from Supabase / S3 URLs in strings", () => {
    const out = sanitizeForDebug({
      message:
        "fetch https://abc.supabase.co/storage/v1/object/sign/x.png?token=eyJabc.def.ghi failed",
    }) as any;
    expect(out.message).toContain("?[redacted]");
    expect(out.message).not.toContain("eyJabc.def.ghi");
  });

  it("is idempotent across repeated passes", () => {
    const payload = {
      error: "Bearer eyJabcdefgh.payloadXYZ.sigQRS123 invalid",
      url: "https://x.com/a?token=secretvalue",
    };
    const once = sanitizeForDebug(payload);
    const twice = sanitizeForDebug(once);
    expect(twice).toEqual(once);
  });

  it("preserves a realistic upstream error payload", () => {
    const out = sanitizeForDebug({
      error: "Replicate returned 422: prompt safety violation",
      status: 422,
      requestId: "req_12345",
    });
    expect(out).toEqual({
      error: "Replicate returned 422: prompt safety violation",
      status: 422,
      requestId: "req_12345",
    });
  });
});
