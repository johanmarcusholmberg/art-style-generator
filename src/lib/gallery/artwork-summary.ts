/**
 * Artwork detail summary — PRESENTATION ONLY.
 *
 * Turns the data the app already knows (gallery row + versioned assets +
 * existing print-readiness logic) into creator-facing display strings for the
 * Gallery lightbox / mobile drawer.
 *
 * Hard rules:
 *   - No I/O, no Supabase, no asset *resolution*. This module never decides
 *     which bytes an action reads — `asset-integrity/source-resolver.ts` owns
 *     that, and download/export keep using it unchanged.
 *   - No database IDs and no storage paths ever appear in the returned labels.
 *   - Print readiness comes from `getPrintReadiness()`; no new thresholds.
 */
import {
  getPrintReadiness,
  type PrintReadinessLevel,
  type AssetImageLike,
} from "@/lib/image-assets";
import {
  bestAvailableAsset,
  versionLabel,
  type ImageAssetRow,
} from "@/lib/generated-image-assets";
import { UPSCALE_MODES, type UpscaleMode } from "@/lib/upscale-modes";

export interface VersionSummary {
  /** "Original" / "Upscale 2" */
  label: string;
  /** "4096 × 5734" or null when unmeasured. */
  dimensions: string | null;
  isOriginal: boolean;
  isMaster: boolean;
  /** Friendly upscale method, e.g. "Real-ESRGAN 4×". Null when not useful. */
  methodLabel: string | null;
}

export type PrintReadinessState =
  | "ready"
  | "good"
  | "insufficient"
  | "unknown";

export interface PrintReadinessSummary {
  state: PrintReadinessState;
  /** Short creator-facing headline, e.g. "Ready for print". */
  headline: string;
  /** e.g. "6144 × 8601 · suitable for 50×70 cm". */
  detail: string;
  /** Existing recommendation text, when the underlying logic gives one. */
  recommendation: string | null;
  /** Secondary technical detail, e.g. "312 PPI". */
  ppiLabel: string | null;
  level: PrintReadinessLevel;
}

export interface ArtworkDetailSummary {
  /** The version currently previewed (may differ from the master). */
  selected: VersionSummary | null;
  /** The version the app treats as the current master/best source. */
  master: VersionSummary | null;
  /** True when the previewed version is not the current master. */
  previewingNonMaster: boolean;
  /** Display dimensions for the previewed version (falls back to the row). */
  displayDimensions: string | null;
  printReadiness: PrintReadinessSummary;
  /** "Gemini · gemini-3-pro-image" or "Provider not recorded". */
  providerLabel: string;
  /** Print format label, e.g. "50×70 cm". Null when none chosen. */
  printFormatLabel: string | null;
  /** Formatted creation date, or null. */
  createdLabel: string | null;
  enhancementRecommended: boolean;
  /**
   * What "Download master" will actually hand the user, in creator language.
   * Mirrors the existing source contract: a selected version wins, otherwise
   * the row's canonical master.
   */
  downloadMasterDescription: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  sdxl: "SDXL",
  gemini: "Gemini",
  openai: "OpenAI",
  replicate: "Replicate",
  lovable: "Lovable AI",
};

function dims(w?: number | null, h?: number | null): string | null {
  return w && h ? `${w} × ${h}` : null;
}

function methodLabel(asset: ImageAssetRow): string | null {
  if (!asset.upscale_method) return null;
  return (
    UPSCALE_MODES[asset.upscale_method as UpscaleMode]?.shortLabel ??
    asset.upscale_method
  );
}

function toVersionSummary(
  asset: ImageAssetRow,
  masterId: string | null,
): VersionSummary {
  return {
    label: versionLabel(asset),
    dimensions: dims(asset.width_px, asset.height_px),
    isOriginal: asset.asset_type === "original",
    isMaster: !!masterId && asset.id === masterId,
    methodLabel: methodLabel(asset),
  };
}

/**
 * Identify which versioned asset row IS the persisted master.
 *
 * Presentation-only: it re-uses the SAME path precedence the source layer
 * already applies (master → enhanced → base) and matches it to an active
 * asset's `storage_path`. When no reliable match exists we return null so the
 * UI omits the badge rather than guessing.
 */
