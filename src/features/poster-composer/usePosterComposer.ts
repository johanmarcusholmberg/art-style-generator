/**
 * Poster Composer — state hook + pure helpers.
 *
 * The hook owns local PosterState, exposes setters, and provides:
 *   - `getSafeArea()` for preview & export geometry
 *   - `buildPromptHint()` for the optional layout/text hint that is
 *     APPENDED to the user prompt by the caller (we never touch the
 *     compiler or the generation pipeline itself)
 *   - `exportPoster()` which delegates the artwork render to the existing
 *     `preparePrintExport` and then composites the text overlay on top
 *
 * No state crosses module boundaries; the hook is intentionally local.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  preparePrintExport,
  downloadPrintExport,
} from "@/lib/print-export";
import {
  type ExportFormat,
  encodeCanvasToBlob,
  getStoredExportFormat,
} from "@/lib/export-formats";
import { DEFAULT_PRINT_FORMAT_ID, getPrintFormat } from "@/lib/print-formats";
import { POSTER_TEMPLATES, getPosterTemplate } from "./poster-templates";
import type {
  PosterExportResult,
  PosterLayoutConfig,
  PosterState,
  PosterTemplateId,
  PosterTextContent,
  PosterTextMode,
} from "./poster-types";

// ── Surface background (single source of truth) ──────────────────────────

const FALLBACK_POSTER_BACKGROUND = "#f5efe4";

/**
 * Resolve THE poster surface colour — used for the outer frame, margins,
 * the safe-area band, and the export canvas. Order of precedence:
 *   1. `state.layout.backgroundColor` (user-edited)
 *   2. `state.layout.safeAreaBackground` (legacy field)
 *   3. template default `defaultLayout.backgroundColor`
 *   4. global fallback
 */
export function resolvePosterSurfaceBackground(state: PosterState): string {
  const layout = state.layout;
  if (layout.backgroundColor) return layout.backgroundColor;
  if (layout.safeAreaBackground) return layout.safeAreaBackground;
  const tpl = getPosterTemplate(state.templateId);
  return tpl.defaultLayout.backgroundColor ?? FALLBACK_POSTER_BACKGROUND;
}

// ── Geometry ─────────────────────────────────────────────────────────────

export interface SafeAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pure geometry helper — returns `null` when the safe area is disabled.
 * Width is always the full canvas width; height is `ratio * canvasHeight`.
 */
export function getSafeArea(
  layout: PosterLayoutConfig,
  canvasWidth: number,
  canvasHeight: number,
): SafeAreaRect | null {
  if (!layout.safeAreaEnabled || layout.safeAreaHeightRatio <= 0) return null;
  const height = Math.round(canvasHeight * layout.safeAreaHeightRatio);
  if (layout.safeAreaPosition === "bottom") {
    return { x: 0, y: canvasHeight - height, width: canvasWidth, height };
  }
  return { x: 0, y: 0, width: canvasWidth, height };
}

// ── Prompt-hint builder (additive only) ──────────────────────────────────

/** True when ANY non-empty text field is present on the poster. */
export function hasPosterText(text: PosterTextContent | undefined): boolean {
  if (!text) return false;
  return Boolean(
    text.title?.trim() ||
      text.subtitle?.trim() ||
      text.description?.trim() ||
      text.ingredients?.some((i) => i.trim()),
  );
}

/**
 * Build an optional text snippet to APPEND to the user's prompt before it
 * is sent to the existing generation pipeline. Never mutates the compiler.
 *
 * STRICT rules (no accidental layout artifacts):
 *   - composer mode → only emit the "leave clean empty space" hint when
 *     the user has BOTH enabled the safe area AND entered some text.
 *   - generated mode → only emit the "include this text" hint when the
 *     user typed a title/subtitle. The safe area is irrelevant here.
 *   - otherwise → return "" so the generator runs untouched.
 */
