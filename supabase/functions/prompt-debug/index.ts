/**
 * Provider-aware prompt inspection endpoint.
 *
 * GET  /prompt-debug?style=popart&prompt=A%20cat
 *   → returns Gemini + SDXL compiled prompts for the given style/subject.
 *
 * POST { style, prompt, aspectRatio?, backgroundStyle?, printMode? }
 *   → same, with full options support.
 */

import {
  compilePrompt,
  compilePromptForSDXL,
  corsHeaders,
} from "../_shared/prompt-compiler.ts";
import { categoryFor } from "../_shared/prompt-profiles.ts";

interface DebugInput {
  style: string;
  prompt: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  printMode?: boolean;
}

function compile(input: DebugInput) {
  const opts = {
    aspectRatio: input.aspectRatio,
    backgroundStyle: input.backgroundStyle,
    printMode: !!input.printMode,
  };
  const gemini = compilePrompt(input.prompt, input.style, opts);
  const sdxl = compilePromptForSDXL(input.prompt, input.style, {
    ...opts,
    provider: "sdxl",
  });

  return {
    style: input.style,
    subject: input.prompt,
    category: categoryFor(input.style),
    gemini: {
      prompt: gemini,
      length: gemini.length,
    },
    sdxl: {
      prompt: sdxl.prompt,
      negativePrompt: sdxl.negativePrompt,
      length: sdxl.prompt.length,
      negativeLength: (sdxl.negativePrompt ?? "").length,
      category: sdxl.category,
    },
  };
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
      };
    } else {
      const body = await req.json().catch(() => ({}));
      input = {
        style: body.style ?? "popart",
        prompt: body.prompt ?? "A lone fisherman in a small boat at sunset",
        aspectRatio: body.aspectRatio,
        backgroundStyle: body.backgroundStyle,
        printMode: !!body.printMode,
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
