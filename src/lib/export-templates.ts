/**
 * Etsy-ready export templates.
 *
 * A *template* is a curated bundle of print sizes (multiple aspect ratios,
 * each with multiple physical sizes at a target DPI) that should ship as a
 * single downloadable ZIP for an Etsy digital product.
 *
 * This layer sits *above*:
 *   - `print-presets.ts` (single physical target with DPI math)
 *   - `print-formats.ts` (canvas-export tier metadata)
 *   - `upscale-recipes.ts` (style-aware enhancement choice)
 *
 * Templates are intentionally explicit and hand-curated — easy to extend
 * with new bundles (framed, unframed, with-mockups, lab-specific, etc.)
 * without changing the export pipeline.
 */
import type { PrintPresetUnit } from "@/lib/print-presets";

const CM_PER_INCH = 2.54;
const MM_PER_INCH = 25.4;

function toInches(v: number, unit: PrintPresetUnit) {
  switch (unit) {
    case "in": return v;
    case "cm": return v / CM_PER_INCH;
    case "mm": return v / MM_PER_INCH;
  }
}

function px(size: number, unit: PrintPresetUnit, dpi: number) {
  return Math.round(toInches(size, unit) * dpi);
}

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type ExportRatioKey = "2x3" | "3x4" | "A-series";

export interface ExportSize {
  /** Stable id, e.g. "2x3_20x30" */
  id: string;
  /** Display label, e.g. "20 × 30 cm" */
  label: string;
  /** Physical width */
  width: number;
  /** Physical height */
  height: number;
  unit: PrintPresetUnit;
  /** Target DPI (defaults to template DPI) */
  dpi: number;
  /** Final pixel dimensions */
  pixelWidth: number;
  pixelHeight: number;
  /** File-name-friendly suffix, e.g. "20x30cm" or "A4" */
  fileTag: string;
}

export interface ExportRatioGroup {
  /** Bucket key, used for ZIP folder name */
  key: ExportRatioKey;
  /** Display label, e.g. "2:3 ratio" */
  label: string;
  /** Numeric aspect ratio (w / h) — informational only */
  aspectRatio: number;
  sizes: ExportSize[];
}

export interface ExportTemplate {
  id: string;
  label: string;
  description: string;
  /** Default DPI used to derive pixel dimensions */
  defaultDpi: number;
  /** Whether the template supports the optional white-border toggle */
  supportsBorder: boolean;
  /** When true, the export should prefer print-safe upscale recipes */
  preferPrintRecipe: boolean;
  /** Ratio groups included in the bundle */
  ratios: ExportRatioGroup[];
}

/* ------------------------------------------------------------------ */
/* Helpers to define sizes                                            */
/* ------------------------------------------------------------------ */

function size(
  ratioKey: ExportRatioKey,
  label: string,
  width: number,
  height: number,
  unit: PrintPresetUnit,
  dpi: number,
  fileTag: string,
): ExportSize {
  return {
    id: `${ratioKey}_${fileTag}`.toLowerCase(),
    label,
    width,
    height,
    unit,
    dpi,
    pixelWidth: px(width, unit, dpi),
    pixelHeight: px(height, unit, dpi),
    fileTag,
  };
}

/* ------------------------------------------------------------------ */
/* Etsy basic bundle                                                  */
/* ------------------------------------------------------------------ */

const DPI = 300;

const RATIO_2x3: ExportRatioGroup = {
  key: "2x3",
  label: "2:3 ratio",
  aspectRatio: 2 / 3,
  sizes: [
    size("2x3", "20 × 30 cm",  20, 30, "cm", DPI, "20x30cm"),
    size("2x3", "40 × 60 cm",  40, 60, "cm", DPI, "40x60cm"),
  ],
};

const RATIO_3x4: ExportRatioGroup = {
  key: "3x4",
  label: "3:4 ratio",
  aspectRatio: 3 / 4,
  sizes: [
    size("3x4", "30 × 40 cm",  30, 40, "cm", DPI, "30x40cm"),
  ],
};

// A-series at 300 DPI:
//   A4 = 210 × 297 mm → 2480 × 3508 px
//   A3 = 297 × 420 mm → 3508 × 4961 px
const RATIO_A: ExportRatioGroup = {
  key: "A-series",
  label: "A-series",
  aspectRatio: 210 / 297,
  sizes: [
    size("A-series", "A4", 210, 297, "mm", DPI, "A4"),
    size("A-series", "A3", 297, 420, "mm", DPI, "A3"),
  ],
};

export const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: "etsy_bundle_basic",
    label: "Etsy Basic Bundle",
    description:
      "Standard print-ready bundle covering the most common Etsy frame sizes (2:3, 3:4 and A-series) at 300 DPI.",
    defaultDpi: DPI,
    supportsBorder: true,
    preferPrintRecipe: true,
    ratios: [RATIO_2x3, RATIO_3x4, RATIO_A],
  },
];

export const DEFAULT_EXPORT_TEMPLATE_ID = "etsy_bundle_basic";

export function getExportTemplate(id: string): ExportTemplate | undefined {
  return EXPORT_TEMPLATES.find((t) => t.id === id);
}

/** Flatten all sizes for a template — handy for previews/summaries. */
export function flattenTemplateSizes(t: ExportTemplate): ExportSize[] {
  return t.ratios.flatMap((r) => r.sizes);
}

/** Total file count a template will produce. */
export function countTemplateFiles(t: ExportTemplate): number {
  return flattenTemplateSizes(t).length;
}

/** Build the file name for a single rendered size. */
export function buildExportFileName(
  size: ExportSize,
  opts: { ext?: string; withBorder?: boolean } = {},
): string {
  const ext = opts.ext ?? "jpg";
  const border = opts.withBorder ? "_bordered" : "";
  return `poster_${size.fileTag}_${size.dpi}dpi${border}.${ext}`;
}

/** Folder name inside the ZIP for a ratio group. */
export function ratioFolderName(group: ExportRatioGroup): string {
  return group.key;
}