export function buildPromptHint(state: PosterState): string {
  if (state.textMode === "composer") {
    if (!state.layout.safeAreaEnabled) return "";
    if (!hasPosterText(state.text)) return "";
    const where = state.layout.safeAreaPosition;
    return `Leave clean empty space at the ${where} of the image for later text layout, with minimal details in that area.`;
  }
  // textMode === "generated" — surface the requested text to the model.
  const parts: string[] = [];
  if (state.text.title) parts.push(`title "${state.text.title}"`);
  if (state.text.subtitle) parts.push(`subtitle "${state.text.subtitle}"`);
  if (parts.length === 0) return "";
  return `Include the following text inside the image as integrated typography: ${parts.join(", ")}.`;
}

// ── Text overlay rendering (used by both preview canvas + export) ────────

interface OverlayRenderOptions {
  ctx: CanvasRenderingContext2D;
  state: PosterState;
  rect: SafeAreaRect;
  /** Multiplier vs. the 1000px reference used by legacy size fields. */
  scale: number;
  /** Multiplier vs. the 1000px reference for spacing (gap/padding). */
  spaceScale: number;
  /** Optional outparam — set to true if text was shrunk or overflowed. */
  onOverflow?: (info: { shrunk: boolean; overflowed: boolean }) => void;
}

interface BlockMetrics {
  font: string;
  text: string;
  color: string;
  letterSpacing: string;
  sizePx: number;
  lineHeight: number;
  maxWidth: number;
  lines: string[];
  height: number;
}

function resolveSize(
  ratio: number | undefined,
  legacyPx: number,
  shortEdge: number,
  scale: number,
  shrink: number,
): number {
  const base = ratio ? ratio * shortEdge : legacyPx * scale;
  return Math.max(8, Math.round(base * shrink));
}

function buildBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  color: string,
  letterSpacing: string,
  sizePx: number,
  lineHeight: number,
  maxWidth: number,
): BlockMetrics {
  ctx.font = font;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).letterSpacing = letterSpacing;
  } catch { /* noop */ }
  const lines = wrapLines(ctx, text, maxWidth);
  return {
    font,
    text,
    color,
    letterSpacing,
    sizePx,
    lineHeight,
    maxWidth,
    lines,
    height: lines.length * sizePx * lineHeight,
  };
}

