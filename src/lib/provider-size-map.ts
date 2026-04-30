/**
 * Provider-size map (frontend source of truth for adapter sizing).
 *
 * Translates a poster format id (from `src/lib/print-formats.ts`) into the
 * concrete request shape each generation provider accepts:
 *
 *   - SDXL  → width × height in pixels (multiples of 8)
 *   - OpenAI (gpt-image-1) → one of "1024x1024" | "1024x1536" | "1536x1024"
 *   - Gemini → an aspect-ratio token ("1:1" | "3:4" | "2:3" | …)
 *
 * `exact` records whether the chosen request dimensions perfectly match
 * the poster's aspect ratio (true) or are an approximation that the export
 * pipeline will correct later (false). The normalized generation response
 * surfaces this as `providerExactMatch` / `providerAdjusted` so the UI can
 * label results clearly.
 *
 * Foundation: this file does NOT modify the poster format registry, the
 * prompt compiler, the safe-area logic, or the export pipeline. It only
 * tells provider adapters what dimensions to request.
 */

export type SdxlSizeConfig = { width: number; height: number; exact: boolean };
export type OpenAISizeConfig = { size: "1024x1024" | "1024x1536" | "1536x1024"; exact: boolean };
export type GeminiSizeConfig = { aspectRatio: "1:1" | "3:4" | "2:3" | "4:3" | "3:2" | "16:9" | "9:16"; exact: boolean };

export type ProviderSizeConfig = SdxlSizeConfig | OpenAISizeConfig | GeminiSizeConfig;

export type ProviderKey = "sdxl" | "openai" | "gemini";

export const PROVIDER_SIZE_MAP: {
  sdxl: Record<string, SdxlSizeConfig>;
  openai: Record<string, OpenAISizeConfig>;
  gemini: Record<string, GeminiSizeConfig>;
} = {
  sdxl: {
    print_30x40: { width: 1024, height: 1344, exact: false },
    print_50x70: { width: 1344, height: 1888, exact: true },
    print_50x50: { width: 1024, height: 1024, exact: true },
    print_a2: { width: 1408, height: 1984, exact: false },
    print_a3: { width: 1408, height: 1984, exact: false },
    print_a4: { width: 1408, height: 1984, exact: false },
  },
  openai: {
    print_30x40: { size: "1024x1536", exact: false },
    print_50x70: { size: "1024x1536", exact: false },
    print_50x50: { size: "1024x1024", exact: true },
    print_a2: { size: "1024x1536", exact: false },
    print_a3: { size: "1024x1536", exact: false },
    print_a4: { size: "1024x1536", exact: false },
  },
  gemini: {
    print_30x40: { aspectRatio: "3:4", exact: true },
    print_50x70: { aspectRatio: "3:4", exact: false },
    print_50x50: { aspectRatio: "1:1", exact: true },
    print_a2: { aspectRatio: "2:3", exact: false },
    print_a3: { aspectRatio: "2:3", exact: false },
    print_a4: { aspectRatio: "2:3", exact: false },
  },
};

/**
 * Look up the provider-specific size config for the given poster format.
 * Returns `null` when the provider or format is unknown — adapters should
 * fall back to their previous aspect-ratio-based heuristic in that case.
 */
export function getProviderSize(provider: "sdxl", formatId?: string): SdxlSizeConfig | null;
export function getProviderSize(provider: "openai", formatId?: string): OpenAISizeConfig | null;
export function getProviderSize(provider: "gemini", formatId?: string): GeminiSizeConfig | null;
export function getProviderSize(
  provider: ProviderKey,
  formatId?: string,
): ProviderSizeConfig | null {
  if (!formatId) return null;
  const map = (PROVIDER_SIZE_MAP as Record<string, Record<string, ProviderSizeConfig>>)[provider];
  if (!map) return null;
  return map[formatId] ?? null;
}
