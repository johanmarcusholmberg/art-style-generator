/**
 * Print export presets.
 *
 * Explicit, hand-curated print targets with hard pixel/DPI requirements.
 * The app does NOT guess sizing from the browser viewport — every export
 * must resolve through one of these presets.
 *
 * This layer is intentionally thin:
 *   - it owns physical dimensions / DPI / pixel targets
 *   - it flags whether a preset is print-oriented (so we can prefer the
 *     poster_print recipe from `upscale-recipes.ts`)
 *   - it does NOT duplicate recipe logic — print-export consumers should
 *     call `resolveUpscaleRecipe({ printIntent: preset.preferPrintRecipe })`
 *
 * The existing `print-formats.ts` registry stays as the source of truth
 * for the *physical print catalog* used by the canvas exporter. Presets
 * sit on top and add intent / target DPI / preferred recipe metadata.
 */
import {
  PRINT_FORMATS,
  getPrintFormat,
  type PrintFormat,
} from "@/lib/print-formats";

export type PrintPresetUnit = "mm" | "cm" | "in";

export type PrintPresetCategory = "web" | "photo" | "poster" | "canvas";

export interface PrintPreset {
  /** Stable id, e.g. "print_50x70_300" */
  id: string;
  /** Short label, e.g. "50 × 70 cm · 300 DPI" */
  label: string;
  /** Longer description for tooltips */
  description: string;
  category: PrintPresetCategory;

  /** Physical dimensions */
  width: number;
  height: number;
  unit: PrintPresetUnit;

  /** Target DPI */
  dpi: number;

  /** Resulting pixel target */
  targetWidthPx: number;
  targetHeightPx: number;

  /** Whether this preset has a meaningful print intent */
  printIntent: boolean;
  /**
   * Whether this preset should bias the upscale recipe layer toward
   * print-oriented recipes (e.g. poster_print).
   */
  preferPrintRecipe: boolean;
  /**
   * Whether the exporter is allowed to crop to fit the aspect ratio.
   * Default false — preserve full artwork via padding instead.
   */
  allowCrop: boolean;

  /**
   * Optional reference to a `PrintFormat` in `print-formats.ts`.
   * When set, the canvas exporter can use that format for tier
   * decisions and aspect ratio normalization.
   */
  printFormatId?: string;
}

/* ------------------------------------------------------------------ */
/* Conversion helpers                                                 */
/* ------------------------------------------------------------------ */

const MM_PER_INCH = 25.4;
const CM_PER_INCH = 2.54;

function toInches(value: number, unit: PrintPresetUnit): number {
  switch (unit) {
    case "in": return value;
    case "cm": return value / CM_PER_INCH;
    case "mm": return value / MM_PER_INCH;
  }
}

function pixels(size: number, unit: PrintPresetUnit, dpi: number): number {
  return Math.round(toInches(size, unit) * dpi);
}

function makePreset(
  partial: Omit<PrintPreset, "targetWidthPx" | "targetHeightPx">,
): PrintPreset {
  return {
    ...partial,
    targetWidthPx: pixels(partial.width, partial.unit, partial.dpi),
    targetHeightPx: pixels(partial.height, partial.unit, partial.dpi),
  };
}

/* ------------------------------------------------------------------ */
/* Registry                                                           */
/* ------------------------------------------------------------------ */

/**
 * Hand-curated print presets.
 *
 * Adding a preset here is the *only* way to expose a new print target
 * to the UI — keeps everything explicit and easily editable.
 */
