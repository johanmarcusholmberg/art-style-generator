/**
 * Turn 4B — shared action-source contract tests.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: (p: string) => ({
          data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/generated-images/${p}` },
        }),
      }),
    },
  },
}));

import {
  classifyActionCandidate,
  resolveActionSourceFromRow,
  resolveSessionActionSource,
  describeActionSource,
} from "./source-resolver";

const url = (b: string, p: string) => `https://x/storage/v1/object/public/${b}/${p}`;

describe("classifyActionCandidate", () => {
  it("rejects render/image display URLs", () => {
    const r = classifyActionCandidate(
      "https://proj.supabase.co/storage/v1/render/image/public/generated-images/a.png?width=500",
    );
    expect(r.usable).toBe(false);
    expect(r.reason).toMatch(/display-only/);
  });

  it("rejects blob: and data: previews", () => {
    expect(classifyActionCandidate("blob:http://x/1").usable).toBe(false);
    expect(classifyActionCandidate("data:image/png;base64,AAA").usable).toBe(false);
  });

  it("rejects external provider URLs", () => {
    expect(classifyActionCandidate("https://replicate.delivery/x.png").usable).toBe(false);
  });

  it("accepts bare storage paths and public object URLs", () => {
    expect(classifyActionCandidate("user/a.png").usable).toBe(true);
    expect(
      classifyActionCandidate("https://p.supabase.co/storage/v1/object/public/generated-images/a.png")
        .usable,
    ).toBe(true);
  });
});

describe("resolveActionSourceFromRow", () => {
  it("prefers the master storage path for downloads and exports", () => {
    const src = resolveActionSourceFromRow(
      { master_storage_path: "u/master.png", storage_path: "u/base.png", enhanced_width_px: 6000, enhanced_height_px: 8400 },
      { intent: "download_master", urlBuilder: url },
    );
    expect(src.ok).toBe(true);
    expect(src.kind).toBe("canonical_master");
    expect(src.path).toBe("u/master.png");
    expect(describeActionSource(src)).toContain("6000×8400");
  });

  it("falls back to the base image with a warning when no master exists", () => {
    const src = resolveActionSourceFromRow(
      { storage_path: "u/base.png" },
      { intent: "download_master", urlBuilder: url },
    );
    expect(src.ok).toBe(true);
    expect(src.label).toBe("Original");
    expect(src.warnings.join(" ")).toMatch(/No enhanced master/);
  });

  it("returns the original for download_original even when a master exists", () => {
    const src = resolveActionSourceFromRow(
      { master_storage_path: "u/master.png", original_storage_path: "u/orig.png" },
      { intent: "download_original", urlBuilder: url },
    );
    expect(src.path).toBe("u/orig.png");
    expect(src.label).toBe("Original");
  });

  it("never resolves to a display transformation URL", () => {
    const src = resolveActionSourceFromRow(
      { masterUrl: "https://p.supabase.co/storage/v1/render/image/public/generated-images/a.png" },
      { intent: "print_export", urlBuilder: url },
    );
    expect(src.ok).toBe(false);
    expect(src.reason).toMatch(/No persisted master/);
  });

  it("is unavailable for an empty row", () => {
    expect(resolveActionSourceFromRow(null, { intent: "download_master" }).ok).toBe(false);
    expect(resolveActionSourceFromRow({}, { intent: "download_master" }).ok).toBe(false);
  });
});

describe("resolveSessionActionSource", () => {
  it("blocks print export from an unsaved session image", () => {
    const src = resolveSessionActionSource("blob:http://x/1", "print_export");
    expect(src.ok).toBe(false);
    expect(src.kind).toBe("unavailable");
    expect(src.url).toBeNull();
    expect(src.reason).toMatch(/not saved yet/);
  });

  it("blocks print export and master download from data: previews", () => {
    for (const intent of ["print_export", "download_master"] as const) {
      const src = resolveSessionActionSource("data:image/png;base64,AAA", intent);
      expect(src.ok).toBe(false);
      expect(src.url).toBeNull();
    }
  });

  it("blocks external provider URLs for every production action", () => {
    for (const intent of ["print_export", "download_master", "download_original"] as const) {
      const src = resolveSessionActionSource("https://replicate.delivery/x.png", intent);
      expect(src.ok).toBe(false);
      expect(src.kind).toBe("unavailable");
      expect(src.url).toBeNull();
    }
  });

  it("blocks display transformation URLs", () => {
    const src = resolveSessionActionSource(
      "https://p.supabase.co/storage/v1/render/image/public/generated-images/u/a.png?width=500",
      "print_export",
    );
    expect(src.ok).toBe(false);
  });

  it("blocks an exact master download from an unsaved session image", () => {
    const src = resolveSessionActionSource("blob:http://x/1", "download_master");
    expect(src.ok).toBe(false);
    expect(src.reason).toMatch(/not saved yet/);
  });


  it("upgrades a persisted storage URL to a canonical master", () => {
    const src = resolveSessionActionSource(
      "https://p.supabase.co/storage/v1/object/public/generated-images/u/a.png",
      "download_master",
    );
    expect(src.ok).toBe(true);
    expect(src.path).toBe("u/a.png");
  });
});
