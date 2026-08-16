/**
 * Offline integration/regression suite for EVERY code path that creates or
 * updates `generated_images` / `generated_image_assets`.
 *
 * Audited paths (see the report in chat):
 *   1. Durable generation persist  — supabase/functions/_shared/persist-generation-result.ts
 *      (the single writer for ALL providers: gemini, sdxl/replicate, openai, lovable)
 *   2. Versioned asset creation    — src/lib/generated-image-assets.ts (upscale versions)
 *   3. Client self-heal            — src/lib/image-metadata-repair.ts
 *   4. Backfill planner            — supabase/functions/_shared/metadata-backfill-plan.ts
 *   5. Shared validator            — src/lib/metadata-validator.ts (single implementation)
 *
 * The harness below mirrors the server persist sequence 1:1 (measure bytes →
 * assert invariant → insert/repair row → sync original asset) and drives it
 * with per-provider outcomes. Every assertion about "trustworthiness" goes
 * through the shared validator — no second implementation is introduced.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  assertMetadataComplete,
  canonicalAspectRatio,
  isPrintReadyGeneration,
} from "./generation-metadata-invariant";
import { decodeImageDimensions } from "./image-byte-dimensions";
import {
  validateGeneratedImageMetadata,
  validateGeneratedImageWithAsset,
  type GeneratedImageMetadataRow,
  type GeneratedImageAssetRow,
} from "./metadata-validator";
import {
  needsMetadataRepair,
  needsAspectRatioRepair,
  repairedAspectRatio,
} from "./image-metadata-repair";
import {
  planRowBackfill,
  planIsNoop,
} from "../../supabase/functions/_shared/metadata-backfill-plan";

// ───────────────────────────────────────────────────────────── fake storage

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

/** Bytes no decoder can read (e.g. an HTML error page returned by a CDN). */
const UNDECODABLE = new TextEncoder().encode("<html>rate limited</html>");

// ───────────────────────────────────────────────────────────────── fake db

interface ImageRow extends GeneratedImageMetadataRow {
  id: string;
  generation_job_item_id: string;
  generation_provider: string | null;
}
interface AssetRow extends GeneratedImageAssetRow {
  id: string;
  generated_image_id: string;
  source_asset_id: string | null;
}

let images: ImageRow[] = [];
let assets: AssetRow[] = [];
let storage: Map<string, Uint8Array>;
let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

// ───────────────────────────────────────── mirrored server persist sequence

interface ProviderOutcome {
  providerId: "gemini" | "sdxl" | "openai" | "lovable";
  /** Provider-reported dimensions — DIAGNOSTICS ONLY, never persisted. */
  reportedWidth?: number | null;
  reportedHeight?: number | null;
  bytes: Uint8Array;
}

interface PersistInput {
  itemId: string;
  outcome: ProviderOutcome;
  printFormatId: string | null;
  /** Whatever the client/provider claimed — the format always wins. */
  providedAspectRatio: string;
  generationMode: string;
  mode?: string;
}

let bytesDecoded = 0;