export function resolveMasterAssetId(
  image: {
    master_storage_path?: string | null;
    enhanced_storage_path?: string | null;
    storage_path?: string | null;
  },
  assets: ImageAssetRow[],
): string | null {
  const candidates = [
    image.master_storage_path,
    image.enhanced_storage_path,
    image.storage_path,
  ].filter((p): p is string => !!p);

  for (const path of candidates) {
    const matches = assets.filter((a) => a.storage_path === path);
    if (matches.length === 1) return matches[0].id;
    if (matches.length > 1) return null; // ambiguous — never guess
  }
  return null;
}

export function buildPrintReadinessSummary(
  image: AssetImageLike & { print_format_id?: string | null },
  displayDims: string | null,
  sourceLabel?: string | null,
): PrintReadinessSummary {
  const r = getPrintReadiness(image, image.print_format_id);
  const size = r.format?.label ?? null;

  if (r.level === "unknown") {
    return {
      state: "unknown",
      headline: "Not enough information",
      detail: "Dimensions are still being verified",
      recommendation: r.recommendation,
      ppiLabel: null,
      level: r.level,
    };
  }

  const ppiLabel = r.achievablePpi ? `${r.achievablePpi} PPI` : null;
  const sizePart = size ? ` · ${size}` : "";
  const base = [sourceLabel || null, displayDims || null]
    .filter(Boolean)
    .join(" · ");

  if (r.level === "ready-300") {
    return {
      state: "ready",
      headline: "Ready for print",
      detail: `${base}${base ? " · " : ""}suitable for ${size ?? "the selected size"}`,
      recommendation: null,
      ppiLabel,
      level: r.level,
    };
  }

  if (r.level === "ready-150") {
    return {
      state: "good",
      headline: "Good, enhancement recommended",
      detail: `${base}${base ? " · " : ""}fine for standard prints${sizePart}`,
      recommendation: r.recommendation,
      ppiLabel,
      level: r.level,
    };
  }

  return {
    state: "insufficient",
    headline: "Enhance before printing",
    detail: `${base}${base ? " · " : ""}too small for ${size ?? "this print size"}`,
    recommendation: r.recommendation,
    ppiLabel,
    level: r.level,
  };
}

export function buildArtworkDetailSummary(
  image: AssetImageLike & {
    print_format_id?: string | null;
    generation_provider?: string | null;
    generation_model?: string | null;
    actual_width_px?: number | null;
    actual_height_px?: number | null;
    created_at?: string | null;
  },
  selectedAsset: ImageAssetRow | null,
  assets: ImageAssetRow[] = [],
  printFormatLabel?: string | null,
): ArtworkDetailSummary {
  // The master is the PERSISTED master identity (master → enhanced → base
  // storage path), not merely the largest asset.
  const masterId = resolveMasterAssetId(image, assets);
  const masterAsset = masterId ? assets.find((a) => a.id === masterId) ?? null : null;

  const selected = selectedAsset
    ? toVersionSummary(selectedAsset, masterId)
    : null;
  const master = masterAsset ? toVersionSummary(masterAsset, masterId) : null;

  const displayDimensions =
    (selected?.dimensions ?? null) ||
    dims(image.actual_width_px, image.actual_height_px);

  // Readiness is evaluated from the production/master source, so its copy must
  // quote the master's dimensions — never the previewed version's.
  const masterDimensions =
    (master?.dimensions ?? null) ||
    dims(image.actual_width_px, image.actual_height_px);

  const printReadiness = buildPrintReadinessSummary(
    image,
    masterDimensions,
    master ? "Current master" : null,
  );

  const providerKey = image.generation_provider ?? null;
  const providerName = providerKey
    ? PROVIDER_LABELS[providerKey] ?? providerKey
    : null;
  const providerLabel = providerName
    ? image.generation_model
      ? `${providerName} · ${image.generation_model}`
      : providerName
    : "Provider not recorded";

  // Mirrors the existing action-source rule: selected version wins, otherwise
  // the row's canonical master.
  const effective = selected ?? master;
  const downloadMasterDescription = effective
    ? `Uses ${effective.label}${effective.dimensions ? ` · ${effective.dimensions}` : ""}`
    : displayDimensions
      ? `Uses the current master · ${displayDimensions}`
      : "Uses the current master";

  return {
    selected,
    master,
    previewingNonMaster: !!selected && !!master && !selected.isMaster,
    displayDimensions,
    printReadiness,
    providerLabel,
    printFormatLabel: printFormatLabel ?? null,
    createdLabel: image.created_at
      ? new Date(image.created_at).toLocaleDateString()
      : null,
    enhancementRecommended:
      printReadiness.state === "good" || printReadiness.state === "insufficient",
    downloadMasterDescription,
  };
}
