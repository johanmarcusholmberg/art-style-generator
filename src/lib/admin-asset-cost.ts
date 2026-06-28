/**
 * Rough cost estimation for assets in the Admin Asset Library.
 *
 * These are coarse heuristics — used only for admin reporting, NEVER for
 * billing. Returns null when no estimate is possible.
 */

const GENERATION_COST_BY_PROVIDER: Record<string, number> = {
  openai: 0.04,
  "openai-direct": 0.04,
  gemini: 0.02,
  "gemini-direct": 0.02,
  lovable: 0.015,
  replicate: 0.025,
  "replicate-direct": 0.025,
  sdxl: 0.02,
};

const UPSCALE_COST_BY_METHOD: Record<string, number> = {
  realesrgan: 0.0023,
  realesrgan_4x: 0.0023,
  supir: 0.05,
  print_plus: 0.05,
  tile_4x: 0.04,
  tile_8x: 0.08,
  // Dynamic Clarity at decimal scale (Recommended target-300 + Advanced manual).
  // Priced at the medium tile tier since one Clarity pass dominates cost.
  clarity_dynamic: 0.06,
  "replicate/clarity-upscaler": 0.06,
};

export function estimateGenerationCost(
  provider?: string | null,
  route?: string | null,
): number | null {
  const key = (route || provider || "").toLowerCase();
  if (!key) return null;
  for (const k of Object.keys(GENERATION_COST_BY_PROVIDER)) {
    if (key.includes(k)) return GENERATION_COST_BY_PROVIDER[k];
  }
  return null;
}

export function estimateUpscaleCost(
  upscaleMode?: string | null,
  upscaleMethod?: string | null,
  enhancementModel?: string | null,
): number | null {
  const key = (upscaleMode || upscaleMethod || enhancementModel || "").toLowerCase();
  if (!key) return null;
  for (const k of Object.keys(UPSCALE_COST_BY_METHOD)) {
    if (key.includes(k)) return UPSCALE_COST_BY_METHOD[k];
  }
  return null;
}

export function formatCost(cost: number | null): string {
  if (cost == null) return "—";
  return `$${cost.toFixed(3)}`;
}
