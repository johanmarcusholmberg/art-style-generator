/**
 * Unified generate-image router (Phase 2).
 *
 * Single backend entry point that accepts `{ styleKey, ... }` and dispatches
 * to the existing prompt-compiler + provider resolver. Lives ALONGSIDE the
 * per-style edge functions — those continue to work unchanged.
 *
 * Frontend adapters (src/lib/generation-providers/*) currently target the
 * per-style functions for safety; this router is provided so future code
 * can collapse to a single endpoint without touching every style page.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, STYLE_RULES } from "../_shared/prompt-compiler.ts";
import { runWithResolver, ProviderError } from "../_shared/generators.ts";

interface Body {
  prompt?: string;
  styleKey?: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  printMode?: boolean;
  sourceImageUrl?: string;
  generatorPreference?: "auto" | "sdxl" | "gemini";
  // Normalized contract additions (currently informational only).
  sizeIntent?: "preview" | "standard" | "print";
  qualityIntent?: "fast" | "balanced" | "premium";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;
    const {
      prompt,
      styleKey,
      aspectRatio,
      backgroundStyle,
      printMode,
      sourceImageUrl,
      generatorPreference,
    } = body || {};

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0 || trimmedPrompt.length > 1000) {
      return new Response(
        JSON.stringify({ error: "Prompt must be between 1 and 1000 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!styleKey || typeof styleKey !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing styleKey" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!STYLE_RULES[styleKey]) {
      return new Response(
        JSON.stringify({ error: `Unknown styleKey: ${styleKey}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pref =
      generatorPreference === "sdxl" ||
      generatorPreference === "gemini" ||
      generatorPreference === "auto"
        ? generatorPreference
        : "auto";

    const isEdit = !!sourceImageUrl;
    // Image edits force Gemini (only image-capable provider in Phase 1).
    const effectivePref = isEdit && pref !== "gemini" ? "auto" : pref;

    try {
      const outcome = await runWithResolver(effectivePref, {
        userPrompt: trimmedPrompt,
        styleKey,
        aspectRatio,
        backgroundStyle,
        printMode: !!printMode,
        isEdit,
        sourceImageUrl,
      });

      console.log(
        `[generate-image-router] style=${styleKey} provider=${outcome.providerId} ` +
          `model=${outcome.modelId} strategy=${outcome.strategy} fallback=${outcome.fallbackUsed}`,
      );

      return new Response(
        JSON.stringify({
          imageUrl: outcome.imageUrl,
          provider: outcome.providerId,
          model: outcome.modelId,
          strategy: outcome.strategy,
          fallbackUsed: outcome.fallbackUsed,
          width: outcome.width,
          height: outcome.height,
          attempted: outcome.attempted,
          styleKey,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err) {
      if (err instanceof ProviderError) {
        const status = err.httpStatus ?? 500;
        return new Response(
          JSON.stringify({ error: err.message, code: err.code }),
          { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw err;
    }
  } catch (e) {
    console.error("generate-image-router error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
