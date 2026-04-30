/**
 * Gemini direct adapter (adapter 2).
 *
 * Phase 2 note: this adapter does NOT call Gemini directly from the
 * browser — that would leak the API key. Instead it submits a request
 * with `providerPreference: "gemini"` so the backend's existing
 * `runWithResolver` runs the Gemini provider exclusively (manual mode,
 * no fallback). This gives the same end-to-end behavior as a "direct"
 * adapter while keeping the secret server-side.
 *
 * When/if a future phase adds a separate `gemini-direct` backend
 * function, only the transport in this file needs to change — the
 * normalized contract is preserved.
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveEdgeFnForStyle } from "@/lib/generation-providers/_resolve-edge-fn";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";

export async function generateWithGeminiAdapter(
  req: NormalizedGenerationRequest,
): Promise<NormalizedGenerationResponse> {
  const edgeFn = resolveEdgeFnForStyle(req.styleKey);
  const body: Record<string, unknown> = {
    prompt: req.prompt,
    aspectRatio: req.aspectRatio,
    backgroundStyle: req.backgroundStyle,
    printMode: req.printMode ?? true,
    // Force Gemini path on the backend resolver.
    generatorPreference: "gemini",
  };
  if (req.posterFormatHint) body.posterFormatHint = req.posterFormatHint;
  if (req.posterFormatId) body.posterFormatId = req.posterFormatId;
  if (req.referenceImageUrl) body.sourceImageUrl = req.referenceImageUrl;

  const { data, error } = await supabase.functions.invoke(edgeFn, { body });
  if (error) throw error;
  if (!data || data.error) throw new Error(data?.error || "Gemini generation failed");
  if (!data.imageUrl) throw new Error("Gemini returned no imageUrl");

  return {
    imageUrl: data.imageUrl,
    width: data.width,
    height: data.height,
    generationProvider: data.provider ?? "gemini",
    generationModel: data.model ?? "google/gemini-3-pro-image-preview",
    prompt: req.prompt,
    revisedPrompt: data.revisedPrompt,
    styleKey: req.styleKey,
    fallbackUsed: false, // manual selection — never auto-falls-back
    strategy: "manual",
    attempted: data.attempted,
    // Gemini adapter explicitly bypasses the Lovable resolver's choice;
    // mark this as a "direct" route so the UI can communicate it clearly.
    executionRoute: "direct_gemini",
    requestedWidth: data.requestedWidth,
    requestedHeight: data.requestedHeight,
    requestedAspectRatio: data.requestedAspectRatio,
    providerExactMatch: data.providerExactMatch,
    providerAdjusted: data.providerAdjusted,
    metadata: { adapter: "gemini-direct", edgeFn },
  };
}
