/**
 * Upscale mode registry — single source of truth for all 4 upscale paths.
 *
 * Used by:
 *   - useUpscale hook (frontend abstraction)
 *   - ImageGenerator (auto + manual upscale)
 *   - Gallery lightbox (manual upscale on existing assets)
 *   - upscale-image edge function (mode dispatcher)
 */

export type UpscaleMode = "none" | "realesrgan_4x" | "tile_4x" | "tile_8x" | "print_plus";

export type UpscaleCategory = "off" | "fast" | "print";
export type UpscaleCostTier = "free" | "low" | "medium" | "high";

export interface UpscaleModeConfig {
  id: UpscaleMode;
  label: string;
  shortLabel: string;
  description: string;
  /** Whether this mode actually performs an upscale */
  runs: boolean;
  /** Final scale factor relative to source */
  scaleFactor: number;
  /** Whether this mode uses tiled SDXL processing */
  tiled: boolean;
  /** Provider tag stored in DB (enhancement_model column) */
  provider: string;
  /** Grouping for the unified UI */
  category: UpscaleCategory;
  /** Approx wall-clock duration shown in the UI */
  estimatedTime: string;
  /** Coarse cost tier shown in the UI */
  estimatedCost: UpscaleCostTier;
  /** One-line UX intent — "best for print", "fast web", etc. */
  intendedUse: string;
  /** Available as auto-after-generation choice */
  isAutomaticCapable: boolean;
  /** Available as manual-after-generation choice */
  isManualCapable: boolean;
  /** Available from the gallery lightbox */
  isGalleryCapable: boolean;
  /** Re-running this mode requires the original/base asset (we always do this anyway) */
  requiresOriginalAsset: boolean;
  /** Globally enabled */
  enabled: boolean;
}

export const UPSCALE_MODES: Record<UpscaleMode, UpscaleModeConfig> = {
  none: {
    id: "none",
    label: "No upscale",
    shortLabel: "Off",
    description: "Use the generated image as-is. Fastest.",
    runs: false,
    scaleFactor: 1,
    tiled: false,
    provider: "none",
    category: "off",
    estimatedTime: "Instant",
    estimatedCost: "free",
    intendedUse: "Quick previews and iteration",
    isAutomaticCapable: true,
    isManualCapable: false,
    isGalleryCapable: false,
    requiresOriginalAsset: false,
    enabled: true,
  },
  realesrgan_4x: {
    id: "realesrgan_4x",
    label: "HD 4× (Real-ESRGAN)",
    shortLabel: "HD 4×",
    description: "Fast 4× super-resolution. Great for web & most prints.",
    runs: true,
    scaleFactor: 4,
    tiled: false,
    provider: "replicate/real-esrgan",
    category: "fast",
    estimatedTime: "~10–20s",
    estimatedCost: "low",
    intendedUse: "Best for web & smaller prints",
    isAutomaticCapable: true,
    isManualCapable: true,
    isGalleryCapable: true,
    requiresOriginalAsset: true,
    enabled: true,
  },
  tile_4x: {
    id: "tile_4x",
    label: "Print 4× (Tiled)",
    shortLabel: "Tile 4×",
    description: "Tiled SDXL refinement. Highest detail for large prints.",
    runs: true,
    scaleFactor: 4,
    tiled: true,
    provider: "replicate/clarity-upscaler",
    category: "print",
    estimatedTime: "~1–2 min",
    estimatedCost: "medium",
    intendedUse: "Best for medium / large prints",
    isAutomaticCapable: true,
    isManualCapable: true,
    isGalleryCapable: true,
    requiresOriginalAsset: true,
    enabled: true,
  },
  tile_8x: {
    id: "tile_8x",
    label: "Print 8× (Tiled)",
    shortLabel: "Tile 8×",
    description: "Tiled SDXL refinement at 8×. May downshift to 4× if output exceeds 12K.",
    runs: true,
    scaleFactor: 8,
    tiled: true,
    provider: "replicate/clarity-upscaler",
    category: "print",
    estimatedTime: "~3–5 min",
    estimatedCost: "high",
    intendedUse: "Best for very large / gallery prints",
    isAutomaticCapable: true,
    isManualCapable: true,
    isGalleryCapable: true,
    requiresOriginalAsset: true,
    enabled: true,
  },
  print_plus: {
    id: "print_plus",
    label: "Print+ (ESRGAN → SUPIR)",
    shortLabel: "Print+",
    description: "Real-ESRGAN 4× upscale, then SUPIR detail refinement. Best fidelity for print.",
    runs: true,
    scaleFactor: 4,
    tiled: false,
    provider: "replicate/real-esrgan+supir",
    category: "print",
    estimatedTime: "~2–4 min",
    estimatedCost: "high",
    intendedUse: "Best fidelity for fine-art prints",
    isAutomaticCapable: true,
    isManualCapable: true,
    isGalleryCapable: true,
    requiresOriginalAsset: true,
    enabled: true,
  },
};

