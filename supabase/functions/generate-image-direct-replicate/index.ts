/**
 * Direct Replicate (SDXL) edge function — adapter 3 backend.
 *
 * Calls Replicate's SDXL endpoint directly using REPLICATE_API_TOKEN.
 * Independent of the Lovable resolver. Used by the Replicate frontend
 * adapter to provide a "direct" execution route, reducing dependence on
 * the Lovable gateway.
 *
 * Mirrors the prompt-compilation logic used by `_shared/generators.ts`
 * so the prompt quality stays identical between Lovable-routed and
 * direct-routed SDXL calls.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  STYLE_RULES,
  compilePromptForSDXL,
} from "../_shared/prompt-compiler.ts";

interface Body {
  prompt?: string;
  styleKey?: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  printMode?: boolean;
  posterFormatHint?: string;
}

const REPLICATE_SDXL_VERSION =
  "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"; // stability-ai/sdxl

function sdxlSize(aspectRatio?: string): { width: number; height: number } {
  switch (aspectRatio) {
    case "1:1": return { width: 1024, height: 1024 };
    case "4:5": return { width: 832, height: 1024 };
    case "5:7": return { width: 768, height: 1024 };
    case "2:3": return { width: 768, height: 1152 };
    case "3:2": return { width: 1152, height: 768 };
    case "3:4": return { width: 768, height: 1024 };
    case "4:3": return { width: 1024, height: 768 };
    case "16:9": return { width: 1344, height: 768 };
    case "9:16": return { width: 768, height: 1344 };
    case "7:5": return { width: 1024, height: 768 };
    default: return { width: 1024, height: 1024 };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;
    const { prompt, styleKey, aspectRatio, backgroundStyle, printMode, posterFormatHint } = body || {};

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
    if (!styleKey || typeof styleKey !== "string" || !STYLE_RULES[styleKey]) {
      return new Response(
        JSON.stringify({ error: `Unknown styleKey: ${styleKey}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_TOKEN is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const compiled = compilePromptForSDXL(trimmedPrompt, styleKey, {
      aspectRatio,
      backgroundStyle,
      isEdit: false,
      printMode: !!printMode,
      provider: "sdxl",
      posterFormatHint:
        typeof posterFormatHint === "string" ? posterFormatHint : undefined,
    });

    const { width, height } = sdxlSize(aspectRatio);
    const startedAt = Date.now();

    console.log(
      `[direct-replicate] style=${styleKey} category=${compiled.category} ` +
        `prompt_len=${compiled.prompt.length} size=${width}x${height}`,
    );

    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        version: REPLICATE_SDXL_VERSION,
        input: {
          prompt: compiled.prompt,
          width,
          height,
          num_inference_steps: 40,
          guidance_scale: 7.5,
          scheduler: "K_EULER",
          refine: "expert_ensemble_refiner",
          high_noise_frac: 0.8,
          apply_watermark: false,
          negative_prompt:
            compiled.negativePrompt ||
            "low quality, blurry, soft focus, jpeg artifacts, watermark, signature, text, words, letters, ugly deformed",
        },
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: `Replicate SDXL error ${createRes.status}: ${text.slice(0, 200)}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let prediction = await createRes.json();

    // Poll if not finished from `Prefer: wait`
    const pollStart = Date.now();
    const TIMEOUT = 120_000;
    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled"
    ) {
      if (Date.now() - pollStart > TIMEOUT) {
        return new Response(
          JSON.stringify({ error: "SDXL generation timed out after 120s" }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch(prediction.urls.get, {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      });
      prediction = await pollRes.json();
    }

    if (prediction.status !== "succeeded") {
      return new Response(
        JSON.stringify({
          error: `SDXL ${prediction.status}: ${prediction.error || "unknown"}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const output = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;
    if (!output || typeof output !== "string") {
      return new Response(
        JSON.stringify({ error: "SDXL returned no image URL" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[direct-replicate] ✓ predictionId=${prediction.id} elapsed=${elapsedMs}ms`,
    );

    return new Response(
      JSON.stringify({
        imageUrl: output,
        provider: "sdxl",
        model: "stability-ai/sdxl",
        width,
        height,
        providerGenerationId: prediction.id,
        executionRoute: "direct_replicate",
        styleKey,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-image-direct-replicate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
