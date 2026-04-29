/**
 * Direct OpenAI adapter (adapter 4).
 *
 * Calls a dedicated edge function (`generate-image-direct-openai`) that
 * hits OpenAI's GPT Image API (`gpt-image-1`) without going through the
 * Lovable gateway. The OpenAI API key stays server-side.
 *
 * OpenAI's text encoder handles natural-language prompts well, so this
 * path consumes the SAME compiled prompt the Gemini path does — keeping
 * the structured style-config / prompt-compiler pipeline as the single
 * source of truth.
 *
 * Like the other "direct_*" adapters, this is text-to-image only in this
 * phase. Image edits are still handled by the Lovable adapter.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";

export async function generateWithOpenAIAdapter(
  req: NormalizedGenerationRequest,
): Promise<NormalizedGenerationResponse> {
  if (req.referenceImageUrl || req.isEdit) {
    throw new Error(
      "Direct OpenAI (gpt-image-1) does not support image-to-image edits in this phase — use the Lovable adapter for edits.",
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
  if (req.posterFormatHint) body.posterFormatHint = req.posterFormatHint;
  if (req.posterFormatId) body.posterFormatId = req.posterFormatId;

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
    generationModel: data.model ?? "gpt-image-1",
    prompt: req.prompt,
    styleKey: req.styleKey,
    fallbackUsed: false,
    strategy: "manual",
    executionRoute: "direct_openai",
    metadata: { adapter: "openai-direct" },
  };
}
