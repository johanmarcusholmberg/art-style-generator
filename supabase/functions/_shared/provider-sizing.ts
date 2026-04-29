/**
 * Provider sizing helpers (Phase 2 follow-up).
 *
 * Translates a poster format id (or a fallback aspect-ratio token) into
 * the closest pixel size each provider actually supports. Mirrors the
 * frontend `print-formats.ts` registry — kept in sync deliberately so we
 * don't introduce a second source of truth on the Deno side.
 *
 * - SDXL  : longest-side ≈1024–1344, multiples of 8
 * - OpenAI: one of 1024×1024, 1024×1536, 1536×1024 (gpt-image-1)
 *
 * Frontends pass `posterFormatId` whenever a poster size has been
 * selected; the previous `aspectRatio` token remains supported as a
 * fallback for legacy callers and image-edit flows.
 */

// Inlined from src/lib/print-formats.ts. Keep in sync — only the fields
// the Deno providers actually need.
interface DenoPrintFormat {
  id: string;
  aspectRatio: string;
  aspectRatioDecimal: number;
  recommendedGenerationWidth: number;
  recommendedGenerationHeight: number;
}

const PRINT_FORMATS: DenoPrintFormat[] = [
  { id: "print_50x70", aspectRatio: "5:7", aspectRatioDecimal: 50 / 70,
    recommendedGenerationWidth: 1600, recommendedGenerationHeight: 2240 },
  { id: "print_30x40", aspectRatio: "3:4", aspectRatioDecimal: 30 / 40,
    recommendedGenerationWidth: 1536, recommendedGenerationHeight: 2048 },
  { id: "print_50x50", aspectRatio: "1:1", aspectRatioDecimal: 1,
    recommendedGenerationWidth: 2048, recommendedGenerationHeight: 2048 },
  { id: "print_a2", aspectRatio: "ISO-A", aspectRatioDecimal: 420 / 594,
    recommendedGenerationWidth: 1448, recommendedGenerationHeight: 2048 },
  { id: "print_a3", aspectRatio: "ISO-A", aspectRatioDecimal: 297 / 420,
    recommendedGenerationWidth: 1448, recommendedGenerationHeight: 2048 },
  { id: "print_a4", aspectRatio: "ISO-A", aspectRatioDecimal: 210 / 297,
    recommendedGenerationWidth: 1448, recommendedGenerationHeight: 2048 },
];

function getPrintFormat(id?: string): DenoPrintFormat | undefined {
  if (!id) return undefined;
  return PRINT_FORMATS.find((f) => f.id === id);
}

/** Convert an aspect-ratio token like "5:7" into a decimal (w/h). */
function aspectRatioToDecimal(aspectRatio?: string): number | undefined {
  if (!aspectRatio) return undefined;
  if (aspectRatio === "1:1") return 1;
  const [a, b] = aspectRatio.split(":").map((v) => parseFloat(v));
  if (!isFinite(a) || !isFinite(b) || b === 0) return undefined;
  return a / b;
}

// ── SDXL ────────────────────────────────────────────────────────────────

/** Snap to a multiple of `mult` (SDXL requires multiples of 8). */
function snap(n: number, mult = 8): number {
  return Math.max(mult, Math.round(n / mult) * mult);
}

/**
 * Compute SDXL pixel dimensions targeting longest side ≈1344, both axes
 * snapped to multiples of 8. Prefers the format's recommended size when
 * provided; otherwise derives from the aspect-ratio decimal.
 */
export function sdxlSizeForFormat(
  posterFormatId?: string,
  aspectRatio?: string,
): { width: number; height: number; source: "format" | "aspect" | "default" } {
  const format = getPrintFormat(posterFormatId);
  const ratio = format?.aspectRatioDecimal ?? aspectRatioToDecimal(aspectRatio);

  if (!ratio) {
    return { width: 1024, height: 1024, source: "default" };
  }

  const LONG_SIDE_TARGET = 1344;
  const SHORT_SIDE_FLOOR = 768;

  let width: number, height: number;
  if (ratio >= 1) {
    // landscape or square
    width = LONG_SIDE_TARGET;
    height = Math.max(SHORT_SIDE_FLOOR, Math.round(LONG_SIDE_TARGET / ratio));
  } else {
    // portrait
    height = LONG_SIDE_TARGET;
    width = Math.max(SHORT_SIDE_FLOOR, Math.round(LONG_SIDE_TARGET * ratio));
  }

  return {
    width: snap(width),
    height: snap(height),
    source: format ? "format" : "aspect",
  };
}

// ── OpenAI gpt-image-1 ──────────────────────────────────────────────────

export type OpenAISize = "1024x1024" | "1024x1536" | "1536x1024";

/**
 * Pick the closest gpt-image-1 supported size for the given poster format
 * (or aspect-ratio token fallback).
 */
export function openaiSizeForFormat(
  posterFormatId?: string,
  aspectRatio?: string,
): { size: OpenAISize; width: number; height: number; source: "format" | "aspect" | "default" } {
  const format = getPrintFormat(posterFormatId);
  const ratio = format?.aspectRatioDecimal ?? aspectRatioToDecimal(aspectRatio);

  if (!ratio) {
    return { size: "1024x1024", width: 1024, height: 1024, source: "default" };
  }

  const source: "format" | "aspect" = format ? "format" : "aspect";

  if (ratio > 1.05) return { size: "1536x1024", width: 1536, height: 1024, source };
  if (ratio < 0.95) return { size: "1024x1536", width: 1024, height: 1536, source };
  return { size: "1024x1024", width: 1024, height: 1024, source };
}