function drawTextOverlay({
  ctx,
  state,
  rect,
  scale,
  spaceScale,
  onOverflow,
}: OverlayRenderOptions) {
  const tpl = getPosterTemplate(state.templateId);
  const t = tpl.typography;
  const surface = resolvePosterSurfaceBackground(state);

  // Background band — uses the unified poster surface colour so the band
  // is visually identical to the outer frame / margins.
  ctx.fillStyle = surface;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  // Subtle gradient fade between artwork and text area (8–12px).
  const fadePx = Math.max(8, Math.min(12, Math.round(rect.height * 0.04)));
  const isBottom = state.layout.safeAreaPosition === "bottom";
  const gradient = isBottom
    ? ctx.createLinearGradient(0, rect.y - fadePx, 0, rect.y + fadePx)
    : ctx.createLinearGradient(0, rect.y + rect.height - fadePx, 0, rect.y + rect.height + fadePx);
  // Same colour as the surface, fading from transparent to opaque so the
  // image edge is gently softened.
  gradient.addColorStop(0, hexToRgba(surface, 0));
  gradient.addColorStop(1, surface);
  ctx.fillStyle = gradient;
  if (isBottom) {
    ctx.fillRect(rect.x, rect.y - fadePx, rect.width, fadePx * 2);
  } else {
    ctx.fillRect(rect.x, rect.y + rect.height - fadePx, rect.width, fadePx * 2);
  }

  // Reset to surface for any further fills inside the band.
  const padding = Math.max(8, Math.round(t.blockPadding * spaceScale));
  const gap = Math.max(4, Math.round(t.blockGap * spaceScale));
  const innerLeft = rect.x + padding;
  const innerRight = rect.x + rect.width - padding;
  const innerWidth = innerRight - innerLeft;
  const innerTop = rect.y + padding;
  const innerBottom = rect.y + rect.height - padding;
  const innerHeight = innerBottom - innerTop;
  const align = t.align;
  const xForAlign =
    align === "left" ? innerLeft : align === "right" ? innerRight : (innerLeft + innerRight) / 2;

  const shortEdge = Math.min(rect.width, Math.round(rect.height / Math.max(0.01, state.layout.safeAreaHeightRatio)));

  // Try rendering at full size, shrinking up to 25% if overflowing.
  let shrunk = false;
  let overflowed = false;
  let blocks: BlockMetrics[] = [];
  let totalHeight = 0;

  for (let attempt = 0; attempt < 6; attempt++) {
    const shrink = 1 - attempt * 0.05; // 1.00 → 0.75
    blocks = [];
    totalHeight = 0;

    if (state.text.title) {
      const sizePx = resolveSize(t.titleSizeRatio, t.titleSize, shortEdge, scale, shrink);
      const text = t.titleUppercase ? state.text.title.toUpperCase() : state.text.title;
      const block = buildBlock(
        ctx,
        text,
        `700 ${sizePx}px ${t.titleFontFamily}`,
        t.titleColor,
        t.titleLetterSpacing,
        sizePx,
        t.titleLineHeight,
        innerWidth * t.titleMaxWidthRatio,
      );
      blocks.push(block);
      totalHeight += block.height;
    }
    if (state.text.subtitle) {
      const sizePx = resolveSize(t.subtitleSizeRatio, t.subtitleSize, shortEdge, scale, shrink);
      const block = buildBlock(
        ctx,
        state.text.subtitle,
        `400 ${sizePx}px ${t.bodyFontFamily}`,
        t.bodyColor,
        t.subtitleLetterSpacing,
        sizePx,
        t.subtitleLineHeight,
        innerWidth * t.subtitleMaxWidthRatio,
      );
      blocks.push(block);
      totalHeight += block.height;
    }
    if (state.text.description) {
      const sizePx = resolveSize(t.descriptionSizeRatio, t.bodySize, shortEdge, scale, shrink);
      const block = buildBlock(
        ctx,
        state.text.description,
        `400 ${sizePx}px ${t.bodyFontFamily}`,
        t.bodyColor,
        t.descriptionLetterSpacing,
        sizePx,
        t.descriptionLineHeight,
        innerWidth * t.descriptionMaxWidthRatio,
      );
      blocks.push(block);
      totalHeight += block.height;
    }

    const ingredientsBlock = (() => {
      if (!state.text.ingredients || state.text.ingredients.length === 0) return null;
      const sizePx = resolveSize(t.descriptionSizeRatio, t.bodySize, shortEdge, scale, shrink);
      return buildBlock(
        ctx,
        state.text.ingredients.join("  ·  "),
        `400 ${sizePx}px ${t.bodyFontFamily}`,
        t.bodyColor,
        t.descriptionLetterSpacing,
        sizePx,
        t.descriptionLineHeight,
        innerWidth * t.descriptionMaxWidthRatio,
      );
    })();
    if (ingredientsBlock) {
      blocks.push(ingredientsBlock);
      totalHeight += ingredientsBlock.height;
    }

    const totalWithGaps = totalHeight + gap * Math.max(0, blocks.length - 1);
    if (totalWithGaps <= innerHeight) {
      if (attempt > 0) shrunk = true;
      break;
    }
    if (attempt === 5) overflowed = true;
  }

  // Vertically center the stack inside the band.
  const totalWithGaps =
    blocks.reduce((sum, b) => sum + b.height, 0) + gap * Math.max(0, blocks.length - 1);
  let cursorY = innerTop + Math.max(0, (innerHeight - totalWithGaps) / 2);

  ctx.textBaseline = "top";
  ctx.textAlign = align;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    ctx.font = b.font;
    ctx.fillStyle = b.color;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).letterSpacing = b.letterSpacing;
    } catch { /* noop */ }
    b.lines.forEach((line, idx) => {
      ctx.fillText(line, xForAlign, cursorY + idx * b.sizePx * b.lineHeight);
    });
    cursorY += b.height + gap;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).letterSpacing = "0";
  } catch { /* noop */ }

  onOverflow?.({ shrunk, overflowed });
}