function persist(input: PersistInput): ImageRow {
  const printFormatId = input.printFormatId ?? null;
  const aspectRatio =
    canonicalAspectRatio(printFormatId, input.providedAspectRatio) ??
    input.providedAspectRatio;

  if (isPrintReadyGeneration(input.generationMode) && !printFormatId) {
    throw new Error("metadata_incomplete: missing_print_format");
  }

  const existing = images.find((r) => r.generation_job_item_id === input.itemId);
  const existingComplete =
    !!existing &&
    !!existing.actual_width_px &&
    !!existing.actual_height_px &&
    (!isPrintReadyGeneration(input.generationMode) || !!existing.print_format_id) &&
    existing.aspect_ratio === aspectRatio;
  if (existing && existingComplete) return existing;

  // Provider-reported dimensions are NEVER used — the bytes are measured.
  bytesDecoded++;
  const decoded = decodeImageDimensions(input.outcome.bytes);
  if (!decoded?.width || !decoded?.height) {
    throw new Error(
      "metadata_incomplete: undecodable_image_bytes (provider dimensions are diagnostics only)",
    );
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

  const storagePath = existing?.storage_path ?? `${input.mode ?? "gen"}-${input.itemId}.png`;

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
    images = images.map((r) => (r.id === row.id ? row : r));
  } else {
    storage.set(storagePath, input.outcome.bytes); // deterministic + upsert
    row = {
      id: nextId("img"),
      generation_job_item_id: input.itemId,
      generation_provider: input.outcome.providerId,
      storage_path: storagePath,
      master_storage_path: storagePath,
      print_format_id: printFormatId,
      aspect_ratio: aspectRatio,
      actual_width_px: width,
      actual_height_px: height,
      master_width: width,
      master_height: height,
      generation_mode: input.generationMode,
    };
    images.push(row);
  }

  // Sync canonical/original asset (version 0).
  const original = assets.find(
    (a) =>
      a.generated_image_id === row.id &&
      a.asset_type === "original" &&
      a.version_index === 0 &&
      !a.deleted_at,
  );
  if (!original) {
    assets.push({
      id: nextId("asset"),
      generated_image_id: row.id,
      asset_type: "original",
      version_index: 0,
      source_asset_id: null,
      storage_path: storagePath,
      width_px: width,
      height_px: height,
      deleted_at: null,
    });
  } else {
    Object.assign(original, {
      storage_path: row.master_storage_path ?? storagePath,
      width_px: width,
      height_px: height,
    });
  }
  return row;
}

function originalAssetFor(imageId: string): AssetRow {
  const a = assets.find(
    (x) => x.generated_image_id === imageId && x.asset_type === "original" && !x.deleted_at,
  );
  if (!a) throw new Error("no original asset");
  return a;
}

/** Mirror of saveUpscaleAsset: version rows measure their own bytes. */
function saveVersionAsset(imageId: string, bytes: Uint8Array): AssetRow {
  const decoded = decodeImageDimensions(bytes);
  if (!decoded) throw new Error("metadata_incomplete: undecodable_image_bytes");
  const versionIdx =
    assets.filter((a) => a.generated_image_id === imageId).length;
  const path = `upscales/${imageId}/v${versionIdx}.png`;
  storage.set(path, bytes);
  const asset: AssetRow = {
    id: nextId("asset"),
    generated_image_id: imageId,
    asset_type: "upscale",
    version_index: versionIdx,
    source_asset_id: originalAssetFor(imageId).id,
    storage_path: path,
    width_px: decoded.width,
    height_px: decoded.height,
    deleted_at: null,
  };
  assets.push(asset);
  return asset;
}

const PROVIDERS: ProviderOutcome["providerId"][] = [
  "gemini",
  "sdxl",
  "openai",
  "lovable",
];

beforeEach(() => {
  images = [];
  assets = [];
  storage = new Map();
  seq = 0;
  bytesDecoded = 0;
});

// ─────────────────────────────────────────────────────────────────── tests

describe("provider persistence guarantees", () => {
  it.each(PROVIDERS)(
    "%s: cannot persist an image whose bytes carry no valid dimensions",
    (providerId) => {
      expect(() =>
        persist({
          itemId: `item-${providerId}`,
          outcome: { providerId, bytes: UNDECODABLE },
          printFormatId: "print_50x70",
          providedAspectRatio: "5:7",
          generationMode: "print-ready",
        }),
      ).toThrow(/undecodable_image_bytes/);
      expect(images).toHaveLength(0);
      expect(assets).toHaveLength(0);
    },
  );

  it.each(PROVIDERS)(
    "%s: provider-reported dimensions are ignored; the measured bytes win",
    (providerId) => {
      const row = persist({
        itemId: `item-${providerId}`,
        outcome: {
          providerId,
          // deliberately wrong "provider" metadata
          reportedWidth: 1024,
          reportedHeight: 1024,
          bytes: pngBytes(2000, 2800),
        },
        printFormatId: "print_50x70",
        providedAspectRatio: "1:1",
        generationMode: "print-ready",
      });
      expect(row.actual_width_px).toBe(2000);
      expect(row.actual_height_px).toBe(2800);
      // Client-claimed ratio is overridden by the canonical print-format ratio.
      expect(row.aspect_ratio).toBe("5:7");
      expect(validateGeneratedImageMetadata(row).ok).toBe(true);
    },
  );

  it("gemini omitting dimensions entirely still persists measured truth", () => {
    const row = persist({
      itemId: "item-gemini-null",
      outcome: {
        providerId: "gemini",
        reportedWidth: null,
        reportedHeight: null,
        bytes: pngBytes(1200, 1680),
      },
      printFormatId: "print_50x70",
      providedAspectRatio: "5:7",
      generationMode: "print-ready",
    });
    expect(bytesDecoded).toBe(1);
    expect(row.actual_width_px).toBe(1200);
    expect(row.actual_height_px).toBe(1680);
    expect(row.actual_width_px).not.toBeNull();
    expect(originalAssetFor(row.id).width_px).toBe(1200);
  });

  it.each(PROVIDERS)(
    "%s: print-ready generations without a print format are refused",
    (providerId) => {
      expect(() =>
        persist({
          itemId: `item-${providerId}-noformat`,
          outcome: { providerId, bytes: pngBytes(1000, 1400) },
          printFormatId: null,
          providedAspectRatio: "5:7",
          generationMode: "print-ready",
        }),
      ).toThrow(/missing_print_format/);
      expect(images).toHaveLength(0);
    },
  );
});

