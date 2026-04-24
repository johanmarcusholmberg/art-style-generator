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

// ── Per-style / per-provider defaults (Style Control Panel) ──────────────
//
// Personal-use control panel persistence lives in localStorage so it
// survives browser sessions, distinct from the ephemeral `loadStrictness`
// override above. Reuses the existing `Strictness` type — no new values.

export type ProviderId = "gemini" | "sdxl" | "openai";

const DEFAULTS_STORAGE_KEY = "style-strictness-defaults";

function isStrictness(v: unknown): v is Strictness {
  return v === "balanced" || v === "strict" || v === "very_strict";
}

/** Shape: { [styleKey]: { [providerId]: Strictness } } */
export type StrictnessDefaultsMap = Partial<
  Record<string, Partial<Record<ProviderId, Strictness>>>
>;

export function loadStrictnessDefaults(): StrictnessDefaultsMap {
  try {
    const raw = localStorage.getItem(DEFAULTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: StrictnessDefaultsMap = {};
    for (const [styleKey, perProvider] of Object.entries(parsed)) {
      if (!perProvider || typeof perProvider !== "object") continue;
      const cell: Partial<Record<ProviderId, Strictness>> = {};
      for (const p of ["gemini", "sdxl", "openai"] as ProviderId[]) {
        const v = (perProvider as Record<string, unknown>)[p];
        if (isStrictness(v)) cell[p] = v;
      }
      out[styleKey] = cell;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveStrictnessDefaults(map: StrictnessDefaultsMap) {
  try {
    localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function setStrictnessDefault(
  styleKey: string,
  provider: ProviderId,
  value: Strictness | undefined,
) {
  const map = loadStrictnessDefaults();
  const cell = { ...(map[styleKey] ?? {}) };
  if (value === undefined) delete cell[provider];
  else cell[provider] = value;
  if (Object.keys(cell).length === 0) delete map[styleKey];
  else map[styleKey] = cell;
  saveStrictnessDefaults(map);
}

/**
 * Resolve the effective default strictness for a (style, provider) pair.
 *
 * Priority:
 *   1. Style Control Panel override for this exact (style, provider).
 *   2. Per-provider default (`defaultStrictnessFor`) — existing behavior.
 *
 * Note: this does NOT consult the ProviderDebug `loadStrictness()` override
 * — that is a separate manual control intentionally scoped to the debug UI.
 */
export function getDefaultStrictness(input: {
  styleKey: string;
  provider: ProviderId;
}): Strictness {
  const map = loadStrictnessDefaults();
  const override = map[input.styleKey]?.[input.provider];
  if (override) return override;
  return defaultStrictnessFor(input.provider);
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
