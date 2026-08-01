import { describe, it, expect } from "vitest";
import {
  getImageDisplayUrl,
  getCanonicalMasterUrl,
  getThumbnailUrl,
  getPreviewUrl,
  getDisplayFallbackUrl,
  selectCanonicalDisplaySource,
  isTransformableStorageUrl,
  DISPLAY_PRESETS,
  handleDisplayImageError,
  canonicalFromTransformedUrl,
} from "./image-display-url";

const BASE = "https://proj.supabase.co/storage/v1/object/public/generated-images";
const RENDER = "https://proj.supabase.co/storage/v1/render/image/public/generated-images";

const portrait = {
  id: "img-1",
  gallery_image_id: "img-1",
  publicUrl: `${BASE}/a.png`,
  masterUrl: `${BASE}/a-corrected.png`,
  storage_path: "a.png",
  master_storage_path: "a-corrected.png",
  ratio_enforcement_status: "completed",
  master_width: 1344,
  master_height: 1888,
};

const landscape = { ...portrait, master_width: 1888, master_height: 1344 };

describe("presets", () => {
  it("thumbnail requests ~500px long edge", () => {
    const r = getImageDisplayUrl(portrait, "thumbnail");
    expect(r.transformed).toBe(true);
    expect(r.url).toContain("height=500");
    expect(r.url).not.toContain("width=");
    expect(DISPLAY_PRESETS.thumbnail.maxLongEdge).toBe(500);
  });

  it("preview requests ~1600px long edge", () => {
    const r = getImageDisplayUrl(portrait, "preview");
    expect(r.url).toContain("height=1600");
    expect(r.url).toContain("quality=82");
  });

  it("master returns the canonical URL untransformed", () => {
    const r = getImageDisplayUrl(portrait, "master");
    expect(r.transformed).toBe(false);
    expect(r.url).toBe(portrait.masterUrl);
    expect(r.url).not.toContain("render/image");
  });
});

describe("aspect ratio", () => {
  it("preserves portrait ratio by constraining height", () => {
    expect(getThumbnailUrl(portrait)).toContain("height=500");
  });

  it("preserves landscape ratio by constraining width", () => {
    const u = getThumbnailUrl(landscape);
    expect(u).toContain("width=500");
    expect(u).not.toContain("height=");
  });

  it("never crops — always resize=contain", () => {
    expect(getPreviewUrl(portrait)).toContain("resize=contain");
    expect(getPreviewUrl(landscape)).toContain("resize=contain");
    expect(getThumbnailUrl(portrait)).not.toContain("cover");
  });

  it("unknown dimensions contain within a square box without distortion", () => {
    const u = getThumbnailUrl({ ...portrait, master_width: null, master_height: null });
    expect(u).toContain("width=500");
    expect(u).toContain("height=500");
    expect(u).toContain("resize=contain");
  });
});

describe("canonical source selection", () => {
  it("prefers corrected canonical master when finalization completed", () => {
    expect(selectCanonicalDisplaySource(portrait)).toEqual({
      url: portrait.masterUrl,
      sourceKind: "canonical_master",
    });
  });

  it("uses persisted original when finalization is not_required", () => {
    const s = selectCanonicalDisplaySource({
      ...portrait,
      masterUrl: null,
      ratio_enforcement_status: "not_required",
    });
    expect(s.sourceKind).toBe("persisted_source");
    expect(s.url).toBe(portrait.publicUrl);
  });

  it("missing canonical identity does not produce a master-ready result", () => {
    const s = selectCanonicalDisplaySource({
      ...portrait,
      id: null,
      gallery_image_id: null,
    });
    expect(s.sourceKind).not.toBe("canonical_master");
  });

  it("missing canonical dimensions does not produce a master-ready result", () => {
    const s = selectCanonicalDisplaySource({
      ...portrait,
      master_width: 0,
      master_height: 0,
      actual_width_px: null,
      actual_height_px: null,
    });
    expect(s.sourceKind).not.toBe("canonical_master");
  });
});

