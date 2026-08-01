/**
 * Turn 3B — shared, pure print-validation and color-management layer.
 *
 * This is the ONE place that decides what "format ready", "print ready",
 * "150 PPI ready" and "300 PPI ready" mean. It is pure (no DOM, no
 * network, no storage) and independently testable.
 *
 * Turn 3A rules are frozen here:
 *   - Transformed `render/image` URLs are display-only and are rejected
 *     as a print source.
 *   - Local `blob:` / `data:` previews are rejected as a print source.
 *   - All PPI / export math uses canonical persisted master pixel
 *     metadata — never rendered browser dimensions, never 500/1600 px
 *     display derivatives.
 *
 * Formulas (documented, single source of truth):
 *   widthInches   = physicalWidthMm / 25.4
 *   ppiX          = canonicalWidth  / widthInches
 *   ppiY          = canonicalHeight / heightInches
 *   effectivePpi  = min(ppiX, ppiY)                 (limiting axis)
 *   trimPx        = round(inches * exportDpi)
 *   bleedPx       = round(bleedMm / 25.4 * exportDpi)   (half-up rounding)
 *   exportPx      = trimPx + 2 * bleedPx            (bleed exports only)
 */
import {
  getPrintFormat,
  type PrintFormat,
} from "@/lib/print-formats";
import {
  DEFAULT_BLEED_MM,
  DEFAULT_EXPORT_DPI,
  DEFAULT_SAFE_MM,
  mmToPx,
} from "@/lib/bleed-config";
import type { ExportFormat } from "@/lib/export-formats";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Where a print source came from. Only canonical masters may print. */
export type PrintSourceKind =
  | "canonical_master"
  | "persisted_original"
  | "local_preview"
  | "display_derivative"
  | "unknown";

/** Honest color-management statuses. No fake CMYK. */
export type ColorProfileStatus =
  | "srgb_confirmed"
  | "rgb_assumed"
  | "profile_preserved"
  | "profile_unknown"
  | "profile_not_supported"
  | "cmyk_not_available";

/** How the master reached (or failed to reach) the target ratio. */
export type RatioClassification =
  | "correct"
  | "corrected_crop"
  | "padded"
  | "distorted"
  | "unknown";

/** UI hierarchy — never a single ambiguous green badge. */
export type ReadinessSeverity = "pass" | "warning" | "blocked" | "unknown";

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColorProfileInput {
  /** Declared color space of the canonical master, when known. */
  space?: "srgb" | "rgb" | "cmyk" | "unknown" | null;
  /** ICC profile name, when known. */
  profileName?: string | null;
  /** Whether an ICC profile is embedded in the canonical master. */
  embedded?: boolean | null;
  /**
   * Whether the export pipeline used for this export can preserve an
   * embedded profile. Browser canvas exports cannot — leave false.
   */
  exportPreservesProfile?: boolean | null;
}

export interface PrintValidationInput {
  /** Canonical master URL / identity (never a display derivative). */
  canonicalSourceUrl?: string | null;
  /** Explicit classification of the source, when the caller knows it. */
  canonicalSourceKind?: PrintSourceKind;
  /** Canonical master pixel width (persisted metadata). */
  canonicalWidth?: number | null;
  /** Canonical master pixel height (persisted metadata). */
  canonicalHeight?: number | null;
  /** Selected print format id from the shared registry. */
  printFormatId: string;
  /** Optional physical override in millimetres. */
  physicalWidthMm?: number | null;
  physicalHeightMm?: number | null;
  /** Requested orientation. "auto" derives from the master. */
  orientation?: "portrait" | "landscape" | "auto";
  /** Ratio-enforcement metadata recorded during finalization. */
  ratioAdjustment?: "none" | "crop" | "pad" | "distort" | "unknown";
  /** Crop box applied during ratio enforcement, when known. */
  cropBox?: CropBox | null;
  /** Export encoder. */
  exportFormat?: ExportFormat;
  /** Named export path being validated. */
  exportType?: "standard" | "bleed" | "etsy" | "derivative";
  /** Whether this export adds bleed. */
  includeBleed?: boolean;
  bleedMm?: number;
  safeMm?: number;
  /** Intended export PPI. Defaults to 300. */
  exportDpi?: number;
  /** Known color metadata. */
  colorProfile?: ColorProfileInput | null;
}