describe("incorrect metadata detection via the shared validator", () => {
  it("flags a stale aspect ratio that disagrees with the print format", () => {
    const row = persist({
      itemId: "item-ratio",
      outcome: { providerId: "sdxl", bytes: pngBytes(2000, 2800) },
      printFormatId: "print_50x70",
      providedAspectRatio: "5:7",
      generationMode: "print-ready",
    });
    const tampered = { ...row, aspect_ratio: "2:3" };
    const res = validateGeneratedImageMetadata(tampered);
    expect(res.ok).toBe(false);
    expect(res.errors.map((e) => e.code)).toContain("aspect_ratio_mismatch");
    expect(res.canonicalAspectRatio).toBe("5:7");
  });

  it("flags null dimensions as untrustworthy", () => {
    const res = validateGeneratedImageMetadata({
      actual_width_px: null,
      actual_height_px: null,
      print_format_id: "print_50x70",
      aspect_ratio: "5:7",
      generation_mode: "print-ready",
    });
    expect(res.ok).toBe(false);
    expect(res.errors.map((e) => e.code)).toContain("missing_dimensions");
  });

  it("warns when persisted pixels drift from the declared print format", () => {
    const res = validateGeneratedImageMetadata({
      actual_width_px: 2000,
      actual_height_px: 2000,
      print_format_id: "print_50x70",
      aspect_ratio: "5:7",
      generation_mode: "print-ready",
    });
    expect(res.warnings.map((w) => w.code)).toContain("dimension_ratio_drift");
  });
});

