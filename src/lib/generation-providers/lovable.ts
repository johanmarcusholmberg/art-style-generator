/**
 * Lovable adapter (adapter 1).
 *
 * "Lovable" here means: generation routed through the existing Supabase
 * edge functions, which themselves consult `_shared/generators.ts` and
 * may dispatch to either Gemini (via the Lovable AI Gateway) or SDXL
 * (via Replicate). From the frontend's point of view this is the
 * canonical, always-available adapter.
 *
 * This adapter does NOT introduce a new transport — it wraps the existing
 * `supabase.functions.invoke(<style-edge-fn>, ...)` call and normalizes
 * the response. Keeps Phase 2 zero-risk for the production flow.
 */

import { supabase } from "@/integrations/supabase/client";
import { STYLE_CONFIGS } from "@/lib/style-config";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";

/** Resolve the per-style edge function that should handle a styleKey. */
function resolveEdgeFnForStyle(styleKey: string): string {
  // STYLE_CONFIGS is keyed by style id and exposes themedEdgeFn / freestyleEdgeFn.
  // For freestyle variants the styleKey itself encodes "<base>-freestyle".
  const isFreestyleVariant = styleKey.endsWith("-freestyle");
  const baseKey = isFreestyleVariant ? styleKey.replace(/-freestyle$/, "") : styleKey;
  const cfg = (STYLE_CONFIGS as Record<string, any>)[baseKey];
  if (!cfg) {
    // Fallback to the universal japanese handler — matches generate-image/index.ts.
    return "generate-image";
  }
  if (isFreestyleVariant && cfg.freestyleEdgeFn) return cfg.freestyleEdgeFn;
  return cfg.themedEdgeFn || cfg.freestyleEdgeFn || "generate-image";
}

export async function generateWithLovableAdapter(
  req: NormalizedGenerationRequest,
): Promise<NormalizedGenerationResponse> {
  const edgeFn = resolveEdgeFnForStyle(req.styleKey);

  const body: Record<string, unknown> = {
    prompt: req.prompt,
    aspectRatio: req.aspectRatio,
    backgroundStyle: req.backgroundStyle,
    printMode: req.printMode ?? true,
    generatorPreference: req.providerPreference ?? "auto",
  };
  if (req.referenceImageUrl) body.sourceImageUrl = req.referenceImageUrl;

  const { data, error } = await supabase.functions.invoke(edgeFn, { body });
  if (error) throw error;
  if (!data || data.error) throw new Error(data?.error || "Generation failed");
  if (!data.imageUrl) throw new Error("Provider returned no imageUrl");

  return {
    imageUrl: data.imageUrl,
    width: data.width,
    height: data.height,
    generationProvider: data.provider, // "sdxl" | "gemini" — set by backend
    generationModel: data.model,
    prompt: req.prompt,
    revisedPrompt: data.revisedPrompt,
    styleKey: req.styleKey,
    fallbackUsed: !!data.fallbackUsed,
    strategy: data.strategy ?? "auto",
    attempted: data.attempted,
    metadata: { adapter: "lovable", edgeFn },
  };
}