/** Pure helper — wrap text into lines for the active ctx font. */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (ctx.measureText(test).width <= maxWidth) current = test;
    else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** "#rrggbb" → "rgba(r,g,b,a)". Falls back to the original colour on parse fail. */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Measure-only pass — mirrors the exact layout logic of `drawTextOverlay`
 * but does not paint. Returns `{ shrunk, overflowed }` so callers (notably
 * the React preview) can surface a warning when the user's text won't fit.
 *
 * Uses an offscreen 2D context so it can run safely from a React render
 * pass without touching the visible DOM.
 */
export function measurePosterOverlay(
  state: PosterState,
  canvasWidth: number,
  canvasHeight: number,
): { shrunk: boolean; overflowed: boolean } {
  if (state.textMode !== "composer" || !state.layout.safeAreaEnabled) {
    return { shrunk: false, overflowed: false };
  }
  const rect = getSafeArea(state.layout, canvasWidth, canvasHeight);
  if (!rect) return { shrunk: false, overflowed: false };
  if (typeof document === "undefined") return { shrunk: false, overflowed: false };

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { shrunk: false, overflowed: false };

  let result = { shrunk: false, overflowed: false };
  const scale = canvasHeight / 1000;
  drawTextOverlay({
    ctx,
    state,
    rect,
    scale,
    spaceScale: scale,
    onOverflow: (info) => {
      result = info;
    },
  });
  return result;
}

// ── Auto-fit (clickable warning helper) ──────────────────────────────────

/**
 * Suggested length presets when the user clicks "auto-fit". These are the
 * smallest sensible character budgets per field — picked to look balanced
 * on a poster, not just to fit. The fitter walks from largest → smallest
 * preset, then escalates to growing the safe-area band.
 */
const TITLE_PRESETS = [48, 32, 24, 18, 12, 8];
const SUBTITLE_PRESETS = [80, 60, 44, 32, 24, 16];
const DESCRIPTION_PRESETS = [220, 160, 120, 90, 60, 40];
const INGREDIENTS_LIMITS = [12, 8, 6, 4, 3];

const HEIGHT_RAMP = [0.22, 0.26, 0.3, 0.34, 0.4, 0.45];

/** Truncate at a word boundary when possible, append an ellipsis. */
function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  const slice = text.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[\s,.;:!?-]+$/, "") + "…";
}

export interface AutoFitResult {
  text: PosterTextContent;
  layout: PosterLayoutConfig;
  /** True when the safe-area height was bumped to make text fit. */
  bumpedHeight: boolean;
}

/**
 * Iteratively shrinks the user's text using the presets above. If text
 * still overflows at the smallest preset, the safe-area band height is
 * bumped up the HEIGHT_RAMP. Returns `null` when even the largest band
 * with the smallest text cannot fit.
 *
 * Pure helper — does not mutate `state`. Caller applies the result via
 * `setText` / `setLayout`.
 */
