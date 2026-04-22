/**
 * Generation router (Phase: cost-aware routing + execution route visibility).
 *
 * Single frontend entry point for image generation. Resolves the user's
 * provider preference into a concrete adapter chain, runs it, and falls
 * back to the Lovable adapter on failure when (and only when) Auto was
 * selected. Manual selections fail loudly so users can see what broke.
 *
 * Auto routing is deterministic — the picked primary adapter is decided
 * by `decideRoute()` in `src/lib/style-routing.ts` based on style + intent.
 *
 * Downstream code should call `generateImage()` from here instead of
 * invoking edge functions or adapters directly.
 */

import type { GeneratorPreference } from "@/lib/generators";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";
import { generateWithLovableAdapter } from "@/lib/generation-providers/lovable";
import { generateWithGeminiAdapter } from "@/lib/generation-providers/gemini";
import { decideRoute, type RouteFamily } from "@/lib/style-routing";

export type AdapterId = "lovable" | "gemini";

interface AdapterRun {
  id: AdapterId;
  run: (req: NormalizedGenerationRequest) => Promise<NormalizedGenerationResponse>;
}

const ADAPTERS: Record<AdapterId, AdapterRun> = {
  lovable: { id: "lovable", run: generateWithLovableAdapter },
  gemini: { id: "gemini", run: generateWithGeminiAdapter },
};

function adapterForFamily(family: RouteFamily): AdapterRun {
  return family === "direct_gemini" ? ADAPTERS.gemini : ADAPTERS.lovable;
}

export interface RouterDiagnostics {
  attemptedAdapters: Array<{ id: AdapterId; ok: boolean; error?: string }>;
  fallbackTriggered: boolean;
  /** Why the router picked the primary adapter (Auto only). */
  routingReason?: string;
}

/**
 * Resolve a user-facing provider preference into an ordered list of adapters
 * to try. Auto consults the deterministic style-routing rules; manual
 * preferences are honored exactly.
 */
export function resolveAdapterChain(
  pref: GeneratorPreference,
  req: NormalizedGenerationRequest,
): { chain: AdapterRun[]; reason?: string } {
  // Image edits ALWAYS go through the Lovable adapter — only it has a
  // working image-to-image dispatch today.
  const isEdit = !!req.referenceImageUrl || !!req.isEdit;
  if (isEdit) {
    return {
      chain: [ADAPTERS.lovable],
      reason: "edit → Lovable adapter (only image-to-image-capable path)",
    };
  }

  switch (pref) {
    case "gemini":
      return { chain: [ADAPTERS.gemini], reason: "manual: gemini" };
    case "sdxl":
      // SDXL runs through the Lovable adapter (which respects
      // `providerPreference: "sdxl"` on the backend).
      return { chain: [ADAPTERS.lovable], reason: "manual: sdxl (via Lovable)" };
    case "auto":
    default: {
      const decision = decideRoute({
        styleKey: req.styleKey,
        isEdit,
        printIntent: !!req.printMode,
      });
      const primary = adapterForFamily(decision.primary);
      // Auto fallback chain: if primary is Gemini, fall back to Lovable;
      // if primary is Lovable, fall back to Gemini (covers SDXL outages).
      const fallback =
        primary.id === "gemini" ? ADAPTERS.lovable : ADAPTERS.gemini;
      return { chain: [primary, fallback], reason: decision.reason };
    }
  }
}

/**
 * Main entry point. Returns a normalized response plus diagnostics.
 *
 * Routing rules (deterministic):
 *   1. Resolve adapter chain from preference + style.
 *   2. Try primary; if it succeeds, return.
 *   3. If preference === "auto" and primary failed, try the next adapter.
 *      The fallback annotates the response with execution_route =
 *      "lovable_gateway_fallback" when Lovable rescued a Gemini failure.
 *   4. If preference is manual, never silently switch — propagate the error.
 */
export async function generateImage(
  req: NormalizedGenerationRequest,
): Promise<{ response: NormalizedGenerationResponse; diagnostics: RouterDiagnostics }> {
  const pref = req.providerPreference ?? "auto";
  const { chain: effectiveChain, reason: routingReason } = resolveAdapterChain(
    pref,
    req,
  );
  const attempts: RouterDiagnostics["attemptedAdapters"] = [];

  console.log(
    `[generation-router] style=${req.styleKey} pref=${pref} ` +
      `chain=${effectiveChain.map((a) => a.id).join(",")} reason="${routingReason}"`,
  );

  for (let i = 0; i < effectiveChain.length; i++) {
    const adapter = effectiveChain[i];
    try {
      const response = await adapter.run(req);
      attempts.push({ id: adapter.id, ok: true });

      // If Auto fell back to Lovable after the primary failed, surface that
      // explicitly in the execution route so the UI/DB reflects reality.
      const fallbackTriggered = i > 0;
      const finalResponse: NormalizedGenerationResponse = fallbackTriggered
        ? {
            ...response,
            executionRoute: "lovable_gateway_fallback",
            fallbackUsed: true,
            routingReason,
          }
        : { ...response, routingReason };

      console.log(
        `[generation-router] ✓ adapter=${adapter.id} provider=${response.generationProvider} ` +
          `route=${finalResponse.executionRoute} fallback=${fallbackTriggered}`,
      );

      return {
        response: finalResponse,
        diagnostics: {
          attemptedAdapters: attempts,
          fallbackTriggered,
          routingReason,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attempts.push({ id: adapter.id, ok: false, error: msg });
      console.error(`[generation-router] ✗ adapter=${adapter.id} failed: ${msg}`);
      // Manual selection → fail loudly. Auto → try next adapter.
      if (pref !== "auto") throw err;
    }
  }

  // Auto exhausted everything — surface a useful aggregated error.
  const summary = attempts
    .map((a) => `${a.id}:${a.ok ? "ok" : a.error}`)
    .join(" | ");
  throw new Error(`All generation adapters failed. ${summary}`);
}
