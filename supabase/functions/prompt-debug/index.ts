/**
 * Provider-aware prompt inspection endpoint.
 *
 * GET  /prompt-debug?style=popart&prompt=A%20cat&strictness=strict
 *   → returns Gemini + SDXL + OpenAI compiled prompts for the given style/subject.
 *
 * POST { style, prompt, aspectRatio?, backgroundStyle?, printMode?, strictness? }
 *   → same, with full options support.
 */

import {
  compilePrompt,
  compilePromptForSDXL,
  compilePromptForOpenAI,
  corsHeaders,
  STYLE_RULES,
} from "../_shared/prompt-compiler.ts";
import { categoryFor } from "../_shared/prompt-profiles.ts";
import {
  defaultStrictnessFor,
  estimateDriftRisk,
  getStyleMeta,
  validateCompiledPrompt,
  type Strictness,
} from "../_shared/style-meta.ts";

interface DebugInput {
  style: string;
  prompt: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  printMode?: boolean;
  strictness?: Strictness;
}

function compile(input: DebugInput) {
  const opts = {
    aspectRatio: input.aspectRatio,
    backgroundStyle: input.backgroundStyle,
    printMode: !!input.printMode,
  };
  const meta = getStyleMeta(input.style);
  const rules = STYLE_RULES[input.style];

  const sdxlStrictness: Strictness =
    input.strictness ?? defaultStrictnessFor(input.style, "sdxl");
  const geminiStrictness: Strictness =
    input.strictness ?? defaultStrictnessFor(input.style, "gemini");
  const openaiStrictness: Strictness =
    input.strictness ?? defaultStrictnessFor(input.style, "openai");

  const gemini = compilePrompt(input.prompt, input.style, opts);
  const sdxl = compilePromptForSDXL(input.prompt, input.style, {
    ...opts,
    provider: "sdxl",
    strictness: sdxlStrictness,
  });
  const openai = compilePromptForOpenAI(input.prompt, input.style, {
    ...opts,
    provider: "openai",
    strictness: openaiStrictness,
  });

  const mustHaves = (rules?.styleAnchors.length ?? 0) + (rules?.styleRules.length ?? 0);
  const avoids = (rules?.avoidRules.length ?? 0) + (rules?.blockedTraits?.length ?? 0);

  const sdxlValidation = validateCompiledPrompt({
    styleKey: input.style,
    provider: "sdxl",
    prompt: sdxl.prompt,
    negativePrompt: sdxl.negativePrompt,
    styleMustHavesCount: mustHaves,
    styleAvoidCount: avoids,
  });
  const geminiValidation = validateCompiledPrompt({
    styleKey: input.style,
    provider: "gemini",
    prompt: gemini,
    styleMustHavesCount: mustHaves,
    styleAvoidCount: avoids,
  });
  const openaiValidation = validateCompiledPrompt({
    styleKey: input.style,
    provider: "openai",
    prompt: openai.prompt,
    styleMustHavesCount: mustHaves,
    styleAvoidCount: avoids,
  });

  return {
    style: input.style,
    subject: input.prompt,
    category: categoryFor(input.style),
    displayName: meta.displayName,
    gemini: {
      prompt: gemini,
      length: gemini.length,
      strictness: geminiStrictness,
      driftRisk: estimateDriftRisk(input.style, "gemini", geminiStrictness),
      validation: geminiValidation,
    },
    sdxl: {
      prompt: sdxl.prompt,
      negativePrompt: sdxl.negativePrompt,
      length: sdxl.prompt.length,
      negativeLength: (sdxl.negativePrompt ?? "").length,
      category: sdxl.category,
      strictness: sdxlStrictness,
      driftRisk: estimateDriftRisk(input.style, "sdxl", sdxlStrictness),
      validation: sdxlValidation,
    },
    openai: {
      prompt: openai.prompt,
      length: openai.prompt.length,
      category: openai.category,
      strictness: openaiStrictness,
      driftRisk: estimateDriftRisk(input.style, "openai", openaiStrictness),
      validation: openaiValidation,
    },
  };
}

function asStrictness(v: string | null | undefined): Strictness | undefined {
  if (v === "balanced" || v === "strict" || v === "very_strict") return v;
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let input: DebugInput;

    if (req.method === "GET") {
      const url = new URL(req.url);
      const style = url.searchParams.get("style") ?? "popart";
      const prompt =
        url.searchParams.get("prompt") ??
        "A lone fisherman in a small boat at sunset";
      input = {
        style,
        prompt,
        aspectRatio: url.searchParams.get("aspectRatio") ?? undefined,
        backgroundStyle: url.searchParams.get("backgroundStyle") ?? undefined,
        printMode: url.searchParams.get("printMode") === "true",
        strictness: asStrictness(url.searchParams.get("strictness")),
      };
    } else {
      const body = await req.json().catch(() => ({}));
      input = {
        style: body.style ?? "popart",
        prompt: body.prompt ?? "A lone fisherman in a small boat at sunset",
        aspectRatio: body.aspectRatio,
        backgroundStyle: body.backgroundStyle,
        printMode: !!body.printMode,
        strictness: asStrictness(body.strictness),
      };
    }

    if (!input.style || typeof input.style !== "string") {
      return new Response(JSON.stringify({ error: "style required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = compile(input);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("prompt-debug error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
