/**
 * Lovable adapter (adapter 1).
 *
 * "Lovable" here means: generation routed through the existing Supabase
 * edge functions, which themselves consult `_shared/generators.ts` and
 * may dispatch to either Gemini (via the Lovable AI Gateway) or SDXL
 * (via Replicate). From the frontend's point of view this is the
 * canonical, always-available adapter.
 *
 * This adapter does NOT introduce a new transport — it wraps the existing
 * `supabase.functions.invoke(<style-edge-fn>, ...)` call and normalizes
 * the response. Keeps Phase 2 zero-risk for the production flow.
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveEdgeFnForStyle } from "@/lib/generation-providers/_resolve-edge-fn";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";

/**
 * Detect "function not deployed" so the v2→legacy fallback only kicks in
 * for the right error class (and not, say, transient 5xx from a real
 * upstream provider).
 */
function isFunctionNotFound(err: unknown): boolean {
  if (!err) return false;
  const msg =
    typeof err === "string"
      ? err
      : (err as { message?: string })?.message?.toLowerCase?.() || "";
  if (!msg) return false;
  return (
    msg.includes("not found") ||
    msg.includes("404") ||
    msg.includes("function not found") ||
    msg.includes("no such function")
  );
}

export async function generateWithLovableAdapter(
  req: NormalizedGenerationRequest,
): Promise<NormalizedGenerationResponse> {
  const edgeFn = resolveEdgeFnForStyle(req.styleKey);

  // Try the unified v2 entry point first. It dispatches to the SAME
  // shared style handler under the hood, so prompt parity is guaranteed.
  // On 404 / function-not-found we fall back to the legacy per-style fn.
  const v2Body: Record<string, unknown> = {
    styleKey: req.styleKey,
    mode: req.styleKey.endsWith("-freestyle") ? "freestyle" : "themed",
    prompt: req.prompt,
    aspectRatio: req.aspectRatio,
    backgroundStyle: req.backgroundStyle,
    sourceImageUrl: req.referenceImageUrl,
    generationMode: req.printMode ? "print-ready" : "standard",
    printFormatId: req.posterFormatId,
    providerPreference: req.providerPreference === "auto" ? "auto" : "lovable",
  };
  if (req.strictness) v2Body.strictness = req.strictness;
  if (req.posterFormatHint) v2Body.posterFormatHint = req.posterFormatHint;

  let data: any = null;
  let error: any = null;
  let usedRoute: "v2" | "legacy" = "v2";

  try {
    const r = await supabase.functions.invoke("generate-image-v2", { body: v2Body });
    data = r.data;
    error = r.error;
    if (error && isFunctionNotFound(error)) {
      throw new Error("v2-missing");
    }
  } catch (e) {
    if (!isFunctionNotFound(e) && !(e instanceof Error && e.message === "v2-missing")) {
      // Real error — propagate, don't fall back silently
      throw e;
    }
    data = null;
    error = null;
    usedRoute = "legacy";
  }

  if (usedRoute === "legacy" || (!data?.imageUrl && !error)) {
    const body: Record<string, unknown> = {
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
      backgroundStyle: req.backgroundStyle,
      printMode: req.printMode ?? true,
      generatorPreference: req.providerPreference ?? "auto",
    };
    if (req.strictness) body.strictness = req.strictness;
    if (req.posterFormatHint) body.posterFormatHint = req.posterFormatHint;
    if (req.posterFormatId) body.posterFormatId = req.posterFormatId;
    if (req.referenceImageUrl) body.sourceImageUrl = req.referenceImageUrl;

    const r = await supabase.functions.invoke(edgeFn, { body });
    data = r.data;
    error = r.error;
    usedRoute = "legacy";
  }
  if (error) throw error;
  if (!data || data.error) throw new Error(data?.error || "Generation failed");
  if (!data.imageUrl) throw new Error("Provider returned no imageUrl");

  // v2 wraps the upstream engine under `upstreamProvider`/`upstreamModel`.
  // Legacy returns engine info as `provider`/`model` directly.
  const provider = (data.upstreamProvider ?? data.provider) as
    | "sdxl"
    | "gemini"
    | undefined;
  const model = (data.upstreamModel ?? data.model) as string | undefined;
  const executionRoute =
    provider === "sdxl" ? "lovable_gateway_sdxl" : "lovable_gateway";

  return {
    imageUrl: data.imageUrl,
    width: data.width,
    height: data.height,
    generationProvider: provider!, // "sdxl" | "gemini" — set by backend
    generationModel: model!,
    prompt: req.prompt,
    revisedPrompt: data.revisedPrompt,
    styleKey: req.styleKey,
    fallbackUsed: !!data.fallbackUsed,
    strategy: data.strategy ?? "auto",
    attempted: data.attempted,
    executionRoute,
    requestedWidth: data.requestedWidth,
    requestedHeight: data.requestedHeight,
    requestedAspectRatio: data.requestedAspectRatio,
    providerExactMatch: data.providerExactMatch,
    providerAdjusted: data.providerAdjusted,
    metadata: {
      adapter: "lovable",
      edgeFn: usedRoute === "v2" ? "generate-image-v2" : edgeFn,
      route: data.route, // route-level label from v2 (lovable_gateway)
      promptVersion: data.promptVersion,
      estimatedCost: data.estimatedCost ?? null,
      currency: data.currency ?? "USD",
    },
  };
}
