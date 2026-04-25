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

import { useCallback, useMemo, useState } from "react";
import {
  preparePrintExport,
  downloadPrintExport,
} from "@/lib/print-export";
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

/**
 * Build an optional text snippet to APPEND to the user's prompt before it
 * is sent to the existing generation pipeline. Never mutates the compiler.
 *
 *   - composer mode + safe area → ask the model to leave clean empty space
 *   - generated mode            → keep the existing text-in-image behavior:
 *                                 echo title/subtitle into the prompt as
 *                                 "include the words …" so it survives
 *                                 the prompt compiler unchanged.
 */
export function buildPromptHint(state: PosterState): string {
  if (state.textMode === "composer") {
    if (!state.layout.safeAreaEnabled) return "";
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
  scale: number; // multiplier vs. the 1000px reference height in templates
}

function drawTextOverlay({ ctx, state, rect, scale }: OverlayRenderOptions) {
  const tpl = getPosterTemplate(state.templateId);
  const t = tpl.typography;

  // Background band
  ctx.fillStyle = state.layout.safeAreaBackground ?? t.titleColor === "#111111" ? "#ffffff" : (state.layout.safeAreaBackground ?? "#ffffff");
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const padX = Math.round(rect.width * 0.06);
  const padY = Math.round(rect.height * 0.12);
  const innerLeft = rect.x + padX;
  const innerRight = rect.x + rect.width - padX;
  const innerWidth = innerRight - innerLeft;
  const align = t.align;

  let cursorY = rect.y + padY;
  ctx.textBaseline = "top";
  ctx.textAlign = align;

  const xForAlign =
    align === "left" ? innerLeft : align === "right" ? innerRight : (innerLeft + innerRight) / 2;

  // Title
  if (state.text.title) {
    const sizePx = Math.max(12, Math.round(t.titleSize * scale));
    ctx.font = `700 ${sizePx}px ${t.titleFontFamily}`;
    ctx.fillStyle = t.titleColor;
    const text = t.titleUppercase ? state.text.title.toUpperCase() : state.text.title;
    // Letter-spacing fallback: canvas has no native letter-spacing, but
    // most browsers honour the canvas2d `letterSpacing` property nowadays.
    // Use it when available; ignore otherwise.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).letterSpacing = t.titleLetterSpacing;
    } catch { /* noop */ }
    wrapAndDrawText(ctx, text, xForAlign, cursorY, innerWidth, sizePx * 1.1);
    const lines = countWrappedLines(ctx, text, innerWidth);
    cursorY += lines * sizePx * 1.1 + sizePx * 0.25;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).letterSpacing = "0";
    } catch { /* noop */ }
  }

  // Subtitle
  if (state.text.subtitle) {
    const sizePx = Math.max(10, Math.round(t.subtitleSize * scale));
    ctx.font = `400 ${sizePx}px ${t.bodyFontFamily}`;
    ctx.fillStyle = t.bodyColor;
    wrapAndDrawText(ctx, state.text.subtitle, xForAlign, cursorY, innerWidth, sizePx * 1.3);
    const lines = countWrappedLines(ctx, state.text.subtitle, innerWidth);
    cursorY += lines * sizePx * 1.3 + sizePx * 0.4;
  }

  // Description
  if (state.text.description) {
    const sizePx = Math.max(10, Math.round(t.bodySize * scale));
    ctx.font = `400 ${sizePx}px ${t.bodyFontFamily}`;
    ctx.fillStyle = t.bodyColor;
    wrapAndDrawText(ctx, state.text.description, xForAlign, cursorY, innerWidth, sizePx * 1.4);
  }

  // Ingredients (rendered as a single dot-separated line beneath everything)
  if (state.text.ingredients && state.text.ingredients.length > 0) {
    const sizePx = Math.max(10, Math.round(t.bodySize * scale));
    ctx.font = `400 ${sizePx}px ${t.bodyFontFamily}`;
    ctx.fillStyle = t.bodyColor;
    const line = state.text.ingredients.join("  ·  ");
    const yLine = rect.y + rect.height - padY - sizePx;
    wrapAndDrawText(ctx, line, xForAlign, yLine, innerWidth, sizePx * 1.3);
  }
}

/** Wrap-and-draw using the active ctx font. */
function wrapAndDrawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
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
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
}

function countWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): number {
  const words = text.split(/\s+/);
  let lines = 1;
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (ctx.measureText(test).width <= maxWidth) current = test;
    else {
      lines++;
      current = w;
    }
  }
  return lines;
}

// ── Export (delegates artwork render to existing print-export.ts) ────────

interface ExportPosterOptions {
  /** When true, write text overlay at export time. Defaults to true for
   *  composer mode and false for generated mode. */
  renderOverlay?: boolean;
  mimeType?: string;
  quality?: number;
}

export async function exportPoster(
  state: PosterState,
  opts: ExportPosterOptions = {},
): Promise<PosterExportResult> {
  if (!state.imageUrl) throw new Error("Poster has no image to export.");

  const printFormatId = state.printFormatId ?? DEFAULT_PRINT_FORMAT_ID;
  const format = getPrintFormat(printFormatId);
  if (!format) throw new Error(`Unknown print format: ${printFormatId}`);

  // 1. Reuse existing print export to get the high-res normalized artwork.
  const base = await preparePrintExport({
    imageUrl: state.imageUrl,
    printFormatId,
    ratioMethod: "pad",
    padColor: state.layout.safeAreaBackground ?? "#ffffff",
    mimeType: "image/png",
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
  const canvas = document.createElement("canvas");
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for poster export.");

  // Draw the print-ready artwork as the bottom layer.
  const artwork = await blobToImage(base.blob);
  ctx.drawImage(artwork, 0, 0, base.width, base.height);

  // Draw the safe-area band + typography on top.
  const rect = getSafeArea(state.layout, base.width, base.height);
  if (rect) {
    // Reference for typography sizes is a 1000px-tall poster; scale up.
    const scale = base.height / 1000;
    drawTextOverlay({ ctx, state, rect, scale });
  }

  const mime = opts.mimeType ?? "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Poster export failed"))),
      mime,
      opts.quality ?? 1,
    );
  });

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
  printFormatId?: string;
}

export function usePosterComposer(init: UsePosterComposerInit) {
  const initial: PosterState = useMemo(() => {
    const tpl = getPosterTemplate(init.templateId ?? "fika");
    return {
      templateId: tpl.id,
      textMode: init.textMode ?? "composer",
      text: { ...tpl.defaultText },
      layout: { ...tpl.defaultLayout },
      imageUrl: init.imageUrl,
      printFormatId: init.printFormatId,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<PosterState>(initial);

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