export interface PrintValidationResult {
  canonicalSourceUrl: string | null;
  canonicalSourceKind: PrintSourceKind;
  canonicalWidth: number | null;
  canonicalHeight: number | null;

  format: PrintFormat | null;
  formatId: string;
  targetWidthMm: number | null;
  targetHeightMm: number | null;
  orientation: "portrait" | "landscape" | "square" | "unknown";

  actualAspectRatio: number | null;
  requiredAspectRatio: number | null;
  /** Relative difference |actual − required| / required. */
  ratioDifference: number | null;
  ratioTolerance: number;
  ratioClassification: RatioClassification;

  /** Readiness states — deliberately separate concepts. */
  previewReady: boolean;
  formatReady: boolean;
  printReady: boolean;
  ppi150Ready: boolean;
  ppi300Ready: boolean;

  /** Unrounded effective PPI values. Round only for display. */
  ppiX: number | null;
  ppiY: number | null;
  effectivePpi: number | null;
  limitingAxis: "x" | "y" | null;
  requiredPixelsFor150: { width: number; height: number } | null;
  requiredPixelsFor300: { width: number; height: number } | null;

  cropApplied: boolean;
  cropBox: CropBox | null;
  paddingApplied: boolean;
  distortionDetected: boolean;

  exportDpi: number;
  includeBleed: boolean;
  bleedMm: number;
  bleedPx: number;
  safeMm: number;
  safePx: number;
  trimPixels: { width: number; height: number } | null;
  exportPixels: { width: number; height: number } | null;

  colorStatus: ColorProfileStatus;
  colorNotes: string[];

  severity: ReadinessSeverity;
  warnings: string[];
  blockingErrors: string[];
  explanation: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/**
 * Ratio tolerance = 0.5 % relative difference.
 *
 * Chosen so that integer-pixel rounding at poster resolutions (a one or
 * two pixel difference on a 3000–8000 px edge is < 0.05 %) always passes,
 * while genuine format errors (e.g. 3:4 artwork sent to a 5:7 poster,
 * ~7 % off) always fail.
 */
export const PRINT_RATIO_TOLERANCE = 0.005;

const MM_PER_INCH = 25.4;
const PPI_150 = 150;
const PPI_300 = 300;
/**
 * Sub-pixel tolerance for PPI thresholds. Integer trim pixels can land a
 * fraction below the nominal target (A4 at 300 PPI = 2480.31 px → 2480 px
 * → 299.96 PPI). Half a PPI of slack absorbs that rounding without
 * admitting genuinely under-resolution masters.
 */
const PPI_EPSILON = 0.5;

/* ------------------------------------------------------------------ */
/* Source classification                                               */
/* ------------------------------------------------------------------ */

/** True for Supabase image-transform (display-only) URLs. */
export function isDisplayDerivativeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("/render/image/");
}

/** True for temporary in-browser previews. */
export function isLocalPreviewSource(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("blob:") || url.startsWith("data:");
}

/**
 * True for a source string that is neither an absolute http(s) URL nor a
 * plausible storage path. Such values can never resolve to a canonical
 * master and must not be treated as printable.
 */
export function isMalformedPrintSource(url: string | null | undefined): boolean {
  if (!url) return false;
  const v = url.trim();
  if (!v) return true;
  if (/^https?:\/\//i.test(v)) {
    try {
      // eslint-disable-next-line no-new
      new URL(v);
      return false;
    } catch {
      return true;
    }
  }
  // Storage paths: no whitespace, at least one path-safe segment.
  return /\s/.test(v) || !/^[A-Za-z0-9._\-/]+$/.test(v);
}

