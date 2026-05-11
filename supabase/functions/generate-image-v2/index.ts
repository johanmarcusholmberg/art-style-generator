/**
 * generate-image-v2 — unified generation entry point.
 *
 * This function is ADDITIVE. It does not replace the existing per-style
 * `generate-image-*` functions. They remain deployed and callable.
 *
 * To preserve prompt parity, this function dispatches to the exact same
 * `createStyleHandler` used by the legacy functions. There is no second
 * prompt-building pipeline. The internal helpers below (buildPrompt,
 * buildEditPrompt, resolveStyleRules, resolveProviderRoute,
 * estimateGenerationCost) are intentionally thin wrappers / placeholders
 * — they exist to lock in the future-routing shape without introducing
 * a parallel implementation today.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createStyleHandler,
  compilePrompt,
  STYLE_RULES,
  type StyleRules,
} from "../_shared/prompt-compiler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PROMPT_VERSION = "v2";
const ACTIVE_PROVIDER = "lovable";
const ACTIVE_MODEL = "google/gemini-3-pro-image-preview";
const ACTIVE_ROUTE = "lovable_gateway";

// ── Internal helpers — thin wrappers / placeholders ────────────────────

/** Future-routing placeholder. Today: defers entirely to the shared compiler. */
function buildPrompt(args: {
  userPrompt: string;
  styleKey: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  printMode?: boolean;
}): string {
  return compilePrompt({
    userPrompt: args.userPrompt,
    styleKey: args.styleKey,
    aspectRatio: args.aspectRatio,
    backgroundStyle: args.backgroundStyle,
    printMode: !!args.printMode,
  });
}

/** Future-routing placeholder for edit prompts. */
function buildEditPrompt(args: {
  userPrompt: string;
  styleKey: string;
}): string {
  // Shared compiler already accepts isEdit context downstream; for now this
  // is just the standard prompt body. Marked as placeholder for future
  // dedicated edit-prompting strategy.
  return compilePrompt({
    userPrompt: args.userPrompt,
    styleKey: args.styleKey,
  });
}

function resolveStyleRules(styleKey: string): StyleRules | null {
  return STYLE_RULES[styleKey] ?? null;
}

interface ProviderRoute {
  provider: string;
  model: string;
  route: string;
}

/**
 * Provider routing placeholder.
 * Only Lovable is active in this phase. Structure left in place so future
 * direct providers (Gemini / OpenAI / Replicate) can be plugged in without
 * altering the response envelope.
 */
function resolveProviderRoute(
  _styleKey: string,
  _preference: "auto" | "lovable",
  _isEdit: boolean,
): ProviderRoute {
  return {
    provider: ACTIVE_PROVIDER,
    model: ACTIVE_MODEL,
    route: ACTIVE_ROUTE,
  };
}

/** Cost estimation placeholder — returns null until billing data is wired. */
function estimateGenerationCost(_route: ProviderRoute): number | null {
  return null;
}

// ── Style dispatch ─────────────────────────────────────────────────────

const VALID_STYLE_KEYS = new Set(Object.keys(STYLE_RULES));

function normalizeStyleKey(styleKey: string, mode: string): string {
  // The shared compiler's STYLE_RULES uses keys like "popart",
  // "popart-freestyle", "lineart-minimal", etc. Caller may pass a base key
  // plus a mode hint — combine them when there's a matching variant.
  if (VALID_STYLE_KEYS.has(styleKey)) return styleKey;
  if (mode === "freestyle") {
    const variant = `${styleKey}-freestyle`;
    if (VALID_STYLE_KEYS.has(variant)) return variant;
  }
  if (mode === "tertiary") {
    const variant = `${styleKey}-minimal`;
    if (VALID_STYLE_KEYS.has(variant)) return variant;
  }
  return styleKey; // let downstream surface a clean error
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const {
      styleKey,
      mode = "themed",
      prompt,
      aspectRatio = "5:7",
      backgroundStyle = "white",
      sourceImageUrl = null,
      generationMode = "standard",
      printFormatId = null,
      providerPreference = "auto",
      // Pass-through optional fields
      strictness,
      posterFormatHint,
      posterFormatId,
    } = rawBody as Record<string, unknown>;

    if (typeof styleKey !== "string" || !styleKey) {
      return new Response(
        JSON.stringify({ error: "Missing styleKey" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resolvedStyleKey = normalizeStyleKey(styleKey, String(mode));
    const isEdit = !!sourceImageUrl;

    // Build placeholders to satisfy the new contract (these run server-side
    // but their output is informational only; actual generation uses the
    // shared style handler so prompt parity is guaranteed).
    void (isEdit
      ? buildEditPrompt({ userPrompt: prompt, styleKey: resolvedStyleKey })
      : buildPrompt({
          userPrompt: prompt,
          styleKey: resolvedStyleKey,
          aspectRatio: typeof aspectRatio === "string" ? aspectRatio : undefined,
          backgroundStyle:
            typeof backgroundStyle === "string" ? backgroundStyle : undefined,
          printMode: generationMode === "print-ready",
        }));

    const route = resolveProviderRoute(
      resolvedStyleKey,
      providerPreference === "lovable" ? "lovable" : "auto",
      isEdit,
    );

    // Delegate to the canonical style handler — same code path as the
    // legacy per-style edge functions. Guarantees prompt parity.
    const handler = createStyleHandler(resolvedStyleKey);
    const innerBody = {
      prompt,
      aspectRatio,
      backgroundStyle,
      printMode: generationMode === "print-ready",
      generatorPreference: "auto", // Lovable backend resolver picks engine
      strictness,
      posterFormatHint,
      posterFormatId: posterFormatId ?? printFormatId,
      sourceImageUrl,
    };
    const innerReq = new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(innerBody),
    });
    const innerRes = await handler(innerReq);
    const innerData = await innerRes.json().catch(() => ({}));

    if (!innerRes.ok || innerData?.error) {
      return new Response(
        JSON.stringify({
          error: innerData?.error || "Generation failed",
          code: innerData?.code,
          promptVersion: PROMPT_VERSION,
        }),
        {
          status: innerRes.status || 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const estimatedCost = estimateGenerationCost(route);

    return new Response(
      JSON.stringify({
        imageUrl: innerData.imageUrl,
        provider: route.provider,
        model: route.model,
        route: route.route,
        estimatedCost,
        currency: "USD",
        promptVersion: PROMPT_VERSION,
        styleKey: resolvedStyleKey,
        mode,
        // Pass-through useful fields from the inner handler
        width: innerData.width,
        height: innerData.height,
        revisedPrompt: innerData.revisedPrompt,
        strategy: innerData.strategy,
        fallbackUsed: innerData.fallbackUsed,
        attempted: innerData.attempted,
        // Surface real upstream provider/model for telemetry; "provider"/"model"
        // above represent the route-level (Lovable) view.
        upstreamProvider: innerData.provider,
        upstreamModel: innerData.model,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-image-v2 error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
