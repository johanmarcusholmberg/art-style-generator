import { describe, it, expect } from "vitest";
import { resolveMatchingCollectionAnchor } from "./anchor-resolver";

const empty = {
  baseUrl: null, baseStoragePath: null, baseWidth: null, baseHeight: null,
  enhancedUrl: null, enhancedStoragePath: null, enhancedWidth: null, enhancedHeight: null,
  durableMasterUrl: null, durableMasterStoragePath: null,
  durableMasterWidth: null, durableMasterHeight: null,
  selectedUrl: null,
};

describe("resolveMatchingCollectionAnchor", () => {
  it("returns null when no URL selected", () => {
    expect(resolveMatchingCollectionAnchor({ ...empty })).toBeNull();
  });

  it("enhanced URL selected → enhanced dims, never base dims", () => {
    const r = resolveMatchingCollectionAnchor({
      ...empty,
      baseUrl: "b", baseStoragePath: "path/base", baseWidth: 100, baseHeight: 200,
      enhancedUrl: "e", enhancedStoragePath: "path/enh", enhancedWidth: 400, enhancedHeight: 800,
      selectedUrl: "e",
    })!;
    expect(r.anchorImageUrl).toBe("e");
    expect(r.anchorStoragePath).toBe("path/enh");
    expect(r.anchorWidthPx).toBe(400);
    expect(r.anchorHeightPx).toBe(800);
    expect(r.source).toBe("enhanced-persisted");
  });

  it("enhanced URL selected without persisted path → provider fallback but enhanced dims", () => {
    const r = resolveMatchingCollectionAnchor({
      ...empty,
      baseUrl: "b", baseWidth: 100, baseHeight: 200,
      enhancedUrl: "e", enhancedWidth: 400, enhancedHeight: 800,
      selectedUrl: "e",
    })!;
    expect(r.anchorStoragePath).toBeNull();
    expect(r.anchorWidthPx).toBe(400);
    expect(r.source).toBe("provider");
  });

  it("base URL selected → durable master identity preferred over base", () => {
    const r = resolveMatchingCollectionAnchor({
      ...empty,
      baseUrl: "b", baseStoragePath: "path/base", baseWidth: 100, baseHeight: 200,
      durableMasterUrl: "b", durableMasterStoragePath: "path/master",
      durableMasterWidth: 1024, durableMasterHeight: 1400,
      selectedUrl: "b",
    })!;
    expect(r.anchorStoragePath).toBe("path/master");
    expect(r.anchorWidthPx).toBe(1024);
    expect(r.source).toBe("durable-master");
  });

  it("base URL selected without durable info → persisted base", () => {
    const r = resolveMatchingCollectionAnchor({
      ...empty,
      baseUrl: "b", baseStoragePath: "path/base", baseWidth: 100, baseHeight: 200,
      selectedUrl: "b",
    })!;
    expect(r.source).toBe("base-persisted");
    expect(r.anchorStoragePath).toBe("path/base");
  });

  it("base URL selected with nothing persisted → provider fallback", () => {
    const r = resolveMatchingCollectionAnchor({
      ...empty,
      baseUrl: "b", selectedUrl: "b",
    })!;
    expect(r.source).toBe("provider");
    expect(r.anchorStoragePath).toBeNull();
    expect(r.anchorWidthPx).toBeNull();
  });

  it("URL matches neither base nor enhanced → provider-only fallback", () => {
    const r = resolveMatchingCollectionAnchor({
      ...empty,
      baseUrl: "b", baseStoragePath: "path/base", baseWidth: 10, baseHeight: 20,
      selectedUrl: "unknown-url",
    })!;
    expect(r.source).toBe("provider");
    expect(r.anchorStoragePath).toBeNull();
    expect(r.anchorWidthPx).toBeNull();
  });

  it("URL matches durable master directly", () => {
    const r = resolveMatchingCollectionAnchor({
      ...empty,
      durableMasterUrl: "m", durableMasterStoragePath: "s/m",
      durableMasterWidth: 500, durableMasterHeight: 700,
      selectedUrl: "m",
    })!;
    expect(r.source).toBe("durable-master");
    expect(r.anchorWidthPx).toBe(500);
  });

  // ── Turn 2c.2 additions ─────────────────────────────────────────

  it("corrected-master persisted wins when its URL is selected", () => {
    const r = resolveMatchingCollectionAnchor({
      ...empty,
      // Base identity refers to the RAW provider pixels — must not leak.
      baseUrl: "raw", baseStoragePath: "path/raw", baseWidth: 1094, baseHeight: 1606,
      durableMasterUrl: "raw", durableMasterStoragePath: "path/raw",
      durableMasterWidth: 1094, durableMasterHeight: 1606,
      correctedMasterUrl: "corrected", correctedMasterStoragePath: "path/corrected-v1",
      correctedMasterWidth: 1094, correctedMasterHeight: 1532,
      selectedUrl: "corrected",
    })!;
    expect(r.source).toBe("corrected-master-persisted");
    expect(r.anchorStoragePath).toBe("path/corrected-v1");
    expect(r.anchorWidthPx).toBe(1094);
    expect(r.anchorHeightPx).toBe(1532);
  });

  it("locally-finalized canvas URL never inherits raw storage identity", () => {
    const r = resolveMatchingCollectionAnchor({
      ...empty,
      baseUrl: "raw", baseStoragePath: "path/raw", baseWidth: 1094, baseHeight: 1606,
      durableMasterUrl: "raw", durableMasterStoragePath: "path/raw",
      durableMasterWidth: 1094, durableMasterHeight: 1606,
      locallyFinalizedCanvasUrl: "blob:local-canvas",
      locallyFinalizedCanvasWidth: 1094, locallyFinalizedCanvasHeight: 1532,
      selectedUrl: "blob:local-canvas",
    })!;
    expect(r.source).toBe("local-finalized-unpersisted");
    expect(r.anchorStoragePath).toBeNull();
    expect(r.anchorWidthPx).toBe(1094);
    expect(r.anchorHeightPx).toBe(1532);
  });

  it("corrected-master URL selected without persisted path → provider fallback keeps dims", () => {
    const r = resolveMatchingCollectionAnchor({
      ...empty,
      correctedMasterUrl: "cm", correctedMasterWidth: 800, correctedMasterHeight: 1120,
      selectedUrl: "cm",
    })!;
    expect(r.source).toBe("provider");
    expect(r.anchorStoragePath).toBeNull();
    expect(r.anchorWidthPx).toBe(800);
  });
});
