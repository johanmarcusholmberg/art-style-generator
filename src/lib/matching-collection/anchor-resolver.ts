/**
 * anchor-resolver — pure helper that decides which persisted identity
 * (storage path + pixel dimensions) belongs to the visible anchor URL
 * the user is about to hand off to Matching Collection.
 *
 * Rules (spec Turn 2c.1):
 *   1. Persisted enhanced/master asset wins when it is the selected URL.
 *   2. Persisted base asset comes next.
 *   3. Provider URL falls back with null storage path and unknown dims.
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
  /** URL the user currently sees as the anchor. */
  selectedUrl: string | null;
}

export type AnchorSource =
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

  // Enhanced/master selected → strictly enhanced identity.
  if (i.enhancedUrl && sel === i.enhancedUrl) {
    return {
      anchorImageUrl: sel,
      anchorStoragePath: i.enhancedStoragePath ?? null,
      anchorWidthPx: i.enhancedWidth ?? null,
      anchorHeightPx: i.enhancedHeight ?? null,
      source: i.enhancedStoragePath ? "enhanced-persisted" : "provider",
    };
  }

  // Base URL selected → prefer durable master identity (server-persisted),
  // else the persisted base row, else provider fallback.
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

  // Selection matches the durable master URL directly.
  if (i.durableMasterUrl && sel === i.durableMasterUrl) {
    return {
      anchorImageUrl: sel,
      anchorStoragePath: i.durableMasterStoragePath ?? null,
      anchorWidthPx: i.durableMasterWidth ?? null,
      anchorHeightPx: i.durableMasterHeight ?? null,
      source: i.durableMasterStoragePath ? "durable-master" : "provider",
    };
  }

  // Provider URL only (no persisted identity known for this URL).
  return {
    anchorImageUrl: sel,
    anchorStoragePath: null,
    anchorWidthPx: null,
    anchorHeightPx: null,
    source: "provider",
  };
}
