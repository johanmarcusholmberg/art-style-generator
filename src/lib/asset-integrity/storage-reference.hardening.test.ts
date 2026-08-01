import { describe, it, expect } from "vitest";
import {
  normalizeStorageObjectReference,
  isAcceptedStorageHost,
  redactStorageReference,
} from "./storage-reference";

const BASE = "https://proj.supabase.co";

describe("storage reference hardening", () => {
  it("treats an unrelated host with a Supabase-looking path as external", () => {
    const r = normalizeStorageObjectReference(
      "https://evil.example.com/storage/v1/object/public/generated-images/a.png",
    );
    expect(r.kind).toBe("external");
    expect(r.identity).toBeNull();
    expect(r.isStoredObject).toBe(false);
  });

  it("never derives identity from a query string or fragment", () => {
    expect(
      normalizeStorageObjectReference(
        `${BASE}/nope.png?next=/storage/v1/object/public/generated-images/a.png`,
      ).kind,
    ).toBe("external");
    expect(
      normalizeStorageObjectReference(
        `${BASE}/nope.png#/storage/v1/object/public/generated-images/a.png`,
      ).kind,
    ).toBe("external");
  });

  it("accepts Supabase and local development storage hosts only", () => {
    expect(isAcceptedStorageHost("proj.supabase.co")).toBe(true);
    expect(isAcceptedStorageHost("localhost")).toBe(true);
    expect(isAcceptedStorageHost("supabase.co.evil.com")).toBe(false);
    expect(isAcceptedStorageHost("replicate.delivery")).toBe(false);
  });

  it("returns malformed rather than throwing on bad percent-encoding", () => {
    expect(
      normalizeStorageObjectReference(`${BASE}/storage/v1/object/public/generated-images/%E0%A4%A`)
        .kind,
    ).toBe("malformed");
    expect(normalizeStorageObjectReference("%E0%A4%A").kind).toBe("malformed");
  });

  it("returns malformed for an unparseable URL", () => {
    expect(normalizeStorageObjectReference("http://").kind).toBe("malformed");
  });

  it("redacts AWS-style signature parameters", () => {
    const out = redactStorageReference(
      `${BASE}/storage/v1/object/sign/b/a.png?X-Amz-Credential=AKIASECRET&X-Amz-Signature=SIG`,
    );
    expect(out).not.toContain("AKIASECRET");
    expect(out).not.toContain("SIG");
  });
});
