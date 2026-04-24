/**
 * Direct Replicate adapter (adapter 3).
 *
 * Calls a dedicated edge function (`generate-image-direct-replicate`) that
 * hits Replicate's SDXL endpoint without going through the Lovable
 * resolver. This gives us a true "direct" execution path — useful for
 * cost reduction and for clearly distinguishing direct vs gateway calls
 * in the UI.
 *
 * Like the Gemini adapter, this stays server-mediated to keep the
 * REPLICATE_API_TOKEN out of the browser.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";

export async function generateWithReplicateAdapter(
  req: NormalizedGenerationRequest,
): Promise<NormalizedGenerationResponse> {
  // Replicate SDXL is text-to-image only in this phase.
  if (req.referenceImageUrl || req.isEdit) {
    throw new Error(
      "Direct Replicate (SDXL) does not support image-to-image edits — use the Lovable adapter for edits.",
    );
  }

  const body: Record<string, unknown> = {
    prompt: req.prompt,
    styleKey: req.styleKey,
    aspectRatio: req.aspectRatio,
    backgroundStyle: req.backgroundStyle,
    printMode: req.printMode ?? true,
  };
  if (req.strictness) body.strictness = req.strictness;

  const { data, error } = await supabase.functions.invoke(
    "generate-image-direct-replicate",
    { body },
  );
  if (error) throw error;
  if (!data || data.error) {
    throw new Error(data?.error || "Direct Replicate generation failed");
  }
  if (!data.imageUrl) throw new Error("Direct Replicate returned no imageUrl");

  return {
    imageUrl: data.imageUrl,
    width: data.width,
    height: data.height,
    generationProvider: "sdxl",
    generationModel: data.model ?? "stability-ai/sdxl",
    prompt: req.prompt,
    styleKey: req.styleKey,
    providerGenerationId: data.providerGenerationId,
    fallbackUsed: false,
    strategy: "manual",
    executionRoute: "direct_replicate",
    metadata: { adapter: "replicate-direct" },
  };
}
