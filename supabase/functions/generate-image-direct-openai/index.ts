/**
 * Direct OpenAI (gpt-image-2) edge function — adapter 4 backend.
 *
 * Calls OpenAI's Image API directly using OPENAI_API_KEY. Independent of
 * Lovable's gateway and credits. Uses gpt-image-2 with exact poster-format
 * pixel sizes (no legacy 1024×1536 / 1024×1024 / auto fallbacks).
 *
 * Reuses the SAME shared `compilePrompt()` used by the Gemini path so
 * style adherence stays consistent across providers.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  STYLE_RULES,
  compilePromptForOpenAI,
} from "../_shared/prompt-compiler.ts";
import { openaiGptImage2SizeForFormat } from "../_shared/provider-sizing.ts";

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
  sizeIntent?: "preview" | "standard" | "print";
  /** Explicit "WxH" override (gpt-image-2 only, multiples of 16). */
  requestedSize?: string;
  /** Optional explicit portrait/landscape override. */
  orientation?: "portrait" | "landscape";
}


const OPENAI_MODEL = "gpt-image-2";

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
      sizeIntent,
      requestedSize,
      orientation,
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
    // OpenAI sometimes drifts toward photographic output.
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

    // Exact poster-format pixel size for gpt-image-2. No legacy
    // 1024×1024 / 1024×1536 fallbacks for mapped formats; no white-border
    // padding; the selected format directly controls the requested W×H.
    const exactSized = openaiGptImage2SizeForFormat(
      posterFormatId,
      orientation === "portrait" || orientation === "landscape" ? orientation : undefined,
    );
    let size: string;
    let width: number;
    let height: number;
    let sizeSource: string;
    let providerExactMatch: boolean;
    if (exactSized) {
      size = exactSized.size;
      width = exactSized.width;
      height = exactSized.height;
      sizeSource = exactSized.source;
      providerExactMatch = exactSized.exact;
    } else {
      // No format selected — fall back to a square 1024×1024 default.
      size = "1024x1024";
      width = 1024;
      height = 1024;
      sizeSource = "default";
      providerExactMatch = false;
    }
    // Honor adapter-provided "WxH" override (capability-gated client-side).
    if (typeof requestedSize === "string" && /^\d{3,4}x\d{3,4}$/.test(requestedSize)) {
      const [w, h] = requestedSize.split("x").map(Number);
      if (w >= 256 && w <= 4096 && h >= 256 && h <= 4096 && w % 16 === 0 && h % 16 === 0) {
        size = requestedSize; width = w; height = h; sizeSource = "override";
      }
    }
    const startedAt = Date.now();

    console.log(
      `[direct-openai] model=${OPENAI_MODEL} style=${styleKey} category=${compiled.category} ` +
        `prompt_len=${compiledPrompt.length} requestedSize=${size} sizeSource=${sizeSource} ` +
        `sizeIntent=${sizeIntent ?? "standard"} exact=${providerExactMatch} posterFormatId=${posterFormatId ?? "none"} quality=${quality ?? "high"}`,
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
    // gpt-image-2 returns base64 by default (`b64_json`). We re-emit as a
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
    console.log(
      `[direct-openai] ✓ model=${OPENAI_MODEL} elapsed=${elapsedMs}ms requestedSize=${size} ` +
        `posterFormatId=${posterFormatId ?? "none"}`,
    );

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
        providerExactMatch,
        providerAdjusted: !providerExactMatch,
        sizeSource,
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