describe("generated_images / generated_image_assets cannot silently diverge", () => {
  it("persist keeps the original asset in lockstep with the master row", () => {
    const row = persist({
      itemId: "item-sync",
      outcome: { providerId: "openai", bytes: pngBytes(1536, 2048) },
      printFormatId: "print_3x4",
      providedAspectRatio: "3:4",
      generationMode: "print-ready",
    });
    expect(validateGeneratedImageWithAsset(row, originalAssetFor(row.id)).ok).toBe(true);
  });

  it("detects a divergent original asset (dimensions)", () => {
    const row = persist({
      itemId: "item-div",
      outcome: { providerId: "gemini", bytes: pngBytes(1536, 2048) },
      printFormatId: "print_3x4",
      providedAspectRatio: "3:4",
      generationMode: "print-ready",
    });
    const drifted = { ...originalAssetFor(row.id), width_px: 999 };
    const res = validateGeneratedImageWithAsset(row, drifted);
    expect(res.ok).toBe(false);
    expect(res.errors.map((e) => e.code)).toContain("asset_dimension_mismatch");
  });

  it("detects an original asset pointing at a different object", () => {
    const row = persist({
      itemId: "item-div2",
      outcome: { providerId: "lovable", bytes: pngBytes(1536, 2048) },
      printFormatId: "print_3x4",
      providedAspectRatio: "3:4",
      generationMode: "print-ready",
    });
    const drifted = { ...originalAssetFor(row.id), storage_path: "somewhere/else.png" };
    const res = validateGeneratedImageWithAsset(row, drifted);
    expect(res.errors.map((e) => e.code)).toContain("asset_storage_path_mismatch");
  });

  it("re-persisting an incomplete row repairs it AND re-syncs the asset", () => {
    // Simulate a legacy/partial row created before the invariant existed.
    const legacy: ImageRow = {
      id: nextId("img"),
      generation_job_item_id: "item-legacy",
      generation_provider: "gemini",
      storage_path: "gen-item-legacy.png",
      master_storage_path: "gen-item-legacy.png",
      actual_width_px: null,
      actual_height_px: null,
      master_width: null,
      master_height: null,
      print_format_id: null,
      aspect_ratio: "1:1",
      generation_mode: "print-ready",
    };
    images.push(legacy);
    assets.push({
      id: nextId("asset"),
      generated_image_id: legacy.id,
      asset_type: "original",
      version_index: 0,
      source_asset_id: null,
      storage_path: legacy.storage_path!,
      width_px: null,
      height_px: null,
      deleted_at: null,
    });
    expect(validateGeneratedImageMetadata(legacy).ok).toBe(false);

    const repaired = persist({
      itemId: "item-legacy",
      outcome: { providerId: "gemini", bytes: pngBytes(2000, 2800) },
      printFormatId: "print_50x70",
      providedAspectRatio: "5:7",
      generationMode: "print-ready",
    });
    expect(repaired.aspect_ratio).toBe("5:7");
    expect(repaired.actual_width_px).toBe(2000);
    expect(
      validateGeneratedImageWithAsset(repaired, originalAssetFor(repaired.id)).ok,
    ).toBe(true);

    // Second pass is a pure no-op: no bytes re-fetched, no writes.
    const before = bytesDecoded;
    persist({
      itemId: "item-legacy",
      outcome: { providerId: "gemini", bytes: pngBytes(2000, 2800) },
      printFormatId: "print_50x70",
      providedAspectRatio: "5:7",
      generationMode: "print-ready",
    });
    expect(bytesDecoded).toBe(before);
    expect(images).toHaveLength(1);
  });
});

describe("regeneration and version creation preserve metadata", () => {
  it("a regeneration item persists its own complete, independent metadata", () => {
    const first = persist({
      itemId: "item-a",
      outcome: { providerId: "gemini", bytes: pngBytes(2000, 2800) },
      printFormatId: "print_50x70",
      providedAspectRatio: "5:7",
      generationMode: "print-ready",
    });
    const regen = persist({
      itemId: "item-a-regen",
      outcome: { providerId: "sdxl", bytes: pngBytes(2400, 3360) },
      printFormatId: "print_50x70",
      providedAspectRatio: "5:7",
      generationMode: "print-ready",
    });
    expect(regen.id).not.toBe(first.id);
    for (const row of [first, regen]) {
      expect(validateGeneratedImageWithAsset(row, originalAssetFor(row.id)).ok).toBe(true);
      expect(row.aspect_ratio).toBe("5:7");
    }
    expect(images).toHaveLength(2);
    expect(assets.filter((a) => a.asset_type === "original")).toHaveLength(2);
  });

  it("creating an upscale version measures its own bytes and leaves the master valid", () => {
    const row = persist({
      itemId: "item-v",
      outcome: { providerId: "openai", bytes: pngBytes(2000, 2800) },
      printFormatId: "print_50x70",
      providedAspectRatio: "5:7",
      generationMode: "print-ready",
    });
    const version = saveVersionAsset(row.id, pngBytes(4000, 5600));
    expect(version.width_px).toBe(4000);
    expect(version.height_px).toBe(5600);
    // The version does NOT overwrite the canonical original.
    expect(originalAssetFor(row.id).width_px).toBe(2000);
    expect(validateGeneratedImageWithAsset(row, originalAssetFor(row.id)).ok).toBe(true);
  });

  it("an upscale version with unreadable bytes is refused", () => {
    const row = persist({
      itemId: "item-v2",
      outcome: { providerId: "sdxl", bytes: pngBytes(1000, 1400) },
      printFormatId: "print_50x70",
      providedAspectRatio: "5:7",
      generationMode: "print-ready",
    });
    expect(() => saveVersionAsset(row.id, UNDECODABLE)).toThrow(/undecodable/);
    expect(assets.filter((a) => a.asset_type === "upscale")).toHaveLength(0);
  });
});