/** Classify a URL as a print source. Explicit input kinds win. */
export function classifyPrintSource(
  url: string | null | undefined,
  declared?: PrintSourceKind,
): PrintSourceKind {
  if (isDisplayDerivativeUrl(url)) return "display_derivative";
  if (isLocalPreviewSource(url)) return "local_preview";
  if (isMalformedPrintSource(url)) return "unknown";
  if (declared) return declared;
  if (!url) return "unknown";
  return "persisted_original";
}

/** Only canonical persisted assets may be used as a print source. */
export function isPrintableSourceKind(kind: PrintSourceKind): boolean {
  return kind === "canonical_master" || kind === "persisted_original";
}

/* ------------------------------------------------------------------ */
/* Color management (honest)                                           */
/* ------------------------------------------------------------------ */

export interface ColorAssessment {
  status: ColorProfileStatus;
  notes: string[];
}

/**
 * Resolve an honest color status.
 *
 * The current export pipeline renders through an HTML canvas, which
 * always emits untagged RGB (effectively sRGB on all mainstream
 * browsers) and cannot preserve or inspect embedded ICC profiles. We
 * therefore never claim CMYK, and never claim a preserved profile
 * unless the caller proves the pipeline supports it.
 */
export function assessColorManagement(
  input: ColorProfileInput | null | undefined,
): ColorAssessment {
  const notes: string[] = [];
  const space = input?.space ?? null;

  if (space === "cmyk") {
    notes.push(
      "Source reports CMYK. ICC-based CMYK conversion is not implemented; " +
        "exports remain RGB.",
    );
    return { status: "cmyk_not_available", notes };
  }

  if (input?.exportPreservesProfile && input?.embedded) {
    notes.push(
      `Embedded profile preserved${input.profileName ? ` (${input.profileName})` : ""}.`,
    );
    return { status: "profile_preserved", notes };
  }

  if (input?.embedded) {
    notes.push(
      "The canonical master has an embedded profile, but browser canvas " +
        "exports cannot preserve ICC profiles. Output is untagged RGB.",
    );
    return { status: "profile_not_supported", notes };
  }

  if (space === "srgb") {
    notes.push("Source is sRGB; exports stay in sRGB.");
    return { status: "srgb_confirmed", notes };
  }

  if (space === "rgb") {
    notes.push("Source is RGB with no profile information. Treated as sRGB.");
    return { status: "rgb_assumed", notes };
  }

  if (space === "unknown" || space === null) {
    if (input && (input.profileName || input.embedded === false)) {
      notes.push("No embedded profile detected. Export treated as untagged RGB.");
      return { status: "rgb_assumed", notes };
    }
    notes.push(
      "No color-space metadata available for this master. Browser exports " +
        "are RGB; CMYK conversion is not available.",
    );
    return { status: "profile_unknown", notes };
  }

  return { status: "profile_unknown", notes };
}

/* ------------------------------------------------------------------ */
/* Core validator                                                      */
/* ------------------------------------------------------------------ */

function positive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

/**
 * Validate a canonical master + export configuration for printing.
 * Pure function — safe to call from render paths and tests.
 */
