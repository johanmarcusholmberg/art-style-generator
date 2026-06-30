/**
 * Direct OpenAI adapter (adapter 4).
 *
 * Calls a dedicated edge function (`generate-image-direct-openai`) that
 * hits OpenAI's GPT Image API (`gpt-image-2`) without going through the
 * Lovable gateway. The OpenAI API key stays server-side.
 *
 * OpenAI's text encoder handles natural-language prompts well, so this
 * path consumes the SAME compiled prompt the Gemini path does — keeping
 * the structured style-config / prompt-compiler pipeline as the single
 * source of truth.
 *
 * Supports both text-to-image and image-to-image (reference upload). For
 * edits the edge function POSTs to OpenAI's `/v1/images/edits` endpoint
 * and the user's reference-strength selection is translated into a prompt
 * directive prepended to the compiled style prompt.
 */



import { supabase } from "@/integrations/supabase/client";
import { resolveAdapterSizingOverrides } from "@/lib/provider-print-sizing";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";

export async function generateWithOpenAIAdapter(
  req: NormalizedGenerationRequest,
): Promise<NormalizedGenerationResponse> {
  const overrides = resolveAdapterSizingOverrides({
    provider: "openai",
    modelId: req.modelId,
    formatId: req.posterFormatId,
    intent: req.sizeIntent,
  });

  const isEdit = !!req.referenceImageUrl || !!req.isEdit;

  const body: Record<string, unknown> = {
    prompt: req.prompt,
    styleKey: req.styleKey,
    aspectRatio: req.aspectRatio,
    backgroundStyle: req.backgroundStyle,
    printMode: req.printMode ?? true,
    sizeIntent: overrides?.sizeIntent ?? req.sizeIntent ?? "standard",
  };
  // Forward explicit pixel size for flexible-dim models (gpt-image-2).
  if (overrides?.requestedSize) body.requestedSize = overrides.requestedSize;

  if (req.strictness) body.strictness = req.strictness;
  if (req.posterFormatHint) body.posterFormatHint = req.posterFormatHint;
  if (req.posterFormatId) body.posterFormatId = req.posterFormatId;
  if (req.requestedModelId) body.requestedModelId = req.requestedModelId;
  if (req.providerModelId) body.providerModelId = req.providerModelId;

  // Image-to-image edit path: forward the uploaded reference + the user's
  // reference-strength selection so the edge function can call the OpenAI
  // images-edit endpoint with the correct prompt directive.
  if (isEdit && req.referenceImageUrl) {
    body.sourceImageUrl = req.referenceImageUrl;
    body.isEdit = true;
    if (req.referenceStrength) body.referenceStrength = req.referenceStrength;
  }

  const { data, error } = await supabase.functions.invoke(
    "generate-image-direct-openai",
    { body },
  );
  if (error) throw error;
  if (!data || data.error) {
    throw new Error(data?.error || "Direct OpenAI generation failed");
  }
  if (!data.imageUrl) throw new Error("Direct OpenAI returned no imageUrl");

  return {
    imageUrl: data.imageUrl,
    width: data.width,
    height: data.height,
    generationProvider: "openai",
    generationModel: data.model ?? "gpt-image-2",
    prompt: req.prompt,
    styleKey: req.styleKey,
    fallbackUsed: false,
    strategy: "manual",
    executionRoute: isEdit ? "direct_openai" : "direct_openai",
    requestedWidth: data.requestedWidth ?? data.width,
    requestedHeight: data.requestedHeight ?? data.height,
    requestedAspectRatio: data.requestedAspectRatio ?? req.aspectRatio,
    providerExactMatch: data.providerExactMatch,
    providerAdjusted: data.providerAdjusted,
    metadata: {
      adapter: "openai-direct",
      requestedSize: data.requestedSize,
      sizeSource: data.sizeSource,
      requestedModelId: req.requestedModelId ?? null,
      isEdit,
      referenceStrength: isEdit ? req.referenceStrength ?? null : null,
      apiRoute: data.apiRoute ?? null,
      modelFallbackReason:
        req.providerModelId && req.providerModelId !== (data.model ?? "gpt-image-2")
          ? `requested ${req.providerModelId} but adapter ran ${data.model ?? "gpt-image-2"}`
          : null,
    },
  };
}
