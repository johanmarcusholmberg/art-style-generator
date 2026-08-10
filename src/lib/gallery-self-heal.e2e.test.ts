/**
 * End-to-end self-heal test for gallery aspect ratios.
 *
 * Simulates the Gallery lightbox loop (Gallery.tsx: `needsMetadataRepair`
 * → `repairImageMetadata` → local state patch) against an in-memory
 * database, feeding rows with missing or wrong `aspect_ratio` and
 * verifying every one converges to the canonical value derived from
 * `print_format_id` — and that a second pass is a complete no-op.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface Row {
  id: string;
  actual_width_px: number | null;
  actual_height_px: number | null;
  print_format_id: string | null;
  aspect_ratio: string | null;
  master_width?: number | null;
  master_height?: number | null;
}

const db = new Map<string, Row>();
const assetUpdates: Array<{ id: string; patch: Record<string, unknown> }> = [];
let writeCount = 0;

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string, patch: Record<string, unknown>) => {
    let targetId: string | null = null;
    const self: any = {
      eq: (col: string, val: unknown) => {
        if (col === "id" || col === "generated_image_id") targetId = String(val);
        return self;
      },
      is: () => self,
      then: (resolve: (v: unknown) => unknown) => {
        if (targetId) {
          if (table === "generated_images") {
            const row = db.get(targetId);
            if (row) {
              db.set(targetId, { ...row, ...(patch as Partial<Row>) });
              writeCount += 1;
            }
          } else {
            assetUpdates.push({ id: targetId, patch });
          }
        }
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return self;
  };
  return {
    supabase: {
      from: (table: string) => ({
        update: (patch: Record<string, unknown>) => makeChain(table, patch),
      }),
    },
  };
});

// Measuring the master returns the true pixel size of the fixture file.
const measured: Record<string, { width: number; height: number }> = {
  "https://cdn.test/needs-measure.png": { width: 2000, height: 2800 },
};
vi.mock("@/lib/image-metadata", () => ({
  loadImageDimensions: vi.fn(async (url: string) => {
    const dims = measured[url];
    if (!dims) throw new Error("not found");
    return dims;
  }),
}));

import { needsMetadataRepair, repairImageMetadata } from "./image-metadata-repair";

/** Mirrors the Gallery lightbox effect for one opened image. */
async function openInLightbox(row: Row, masterUrl: string | null) {
  if (!needsMetadataRepair(row)) return { opened: row, repaired: false as const };
  const res = await repairImageMetadata(row, masterUrl);
  const patched: Row = res.repaired
    ? {
        ...row,
        actual_width_px: res.width,
        actual_height_px: res.height,
        ...(res.aspectRatio ? { aspect_ratio: res.aspectRatio } : {}),
      }
    : row;
  return { opened: patched, repaired: res.repaired };
}

const fixtures: Row[] = [
  // NULL ratio, dimensions present
  { id: "a", actual_width_px: 1200, actual_height_px: 1680, print_format_id: "print_50x70", aspect_ratio: null },
  // Wrong ratio (stale from an older format)
  { id: "b", actual_width_px: 1200, actual_height_px: 1600, print_format_id: "print_30x40", aspect_ratio: "5:7" },
  // Landscape format with a portrait ratio persisted
  { id: "c", actual_width_px: 1680, actual_height_px: 1200, print_format_id: "print_70x50", aspect_ratio: "5:7" },
  // Square format, missing ratio
  { id: "d", actual_width_px: 1500, actual_height_px: 1500, print_format_id: "print_50x50", aspect_ratio: null },
  // A-series with a wrong ratio
  { id: "e", actual_width_px: 1240, actual_height_px: 1754, print_format_id: "print_a4", aspect_ratio: "2:3" },
  // Missing dimensions AND ratio — must measure the master first
  { id: "f", actual_width_px: null, actual_height_px: null, print_format_id: "print_50x70", aspect_ratio: null },
  // Already canonical — must not be touched
  { id: "g", actual_width_px: 1200, actual_height_px: 1680, print_format_id: "print_50x70", aspect_ratio: "5:7" },
];

const masterUrlFor = (id: string) =>
  id === "f" ? "https://cdn.test/needs-measure.png" : `https://cdn.test/${id}.png`;

const expectedRatio: Record<string, string> = {
  a: "5:7",
  b: "3:4",
  c: "7:5",
  d: "1:1",
  e: "ISO-A",
  f: "5:7",
  g: "5:7",
};

beforeEach(() => {
  db.clear();
  for (const row of fixtures) db.set(row.id, { ...row });
  assetUpdates.length = 0;
  writeCount = 0;
});

describe("gallery self-heal · aspect ratio (end-to-end)", () => {
  it("heals every stale/missing ratio to the canonical print-format value", async () => {
    for (const id of db.keys()) {
      const { opened } = await openInLightbox(db.get(id)!, masterUrlFor(id));
      // Local UI state matches the value written to the database.
      expect(opened.aspect_ratio).toBe(expectedRatio[id]);
      expect(db.get(id)!.aspect_ratio).toBe(expectedRatio[id]);
    }
  });

  it("measures the master only when dimensions are missing", async () => {
    for (const id of db.keys()) await openInLightbox(db.get(id)!, masterUrlFor(id));
    expect(db.get("f")).toMatchObject({ actual_width_px: 2000, actual_height_px: 2800 });
    // Rows that already had dimensions keep them untouched.
    expect(db.get("a")).toMatchObject({ actual_width_px: 1200, actual_height_px: 1680 });
    // Only the measured row syncs its versioned original asset.
    expect(assetUpdates).toEqual([
      { id: "f", patch: { width_px: 2000, height_px: 2800 } },
    ]);
  });

  it("never writes for an already-canonical row", async () => {
    const before = writeCount;
    const { repaired } = await openInLightbox(db.get("g")!, masterUrlFor("g"));
    expect(repaired).toBe(false);
    expect(writeCount).toBe(before);
  });

  it("is idempotent: a second pass repairs nothing", async () => {
    for (const id of db.keys()) await openInLightbox(db.get(id)!, masterUrlFor(id));
    const afterFirst = writeCount;
    for (const id of db.keys()) {
      const row = db.get(id)!;
      expect(needsMetadataRepair(row)).toBe(false);
      const { repaired } = await openInLightbox(row, masterUrlFor(id));
      expect(repaired).toBe(false);
    }
    expect(writeCount).toBe(afterFirst);
  });

  it("leaves the ratio alone when no print format is known", async () => {
    const row: Row = {
      id: "h",
      actual_width_px: 1000,
      actual_height_px: 1000,
      print_format_id: null,
      aspect_ratio: "9:16",
    };
    db.set("h", row);
    const { repaired, opened } = await openInLightbox(row, masterUrlFor("h"));
    expect(repaired).toBe(false);
    expect(opened.aspect_ratio).toBe("9:16");
  });
});