export function validatePrintReadiness(
  input: PrintValidationInput,
): PrintValidationResult {
  const warnings: string[] = [];
  const blockingErrors: string[] = [];

  const url = input.canonicalSourceUrl ?? null;
  const sourceKind = classifyPrintSource(url, input.canonicalSourceKind);

  const format = getPrintFormat(input.printFormatId) ?? null;
  if (!format) {
    blockingErrors.push(`Unknown print format "${input.printFormatId}".`);
  }

  // Physical target dimensions (mm), with orientation handling.
  let targetWidthMm = positive(input.physicalWidthMm)
    ? input.physicalWidthMm!
    : format
    ? format.widthCm * 10
    : null;
  let targetHeightMm = positive(input.physicalHeightMm)
    ? input.physicalHeightMm!
    : format
    ? format.heightCm * 10
    : null;

  const w = positive(input.canonicalWidth) ? input.canonicalWidth! : null;
  const h = positive(input.canonicalHeight) ? input.canonicalHeight! : null;

  const wantLandscape =
    input.orientation === "landscape" ||
    (input.orientation === "auto" && w !== null && h !== null && w > h);
  const wantPortrait =
    input.orientation === "portrait" ||
    (input.orientation === "auto" && w !== null && h !== null && h > w);

  if (targetWidthMm !== null && targetHeightMm !== null) {
    if (wantLandscape && targetHeightMm > targetWidthMm) {
      [targetWidthMm, targetHeightMm] = [targetHeightMm, targetWidthMm];
    } else if (wantPortrait && targetWidthMm > targetHeightMm) {
      [targetWidthMm, targetHeightMm] = [targetHeightMm, targetWidthMm];
    }
  }

  const orientation: PrintValidationResult["orientation"] =
    targetWidthMm === null || targetHeightMm === null
      ? "unknown"
      : targetWidthMm > targetHeightMm
      ? "landscape"
      : targetWidthMm < targetHeightMm
      ? "portrait"
      : "square";

  // ── Source gating ────────────────────────────────────────────────
  if (sourceKind === "display_derivative") {
    blockingErrors.push(
      "A web display derivative (render/image URL) cannot be used as a print source.",
    );
  } else if (sourceKind === "local_preview") {
    blockingErrors.push(
      "A local browser preview cannot be used as a print source. Wait for the canonical master to persist.",
    );
  } else if (sourceKind === "unknown") {
    blockingErrors.push(
      url && isMalformedPrintSource(url)
        ? "The canonical source is malformed and cannot be used as a print source."
        : "No canonical master available for this export.",
    );
  }

  // ── Dimensions ───────────────────────────────────────────────────
  if (w === null || h === null) {
    blockingErrors.push("Canonical master dimensions are missing or invalid.");
  }

  const actualAspectRatio = w !== null && h !== null ? w / h : null;
  const requiredAspectRatio =
    targetWidthMm !== null && targetHeightMm !== null
      ? targetWidthMm / targetHeightMm
      : null;
  const ratioDifference =
    actualAspectRatio !== null && requiredAspectRatio
      ? Math.abs(actualAspectRatio - requiredAspectRatio) / requiredAspectRatio
      : null;

  const adjustment = input.ratioAdjustment ?? "unknown";
  const ratioWithinTolerance =
    ratioDifference !== null && ratioDifference <= PRINT_RATIO_TOLERANCE;

  let ratioClassification: RatioClassification;
  if (adjustment === "distort") {
    ratioClassification = "distorted";
  } else if (ratioDifference === null) {
    ratioClassification = "unknown";
  } else if (!ratioWithinTolerance) {
    // Whatever the metadata claims, the master does not match the format.
    ratioClassification = adjustment === "pad" ? "padded" : "unknown";
  } else if (adjustment === "crop") {
    ratioClassification = "corrected_crop";
  } else if (adjustment === "pad") {
    ratioClassification = "padded";
  } else if (adjustment === "none") {
    ratioClassification = "correct";
  } else {
    ratioClassification = "correct";
  }

  const distortionDetected = ratioClassification === "distorted";
  const cropApplied = adjustment === "crop" || !!input.cropBox;
  const paddingApplied = adjustment === "pad";

  if (distortionDetected) {
    blockingErrors.push(
      "The master was stretched to fit this format. Distorted artwork must not be printed.",
    );
  }
  if (ratioDifference !== null && !ratioWithinTolerance) {
    blockingErrors.push(
      `Aspect ratio does not match ${format?.label ?? input.printFormatId}: ` +
        `master is ${actualAspectRatio!.toFixed(4)}, format requires ` +
        `${requiredAspectRatio!.toFixed(4)} (${(ratioDifference * 100).toFixed(2)}% off).`,
    );
  }
  if (paddingApplied) {
    warnings.push(
      "This master reached the format by padding — the artwork does not fill the trim area edge-to-edge.",
    );
  }
  if (cropApplied && ratioWithinTolerance) {
    warnings.push("This master reached the format by cropping; edge content was removed.");
  }
  if (ratioClassification === "unknown" && ratioDifference !== null && ratioWithinTolerance) {
    // Not possible, but keeps the union exhaustive-safe.
    warnings.push("Ratio-enforcement metadata is missing.");
  }
  if (adjustment === "unknown" && ratioDifference !== null) {
    warnings.push("Ratio-enforcement metadata is unknown; ratio verified from pixel dimensions only.");
  }

  const formatReady =
    !!format &&
    w !== null &&
    h !== null &&
    ratioWithinTolerance &&
    !distortionDetected;

  // ── PPI ──────────────────────────────────────────────────────────
  let ppiX: number | null = null;
  let ppiY: number | null = null;
  let effectivePpi: number | null = null;
  let limitingAxis: "x" | "y" | null = null;
  let requiredPixelsFor150: { width: number; height: number } | null = null;
  let requiredPixelsFor300: { width: number; height: number } | null = null;

  if (w !== null && h !== null && targetWidthMm && targetHeightMm) {
    const wIn = mmToInches(targetWidthMm);
    const hIn = mmToInches(targetHeightMm);
    ppiX = w / wIn;
    ppiY = h / hIn;
    effectivePpi = Math.min(ppiX, ppiY);
    limitingAxis = ppiX <= ppiY ? "x" : "y";
    requiredPixelsFor150 = {
      width: Math.ceil(wIn * PPI_150),
      height: Math.ceil(hIn * PPI_150),
    };
    requiredPixelsFor300 = {
      width: Math.ceil(wIn * PPI_300),
      height: Math.ceil(hIn * PPI_300),
    };
  }

  const ppi150Ready = effectivePpi !== null && effectivePpi >= PPI_150 - PPI_EPSILON;
  const ppi300Ready = effectivePpi !== null && effectivePpi >= PPI_300 - PPI_EPSILON;

  // ── Bleed / export geometry ──────────────────────────────────────
  const exportDpi =
    positive(input.exportDpi) ? input.exportDpi! : DEFAULT_EXPORT_DPI;
  const includeBleed = input.includeBleed ?? false;
  const bleedMm = includeBleed ? input.bleedMm ?? DEFAULT_BLEED_MM : 0;
  const safeMm = input.safeMm ?? DEFAULT_SAFE_MM;
  // Half-up rounding at the intended export PPI (shared with bleed-config).
  const bleedPx = includeBleed ? mmToPx(bleedMm, exportDpi) : 0;
  const safePx = mmToPx(safeMm, exportDpi);

  let trimPixels: { width: number; height: number } | null = null;
  let exportPixels: { width: number; height: number } | null = null;
  if (targetWidthMm && targetHeightMm) {
    trimPixels = {
      width: Math.round(mmToInches(targetWidthMm) * exportDpi),
      height: Math.round(mmToInches(targetHeightMm) * exportDpi),
    };
    exportPixels = {
      width: trimPixels.width + bleedPx * 2,
      height: trimPixels.height + bleedPx * 2,
    };
    if (!Number.isFinite(exportPixels.width) || exportPixels.width <= 0) {
      blockingErrors.push("Export dimension calculation failed.");
    }
  } else if (blockingErrors.length === 0) {
    blockingErrors.push("Export dimension calculation failed — no physical target size.");
  }

  if (!includeBleed) {
    // Guard against accidental bleed on standard exports.
    if (
      trimPixels &&
      exportPixels &&
      (exportPixels.width !== trimPixels.width || exportPixels.height !== trimPixels.height)
    ) {
      blockingErrors.push("Standard export unexpectedly includes bleed.");
    }
  }

  // ── Color ────────────────────────────────────────────────────────
  const color = assessColorManagement(input.colorProfile);
  if (
    color.status === "cmyk_not_available" ||
    color.status === "profile_not_supported"
  ) {
    warnings.push(color.notes[0]!);
  }

  // ── PPI warnings ─────────────────────────────────────────────────
  const sizeLabel = format?.label ?? "the selected size";
  if (effectivePpi !== null) {
    if (!ppi150Ready) {
      warnings.push(
        `Only ${Math.round(effectivePpi)} PPI at ${sizeLabel}. Below 150 PPI — visible softness in print.`,
      );
    } else if (!ppi300Ready) {
      warnings.push(
        `Correct ${sizeLabel} format, but the current master provides ${Math.round(
          effectivePpi,
        )} PPI at this print size. Suitable for many poster prints, but not a true 300-PPI source.`,
      );
    }
  }

  const printReady =
    formatReady && blockingErrors.length === 0 && exportPixels !== null;

  const previewReady = w !== null && h !== null;

  let severity: ReadinessSeverity;
  if (blockingErrors.length > 0) severity = "blocked";
  else if (effectivePpi === null || ratioDifference === null) severity = "unknown";
  else if (warnings.length > 0) severity = "warning";
  else severity = "pass";

  const explanation = buildExplanation({
    severity,
    sizeLabel,
    formatReady,
    effectivePpi,
    ppi150Ready,
    ppi300Ready,
    includeBleed,
    bleedMm,
    ratioClassification,
    blockingErrors,
  });

  return {
    canonicalSourceUrl: url,
    canonicalSourceKind: sourceKind,
    canonicalWidth: w,
    canonicalHeight: h,
    format,
    formatId: input.printFormatId,
    targetWidthMm,
    targetHeightMm,
    orientation,
    actualAspectRatio,
    requiredAspectRatio,
    ratioDifference,
    ratioTolerance: PRINT_RATIO_TOLERANCE,
    ratioClassification,
    previewReady,
    formatReady,
    printReady,
    ppi150Ready,
    ppi300Ready,
    ppiX,
    ppiY,
    effectivePpi,
    limitingAxis,
    requiredPixelsFor150,
    requiredPixelsFor300,
    cropApplied,
    cropBox: input.cropBox ?? null,
    paddingApplied,
    distortionDetected,
    exportDpi,
    includeBleed,
    bleedMm,
    bleedPx,
    safeMm,
    safePx,
    trimPixels,
    exportPixels,
    colorStatus: color.status,
    colorNotes: color.notes,
    severity,
    warnings,
    blockingErrors,
    explanation,
  };
}

