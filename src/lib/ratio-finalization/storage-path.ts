/**
 * Deterministic corrected-master storage-path helper.
 *
 * Convention (bucket: `generated-images`):
 *   ratio-finalized/{galleryImageId}/{safeFormatId}/{algorithmVersion}/{itemId}.{ext}
 *
 * - No timestamps or randomness — same input → same path.
 * - Different gallery images, items, formats, or algorithm versions can
 *   never collide.
 * - Format IDs are sanitized so unusual characters cannot escape the
 *   subfolder (only [a-z0-9._-] survive).
 * - The path can never equal the caller's original base path because
 *   the `ratio-finalized/` prefix is fixed.
 */

export const RATIO_FINALIZED_BUCKET = "generated-images";
export const RATIO_FINALIZED_PREFIX = "ratio-finalized";

export interface BuildRatioFinalizedStoragePathInput {
  galleryImageId: string;
  itemId: string;
  posterFormatId: string | null | undefined;
  algorithmVersion: string;
  extension: string;
}

function sanitizeSegment(input: string): string {
  const lower = input.toLowerCase();
  const cleaned = lower.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "unknown";
}

function requireId(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`ratio-finalized path missing required ${label}`);
  }
  return value.trim();
}

export function buildRatioFinalizedStoragePath(
  input: BuildRatioFinalizedStoragePathInput,
): string {
  const gallery = sanitizeSegment(requireId(input.galleryImageId, "galleryImageId"));
  const item = sanitizeSegment(requireId(input.itemId, "itemId"));
  const version = sanitizeSegment(requireId(input.algorithmVersion, "algorithmVersion"));
  const format = sanitizeSegment(input.posterFormatId ?? "no-format");
  const ext = sanitizeSegment(input.extension || "png").replace(/^\.+/, "");
  return `${RATIO_FINALIZED_PREFIX}/${gallery}/${format}/${version}/${item}.${ext}`;
}
