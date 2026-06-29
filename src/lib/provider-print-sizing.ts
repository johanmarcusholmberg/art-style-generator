/**
 * Provider print sizing (corrected Plan #1).
 *
 * Goal: when a generation runs with `sizeIntent: "print"`, ask each
 * provider for the LARGEST supported pixel size that still preserves the
 * selected poster format's aspect ratio within a small tolerance.
 *
 * Design rules (per user feedback):
 *   - Never hard-code one size (e.g. 1536×2048) across all portrait
 *     formats — 5:7, 3:4 and ISO-A all have different ratios.
 *   - OpenAI sizing is model-aware: `gpt-image-1` / `mini` only accept
 *     three fixed sizes; flexible sizes are only emitted when the model
 *     entry explicitly opts in via `supportsFlexibleDimensions`.
 *   - Gemini sizing stays as an aspect-ratio token unless the model entry
 *     explicitly opts in via `supportsImageSizeParameter`. We never emit
 *     a vague "hi-res hint"; only real API parameters.
 *   - `sizeIntent: "preview" | "standard"` returns the legacy small map
 *     so the variant fan-out keeps its current cost profile.
 *
 * This module is pure and side-effect free; UI, router, and edge code
 * call it as the single source of truth for print-intent sizing.
 */

import { getPrintFormat, isAspectRatioMatch } from "@/lib/print-formats";
import { getModelById } from "@/lib/generation-providers/registry";
import { getProviderSize } from "@/lib/provider-size-map";
import { gptImage2SizeForFormat } from "@/lib/openai-gpt-image-2-sizes";

export type SizeIntent = "preview" | "standard" | "print";

export interface ResolvedSdxlSize {
  provider: "sdxl";
  width: number;
  height: number;
  exact: boolean;
  aspectRatioPreserved: boolean;
  intent: SizeIntent;
}

export interface ResolvedOpenAISize {
  provider: "openai";
  /** When fixed, one of OpenAI's three legal sizes. When flexible, "WxH". */
  size: string;
  width: number;
  height: number;
  exact: boolean;
  aspectRatioPreserved: boolean;
  intent: SizeIntent;
  /** True if the result came from the model's flexible-dimensions branch. */
  flexible: boolean;
}

export interface ResolvedGeminiSize {
  provider: "gemini";
  aspectRatio: string;
  /** Only set when the chosen model opts into the imageSize parameter. */
  imageSize?: { width: number; height: number };
  exact: boolean;
  aspectRatioPreserved: boolean;
  intent: SizeIntent;
}

export type ResolvedProviderSize =
  | ResolvedSdxlSize
  | ResolvedOpenAISize
  | ResolvedGeminiSize;

/** SDXL hard ceiling (long edge px). Matches registry `nativeMaxLongEdge`. */
const SDXL_PRINT_LONG_EDGE = 1984;
/** SDXL must request dimensions in multiples of this many pixels. */
const SDXL_MULTIPLE = 8;
/** Aspect-ratio tolerance for "preserves the target ratio". */
const ASPECT_TOLERANCE = 0.005;

function snap(n: number, mult: number): number {
  return Math.max(mult, Math.round(n / mult) * mult);
}

/**
 * Pick the multiple-of-`mult` value (floor or ceil) that produces the
 * closest aspect ratio to the target. Lets ratio fit win over the naive
 * rounding when a different bucket is a better match.
 */
function snapForRatio(
  ideal: number,
  fixedAxis: number,
  targetRatio: number,
  mult: number,
  axis: "width" | "height",
): number {
  const floor = Math.max(mult, Math.floor(ideal / mult) * mult);
  const ceil = Math.max(mult, Math.ceil(ideal / mult) * mult);
  const ratio = (val: number) =>
    axis === "width" ? val / fixedAxis : fixedAxis / val;
  const err = (val: number) => Math.abs(ratio(val) - targetRatio) / targetRatio;
  const errFloor = err(floor);
  const errCeil = err(ceil);
  // Within tolerance, prefer the larger candidate (more pixels for print).
  if (errFloor <= ASPECT_TOLERANCE && errCeil <= ASPECT_TOLERANCE) {
    return Math.max(floor, ceil);
  }
  return errFloor <= errCeil ? floor : ceil;
}

