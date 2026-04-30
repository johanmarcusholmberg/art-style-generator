/**
 * Direct OpenAI (gpt-image-1) edge function — adapter 4 backend.
 *
 * Calls OpenAI's Image API directly using OPENAI_API_KEY. Independent of
 * Lovable's gateway and credits. Uses the current GPT Image API path
 * (`/v1/images/generations` with model `gpt-image-1`) — NOT the legacy
 * DALL·E-only `/images/generations?model=dall-e-3` shape.
 *
 * Reuses the SAME shared `compilePrompt()` used by the Gemini path so
 * style adherence stays consistent across providers — OpenAI's text
 * encoder behaves more like Gemini than SDXL, so the natural-language
 * compiled prompt is the right choice (not the front-loaded SDXL form).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  STYLE_RULES,
  compilePromptForOpenAI,
} from "../_shared/prompt-compiler.ts";
import { openaiSizeForFormat } from "../_shared/provider-sizing.ts";

interface Body {
  prompt?: string;
  styleKey?: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  printMode?: boolean;
  /** Optional: "low" | "medium" | "high" | "auto" (defaults to "high"). */
  quality?: "low" | "medium" | "high" | "auto";
  /** Optional: "balanced" | "strict" | "very_strict". */
  strictness?: "balanced" | "strict" | "very_strict";
  posterFormatHint?: string;
  posterFormatId?: string;
}

const OPENAI_MODEL = "gpt-image-1";

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
      quality,
      strictness,
      posterFormatHint,
      posterFormatId,
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
    if (!styleKey || typeof styleKey !== "string" || !STYLE_RULES[styleKey]) {
      return new Response(
        JSON.stringify({ error: `Unknown styleKey: ${styleKey}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Use the OpenAI-tuned compiler — same canonical prompt as Gemini, plus
    // a category-aware PROVIDER GUIDANCE tail that locks illustration /
    // non-photorealism for poster, screen-print, and minimal styles where
    // gpt-image-1 tends to drift toward photographic output.
    const compiled = compilePromptForOpenAI(trimmedPrompt, styleKey, {
      aspectRatio,
      backgroundStyle,
      isEdit: false,
      printMode: !!printMode,
      provider: "openai",
      strictness,
      posterFormatHint:
        typeof posterFormatHint === "string" ? posterFormatHint : undefined,
    });
    const compiledPrompt = compiled.prompt;

    const sized = openaiSizeForFormat(posterFormatId, aspectRatio);
    const { size, width, height } = sized;
    const startedAt = Date.now();

    console.log(
      `[direct-openai] style=${styleKey} category=${compiled.category} ` +
        `prompt_len=${compiledPrompt.length} size=${size} sizeSource=${sized.source} ` +
        `exact=${sized.exact} posterFormatId=${posterFormatId ?? "none"} quality=${quality ?? "high"}`,
    );

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        prompt: compiledPrompt,
        size,
        n: 1,
        quality: quality ?? "high",
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[direct-openai] HTTP ${res.status}: ${text.slice(0, 500)}`);
      // Map common errors to clearer messages.
      let errMsg = `OpenAI image error ${res.status}: ${text.slice(0, 200)}`;
      if (res.status === 401) errMsg = "OpenAI rejected the API key (401).";
      else if (res.status === 429) errMsg = "OpenAI rate limit hit (429). Try again shortly.";
      else if (res.status === 400 && text.includes("safety")) {
        errMsg = "OpenAI safety system blocked this prompt. Try rewording.";
      }
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await res.json();
    const item = Array.isArray(json?.data) ? json.data[0] : null;
    // gpt-image-1 returns base64 by default (`b64_json`). We re-emit as a
    // data URL so the rest of the pipeline (which expects a string URL)
    // can persist it via the existing master-asset upload flow.
    let imageUrl: string | null = null;
    if (item?.b64_json) {
      imageUrl = `data:image/png;base64,${item.b64_json}`;
    } else if (item?.url) {
      imageUrl = item.url as string;
    }

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "OpenAI returned no image data" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(`[direct-openai] ✓ elapsed=${elapsedMs}ms size=${size}`);

    return new Response(
      JSON.stringify({
        imageUrl,
        provider: "openai",
        model: OPENAI_MODEL,
        width,
        height,
        executionRoute: "direct_openai",
        styleKey,
        requestedWidth: width,
        requestedHeight: height,
        requestedSize: size,
        requestedAspectRatio: aspectRatio ?? null,
        providerExactMatch: sized.exact,
        providerAdjusted: !sized.exact,
        sizeSource: sized.source,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-image-direct-openai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