describe("self-heal and backfill apply the same canonical rules", () => {
  it("self-heal agrees with the validator about which rows are broken", () => {
    const rows: GeneratedImageMetadataRow[] = [
      {
        actual_width_px: 2000,
        actual_height_px: 2800,
        print_format_id: "print_50x70",
        aspect_ratio: "5:7",
      },
      {
        actual_width_px: 2000,
        actual_height_px: 2800,
        print_format_id: "print_50x70",
        aspect_ratio: "2:3",
      },
      {
        actual_width_px: null,
        actual_height_px: null,
        print_format_id: "print_50x70",
        aspect_ratio: "5:7",
      },
    ];
    const repairFlags = rows.map((r) =>
      needsMetadataRepair({ id: "x", ...r } as never),
    );
    const validatorFlags = rows.map((r) => !validateGeneratedImageMetadata(r).ok);
    expect(repairFlags).toEqual([false, true, true]);
    expect(validatorFlags).toEqual(repairFlags);
  });

  it("self-heal derives the same canonical ratio the persist path writes", () => {
    const row = persist({
      itemId: "item-heal",
      outcome: { providerId: "gemini", bytes: pngBytes(2000, 2800) },
      printFormatId: "print_50x70",
      providedAspectRatio: "9:16",
      generationMode: "print-ready",
    });
    expect(
      repairedAspectRatio({ id: row.id, print_format_id: "print_50x70", aspect_ratio: "9:16" }),
    ).toBe(row.aspect_ratio);
    expect(
      needsAspectRatioRepair({ id: row.id, print_format_id: "print_50x70", aspect_ratio: "9:16" }),
    ).toBe(true);
  });

  it("the backfill planner converges a broken row onto validator-clean truth", () => {
    const broken = {
      id: "legacy-1",
      actual_width_px: null,
      actual_height_px: null,
      print_format_id: null,
      aspect_ratio: "1:1",
      storage_path: "legacy/1.png",
      master_storage_path: "legacy/1.png",
    };
    const asset = {
      id: "legacy-asset-1",
      width_px: null,
      height_px: null,
      storage_path: "legacy/1.png",
    };

    const first = planRowBackfill(broken, asset, null);
    expect(first.needsMeasurement).toBe(true);

    const measured = { width: 2000, height: 2800 };
    const plan = planRowBackfill(broken, asset, measured);
    const healed = { ...broken, ...plan.imagePatch } as GeneratedImageMetadataRow;
    const healedAsset = { ...asset, ...plan.assetPatch } as GeneratedImageAssetRow;

    expect(healed.print_format_id).toBe("print_50x70");
    expect(healed.aspect_ratio).toBe("5:7");
    expect(validateGeneratedImageWithAsset(healed, healedAsset).ok).toBe(true);

    // Idempotent: a second pass writes nothing.
    const second = planRowBackfill(
      {
        ...broken,
        ...plan.imagePatch,
        id: "legacy-1",
        storage_path: "legacy/1.png",
        master_storage_path: "legacy/1.png",
      },
      { ...asset, ...plan.assetPatch },
      measured,
    );
    expect(planIsNoop(second)).toBe(true);
  });


  it("a freshly persisted row is already a backfill no-op", () => {
    const row = persist({
      itemId: "item-noop",
      outcome: { providerId: "lovable", bytes: pngBytes(2000, 2800) },
      printFormatId: "print_50x70",
      providedAspectRatio: "5:7",
      generationMode: "print-ready",
    });
    const asset = originalAssetFor(row.id);
    const plan = planRowBackfill(
      {
        id: row.id,
        actual_width_px: row.actual_width_px ?? null,
        actual_height_px: row.actual_height_px ?? null,
        print_format_id: row.print_format_id ?? null,
        aspect_ratio: row.aspect_ratio ?? null,
        storage_path: row.storage_path ?? null,
        master_storage_path: row.master_storage_path ?? null,
      },
      { width_px: asset.width_px ?? null, height_px: asset.height_px ?? null, storage_path: asset.storage_path ?? null },
      { width: row.actual_width_px as number, height: row.actual_height_px as number },
    );
    expect(planIsNoop(plan)).toBe(true);
  });
});
