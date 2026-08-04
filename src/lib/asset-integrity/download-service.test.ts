/**
 * Turn 4B — exact master download tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extensionFromPath,
  resolveMasterExtension,
  sanitizeMasterFilename,
  buildMasterFilename,
  fetchCanonicalMaster,
} from "./download-service";
import type { CanonicalActionSource } from "./source-resolver";

const src = (over: Partial<CanonicalActionSource> = {}): CanonicalActionSource => ({
  ok: true,
  kind: "canonical_master",
  url: "https://p.supabase.co/storage/v1/object/public/generated-images/u/a.png",
  bucket: "generated-images",
  path: "u/a.png",
  width: 100,
  height: 200,
  label: "Print master",
  reason: null,
  warnings: [],
  ...over,
});

describe("filenames", () => {
  it("derives the extension from the stored path first", () => {
    expect(extensionFromPath("u/a.jpg")).toBe("jpg");
    expect(extensionFromPath("u/a")).toBeNull();
    expect(resolveMasterExtension({ path: "u/a.jpeg" })).toBe("jpg");
    expect(resolveMasterExtension({ path: "u/a" }, "image/webp")).toBe("webp");
    expect(resolveMasterExtension({ path: null }, "application/octet-stream")).toBe("png");
  });

  it("sanitizes and never double-appends an extension", () => {
    expect(sanitizeMasterFilename("art/1: master.png")).toBe("art-1-master");
    expect(buildMasterFilename("art.png", { path: "u/a.png" })).toBe("art.png");
  });
});

describe("fetchCanonicalMaster", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn() as any; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("refuses unresolved sources", async () => {
    await expect(
      fetchCanonicalMaster(src({ ok: false, url: null, reason: "nope" }), "a"),
    ).rejects.toThrow("nope");
  });

  it("refuses unsaved session images", async () => {
    await expect(
      fetchCanonicalMaster(src({ kind: "session_preview" }), "a"),
    ).rejects.toThrow(/Save this image/);
  });

  it("returns exact bytes without re-encoding", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    (globalThis.fetch as any).mockResolvedValue({ ok: true, blob: async () => blob, headers: new Headers() });
    const r = await fetchCanonicalMaster(src(), "my art");
    expect(r.bytes).toBe(3);
    expect(r.filename).toBe("my-art.png");
    expect(r.blob).toBe(blob);
  });

  it("surfaces HTTP and empty-object failures", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 404, headers: new Headers() });
    await expect(fetchCanonicalMaster(src(), "a")).rejects.toThrow(/HTTP 404/);

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      blob: async () => new Blob([], { type: "image/png" }),
      headers: new Headers(),
    });
    await expect(fetchCanonicalMaster(src(), "a")).rejects.toThrow(/empty/);
  });
});