/** Resolve SDXL pixel dims that preserve the format ratio at print intent. */
function resolveSdxlPrintSize(formatId: string): ResolvedSdxlSize | null {
  const fmt = getPrintFormat(formatId);
  if (!fmt) return null;
  const ratio = fmt.aspectRatioDecimal;
  // Long edge = SDXL_PRINT_LONG_EDGE; short edge derived from ratio.
  let width: number, height: number;
  if (ratio >= 1) {
    width = SDXL_PRINT_LONG_EDGE;
    height = snapForRatio(SDXL_PRINT_LONG_EDGE / ratio, width, ratio, SDXL_MULTIPLE, "height");
  } else {
    height = SDXL_PRINT_LONG_EDGE;
    width = snapForRatio(SDXL_PRINT_LONG_EDGE * ratio, height, ratio, SDXL_MULTIPLE, "width");
  }
  const preserved = isAspectRatioMatch(width, height, ratio, ASPECT_TOLERANCE);
  return {
    provider: "sdxl",
    width,
    height,
    // SDXL can only land on multiples of 8, so "exact" means the snapped
    // ratio matches within tolerance.
    exact: preserved,
    aspectRatioPreserved: preserved,
    intent: "print",
  };
}

/** Resolve OpenAI sizing for print intent, respecting per-model capability. */
function resolveOpenAIPrintSize(
  formatId: string,
  modelId?: string,
): ResolvedOpenAISize | null {
  const fmt = getPrintFormat(formatId);
  if (!fmt) return null;
  const ratio = fmt.aspectRatioDecimal;

  const model = modelId ? getModelById(modelId) : undefined;
  const flexible = !!model?.supportsFlexibleDimensions;

  if (flexible) {
    // Flexible-dimension OpenAI models (gpt-image-2). When the poster
    // format has an exact pixel mapping, use it verbatim — no near-ratio
    // fallback, no white padding, no legacy fixed sizes.
    const exact = gptImage2SizeForFormat(formatId);
    if (exact) {
      return {
        provider: "openai",
        size: `${exact.width}x${exact.height}`,
        width: exact.width,
        height: exact.height,
        exact: true,
        aspectRatioPreserved: true,
        intent: "print",
        flexible: true,
      };
    }
    // Unmapped formats (e.g. print_50x50, print_30x40): compute a
    // ratio-preserving size capped at the model's long edge. Dimensions
    // are multiples of 16 to satisfy gpt-image-2.
    const LONG = Math.min(3168, model?.nativeMaxLongEdge ?? 2048);
    const MULT = 16;
    let width: number, height: number;
    if (ratio >= 1) {
      width = LONG;
      height = snapForRatio(LONG / ratio, width, ratio, MULT, "height");
    } else {
      height = LONG;
      width = snapForRatio(LONG * ratio, height, ratio, MULT, "width");
    }
    const preserved = isAspectRatioMatch(width, height, ratio, ASPECT_TOLERANCE);
    return {
      provider: "openai",
      size: `${width}x${height}`,
      width,
      height,
      exact: preserved,
      aspectRatioPreserved: preserved,
      intent: "print",
      flexible: true,
    };
  }

  // Fixed-size models (gpt-image-1 / mini / 1.5): only the three legal
  // sizes are valid. Pick the closest portrait/landscape/square match.
  let size: "1024x1024" | "1024x1536" | "1536x1024";
  let width: number, height: number;
  if (ratio > 1.05) {
    size = "1536x1024";
    width = 1536;
    height = 1024;
  } else if (ratio < 0.95) {
    size = "1024x1536";
    width = 1024;
    height = 1536;
  } else {
    size = "1024x1024";
    width = 1024;
    height = 1024;
  }
  const preserved = isAspectRatioMatch(width, height, ratio, ASPECT_TOLERANCE);
  return {
    provider: "openai",
    size,
    width,
    height,
    exact: preserved,
    aspectRatioPreserved: preserved,
    intent: "print",
    flexible: false,
  };
}

