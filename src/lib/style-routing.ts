/**
 * Deterministic style → provider routing (Phase: cost-aware routing).
 *
 * Single source of truth for "which provider should Auto pick for THIS style?".
 * Frontend (generation-router) and backend (generate-image-router) both
 * import the rules from here so behavior stays in sync.
 *
 * Goals:
 *   - Bias flat / poster / line-art / minimal / risograph styles to Gemini
 *     (cheaper + faster + comparable quality at small/preview sizes).
 *   - Keep painterly / photographic / SDXL-heavy styles on the Lovable
 *     (SDXL via Replicate) path where SDXL produces better results.
 *   - Always force image edits through the Lovable adapter — only it
 *     currently has a working image-to-image route.
 *   - NEVER apply these rules when the user manually picks a provider.
 *
 * Rules are explicit and easy to audit; no opaque AI-decides logic.
 */

export type RouteFamily = "lovable_sdxl" | "direct_gemini" | "direct_replicate" | "direct_openai";

export interface StyleRoutingDecision {
  /** Which adapter family Auto should try first. */
  primary: RouteFamily;
  /** Human-readable explanation surfaced in logs + UI. */
  reason: string;
}

/**
 * Style buckets — kept in one place so rules stay consistent across runtimes.
 * Mirrors the SDXL category overrides in `_shared/prompt-profiles.ts` but
 * categorized by routing intent rather than prompt-engineering intent.
 */
const GEMINI_FIRST_STYLES = new Set<string>([
  // Pop / poster / flat — Gemini handles flat color + bold outlines well
  // and is markedly cheaper than SDXL for these.
  "popart",
  "popart-freestyle",
  "screenprint",
  "screenprint-freestyle",
  "risograph",
  "risograph-freestyle",
  "brutalistposter",
  "brutalistposter-freestyle",
  "retrocomic",
  "retrocomic-freestyle",
  "xeroxzine",
  "xeroxzine-freestyle",

  // Minimal / line — small palettes, simple geometry → Gemini wins on cost.
  "minimalism",
  "minimalism-freestyle",
  "lineart",
  "lineart-freestyle",
  "lineart-minimal",

  // Ukiyo-e (woodblock = flat color + outlines)
  "japanese",
  "freestyle",

  // Tattoo flash — flat solid color, bold outlines.
  "tattooflash",
  "tattooflash-freestyle",

  // Botanical — watercolor / painterly handled well by Gemini.
  "botanical",
  "botanical-freestyle",

  // Scandinavian poster — flat minimal poster, Gemini handles best
  "scandinavian_poster",
  "scandinavian_poster-freestyle",

  // Vintage — soft hand-painted gouache café poster, Gemini handles painterly well
  "vintage",
  "vintage-freestyle",

  // Whimsical Japanese — gouache/watercolor storybook poster, Gemini handles painterly well
  "whimsical_japanese",
  "whimsical_japanese-freestyle",

  // Modernist cocktail — flat geometric poster, Gemini-first per user spec
  "modernist_cocktail",
  "modernist_cocktail-freestyle",

  // Mediterranean heritage — photographic travel style, Gemini-first per user spec
  "mediterranean_heritage",
  "mediterranean_heritage-freestyle",
]);

const LOVABLE_SDXL_STYLES = new Set<string>([
  // Photographic / dramatic monochrome — SDXL handles textural detail better.
  "urbannoir",
  "urbannoir-freestyle",

  // Painterly pulp magazine art — SDXL refiner produces stronger paint texture.
  "pulpmagazine",
  "pulpmagazine-freestyle",

  // Graffiti — tactile spray-paint texture benefits from SDXL refiner.
  "graffiti",
  "graffiti-freestyle",
]);

export interface RoutingInput {
  styleKey: string;
  /** True when the request is an image edit (forces Lovable adapter). */
  isEdit?: boolean;
  /** True when a high-resolution print pass is requested. */
  printIntent?: boolean;
}