/** Filter options by the surface they appear in (auto / manual / gallery). */
export type UpscaleSurface = "automatic" | "manual" | "gallery";

export function getUpscaleOptionsForSurface(surface: UpscaleSurface): UpscaleModeConfig[] {
  return UPSCALE_MODE_OPTIONS.filter((o) => {
    if (!o.enabled) return false;
    if (surface === "automatic") return o.isAutomaticCapable;
    if (surface === "manual") return o.isManualCapable;
    if (surface === "gallery") return o.isGalleryCapable;
    return true;
  });
}

export const UPSCALE_COST_LABEL: Record<UpscaleCostTier, string> = {
  free: "Free",
  low: "$",
  medium: "$$",
  high: "$$$",
};

export const UPSCALE_MODE_OPTIONS: UpscaleModeConfig[] = [
  UPSCALE_MODES.none,
  UPSCALE_MODES.realesrgan_4x,
  UPSCALE_MODES.tile_4x,
  UPSCALE_MODES.tile_8x,
  UPSCALE_MODES.print_plus,
];

export const DEFAULT_UPSCALE_MODE: UpscaleMode = "none";

/** Hard-cap on the longer side of any tiled-8x output (px) */
export const TILE_8X_MAX_LONG_SIDE = 8192;

/* ------------------------------------------------------------------ */
/*  Sync vs Async classification                                       */
/* ------------------------------------------------------------------ */

/**
 * Modes that can finish reliably inside a single 150s edge fn request.
 * Everything else goes through the async job flow (upscale_jobs table +
 * Replicate webhook).
 */
const SYNC_MODES: ReadonlySet<UpscaleMode> = new Set(["none", "realesrgan_4x"]);

export function isAsyncUpscaleMode(mode: UpscaleMode): boolean {
  return UPSCALE_MODES[mode].runs && !SYNC_MODES.has(mode);
}

export type UpscaleJobStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export const UPSCALE_JOB_STATUS_LABEL: Record<UpscaleJobStatus, string> = {
  queued: "Queued — starting upscale…",
  processing: "Processing on remote GPU…",
  succeeded: "Upscale complete",
  failed: "Upscale failed",
  cancelled: "Cancelled",
};

/* ------------------------------------------------------------------ */
/*  Staged status                                                      */
/* ------------------------------------------------------------------ */

export type UpscaleStage =
  | "idle"
  | "preparing"
  | "optimizing"
  | "cleanup"
  | "tiling"
  | "upscaling"
  | "stitching"
  | "refining"
  | "saving"
  | "done"
  | "failed"
  | "downshifted"
  | "refine_failed";

export const UPSCALE_STAGE_LABELS: Record<UpscaleStage, string> = {
  idle: "",
  preparing: "Preparing upscale…",
  optimizing: "Optimizing source for 8× upscale…",
  cleanup: "Cleaning artifacts…",
  tiling: "Preparing tiles…",
  upscaling: "Upscaling…",
  stitching: "Stitching final image…",
  refining: "Enhancing for print quality (SUPIR)…",
  saving: "Saving image…",
  done: "Upscale complete",
  failed: "Upscale failed",
  downshifted: "Downshifted to 4× (8× too large)",
  refine_failed: "SUPIR refine failed — kept ESRGAN result",
};

/** Approximate progress percentage per stage, for the progress bar. */
export const UPSCALE_STAGE_PROGRESS: Record<UpscaleStage, number> = {
  idle: 0,
  preparing: 8,
  optimizing: 18,
  cleanup: 28,
  tiling: 40,
  upscaling: 55,
  stitching: 75,
  refining: 88,
  saving: 95,
  done: 100,
  failed: 0,
  downshifted: 0,
  refine_failed: 100,
};