export const PRINT_PRESETS: PrintPreset[] = [
  makePreset({
    id: "web",
    label: "Web · 72 DPI",
    description: "Lightweight web/share asset, no physical print intent.",
    category: "web",
    width: 50, height: 70, unit: "cm", dpi: 72,
    printIntent: false,
    preferPrintRecipe: false,
    allowCrop: false,
  }),
  makePreset({
    id: "print_a4_300",
    label: "A4 · 300 DPI",
    description: "Standard A4 (210 × 297 mm) at full print quality.",
    category: "photo",
    width: 210, height: 297, unit: "mm", dpi: 300,
    printIntent: true,
    preferPrintRecipe: true,
    allowCrop: false,
  }),
  makePreset({
    id: "print_a3_300",
    label: "A3 · 300 DPI",
    description: "A3 (297 × 420 mm) at full print quality.",
    category: "poster",
    width: 297, height: 420, unit: "mm", dpi: 300,
    printIntent: true,
    preferPrintRecipe: true,
    allowCrop: false,
  }),
  makePreset({
    id: "print_30x40_300",
    label: "30 × 40 cm · 300 DPI",
    description: "Compact poster size at full print quality.",
    category: "poster",
    width: 30, height: 40, unit: "cm", dpi: 300,
    printIntent: true,
    preferPrintRecipe: true,
    allowCrop: false,
  }),
  makePreset({
    id: "print_50x70_300",
    label: "50 × 70 cm · 300 DPI",
    description: "Large poster, full print quality. Project default print size.",
    category: "poster",
    width: 50, height: 70, unit: "cm", dpi: 300,
    printIntent: true,
    preferPrintRecipe: true,
    allowCrop: false,
    printFormatId: "print_50x70",
  }),
];

export const DEFAULT_PRINT_PRESET_ID = "print_50x70_300";

export function getPrintPreset(id: string): PrintPreset | undefined {
  return PRINT_PRESETS.find((p) => p.id === id);
}

/** All presets in a given category. */
export function getPrintPresetsByCategory(c: PrintPresetCategory): PrintPreset[] {
  return PRINT_PRESETS.filter((p) => p.category === c);
}

/* ------------------------------------------------------------------ */
/* Sufficiency check                                                  */
/* ------------------------------------------------------------------ */

export interface PresetSufficiency {
  /** True if the master meets the preset target on both axes */
  meetsTarget: boolean;
  /** Achievable DPI at this preset's physical size */
  achievableDpi: number | null;
  /** Short readiness summary */
  summary: string;
  /** Recommended next step (null when none) */
  recommendation: string | null;
  /**
   * If the preset references a `PrintFormat`, the resolved format —
   * useful for the existing canvas exporter.
   */
  printFormat: PrintFormat | null;
}

/**
 * Evaluate whether the given master pixel dimensions satisfy a preset.
 * Pure / synchronous — no DOM or storage access.
 */
export function evaluatePresetSufficiency(
  preset: PrintPreset,
  masterWidth: number | null | undefined,
  masterHeight: number | null | undefined,
): PresetSufficiency {
  const printFormat = preset.printFormatId
    ? getPrintFormat(preset.printFormatId) ?? null
    : null;

  if (!masterWidth || !masterHeight) {
    return {
      meetsTarget: false,
      achievableDpi: null,
      summary: "Master dimensions unknown",
      recommendation: "Save and re-open this image to refresh metadata",
      printFormat,
    };
  }

  const wInches = toInches(preset.width, preset.unit);
  const hInches = toInches(preset.height, preset.unit);
  const dpiW = masterWidth / wInches;
  const dpiH = masterHeight / hInches;
  const achievableDpi = Math.round(Math.min(dpiW, dpiH));

  const meetsTarget =
    masterWidth >= preset.targetWidthPx &&
    masterHeight >= preset.targetHeightPx;

  let summary: string;
  let recommendation: string | null = null;

  if (meetsTarget) {
    summary = `Ready for ${preset.label} (${achievableDpi} DPI)`;
  } else if (preset.printIntent && achievableDpi >= 140) {
    summary = `Below ${preset.dpi} DPI target — prints at ~${achievableDpi} DPI (standard)`;
    recommendation = preset.preferPrintRecipe
      ? "Recommended: Print enhancement first"
      : "Recommended: Enhancement first";
  } else if (preset.printIntent) {
    summary = `Too small for ${preset.label} (~${achievableDpi} DPI)`;
    recommendation = "Recommended: Print enhancement first";
  } else {
    summary = `~${achievableDpi} DPI at this size`;
  }

  return { meetsTarget, achievableDpi, summary, recommendation, printFormat };
}