/**
 * Pick the primary route for a styleKey.
 *
 * Used ONLY when the user picked "auto". Manual provider selection bypasses
 * this entirely and is honored as-is.
 */
export function decideRoute(input: RoutingInput): StyleRoutingDecision {
  const { styleKey, isEdit, printIntent } = input;

  if (isEdit) {
    return {
      primary: "lovable_sdxl", // Lovable adapter dispatches to Gemini for edits server-side
      reason: "edit → Lovable adapter (only image-to-image-capable path)",
    };
  }

  // Texture-heavy / painterly styles benefit from SDXL's refiner. Send
  // them straight to direct Replicate; the router falls back to Lovable.
  if (LOVABLE_SDXL_STYLES.has(styleKey)) {
    return {
      primary: "direct_replicate",
      reason: `style=${styleKey} → direct Replicate (texture-heavy SDXL)`,
    };
  }

  if (printIntent) {
    // Print-ready output benefits from SDXL's refiner pass.
    return {
      primary: "direct_replicate",
      reason: `printIntent + style=${styleKey} → direct Replicate (refiner)`,
    };
  }

  if (GEMINI_FIRST_STYLES.has(styleKey)) {
    return {
      primary: "direct_gemini",
      reason: `style=${styleKey} → direct Gemini (cost-efficient, flat/poster/line)`,
    };
  }

  // Unknown / new style — default to direct Gemini as cheapest option.
  // Router appends Replicate then Lovable as safety-net fallbacks.
  return {
    primary: "direct_gemini",
    reason: `style=${styleKey} → direct Gemini (default cost-aware fallback)`,
  };
}

// ── Execution route ────────────────────────────────────────────────────
// `executionRoute` is the EXTERNAL-facing label that shows up in the UI
// and persists to the DB. It distinguishes:
//
//   lovable_gateway          — generated via Lovable AI Gateway (Gemini behind it)
//   lovable_gateway_sdxl     — generated via SDXL on Replicate, dispatched by Lovable
//   direct_gemini            — Gemini directly (bypassing Lovable routing)
//   lovable_gateway_fallback — Auto fell back to Lovable after primary failed
//
// The router fills this in based on which adapter+provider actually ran.

export type ExecutionRoute =
  | "lovable_gateway"
  | "lovable_gateway_sdxl"
  | "direct_gemini"
  | "direct_replicate"
  | "direct_openai"
  | "lovable_gateway_fallback"
  | "direct_gemini_fallback"
  | "direct_replicate_fallback"
  | "direct_openai_fallback";

export function executionRouteLabel(route?: string | null): string {
  switch (route) {
    case "lovable_gateway": return "Lovable gateway";
    case "lovable_gateway_sdxl": return "Lovable gateway (SDXL)";
    case "direct_gemini": return "Direct Gemini";
    case "direct_replicate": return "Direct Replicate";
    case "direct_openai": return "Direct OpenAI";
    case "lovable_gateway_fallback": return "Lovable · fallback";
    case "direct_gemini_fallback": return "Direct Gemini · fallback";
    case "direct_replicate_fallback": return "Direct Replicate · fallback";
    case "direct_openai_fallback": return "Direct OpenAI · fallback";
    default: return "Unknown route";
  }
}

/**
 * Visual route family for badge styling:
 *   - "direct"   → 🟢 we hit the provider API straight (Replicate / Gemini / OpenAI)
 *   - "lovable"  → 🟡 we went through the Lovable gateway
 *   - "fallback" → 🔁 the primary route failed and we recovered via another
 */
export type RouteVisualKind = "direct" | "lovable" | "fallback";

export function executionRouteKind(route?: string | null): RouteVisualKind {
  if (!route) return "lovable";
  if (route.endsWith("_fallback")) return "fallback";
  if (route.startsWith("direct_")) return "direct";
  return "lovable";
}