/** Resolve Gemini sizing — aspect-ratio token by default, imageSize only when supported. */
function resolveGeminiPrintSize(
  formatId: string,
  modelId?: string,
): ResolvedGeminiSize | null {
  const fmt = getPrintFormat(formatId);
  if (!fmt) return null;
  const ratio = fmt.aspectRatioDecimal;

  // Pick the closest Gemini-supported aspect token.
  // Supported tokens (per ai-models-catalog): "1:1" | "3:4" | "2:3" | "4:3" | "3:2" | "16:9" | "9:16".
  const candidates: { token: string; ratio: number }[] = [
    { token: "1:1", ratio: 1 },
    { token: "3:4", ratio: 3 / 4 },
    { token: "2:3", ratio: 2 / 3 },
    { token: "4:3", ratio: 4 / 3 },
    { token: "3:2", ratio: 3 / 2 },
    { token: "16:9", ratio: 16 / 9 },
    { token: "9:16", ratio: 9 / 16 },
  ];
  const best = candidates.reduce((a, b) =>
    Math.abs(b.ratio - ratio) < Math.abs(a.ratio - ratio) ? b : a,
  );
  const preserved = Math.abs(best.ratio - ratio) / ratio <= ASPECT_TOLERANCE;

  const model = modelId ? getModelById(modelId) : undefined;
  // Only attach an imageSize when the configured Gemini model explicitly
  // supports the parameter. Otherwise we send aspect ratio only — exactly
  // what today's adapter does.
  let imageSize: { width: number; height: number } | undefined;
  if (model?.supportsImageSizeParameter) {
    const LONG = Math.min(2048, model.nativeMaxLongEdge ?? 2048);
    const MULT = 64;
    if (ratio >= 1) {
      imageSize = { width: LONG, height: snap(LONG / ratio, MULT) };
    } else {
      imageSize = { width: snap(LONG * ratio, MULT), height: LONG };
    }
  }

  return {
    provider: "gemini",
    aspectRatio: best.token,
    imageSize,
    exact: preserved,
    aspectRatioPreserved: preserved,
    intent: "print",
  };
}

/**
 * Resolve provider-specific sizing for a given (provider, modelId, formatId, intent).
 *
 * For `preview` and `standard` intents we return the legacy small map
 * verbatim, so the variant fan-out keeps its current cheap sizes. Only
 * `print` consults the per-format ratio-preserving logic above.
 */
export function resolvePrintSize(input: {
  provider: "sdxl" | "openai" | "gemini";
  modelId?: string;
  formatId?: string;
  intent: SizeIntent;
}): ResolvedProviderSize | null {
  const { provider, modelId, formatId, intent } = input;
  if (!formatId) return null;

  if (intent !== "print") {
    // Preserve today's behavior for preview/standard exactly.
    if (provider === "sdxl") {
      const legacy = getProviderSize("sdxl", formatId);
      if (!legacy) return null;
      return {
        provider: "sdxl",
        width: legacy.width,
        height: legacy.height,
        exact: legacy.exact,
        aspectRatioPreserved: legacy.exact,
        intent,
      };
    }
    if (provider === "openai") {
      const legacy = getProviderSize("openai", formatId);
      if (!legacy) return null;
      const [w, h] = legacy.size.split("x").map(Number);
      return {
        provider: "openai",
        size: legacy.size,
        width: w,
        height: h,
        exact: legacy.exact,
        aspectRatioPreserved: legacy.exact,
        intent,
        flexible: false,
      };
    }
    const legacy = getProviderSize("gemini", formatId);
    if (!legacy) return null;
    return {
      provider: "gemini",
      aspectRatio: legacy.aspectRatio,
      exact: legacy.exact,
      aspectRatioPreserved: legacy.exact,
      intent,
    };
  }

  if (provider === "sdxl") return resolveSdxlPrintSize(formatId);
  if (provider === "openai") return resolveOpenAIPrintSize(formatId, modelId);
  return resolveGeminiPrintSize(formatId, modelId);
}