describe("non-persisted sources", () => {
  it("does not transform blob/object URLs", () => {
    const r = getImageDisplayUrl({ url: "blob:http://localhost/abc" }, "preview");
    expect(r.transformed).toBe(false);
    expect(r.sourceKind).toBe("local_preview");
    expect(r.url).toBe("blob:http://localhost/abc");
  });

  it("does not transform base64 previews", () => {
    const r = getImageDisplayUrl({ url: "data:image/png;base64,AAAA" }, "thumbnail");
    expect(r.transformed).toBe(false);
    expect(r.sourceKind).toBe("local_preview");
  });

  it("does not transform external provider URLs before persistence", () => {
    const r = getImageDisplayUrl({ url: "https://replicate.delivery/x.png" }, "preview");
    expect(r.transformed).toBe(false);
    expect(r.sourceKind).toBe("external_source");
    expect(r.url).toBe("https://replicate.delivery/x.png");
  });

  it("classifies transformable URLs correctly", () => {
    expect(isTransformableStorageUrl(`${BASE}/a.png`)).toBe(true);
    expect(isTransformableStorageUrl("blob:x")).toBe(false);
    expect(isTransformableStorageUrl("https://example.com/a.png")).toBe(false);
  });
});

describe("fallback", () => {
  it("falls back to the canonical URL when a transformed URL fails", () => {
    const failed = getPreviewUrl(portrait);
    expect(getDisplayFallbackUrl(portrait, failed)).toBe(portrait.masterUrl);
  });

  it("does not loop when the canonical URL itself failed", () => {
    expect(getDisplayFallbackUrl(portrait, portrait.masterUrl)).toBeNull();
  });

  it("reports no_source without throwing", () => {
    const r = getImageDisplayUrl({}, "thumbnail");
    expect(r.url).toBe("");
    expect(r.fallbackUsed).toBe(true);
  });
});

describe("print / download selectors", () => {
  it("getCanonicalMasterUrl never returns a transformed URL", () => {
    expect(getCanonicalMasterUrl(portrait)).toBe(portrait.masterUrl);
    expect(getCanonicalMasterUrl(portrait)).not.toContain("render/image");
  });

  it("master purpose never returns a render URL even for a rendered input", () => {
    const r = getImageDisplayUrl(
      { ...portrait, masterUrl: `${BASE}/a-corrected.png` },
      "master",
    );
    expect(r.url).not.toContain(RENDER);
  });
});

describe("determinism", () => {
  it("stable inputs produce stable transformation URLs", () => {
    expect(getPreviewUrl(portrait)).toBe(getPreviewUrl({ ...portrait }));
    expect(getThumbnailUrl(portrait)).toBe(getThumbnailUrl({ ...portrait }));
  });

  it("does not append random cache-busting values", () => {
    expect(getPreviewUrl(portrait)).not.toMatch(/[?&](t|_|cb|rand)=/);
  });

  it("re-rendering an already-rendered URL is idempotent", () => {
    const once = getPreviewUrl(portrait);
    const twice = getPreviewUrl({ ...portrait, masterUrl: once });
    expect(twice).toBe(once);
  });
});

describe("handleDisplayImageError (canonical fallback, one-shot)", () => {
  const RENDER =
    "https://x.supabase.co/storage/v1/render/image/public/generated-images/a.png?width=500&resize=contain&quality=80";
  const OBJECT =
    "https://x.supabase.co/storage/v1/object/public/generated-images/a.png";

  function fakeImg(src: string) {
    return { src, currentSrc: src, dataset: {} as Record<string, string> } as unknown as HTMLImageElement;
  }

  it("falls back to the canonical object URL exactly once", () => {
    const el = fakeImg(RENDER);
    handleDisplayImageError(el, { storage_path: "a.png", publicUrl: OBJECT });
    expect(el.src).toBe(OBJECT);
    // Second failure must not retry.
    el.currentSrc = el.src;
    handleDisplayImageError(el, { storage_path: "a.png", publicUrl: OBJECT });
    expect(el.src).toBe(OBJECT);
  });

  it("derives the canonical URL when no metadata is available", () => {
    const el = fakeImg(RENDER);
    handleDisplayImageError(el, { url: RENDER, publicUrl: RENDER });
    expect(el.src).toBe(OBJECT);
  });

  it("does nothing for a failed canonical URL (no loop)", () => {
    const el = fakeImg(OBJECT);
    handleDisplayImageError(el, { storage_path: "a.png", publicUrl: OBJECT });
    expect(el.src).toBe(OBJECT);
  });

  it("canonicalFromTransformedUrl ignores non-render URLs", () => {
    expect(canonicalFromTransformedUrl(OBJECT)).toBeNull();
    expect(canonicalFromTransformedUrl("blob:abc")).toBeNull();
    expect(canonicalFromTransformedUrl(RENDER)).toBe(OBJECT);
  });
});
