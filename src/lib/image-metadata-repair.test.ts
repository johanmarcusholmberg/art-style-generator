import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string, patch: Record<string, unknown>) => {
    updates.push({ table, patch });
    const self: any = {
      eq: () => self,
      is: () => self,
      then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
    };
    return self;
  };
  return {
    supabase: {
      from: (table: string) => ({ update: (patch: Record<string, unknown>) => chain(table, patch) }),
    },
  };
});

vi.mock("@/lib/image-metadata", () => ({
  loadImageDimensions: vi.fn(async () => ({ width: 1200, height: 1680 })),
}));

import {
  needsMetadataRepair,
  needsAspectRatioRepair,
  repairedAspectRatio,
  repairImageMetadata,
} from "./image-metadata-repair";
import { decodeImageDimensions } from "./image-byte-dimensions";
import { assertMetadataComplete } from "./generation-metadata-invariant";

beforeEach(() => {
  updates.length = 0;
});

describe("aspect ratio completeness", () => {
  const base = { id: "img-1", actual_width_px: 1200, actual_height_px: 1680 };

  it("flags dimensions + print format + NULL aspect ratio", () => {
    const row = { ...base, print_format_id: "print_50x70", aspect_ratio: null };
    expect(needsAspectRatioRepair(row)).toBe(true);
    expect(needsMetadataRepair(row)).toBe(true);
    expect(repairedAspectRatio(row)).toBe("5:7");
  });

  it("flags dimensions + print format + wrong aspect ratio", () => {
    const row = { ...base, print_format_id: "print_50x70", aspect_ratio: "1:1" };
    expect(needsMetadataRepair(row)).toBe(true);
    expect(repairedAspectRatio(row)).toBe("5:7");
  });

  it("treats a canonical row as complete", () => {
    const row = { ...base, print_format_id: "print_50x70", aspect_ratio: "5:7" };
    expect(needsMetadataRepair(row)).toBe(false);
  });
});

describe("gallery self-heal", () => {
  it("writes the canonical ratio without re-measuring when dimensions exist", async () => {
    const res = await repairImageMetadata(
      { id: "img-1", actual_width_px: 1200, actual_height_px: 1680, print_format_id: "print_50x70", aspect_ratio: null },
      "https://example.com/master.png",
    );
    expect(res.repaired).toBe(true);
    expect(res.aspectRatio).toBe("5:7");
    expect(updates).toEqual([
      { table: "generated_images", patch: { aspect_ratio: "5:7" } },
    ]);
  });

  it("corrects a wrong ratio too", async () => {
    const res = await repairImageMetadata(
      { id: "img-2", actual_width_px: 1200, actual_height_px: 1680, print_format_id: "print_30x40", aspect_ratio: "5:7" },
      null,
    );
    expect(res.aspectRatio).toBe("3:4");
    expect(updates[0].patch).toEqual({ aspect_ratio: "3:4" });
  });

  it("measures the master when dimensions are missing", async () => {
    const res = await repairImageMetadata(
      { id: "img-3", actual_width_px: null, actual_height_px: null, print_format_id: "print_50x70", aspect_ratio: null },
      "https://example.com/master.png",
    );
    expect(res).toMatchObject({ repaired: true, width: 1200, height: 1680, aspectRatio: "5:7" });
    expect(updates[0].patch).toMatchObject({ actual_width_px: 1200, aspect_ratio: "5:7" });
  });
});

describe("no provider-dimension fallback", () => {
  it("rejects undecodable bytes even when provider dimensions look valid", () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(decodeImageDimensions(junk)).toBeNull();
    // provider says 1024x1536 — must NOT be accepted as actual dimensions
    expect(() =>
      assertMetadataComplete({
        widthPx: decodeImageDimensions(junk)?.width ?? null,
        heightPx: decodeImageDimensions(junk)?.height ?? null,
        printFormatId: "print_50x70",
        aspectRatio: "5:7",
        generationMode: "print-ready",
      }),
    ).toThrow(/missing_dimensions/);
  });

  it("server persistence has no provider-dimension fallback", () => {
    const src = readFileSync(
      resolve(__dirname, "../../supabase/functions/_shared/persist-generation-result.ts"),
      "utf-8",
    );
    expect(src).not.toContain("decoded?.width ?? args.actualWidthPx");
    expect(src).not.toContain("decoded?.height ?? args.actualHeightPx");
    expect(src).toContain("undecodable_image_bytes");
    // aspect ratio is part of retry/repair completeness
    expect(src).toContain('(existing as Record<string, unknown>).aspect_ratio === aspectRatio');
  });
});
