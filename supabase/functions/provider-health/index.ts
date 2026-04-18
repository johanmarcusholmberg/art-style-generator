import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/prompt-compiler.ts";
import { generateWithGemini, generateWithSDXL, ProviderError } from "../_shared/generators.ts";

/**
 * Provider health check endpoint.
 *
 * GET  /provider-health           → status of every provider (no live test)
 * POST /provider-health { test: true, providerId? } → run a real generation test
 */

interface HealthRow {
  providerId: "gemini" | "sdxl";
  modelId: string;
  status: "ready" | "missing-key" | "connection-failed" | "model-unavailable" | "unknown";
  message: string;
  latencyMs?: number;
  sampleImageUrl?: string;
  testedAt: string;
}

function quickStatus(providerId: "gemini" | "sdxl"): HealthRow {
  const testedAt = new Date().toISOString();
  if (providerId === "gemini") {
    const key = Deno.env.get("LOVABLE_API_KEY");
    return key
      ? { providerId, modelId: "google/gemini-3-pro-image-preview", status: "ready", message: "LOVABLE_API_KEY present", testedAt }
      : { providerId, modelId: "google/gemini-3-pro-image-preview", status: "missing-key", message: "LOVABLE_API_KEY not configured", testedAt };
  }
  const key = Deno.env.get("REPLICATE_API_TOKEN");
  return key
    ? { providerId, modelId: "stability-ai/sdxl", status: "ready", message: "REPLICATE_API_TOKEN present", testedAt }
    : { providerId, modelId: "stability-ai/sdxl", status: "missing-key", message: "REPLICATE_API_TOKEN not configured", testedAt };
}

async function liveTest(providerId: "gemini" | "sdxl"): Promise<HealthRow> {
  const testedAt = new Date().toISOString();
  const start = Date.now();
  const args = {
    userPrompt: "a single red apple on a plain white background, minimalist",
    styleKey: "minimalism",
    aspectRatio: "1:1",
    backgroundStyle: "white",
    printMode: false,
    isEdit: false,
  };
  try {
    const fn = providerId === "gemini" ? generateWithGemini : generateWithSDXL;
    const result = await fn(args);
    const latencyMs = Date.now() - start;
    console.log(`[provider-health] ${providerId} OK in ${latencyMs}ms`);
    return {
      providerId,
      modelId: result.modelId,
      status: "ready",
      message: "Live test succeeded",
      latencyMs,
      sampleImageUrl: result.imageUrl,
      testedAt,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const code = err instanceof ProviderError ? err.code : "unknown";
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[provider-health] ${providerId} FAILED (${code}): ${msg}`);
    const status: HealthRow["status"] =
      code === "missing-key" ? "missing-key" : "connection-failed";
    return {
      providerId,
      modelId: providerId === "gemini" ? "google/gemini-3-pro-image-preview" : "stability-ai/sdxl",
      status,
      message: msg,
      latencyMs,
      testedAt,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      const rows = [quickStatus("sdxl"), quickStatus("gemini")];
      return new Response(JSON.stringify({ providers: rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { providerId } = body || {};

    let toTest: Array<"gemini" | "sdxl">;
    if (providerId === "gemini" || providerId === "sdxl") {
      toTest = [providerId];
    } else {
      toTest = ["sdxl", "gemini"];
    }

    const rows = await Promise.all(toTest.map(liveTest));
    return new Response(JSON.stringify({ providers: rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("provider-health error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
