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
  compilePrompt,
} from "../_shared/prompt-compiler.ts";

interface Body {
  prompt?: string;
  styleKey?: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  printMode?: boolean;
  /** Optional: "low" | "medium" | "high" | "auto" (defaults to "high"). */
  quality?: "low" | "medium" | "high" | "auto";
}

const OPENAI_MODEL = "gpt-image-1";

/**
 * Map our aspect-ratio tokens to the closest size gpt-image-1 supports.
 * gpt-image-1 currently supports: 1024x1024, 1024x1536 (portrait), 1536x1024 (landscape).
 * We pick by orientation derived from the ratio.
 */
function openaiSize(aspectRatio?: string): {
  size: "1024x1024" | "1024x1536" | "1536x1024";
  width: number;
  height: number;
} {
  if (!aspectRatio || aspectRatio === "1:1") {
    return { size: "1024x1024", width: 1024, height: 1024 };
  }
  const [aStr, bStr] = aspectRatio.split(":");
  const a = parseFloat(aStr);
  const b = parseFloat(bStr);
  if (!isFinite(a) || !isFinite(b) || b === 0) {
    return { size: "1024x1024", width: 1024, height: 1024 };
  }
  const ratio = a / b;
  if (ratio > 1.05) return { size: "1536x1024", width: 1536, height: 1024 };
  if (ratio < 0.95) return { size: "1024x1536", width: 1024, height: 1536 };
  return { size: "1024x1024", width: 1024, height: 1024 };
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
      quality,
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

    // Use the same natural-language compiled prompt path as Gemini.
    const compiledPrompt = compilePrompt(trimmedPrompt, styleKey, {
      aspectRatio,
      backgroundStyle,
      isEdit: false,
      printMode: !!printMode,
    });

    const { size, width, height } = openaiSize(aspectRatio);
    const startedAt = Date.now();

    console.log(
      `[direct-openai] style=${styleKey} prompt_len=${compiledPrompt.length} ` +
        `size=${size} quality=${quality ?? "high"}`,
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
