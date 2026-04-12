/**
 * Enhancement pipeline configuration.
 * Defines quality modes, provider settings, and enhancement presets.
 */

export type EnhancementMode = "standard" | "hd" | "print-hd";

export interface EnhancementPreset {
  id: EnhancementMode;
  label: string;
  description: string;
  /** Whether to run AI upscale pass */
  runUpscale: boolean;
  /** Enhancement strength hint passed to provider */
  strength: "none" | "medium" | "strong";
  /** Target scale factor for upscaling (relative to source) */
  scaleFactor: number;
  /** Timeout in ms for the enhancement step */
  timeoutMs: number;
}

export const ENHANCEMENT_PRESETS: Record<EnhancementMode, EnhancementPreset> = {
  standard: {
    id: "standard",
    label: "Standard",
    description: "Fast generation, good for web use",
    runUpscale: false,
    strength: "none",
    scaleFactor: 1,
    timeoutMs: 0,
  },
  hd: {
    id: "hd",
    label: "HD",
    description: "Enhanced sharpness and detail",
    runUpscale: true,
    strength: "medium",
    scaleFactor: 2,
    timeoutMs: 60_000,
  },
  "print-hd": {
    id: "print-hd",
    label: "Print HD",
    description: "Maximum detail for large-format printing",
    runUpscale: true,
    strength: "strong",
    scaleFactor: 4,
    timeoutMs: 90_000,
  },
};

export const ENHANCEMENT_MODES: EnhancementMode[] = ["standard", "hd", "print-hd"];

/** Provider configuration — isolated so swapping providers later is easy */
export interface ProviderConfig {
  name: string;
  /** Edge function name to call */
  edgeFunction: string;
}

export const ENHANCEMENT_PROVIDER: ProviderConfig = {
  name: "lovable-ai-gateway",
  edgeFunction: "upscale-image",
};
