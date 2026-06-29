/**
 * Exact pixel sizes for OpenAI GPT Image 2 (`gpt-image-2`).
 *
 * Source of truth for the per-poster-format pixel size we ask OpenAI to
 * render at. No fallbacks to legacy fixed sizes (1024×1024, 1024×1536,
 * 1536×1024), no `auto`, no aspect-ratio tokens — the selected format
 * directly determines the requested W×H.
 *
 * Notes:
 *   - 50×70 uses the 5:7 ratio.
 *   - A2 / A3 / A4 use the ISO A-series ratio (1:√2).
 *   - All dimensions are multiples of 16 (required by gpt-image-2 sizing).
 *   - Landscape variants are the portrait dims swapped.
 */

import { getPrintFormat } from "@/lib/print-formats";

export type Orientation = "portrait" | "landscape";

export interface OpenAIGptImage2Size {
  width: number;
  height: number;
  /** Always true for entries in this map — they exactly match the target ratio. */
  exact: boolean;
  orientation: Orientation;
}

/** Portrait entries; landscape is derived by swapping w/h. */
const PORTRAIT_SIZES: Record<string, { width: number; height: number }> = {
  print_50x70: { width: 1600, height: 2240 }, // 5:7
  print_a4: { width: 1120, height: 1584 }, // ISO-A
  print_a3: { width: 1584, height: 2240 }, // ISO-A
  print_a2: { width: 2240, height: 3168 }, // ISO-A
};

/** Format ids that have an exact gpt-image-2 size mapping. */
export function hasGptImage2ExactSize(formatId: string | undefined): boolean {
  if (!formatId) return false;
  return Object.prototype.hasOwnProperty.call(PORTRAIT_SIZES, formatId);
}

/**
 * Resolve the orientation for a poster format. We treat formats whose
 * registry ratio is >1 as landscape, <1 as portrait. Today every print
 * format in the registry is portrait (or square), so this defaults
 * deterministically to portrait unless an explicit override is provided.
 */
function defaultOrientationForFormat(formatId: string): Orientation {
  const fmt = getPrintFormat(formatId);
  if (!fmt) return "portrait";
  return fmt.aspectRatioDecimal > 1 ? "landscape" : "portrait";
}

/**
 * Look up the exact gpt-image-2 W×H for a (formatId, orientation).
 * Returns null when the format has no exact-size entry (caller may fall
 * back to a ratio-preserving computation for unmapped formats).
 */
export function gptImage2SizeForFormat(
  formatId: string | undefined,
  orientation?: Orientation,
): OpenAIGptImage2Size | null {
  if (!formatId) return null;
  const base = PORTRAIT_SIZES[formatId];
  if (!base) return null;
  const o: Orientation = orientation ?? defaultOrientationForFormat(formatId);
  if (o === "landscape") {
    return { width: base.height, height: base.width, exact: true, orientation: "landscape" };
  }
  return { width: base.width, height: base.height, exact: true, orientation: "portrait" };
}

/** Serialize a size as the "WxH" string the OpenAI API expects. */
export function formatOpenAISize(size: { width: number; height: number }): string {
  return `${size.width}x${size.height}`;
}