// ── Adapter overrides — wire-format hints sent to edge functions ────────

/**
 * Compute the wire-format size overrides an adapter should attach to its
 * edge-function body for a given (provider, modelId, formatId, intent).
 *
 * Returns `null` when no override should be sent (preview/standard intent,
 * missing formatId, etc.) — the edge function then falls back to its
 * existing legacy sizing logic, preserving current behavior exactly.
 */
export interface AdapterSizingOverrides {
  sizeIntent: SizeIntent;
  /** SDXL/Replicate: explicit width × height in px (multiples of 8). */
  requestedWidth?: number;
  requestedHeight?: number;
  /** OpenAI: explicit "WxH" size string (flexible-dim models only). */
  requestedSize?: string;
  /** Gemini: explicit aspect-ratio token to send. */
  requestedAspectRatio?: string;
  /** Gemini: explicit imageSize {w,h} — only when model opts in. */
  imageSize?: { width: number; height: number };
  /** True when the override preserves the poster format ratio. */
  aspectRatioPreserved?: boolean;
}

export function resolveAdapterSizingOverrides(input: {
  provider: "sdxl" | "openai" | "gemini";
  modelId?: string;
  formatId?: string;
  intent?: SizeIntent;
}): AdapterSizingOverrides | null {
  const intent: SizeIntent = input.intent ?? "standard";
  // Preview/standard preserves today's edge-side defaults — emit nothing
  // beyond the intent itself.
  if (intent !== "print") return { sizeIntent: intent };
  const resolved = resolvePrintSize({
    provider: input.provider,
    modelId: input.modelId,
    formatId: input.formatId,
    intent,
  });
  if (!resolved) return { sizeIntent: intent };

  if (resolved.provider === "sdxl") {
    return {
      sizeIntent: intent,
      requestedWidth: resolved.width,
      requestedHeight: resolved.height,
      aspectRatioPreserved: resolved.aspectRatioPreserved,
    };
  }
  if (resolved.provider === "openai") {
    // Only forward an explicit size when the model supports flexible
    // dimensions — for fixed-size models the edge function's existing
    // openaiSizeForFormat() already returns a legal size.
    if (!resolved.flexible) {
      return { sizeIntent: intent, aspectRatioPreserved: resolved.aspectRatioPreserved };
    }
    return {
      sizeIntent: intent,
      requestedSize: resolved.size,
      aspectRatioPreserved: resolved.aspectRatioPreserved,
    };
  }
  // Gemini
  return {
    sizeIntent: intent,
    requestedAspectRatio: resolved.aspectRatio,
    imageSize: resolved.imageSize,
    aspectRatioPreserved: resolved.aspectRatioPreserved,
  };
}

// ── Variant-Keep deterministic-replay capability ────────────────────────

/**
 * Returns whether the configured model supports deterministic seed replay
 * end-to-end (provider AND our adapter). When false, re-generating with
 * the same prompt would produce a different image — so the Variant Fan-Out
 * "Keep" action must NOT silently replace the user's chosen variant.
 *
 * Today no adapter wires a seed parameter through, so this returns false
 * for every model. The flag lives on the registry so individual entries
 * can opt in as the capability ships.
 */
export function supportsDeterministicSeedReplay(modelId?: string): boolean {
  if (!modelId) return false;
  const entry = getModelById(modelId);
  return !!entry?.supportsDeterministicSeedReplay;
}

