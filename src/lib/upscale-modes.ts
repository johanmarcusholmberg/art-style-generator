/**
 * Upscale mode registry — single source of truth for all 4 upscale paths.
 *
 * Used by:
 *   - useUpscale hook (frontend abstraction)
 *   - ImageGenerator (auto + manual upscale)
 *   - Gallery lightbox (manual upscale on existing assets)
 *   - upscale-image edge function (mode dispatcher)
 */

export type UpscaleMode = "none" | "realesrgan_4x" | "tile_4x" | "tile_8x";

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
  },
  tile_8x: {
    id: "tile_8x",
    label: "Print 8× (Tiled)",
    shortLabel: "Tile 8×",
    description: "Tiled SDXL refinement at 8×. May downshift to 4× if output exceeds 8K.",
    runs: true,
    scaleFactor: 8,
    tiled: true,
    provider: "replicate/clarity-upscaler",
  },
};

export const UPSCALE_MODE_OPTIONS: UpscaleModeConfig[] = [
  UPSCALE_MODES.none,
  UPSCALE_MODES.realesrgan_4x,
  UPSCALE_MODES.tile_4x,
  UPSCALE_MODES.tile_8x,
];

export const DEFAULT_UPSCALE_MODE: UpscaleMode = "none";

/** Hard-cap on the longer side of any tiled-8x output (px) */
export const TILE_8X_MAX_LONG_SIDE = 8192;

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
  preparing: 10,
  optimizing: 20,
  cleanup: 30,
  tiling: 45,
  upscaling: 65,
  stitching: 85,
  saving: 95,
  done: 100,
  failed: 0,
  downshifted: 0,
};
