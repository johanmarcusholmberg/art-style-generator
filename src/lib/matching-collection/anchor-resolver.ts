/**
 * anchor-resolver — pure helper that decides which persisted identity
 * (storage path + pixel dimensions) belongs to the visible anchor URL
 * the user is about to hand off to Matching Collection.
 *
 * Rules (spec Turn 2c.2):
 *   1. Corrected-master (post-finalization, persisted) wins when selected.
 *   2. Locally-finalized Canvas URL (post-Canvas correction, not yet
 *      persisted server-side) returns Canvas dims with NULL storage path.
 *      Raw provider storage identity must never be paired with locally
 *      corrected pixels.
 *   3. Persisted enhanced/master asset wins when it is the selected URL.
 *   4. Persisted base asset comes next.
 *   5. Durable master matched directly.
 *   6. Provider URL falls back with null storage path and unknown dims.
 *   - An enhanced URL is never paired with base-only dimensions.
 *   - Unknown values stay null; nothing is fabricated.
 */
export interface AnchorResolveInput {
  baseUrl: string | null;
  baseStoragePath: string | null;
  baseWidth: number | null;
  baseHeight: number | null;
  enhancedUrl: string | null;
  enhancedStoragePath: string | null;
  enhancedWidth: number | null;
  enhancedHeight: number | null;
  durableMasterUrl: string | null;
  durableMasterStoragePath: string | null;
  durableMasterWidth: number | null;
  durableMasterHeight: number | null;
  /**
   * Persisted corrected-master (post-finalization) — server-side truth
   * for the ratio-enforced pixels. When the selected URL matches this,
   * these identifiers travel together.
   */
  correctedMasterUrl?: string | null;
  correctedMasterStoragePath?: string | null;
  correctedMasterWidth?: number | null;
  correctedMasterHeight?: number | null;
  /**
   * Locally-corrected Canvas URL that has NOT yet been persisted as a
   * corrected master server-side. Its pixels differ from the raw
   * provider bytes, so the raw persisted identity must NOT be attached.
   */
  locallyFinalizedCanvasUrl?: string | null;
  locallyFinalizedCanvasWidth?: number | null;
  locallyFinalizedCanvasHeight?: number | null;
  /** URL the user currently sees as the anchor. */
  selectedUrl: string | null;
}

export type AnchorSource =
  | "corrected-master-persisted"
  | "local-finalized-unpersisted"
  | "enhanced-persisted"
  | "base-persisted"
  | "durable-master"
  | "provider";

export interface ResolvedAnchor {
  anchorImageUrl: string;
  anchorStoragePath: string | null;
  anchorWidthPx: number | null;
  anchorHeightPx: number | null;
  source: AnchorSource;
}

export function resolveMatchingCollectionAnchor(
  i: AnchorResolveInput,
): ResolvedAnchor | null {
  const sel = i.selectedUrl;
  if (!sel) return null;

  // (1) Corrected master persisted server-side.
  if (i.correctedMasterUrl && sel === i.correctedMasterUrl) {
    return {
      anchorImageUrl: sel,
      anchorStoragePath: i.correctedMasterStoragePath ?? null,
      anchorWidthPx: i.correctedMasterWidth ?? null,
      anchorHeightPx: i.correctedMasterHeight ?? null,
      source: i.correctedMasterStoragePath
        ? "corrected-master-persisted"
        : "provider",
    };
  }

  // (2) Locally-finalized Canvas URL — never attach raw provider identity.
  if (i.locallyFinalizedCanvasUrl && sel === i.locallyFinalizedCanvasUrl) {
    return {
      anchorImageUrl: sel,
      anchorStoragePath: null,
      anchorWidthPx: i.locallyFinalizedCanvasWidth ?? null,
      anchorHeightPx: i.locallyFinalizedCanvasHeight ?? null,
      source: "local-finalized-unpersisted",
    };
  }

  // (3) Enhanced/master selected → strictly enhanced identity.
  if (i.enhancedUrl && sel === i.enhancedUrl) {
    return {
      anchorImageUrl: sel,
      anchorStoragePath: i.enhancedStoragePath ?? null,
      anchorWidthPx: i.enhancedWidth ?? null,
      anchorHeightPx: i.enhancedHeight ?? null,
      source: i.enhancedStoragePath ? "enhanced-persisted" : "provider",
    };
  }

  // (4) Base URL selected → prefer durable master identity, else base row.
  if (i.baseUrl && sel === i.baseUrl) {
    if (i.durableMasterStoragePath || i.durableMasterWidth != null) {
      return {
        anchorImageUrl: sel,
        anchorStoragePath: i.durableMasterStoragePath ?? i.baseStoragePath ?? null,
        anchorWidthPx: i.durableMasterWidth ?? i.baseWidth ?? null,
        anchorHeightPx: i.durableMasterHeight ?? i.baseHeight ?? null,
        source: i.durableMasterStoragePath ? "durable-master" : "base-persisted",
      };
    }
    return {
      anchorImageUrl: sel,
      anchorStoragePath: i.baseStoragePath ?? null,
      anchorWidthPx: i.baseWidth ?? null,
      anchorHeightPx: i.baseHeight ?? null,
      source: i.baseStoragePath ? "base-persisted" : "provider",
    };
  }

  // (5) Selection matches the durable master URL directly.
  if (i.durableMasterUrl && sel === i.durableMasterUrl) {
    return {
      anchorImageUrl: sel,
      anchorStoragePath: i.durableMasterStoragePath ?? null,
      anchorWidthPx: i.durableMasterWidth ?? null,
      anchorHeightPx: i.durableMasterHeight ?? null,
      source: i.durableMasterStoragePath ? "durable-master" : "provider",
    };
  }

  // (6) Provider URL only (no persisted identity known for this URL).
  return {
    anchorImageUrl: sel,
    anchorStoragePath: null,
    anchorWidthPx: null,
    anchorHeightPx: null,
    source: "provider",
  };
}
