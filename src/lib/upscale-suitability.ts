/**
 * Heuristic upscale suitability assessment.
 *
 * Pure helper — does NOT call any provider. Used by the admin asset
 * details modal to surface a compact recommendation card before a user
 * spends credits on an upscale run.
 *
 * Heuristics (intentionally conservative):
 *   - unknown dimensions → "unknown"
 *   - already ≥ ~280 PPI                         → "not-needed"
 *   - effective PPI < 120                        → "high"
 *   - effective PPI 180–220                      → "medium"
 *   - effective PPI > 220 (and not 300-ready)    → "medium"
 *   - sharp/graphic styles (lineart, popart, …)  → bias upward
 *   - soft/painterly styles                      → risk flag
 *   - prompts mentioning text/labels             → risk flag
 *   - already upscaled                           → reduce + warn
 */
import {
  getMasterDimensions,
  getPrintReadiness,
  type AssetImageLike,
} from "@/lib/image-assets";

export type UpscaleSuitabilityLevel =
  | "high"
  | "medium"
  | "low"
  | "not-needed"
  | "unknown";

export interface UpscaleSuitabilityInput extends AssetImageLike {
  mode?: string | null;
  prompt?: string | null;
  print_format_id?: string | null;
  upscale_applied?: boolean | null;
  enhanced?: boolean | null;
}

export interface UpscaleSuitability {
  level: UpscaleSuitabilityLevel;
  title: string;
  reasons: string[];
  recommendation: string;
  riskFlags: string[];
  effectivePpi: number | null;
}

const SHARP_STYLES = [
  "lineart",
  "line-art",
  "popart",
  "pop-art",
  "screenprint",
  "screen-print",
  "graffiti",
  "brutalistposter",
  "brutalist",
  "scandinavianposter",
  "tattooflash",
  "typography",
  "poster",
  "comic",
  "retrocomic",
  "pulpmagazine",
  // Phase 4: decorative/flat/illustrative styles upscale well
  "artnouveau",
  "midcenturymodern",
  "urbannoir",
];

const SOFT_STYLES = [
  "watercolor",
  "watercolour",
  "loosewatercolor",
  "botanical",
  "painterly",
  "vintage",
  "risograph",
  "xeroxzine",
  "minimalism",
];

const TEXT_HINT_RE =
  /\b(text|label|caption|word|words|letter|letters|typography|signature|logo|title|headline)\b/i;

export function assessUpscaleSuitability(
  input: UpscaleSuitabilityInput,
): UpscaleSuitability {
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  const dims = getMasterDimensions(input);
  if (!dims) {
    return {
      level: "unknown",
      title: "Suitability unknown",
      reasons: ["Master dimensions are not recorded for this asset."],
      recommendation:
        "Run any upscale at your discretion — outcome cannot be estimated.",
      riskFlags: [],
      effectivePpi: null,
    };
  }

  const readiness = getPrintReadiness(input, input.print_format_id);
  const ppi = readiness.achievablePpi;

  let level: UpscaleSuitabilityLevel;
  if (readiness.level === "ready-300") {
    level = "not-needed";
    reasons.push(`Already meets fine-art print quality (${ppi} PPI).`);
  } else if (ppi != null && ppi < 120) {
    level = "high";
    reasons.push(`Low effective resolution (${ppi} PPI at target format).`);
  } else if (ppi != null && ppi >= 220) {
    level = "medium";
    reasons.push(`Already near print-ready (${ppi} PPI).`);
  } else if (ppi != null && ppi >= 180) {
    level = "medium";
    reasons.push(`Moderate resolution (${ppi} PPI).`);
  } else {
    level = "high";
    reasons.push(`Below recommended print resolution (${ppi ?? "?"} PPI).`);
  }

  const styleKey = (input.mode || "").toLowerCase().replace(/\s+/g, "");
  const isSharp = SHARP_STYLES.some((s) => styleKey.includes(s));
  const isSoft = SOFT_STYLES.some((s) => styleKey.includes(s));

  if (isSharp) {
    reasons.push("Sharp/graphic style typically responds well to upscaling.");
    if (level === "medium") level = "high";
  }
  if (isSoft) {
    riskFlags.push(
      "Soft/painterly style — upscaling may sharpen brush detail in unintended ways.",
    );
    if (level === "high") level = "medium";
  }

  if (input.prompt && TEXT_HINT_RE.test(input.prompt)) {
    riskFlags.push(
      "Prompt mentions text/labels — letterforms can degrade under AI upscaling.",
    );
  }

  if (input.upscale_applied || input.enhanced) {
    riskFlags.push(
      "This asset has already been upscaled. Repeated upscaling can compound artifacts.",
    );
    if (level === "high") level = "medium";
    else if (level === "medium") level = "low";
  }

  let title: string;
  let recommendation: string;
  switch (level) {
    case "high":
      title = "Good candidate for upscaling";
      recommendation =
        "Recommended: run a print-oriented upscale to gain usable resolution.";
      break;
    case "medium":
      title = "Upscaling may help";
      recommendation =
        "Optional. Compare original and enhanced versions before committing to print.";
      break;
    case "low":
      title = "Limited benefit expected";
      recommendation =
        "Upscaling is unlikely to add real detail. Prefer reviewing the existing master.";
      break;
    case "not-needed":
      title = "Already print-ready";
      recommendation =
        "No upscale needed. Re-running may add subtle artifacts without visible gain.";
      break;
    default:
      title = "Suitability unknown";
      recommendation = "Outcome cannot be estimated.";
  }

  return { level, title, reasons, recommendation, riskFlags, effectivePpi: ppi };
}
