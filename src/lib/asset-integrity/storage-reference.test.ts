import { describe, it, expect } from "vitest";
import {
  normalizeStorageObjectReference,
  normalizeObjectPath,
  sameStorageObject,
  isTransientAssetReference,
  redactStorageReference,
} from "./storage-reference";

const BASE = "https://proj.supabase.co";
const PUB = `${BASE}/storage/v1/object/public/generated-images/poster-a.png`;
const SIGNED = `${BASE}/storage/v1/object/sign/generated-images/poster-a.png?token=eyJhbGciOi.SECRET`;
const RENDER = `${BASE}/storage/v1/render/image/public/generated-images/poster-a.png?width=500`;

describe("normalizeStorageObjectReference", () => {
  it("1. normalizes a public canonical URL", () => {
    const r = normalizeStorageObjectReference(PUB);
    expect(r.kind).toBe("object_public");
    expect(r.bucket).toBe("generated-images");
    expect(r.path).toBe("poster-a.png");
    expect(r.identity).toBe("generated-images/poster-a.png");
    expect(r.isStoredObject).toBe(true);
  });

  it("2. normalizes a signed URL without retaining the token as identity", () => {
    const r = normalizeStorageObjectReference(SIGNED);
    expect(r.isSigned).toBe(true);
    expect(r.identity).toBe("generated-images/poster-a.png");
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });

  it("3. detects render URLs as display-only, never object identity", () => {
    const r = normalizeStorageObjectReference(RENDER);
    expect(r.kind).toBe("render_display");
    expect(r.isDisplayTransformation).toBe(true);
    expect(r.isStoredObject).toBe(false);
    expect(r.identity).toBeNull();
  });

  it("4. ignores query parameters when resolving identity", () => {
    expect(sameStorageObject(PUB, `${PUB}?v=123&cb=9`)).toBe(true);
  });

  it("5. preserves encoded object paths", () => {
    const r = normalizeStorageObjectReference(
      `${BASE}/storage/v1/object/public/generated-images/folder%20one/p%C3%B6ster.png`,
    );
    expect(r.path).toBe("folder one/pöster.png");
  });

  it("6. rejects blob URLs", () => {
    const r = normalizeStorageObjectReference("blob:http://localhost/abc");
    expect(r.kind).toBe("local");
    expect(isTransientAssetReference("blob:http://localhost/abc")).toBe(true);
  });

  it("7. rejects data URLs", () => {
    expect(normalizeStorageObjectReference("data:image/png;base64,AAA").isLocal).toBe(true);
    expect(isTransientAssetReference("data:image/png;base64,AAA")).toBe(true);
  });

  it("8. rejects external temporary provider URLs", () => {
    const r = normalizeStorageObjectReference("https://replicate.delivery/pbxt/x.png");
    expect(r.kind).toBe("external");
    expect(isTransientAssetReference("https://replicate.delivery/pbxt/x.png")).toBe(true);
  });

  it("accepts a bare bucket-relative path", () => {
    const r = normalizeStorageObjectReference("gen-123.png");
    expect(r.kind).toBe("storage_path");
    expect(r.identity).toBe("generated-images/gen-123.png");
    expect(isTransientAssetReference("gen-123.png")).toBe(false);
  });

  it("rejects path traversal and malformed paths", () => {
    expect(normalizeObjectPath("../secret.png")).toBeNull();
    expect(normalizeObjectPath("a//b.png")).toBeNull();
    expect(normalizeStorageObjectReference("../../etc/passwd").kind).toBe("malformed");
  });

  it("41. redacts signed token values in logs", () => {
    const out = redactStorageReference(SIGNED);
    expect(out).not.toContain("SECRET");
    expect(out).toContain("token=[redacted]");
    expect(redactStorageReference("data:image/png;base64,AAAA")).toBe("data:[redacted]");
  });

  it("distinguishes object/public from render/image/public", () => {
    expect(normalizeStorageObjectReference(PUB).isDisplayTransformation).toBe(false);
    expect(normalizeStorageObjectReference(RENDER).isDisplayTransformation).toBe(true);
  });
});