export function autoFitPosterText(state: PosterState): AutoFitResult | null {
  if (state.textMode !== "composer" || !state.layout.safeAreaEnabled) {
    return null;
  }

  const baseText = state.text;
  const heightOptions = Array.from(
    new Set([state.layout.safeAreaHeightRatio, ...HEIGHT_RAMP].filter((h) => h > 0)),
  ).sort((a, b) => a - b);

  const tryPreset = (
    titleMax: number,
    subtitleMax: number,
    descriptionMax: number,
    ingredientsMax: number,
    height: number,
  ): AutoFitResult | null => {
    const text: PosterTextContent = {
      title: baseText.title ? truncateText(baseText.title, titleMax) : baseText.title,
      subtitle: baseText.subtitle
        ? truncateText(baseText.subtitle, subtitleMax)
        : baseText.subtitle,
      description: baseText.description
        ? truncateText(baseText.description, descriptionMax)
        : baseText.description,
      ingredients: baseText.ingredients
        ? baseText.ingredients
            .slice(0, ingredientsMax)
            .map((i) => truncateText(i, 24))
        : baseText.ingredients,
    };
    const layout: PosterLayoutConfig = {
      ...state.layout,
      safeAreaHeightRatio: height,
    };
    const probe: PosterState = { ...state, text, layout };
    const info = measurePosterOverlay(probe, 1000, 1400);
    if (!info.overflowed) {
      return {
        text,
        layout,
        bumpedHeight: height > state.layout.safeAreaHeightRatio + 0.001,
      };
    }
    return null;
  };

  // Phase 1 — current band height, walk presets large → small.
  for (let i = 0; i < TITLE_PRESETS.length; i++) {
    const r = tryPreset(
      TITLE_PRESETS[i],
      SUBTITLE_PRESETS[i],
      DESCRIPTION_PRESETS[i],
      INGREDIENTS_LIMITS[Math.min(i, INGREDIENTS_LIMITS.length - 1)],
      state.layout.safeAreaHeightRatio,
    );
    if (r) return r;
  }

  // Phase 2 — bump band height, retry presets large → small at each step.
  for (const h of heightOptions) {
    if (h <= state.layout.safeAreaHeightRatio) continue;
    for (let i = 0; i < TITLE_PRESETS.length; i++) {
      const r = tryPreset(
        TITLE_PRESETS[i],
        SUBTITLE_PRESETS[i],
        DESCRIPTION_PRESETS[i],
        INGREDIENTS_LIMITS[Math.min(i, INGREDIENTS_LIMITS.length - 1)],
        h,
      );
      if (r) return r;
    }
  }

  return null;
}

// ── Export (delegates artwork render to existing print-export.ts) ────────

interface ExportPosterOptions {
  /** When true, write text overlay at export time. Defaults to true for
   *  composer mode and false for generated mode. */
  renderOverlay?: boolean;
  /** Legacy mime override. Ignored when {@link format} is set. */
  mimeType?: string;
  /** Legacy quality override. Ignored when {@link format} is set. */
  quality?: number;
  /** Output format. Defaults to the user's persisted choice. */
  format?: ExportFormat;
}

export async function exportPoster(
  state: PosterState,
  opts: ExportPosterOptions = {},
): Promise<PosterExportResult> {
  if (!state.imageUrl) throw new Error("Poster has no image to export.");

  const printFormatId = state.printFormatId ?? DEFAULT_PRINT_FORMAT_ID;
  const format = getPrintFormat(printFormatId);
  if (!format) throw new Error(`Unknown print format: ${printFormatId}`);

  const surfaceColor = resolvePosterSurfaceBackground(state);
  const exportFormat: ExportFormat = opts.format ?? getStoredExportFormat();

  // 1. Reuse existing print export to get the high-res normalized artwork
  //    (with bleed baked in) in the chosen export format.
  const base = await preparePrintExport({
    imageUrl: state.imageUrl,
    printFormatId,
    ratioMethod: "pad",
    padColor: surfaceColor,
    exportFormat,
  });

  // 2. Decide whether to overlay text. Composer mode always overlays;
  //    generated mode only overlays if explicitly requested.
  const shouldOverlay =
    opts.renderOverlay ??
    (state.textMode === "composer" && state.layout.safeAreaEnabled);

  if (!shouldOverlay) {
    return {
      blob: base.blob,
      width: base.width,
      height: base.height,
      printFormatId: base.printFormatId,
      tier: base.tier,
    };
  }

  // 3. Composite text overlay onto a fresh canvas. We keep the artwork
  //    untouched and draw over a reserved region on top.
  //    The base blob already includes bleed, so the canvas inherits it.
  const canvas = document.createElement("canvas");
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for poster export.");

  // PDF blobs can't be re-decoded as <img>, so when the user picks PDF
  // we first composite as a raster canvas and re-encode at the end.
  // Re-render artwork in PNG to keep the image-load step format-agnostic.
  const artworkSource = base.blob.type.startsWith("image/")
    ? base.blob
    : await (async () => {
        const png = await preparePrintExport({
          imageUrl: state.imageUrl!,
          printFormatId,
          ratioMethod: "pad",
          padColor: surfaceColor,
          exportFormat: "png",
        });
        return png.blob;
      })();
  const artwork = await blobToImage(artworkSource);
  ctx.drawImage(artwork, 0, 0, base.width, base.height);

  // Draw the safe-area band + typography on top.
  const rect = getSafeArea(state.layout, base.width, base.height);
  if (rect) {
    // Reference for typography sizes is a 1000px-tall poster; scale up.
    const scale = base.height / 1000;
    const spaceScale = base.height / 1000;
    drawTextOverlay({ ctx, state, rect, scale, spaceScale });
  }

  const blob = await encodeCanvasToBlob(canvas, exportFormat);

  return {
    blob,
    width: base.width,
    height: base.height,
    printFormatId: base.printFormatId,
    tier: base.tier,
  };
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load print-export image into canvas."));
    };
    img.src = url;
  });
}

