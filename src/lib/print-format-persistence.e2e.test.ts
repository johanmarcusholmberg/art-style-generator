/**
 * End-to-end test: print-ready generations must ALWAYS persist the selected
 * print format and the canonical aspect ratio on BOTH
 *
 *   1. the `generated_images` row, and
 *   2. the canonical/original `generated_image_assets` row (version 0)
 *
 * This mirrors the server sequence in
 * `supabase/functions/_shared/persist-generation-result.ts`:
 * measure bytes → assert invariant → insert/repair gallery row → sync the
 * original asset row. Dimensions come only from the persisted bytes; the
 * ratio comes only from the print format.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  assertMetadataComplete,
  canonicalAspectRatio,
  isPrintReadyGeneration,
} from "./generation-metadata-invariant";
import { decodeImageDimensions } from "./image-byte-dimensions";
import { PRINT_FORMATS } from "./print-formats";

// ---------------------------------------------------------------- fake DB

interface ImageRow {
  id: string;
  generation_job_item_id: string;
  storage_path: string;
  print_format_id: string | null;
  aspect_ratio: string | null;
  actual_width_px: number | null;
  actual_height_px: number | null;
  master_width: number | null;
  master_height: number | null;
  generation_mode: string | null;
}

interface AssetRow {
  id: string;
  generated_image_id: string;
  asset_type: string;
  version_index: number;
  storage_bucket: string;
  storage_path: string;
  width_px: number | null;
  height_px: number | null;
  print_format_id: string | null;
  aspect_ratio: string | null;
  deleted_at: string | null;
}

const images = new Map<string, ImageRow>();
const assets = new Map<string, AssetRow>();
const storage = new Map<string, Uint8Array>();
let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

// ------------------------------------------------------------- png bytes

function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(b.buffer);
  view.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return b;
}

// ------------------------------------------------------- persist sequence

interface PersistInput {
  itemId: string;
  bytes: Uint8Array;
  printFormatId: string | null;
  providedAspectRatio: string;
  generationMode: string;
  mode?: string;
}

function persist(input: PersistInput) {
  const printFormatId = input.printFormatId ?? null;
  const aspectRatio =
    canonicalAspectRatio(printFormatId, input.providedAspectRatio) ??
    input.providedAspectRatio;

  if (isPrintReadyGeneration(input.generationMode) && !printFormatId) {
    throw new Error("metadata_incomplete: missing_print_format");
  }

  const existing = [...images.values()].find(
    (r) => r.generation_job_item_id === input.itemId,
  );

  const decoded = decodeImageDimensions(input.bytes);
  if (!decoded?.width || !decoded?.height) {
    throw new Error("metadata_incomplete: undecodable_image_bytes");
  }
  const width = decoded.width;
  const height = decoded.height;

  assertMetadataComplete({
    widthPx: width,
    heightPx: height,
    printFormatId,
    aspectRatio,
    generationMode: input.generationMode,
  });

  const storagePath = existing
    ? existing.storage_path
    : `${input.mode ?? "gen"}-${input.itemId}.png`;

  let row: ImageRow;
  if (existing) {
    row = {
      ...existing,
      actual_width_px: width,
      actual_height_px: height,
      master_width: width,
      master_height: height,
      aspect_ratio: aspectRatio,
      print_format_id: existing.print_format_id ?? printFormatId,
    };
  } else {
    storage.set(storagePath, input.bytes); // upsert, deterministic path
    row = {
      id: nextId("img"),
      generation_job_item_id: input.itemId,
      storage_path: storagePath,
      print_format_id: printFormatId,
      aspect_ratio: aspectRatio,
      actual_width_px: width,
      actual_height_px: height,
      master_width: width,
      master_height: height,
      generation_mode: input.generationMode,
    };
  }
  images.set(row.id, row);

  // Sync the canonical/original asset (version 0).
  const original = [...assets.values()].find(
    (a) =>
      a.generated_image_id === row.id &&
      a.asset_type === "original" &&
      a.version_index === 0 &&
      a.deleted_at === null,
  );
  if (!original) {
    const asset: AssetRow = {
      id: nextId("asset"),
      generated_image_id: row.id,
      asset_type: "original",
      version_index: 0,
      storage_bucket: "generated-images",
      storage_path: storagePath,
      width_px: width,
      height_px: height,
      print_format_id: row.print_format_id,
      aspect_ratio: row.aspect_ratio,
      deleted_at: null,
    };
    assets.set(asset.id, asset);
  } else {
    assets.set(original.id, {
      ...original,
      storage_path: storagePath,
      width_px: width,
      height_px: height,
      print_format_id: row.print_format_id,
      aspect_ratio: row.aspect_ratio,
    });
  }

  return row;
}

function originalAssetFor(imageId: string): AssetRow {
  const a = [...assets.values()].find(
    (x) => x.generated_image_id === imageId && x.asset_type === "original",
  );
  if (!a) throw new Error("no original asset");
  return a;
}

// ------------------------------------------------------------------ tests

describe("print-ready persistence e2e: format + canonical ratio", () => {
  beforeEach(() => {
    images.clear();
    assets.clear();
    storage.clear();
    seq = 0;
  });

  it.each(PRINT_FORMATS.map((f) => [f.id, f.aspectRatio] as const))(
    "persists %s with canonical ratio %s on image AND original asset",
    (formatId, expectedRatio) => {
      const row = persist({
        itemId: `item-${formatId}`,
        bytes: pngBytes(1024, 1536),
        printFormatId: formatId,
        // Deliberately wrong provider-supplied ratio — must be overridden.
        providedAspectRatio: "16:9",
        generationMode: "print-ready",
      });

      expect(row.print_format_id).toBe(formatId);
      expect(row.aspect_ratio).toBe(expectedRatio);
      expect(row.actual_width_px).toBe(1024);
      expect(row.actual_height_px).toBe(1536);

      const asset = originalAssetFor(row.id);
      expect(asset.print_format_id).toBe(formatId);
      expect(asset.aspect_ratio).toBe(expectedRatio);
      expect(asset.width_px).toBe(1024);
      expect(asset.height_px).toBe(1536);
      expect(asset.storage_path).toBe(row.storage_path);
    },
  );

  it("refuses to persist a print-ready generation without a print format", () => {
    expect(() =>
      persist({
        itemId: "item-nofmt",
        bytes: pngBytes(1024, 1536),
        printFormatId: null,
        providedAspectRatio: "2:3",
        generationMode: "print-ready",
      }),
    ).toThrow(/missing_print_format/);
    expect(images.size).toBe(0);
    expect(assets.size).toBe(0);
  });

  it("repairs a partial row so image and asset converge on canonical values", () => {
    // Simulate a legacy/partial row written by an interrupted attempt.
    const partial: ImageRow = {
      id: "img-partial",
      generation_job_item_id: "item-partial",
      storage_path: "gen-item-partial.png",
      print_format_id: null,
      aspect_ratio: null,
      actual_width_px: null,
      actual_height_px: null,
      master_width: null,
      master_height: null,
      generation_mode: "print-ready",
    };
    images.set(partial.id, partial);

    const row = persist({
      itemId: "item-partial",
      bytes: pngBytes(2048, 2867),
      printFormatId: "print_50x70",
      providedAspectRatio: "1:1",
      generationMode: "print-ready",
    });

    expect(row.id).toBe("img-partial");
    expect(row.print_format_id).toBe("print_50x70");
    expect(row.aspect_ratio).toBe("5:7");
    expect(row.actual_width_px).toBe(2048);
    expect(row.actual_height_px).toBe(2867);

    const asset = originalAssetFor(row.id);
    expect(asset.print_format_id).toBe("print_50x70");
    expect(asset.aspect_ratio).toBe("5:7");
    expect(asset.width_px).toBe(2048);
    expect(asset.height_px).toBe(2867);
  });

  it("is idempotent: a replay produces one image row and one original asset", () => {
    const args = {
      itemId: "item-replay",
      bytes: pngBytes(1200, 1680),
      printFormatId: "print_50x70",
      providedAspectRatio: "5:7",
      generationMode: "print-ready",
    };
    const first = persist(args);
    const second = persist(args);

    expect(second.id).toBe(first.id);
    expect(images.size).toBe(1);
    expect(assets.size).toBe(1);
    expect(storage.size).toBe(1);
    expect(second.aspect_ratio).toBe("5:7");
    expect(originalAssetFor(second.id).aspect_ratio).toBe("5:7");
  });

  it("keeps the provider ratio only when no print format applies (non-print mode)", () => {
    const row = persist({
      itemId: "item-web",
      bytes: pngBytes(1024, 1024),
      printFormatId: null,
      providedAspectRatio: "1:1",
      generationMode: "standard",
    });

    expect(row.print_format_id).toBeNull();
    expect(row.aspect_ratio).toBe("1:1");
    expect(originalAssetFor(row.id).aspect_ratio).toBe("1:1");
  });
});
