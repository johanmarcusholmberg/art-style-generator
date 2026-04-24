/**
 * Frontend mirror of supabase/functions/_shared/style-meta.ts.
 *
 * Single source of truth for the small set of style-meta values the
 * frontend needs (display names, default strictness per provider, drift
 * risk estimation for the debug panel). Backend keeps its own copy so
 * edge functions can compile prompts without depending on the frontend
 * bundle.
 */

export type Strictness = "balanced" | "strict" | "very_strict";

export const STRICTNESS_OPTIONS: Array<{
  id: Strictness;
  label: string;
  description: string;
}> = [
  {
    id: "balanced",
    label: "Balanced",
    description: "Standard style guidance. Good default for Gemini/OpenAI.",
  },
  {
    id: "strict",
    label: "Strict",
    description: "Stronger style anchors and avoid rules. Recommended for SDXL.",
  },
  {
    id: "very_strict",
    label: "Very strict",
    description: "Maximum style lock — repeats medium tokens, strongest negative prompt.",
  },
];

/** Per-provider default strictness, before per-style override. */
export function defaultStrictnessFor(provider: "gemini" | "sdxl" | "openai"): Strictness {
  if (provider === "sdxl") return "strict";
  return "balanced";
}

/** Persistence — sessionStorage so it doesn't leak across sessions. */
const STORAGE_KEY = "style-strictness";

export function loadStrictness(): Strictness | undefined {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === "balanced" || v === "strict" || v === "very_strict") return v;
  } catch { /* ignore */ }
  return undefined;
}

export function saveStrictness(s: Strictness) {
  try {
    sessionStorage.setItem(STORAGE_KEY, s);
  } catch { /* ignore */ }
}

export type DriftRisk = "low" | "medium" | "high";

export const DRIFT_RISK_LABEL: Record<DriftRisk, string> = {
  low: "Low risk of style drift",
  medium: "Medium risk",
  high: "High risk",
};

export const DRIFT_RISK_CLASS: Record<DriftRisk, string> = {
  low: "bg-primary/10 text-primary border-primary/30",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  high: "bg-destructive/10 text-destructive border-destructive/30",
};
