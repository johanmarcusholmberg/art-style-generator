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
import { resolveEdgeFnForStyle } from "@/lib/generation-providers/_resolve-edge-fn";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";

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
  if (req.strictness) body.strictness = req.strictness;
  if (req.referenceImageUrl) body.sourceImageUrl = req.referenceImageUrl;

  const { data, error } = await supabase.functions.invoke(edgeFn, { body });
  if (error) throw error;
  if (!data || data.error) throw new Error(data?.error || "Generation failed");
  if (!data.imageUrl) throw new Error("Provider returned no imageUrl");

  // Lovable adapter routes through the Lovable backend resolver, which can
  // either dispatch to SDXL (Replicate) or Gemini (Lovable AI Gateway).
  // Either way, the EXTERNAL execution route is "Lovable gateway" — the
  // backend resolver, not the user, made the provider choice.
  const provider = data.provider as "sdxl" | "gemini" | undefined;
  const executionRoute =
    provider === "sdxl" ? "lovable_gateway_sdxl" : "lovable_gateway";

  return {
    imageUrl: data.imageUrl,
    width: data.width,
    height: data.height,
    generationProvider: provider!, // "sdxl" | "gemini" — set by backend
    generationModel: data.model,
    prompt: req.prompt,
    revisedPrompt: data.revisedPrompt,
    styleKey: req.styleKey,
    fallbackUsed: !!data.fallbackUsed,
    strategy: data.strategy ?? "auto",
    attempted: data.attempted,
    executionRoute,
    metadata: { adapter: "lovable", edgeFn },
  };
}
