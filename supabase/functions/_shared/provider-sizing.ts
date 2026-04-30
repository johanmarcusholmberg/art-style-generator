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

// ── Provider size map (mirrors src/lib/provider-size-map.ts) ────────────
//
// Hard-coded per-format request dimensions for each provider. Keep in sync
// with the frontend file. `exact` records whether the dimensions match the
// poster's aspect ratio perfectly; when false, the export pipeline is
// expected to re-crop to the exact ratio.

const PROVIDER_SIZE_MAP = {
  sdxl: {
    print_30x40: { width: 1024, height: 1344, exact: false },
    print_50x70: { width: 1344, height: 1888, exact: true },
    print_50x50: { width: 1024, height: 1024, exact: true },
    print_a2: { width: 1408, height: 1984, exact: false },
    print_a3: { width: 1408, height: 1984, exact: false },
    print_a4: { width: 1408, height: 1984, exact: false },
  } as Record<string, { width: number; height: number; exact: boolean }>,
  openai: {
    print_30x40: { size: "1024x1536", exact: false },
    print_50x70: { size: "1024x1536", exact: false },
    print_50x50: { size: "1024x1024", exact: true },
    print_a2: { size: "1024x1536", exact: false },
    print_a3: { size: "1024x1536", exact: false },
    print_a4: { size: "1024x1536", exact: false },
  } as Record<string, { size: "1024x1024" | "1024x1536" | "1536x1024"; exact: boolean }>,
  gemini: {
    print_30x40: { aspectRatio: "3:4", exact: true },
    print_50x70: { aspectRatio: "3:4", exact: false },
    print_50x50: { aspectRatio: "1:1", exact: true },
    print_a2: { aspectRatio: "2:3", exact: false },
    print_a3: { aspectRatio: "2:3", exact: false },
    print_a4: { aspectRatio: "2:3", exact: false },
  } as Record<string, { aspectRatio: string; exact: boolean }>,
};

export function getProviderSizeFromMap<T extends "sdxl" | "openai" | "gemini">(
  provider: T,
  posterFormatId?: string,
):
  | (T extends "sdxl" ? { width: number; height: number; exact: boolean } : never)
  | (T extends "openai" ? { size: "1024x1024" | "1024x1536" | "1536x1024"; exact: boolean } : never)
  | (T extends "gemini" ? { aspectRatio: string; exact: boolean } : never)
  | null {
  if (!posterFormatId) return null;
  // deno-lint-ignore no-explicit-any
  const map = (PROVIDER_SIZE_MAP as any)[provider];
  if (!map) return null;
  return map[posterFormatId] ?? null;
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
): {
  width: number;
  height: number;
  source: "map" | "format" | "aspect" | "default";
  exact: boolean;
} {
  // 1. Hard map (preferred — single source of truth)
  const mapped = getProviderSizeFromMap("sdxl", posterFormatId);
  if (mapped) {
    return { width: mapped.width, height: mapped.height, source: "map", exact: mapped.exact };
  }

  // 2. Fallback: derive from format / aspect-ratio (legacy heuristic)
  const format = getPrintFormat(posterFormatId);
  const ratio = format?.aspectRatioDecimal ?? aspectRatioToDecimal(aspectRatio);

  if (!ratio) {
    return { width: 1024, height: 1024, source: "default", exact: false };
  }

  const LONG_SIDE_TARGET = 1344;
  const SHORT_SIDE_FLOOR = 768;

  let width: number, height: number;
  if (ratio >= 1) {
    width = LONG_SIDE_TARGET;
    height = Math.max(SHORT_SIDE_FLOOR, Math.round(LONG_SIDE_TARGET / ratio));
  } else {
    height = LONG_SIDE_TARGET;
    width = Math.max(SHORT_SIDE_FLOOR, Math.round(LONG_SIDE_TARGET * ratio));
  }

  const snapped = { width: snap(width), height: snap(height) };
  // Heuristic dimensions are approximate by definition.
  return {
    ...snapped,
    source: format ? "format" : "aspect",
    exact: false,
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
): {
  size: OpenAISize;
  width: number;
  height: number;
  source: "map" | "format" | "aspect" | "default";
  exact: boolean;
} {
  // 1. Hard map (preferred)
  const mapped = getProviderSizeFromMap("openai", posterFormatId);
  if (mapped) {
    const [w, h] = mapped.size.split("x").map(Number);
    return { size: mapped.size, width: w, height: h, source: "map", exact: mapped.exact };
  }

  // 2. Fallback: derive from format / aspect-ratio
  const format = getPrintFormat(posterFormatId);
  const ratio = format?.aspectRatioDecimal ?? aspectRatioToDecimal(aspectRatio);

  if (!ratio) {
    return { size: "1024x1024", width: 1024, height: 1024, source: "default", exact: false };
  }

  const source: "format" | "aspect" = format ? "format" : "aspect";

  if (ratio > 1.05) return { size: "1536x1024", width: 1536, height: 1024, source, exact: false };
  if (ratio < 0.95) return { size: "1024x1536", width: 1024, height: 1536, source, exact: false };
  return { size: "1024x1024", width: 1024, height: 1024, source, exact: false };
}

// ── Gemini ──────────────────────────────────────────────────────────────

/**
 * Resolve the aspect-ratio Gemini should target for the given poster
 * format. Gemini doesn't expose explicit pixel dimensions through our
 * gateway call, so this is informational — the prompt compiler still
 * carries the COMPOSITION FORMAT directive. We surface it through the
 * normalized response so the UI can flag "approximate" outputs.
 */
export function geminiAspectForFormat(
  posterFormatId?: string,
  aspectRatio?: string,
): { aspectRatio: string; source: "map" | "format" | "aspect" | "default"; exact: boolean } {
  const mapped = getProviderSizeFromMap("gemini", posterFormatId);
  if (mapped) {
    return { aspectRatio: mapped.aspectRatio, source: "map", exact: mapped.exact };
  }
  const format = getPrintFormat(posterFormatId);
  if (format) return { aspectRatio: format.aspectRatio, source: "format", exact: false };
  if (aspectRatio) return { aspectRatio, source: "aspect", exact: false };
  return { aspectRatio: "1:1", source: "default", exact: false };
}