export { downloadPrintExport };

// ── Hook ─────────────────────────────────────────────────────────────────

interface UsePosterComposerInit {
  imageUrl: string;
  /** Optional starting template — defaults to "fika". */
  templateId?: PosterTemplateId;
  /** Optional starting text mode — defaults to "composer". */
  textMode?: PosterTextMode;
  /** Optional starting text content — overrides template defaults. */
  initialText?: PosterTextContent;
  printFormatId?: string;
}

export function usePosterComposer(init: UsePosterComposerInit) {
  const initial: PosterState = useMemo(() => {
    const tpl = getPosterTemplate(init.templateId ?? "fika");
    const hasInitialText =
      init.initialText &&
      (init.initialText.title ||
        init.initialText.subtitle ||
        init.initialText.description ||
        (init.initialText.ingredients && init.initialText.ingredients.length > 0));
    return {
      templateId: tpl.id,
      textMode: init.textMode ?? "composer",
      // If caller passed text (e.g. user typed it in the generator), use
      // it instead of the template's placeholder text. Otherwise fall
      // back to the template defaults so the preview is never empty.
      text: hasInitialText
        ? { ...init.initialText }
        : { ...tpl.defaultText },
      layout: { ...tpl.defaultLayout },
      imageUrl: init.imageUrl,
      printFormatId: init.printFormatId,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<PosterState>(initial);

  // Keep imageUrl in sync if the parent regenerates a new artwork while
  // the composer is mounted. Text + layout + template are preserved.
  const lastImageUrlRef = useRef(init.imageUrl);
  useEffect(() => {
    if (init.imageUrl && init.imageUrl !== lastImageUrlRef.current) {
      lastImageUrlRef.current = init.imageUrl;
      setState((s) => ({ ...s, imageUrl: init.imageUrl }));
    }
  }, [init.imageUrl]);

  const setTemplate = useCallback((id: PosterTemplateId) => {
    const tpl = getPosterTemplate(id);
    setState((s) => ({
      ...s,
      templateId: id,
      // Reset text + layout to template defaults to avoid mismatched state.
      text: { ...tpl.defaultText },
      layout: { ...tpl.defaultLayout },
    }));
  }, []);

  const setTextMode = useCallback((mode: PosterTextMode) => {
    setState((s) => ({ ...s, textMode: mode }));
  }, []);

  const setText = useCallback((patch: Partial<PosterTextContent>) => {
    setState((s) => ({ ...s, text: { ...s.text, ...patch } }));
  }, []);

  const setLayout = useCallback((patch: Partial<PosterLayoutConfig>) => {
    setState((s) => ({ ...s, layout: { ...s.layout, ...patch } }));
  }, []);

  const setImageUrl = useCallback((imageUrl: string) => {
    setState((s) => ({ ...s, imageUrl }));
  }, []);

  return {
    state,
    setState,
    setTemplate,
    setTextMode,
    setText,
    setLayout,
    setImageUrl,
    /** Convenience accessors. */
    template: getPosterTemplate(state.templateId),
    safeAreaForPreview: (w: number, h: number) =>
      getSafeArea(state.layout, w, h),
  };
}

export { POSTER_TEMPLATES };
