/**
 * Upscale mode registry — single source of truth for all 4 upscale paths.
 *
 * Used by:
 *   - useUpscale hook (frontend abstraction)
 *   - ImageGenerator (auto + manual upscale)
 *   - Gallery lightbox (manual upscale on existing assets)
 *   - upscale-image edge function (mode dispatcher)
 */

export type UpscaleMode =
  | "none"
  | "realesrgan_4x"
  | "tile_4x"
  | "tile_8x"
  | "print_target_300";

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
    description: "Fast 4× super-resolution. Best for web and smaller prints. For large formats, a stronger route may be needed.",
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
    description: "Tiled SDXL refinement at 8×. Recommended for very large prints (e.g. 50×70 cm) when 4× cannot reach 300 PPI. May downshift to 4× if output exceeds 12K.",
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
  /**
   * Dynamic print-target route. Calculates the EXACT scale required from

   * the corrected poster master to reach the selected print format's 300
   * PPI pixel target, ceils up to safe provider precision, and calls
   * Real-ESRGAN with that decimal scale. `scaleFactor` is informational
   * only — the hook computes the real scale at runtime via
   * `calculatePrintTargetUpscale`.
   */
  print_target_300: {
    id: "print_target_300",
    label: "Print Target 300 PPI",
    shortLabel: "300 PPI",
    description:
      "Uses the corrected poster master and calculates the exact scale needed for the selected print format's 300 PPI target. Single Real-ESRGAN pass at a decimal scale — no repeated 4×.",
    runs: true,
    // Variable — overridden at runtime per source. 4 is a safe default
    // for surfaces that need a number (cost rank, expected-output preview).
    scaleFactor: 4,
    tiled: false,
    provider: "replicate/real-esrgan",
    category: "print",
    estimatedTime: "~20–60s",
    estimatedCost: "low",
    intendedUse: "Best for hitting 300 PPI on the selected print format",
    isAutomaticCapable: false,
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
  UPSCALE_MODES.print_target_300,
  UPSCALE_MODES.tile_4x,
  UPSCALE_MODES.tile_8x,
];

export const DEFAULT_UPSCALE_MODE: UpscaleMode = "none";

/**
 * Hard-cap on the longer side of any upscale output (px).
 *
 * Unified with the backend dispatcher (`supabase/functions/upscale-image`).
 * Clarity Upscaler can produce up to ~12K px, and the dynamic print-target
 * route (`src/lib/print-target-upscale.ts`) uses this as its default
 * safety cap so 50×70 cm at 300 PPI (5906×8268) is reachable in a single
 * pass without tripping the guard.
 */
export const TILE_8X_MAX_LONG_SIDE = 12288;

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
  | "saving"
  | "done"
  | "failed"
  | "downshifted";

export const UPSCALE_STAGE_LABELS: Record<UpscaleStage, string> = {
  idle: "",
  preparing: "Preparing upscale…",
  optimizing: "Optimizing source for 8× upscale…",
  cleanup: "Cleaning artifacts…",
  tiling: "Preparing tiles…",
  upscaling: "Upscaling…",
  stitching: "Stitching final image…",
  saving: "Saving image…",
  done: "Upscale complete",
  failed: "Upscale failed",
  downshifted: "Downshifted to 4× (8× too large)",
};

/** Approximate progress percentage per stage, for the progress bar. */
export const UPSCALE_STAGE_PROGRESS: Record<UpscaleStage, number> = {
  idle: 0,
  preparing: 8,
  optimizing: 18,
  cleanup: 28,
  tiling: 40,
  upscaling: 60,
  stitching: 80,
  saving: 95,
  done: 100,
  failed: 0,
  downshifted: 0,
};