function buildExplanation(args: {
  severity: ReadinessSeverity;
  sizeLabel: string;
  formatReady: boolean;
  effectivePpi: number | null;
  ppi150Ready: boolean;
  ppi300Ready: boolean;
  includeBleed: boolean;
  bleedMm: number;
  ratioClassification: RatioClassification;
  blockingErrors: string[];
}): string {
  if (args.severity === "blocked") {
    return args.blockingErrors[0] ?? "This export is blocked.";
  }
  if (args.effectivePpi === null) {
    return "Print readiness cannot be assessed — canonical dimensions are unknown.";
  }
  const ppi = Math.round(args.effectivePpi);
  const quality = args.ppi300Ready
    ? "true 300-PPI print source"
    : args.ppi150Ready
    ? "suitable for 150-PPI poster printing, but not a true 300-PPI source"
    : "below 150 PPI at this size";
  const bleed = args.includeBleed
    ? `${args.bleedMm} mm bleed included`
    : "no bleed (trim size only)";
  const ratio =
    args.ratioClassification === "corrected_crop"
      ? "ratio corrected by crop"
      : args.ratioClassification === "padded"
      ? "ratio reached by padding"
      : args.ratioClassification === "unknown"
      ? "ratio metadata unknown"
      : "correct ratio";
  return `${args.sizeLabel} · ${ratio} · ${ppi} PPI — ${quality} · ${bleed}.`;
}

/** Display helper: rounded PPI for UI, never used for logic. */
export function formatPpiForDisplay(ppi: number | null): string {
  return ppi === null ? "—" : `${Math.round(ppi)} PPI`;
}
