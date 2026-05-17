/**
 * Generation router (Phase: direct Replicate + feedback-driven routing).
 *
 * Single frontend entry point for image generation. Resolves the user's
 * provider preference into a concrete adapter chain, runs it, and falls
 * back to the next adapter on failure when (and only when) Auto was
 * selected. Manual selections fail loudly so users can see what broke.
 *
 * Key changes vs. previous phase:
 *   - "sdxl" preference now hits **direct Replicate first**, falling back
 *     to the Lovable gateway only on failure.
 *   - "auto" consults the deterministic style-routing rules AND the local
 *     👍/👎 feedback signal — providers with consistently bad ratings for
 *     the current styleKey are deprioritized in the chain.
 *   - Lovable is the safety net. It is always at the end of an Auto chain
 *     so we never fail outright when the direct providers misbehave.
 *
 * All routing remains deterministic and easy to log / debug.
 */

import type { GeneratorPreference } from "@/lib/generators";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";
import { generateWithLovableAdapter } from "@/lib/generation-providers/lovable";
import { generateWithGeminiAdapter } from "@/lib/generation-providers/gemini";
import { generateWithReplicateAdapter } from "@/lib/generation-providers/replicate";
import { generateWithOpenAIAdapter } from "@/lib/generation-providers/openai";
import { decideRoute, type RouteFamily } from "@/lib/style-routing";
import { getFeedbackSignal } from "@/hooks/use-image-feedback";
import { getModelById } from "@/lib/generation-providers/registry";

export type AdapterId = "lovable" | "gemini" | "replicate" | "openai";

interface AdapterRun {
  id: AdapterId;
  run: (req: NormalizedGenerationRequest) => Promise<NormalizedGenerationResponse>;
}

const ADAPTERS: Record<AdapterId, AdapterRun> = {
  lovable: { id: "lovable", run: generateWithLovableAdapter },
  gemini: { id: "gemini", run: generateWithGeminiAdapter },
  replicate: { id: "replicate", run: generateWithReplicateAdapter },
  openai: { id: "openai", run: generateWithOpenAIAdapter },
};

/** Provider id used in the feedback store, derived from adapter id. */
function feedbackProviderForAdapter(id: AdapterId): "gemini" | "sdxl" | "openai" {
  if (id === "gemini") return "gemini";
  if (id === "openai") return "openai";
  return "sdxl";
}

function adapterForFamily(family: RouteFamily): AdapterRun {
  // Prefer the direct adapter for each family; the router below will
  // append Lovable as a safety-net fallback for Auto.
  switch (family) {
    case "direct_gemini":
      return ADAPTERS.gemini;
    case "direct_replicate":
      return ADAPTERS.replicate;
    case "direct_openai":
      return ADAPTERS.openai;
    case "lovable_sdxl":
    default:
      return ADAPTERS.lovable;
  }
}

export interface RouterDiagnostics {
  attemptedAdapters: Array<{ id: AdapterId; ok: boolean; error?: string }>;
  fallbackTriggered: boolean;
  /** Why the router picked the primary adapter (Auto only). */
  routingReason?: string;
  /** Feedback signal that influenced routing (Auto only). */
  feedbackOverride?: string;
  /** modelId from the request (if any). */
  requestedModelId?: string;
  /** Registry model id actually used to pin the primary adapter (if any). */
  resolvedModelId?: string;
  /** Adapter id derived from resolvedModelId (if any). */
  resolvedAdapterId?: AdapterId;
  /** Reason a requested modelId was not honored (if any). */
  modelFallbackReason?: string;
}

interface ResolvedChain {
  chain: AdapterRun[];
  reason?: string;
  feedbackOverride?: string;
  requestedModelId?: string;
  resolvedModelId?: string;
  resolvedAdapterId?: AdapterId;
  modelFallbackReason?: string;
}

/**
 * Resolve a user-facing provider preference into an ordered list of adapters
 * to try. Auto consults the deterministic style-routing rules AND local
 * feedback; manual preferences are honored exactly (no silent switching).
 */
export function resolveAdapterChain(
  pref: GeneratorPreference,
  req: NormalizedGenerationRequest,
): ResolvedChain {
  // Image edits ALWAYS go through the Lovable adapter — only it has a
  // working image-to-image dispatch today.
  const isEdit = !!req.referenceImageUrl || !!req.isEdit;
  const requestedModelId = req.modelId;
  if (isEdit) {
    return {
      chain: [ADAPTERS.lovable],
      reason: "edit → Lovable adapter (only image-to-image-capable path)",
      requestedModelId,
      modelFallbackReason: requestedModelId
        ? "edit forces Lovable adapter; modelId ignored"
        : undefined,
    };
  }

  // ── modelId pin (Phase 4) ─────────────────────────────────────────────
  // If the caller passed a registry modelId and it resolves to an enabled
  // entry, use its adapter as the primary. For Auto we still append a
  // Lovable safety net so the fallback story is unchanged. For a manual
  // preference we let the manual chain decide.
  let pinnedAdapter: AdapterRun | undefined;
  let resolvedModelId: string | undefined;
  let modelFallbackReason: string | undefined;
  if (requestedModelId) {
    const entry = getModelById(requestedModelId);
    if (!entry) {
      modelFallbackReason = `unknown modelId "${requestedModelId}"`;
    } else if (!entry.enabled) {
      modelFallbackReason = `modelId "${requestedModelId}" is disabled`;
    } else {
      const candidate = ADAPTERS[entry.adapterId];
      if (!candidate) {
        modelFallbackReason = `no adapter for "${entry.adapterId}"`;
      } else {
        pinnedAdapter = candidate;
        resolvedModelId = entry.id;
      }
    }
  }

  if (pinnedAdapter && pref === "auto") {
    const safetyNet = ADAPTERS.lovable;
    const chain =
      pinnedAdapter.id === safetyNet.id
        ? [pinnedAdapter]
        : [pinnedAdapter, safetyNet];
    return {
      chain,
      reason: `pinned modelId=${resolvedModelId} → adapter=${pinnedAdapter.id} (auto fallback: lovable)`,
      requestedModelId,
      resolvedModelId,
      resolvedAdapterId: pinnedAdapter.id,
    };
  }

  switch (pref) {
    case "gemini":
      // If user pinned a gemini-family modelId we already returned above.
      return {
        chain: [pinnedAdapter ?? ADAPTERS.gemini],
        reason: pinnedAdapter
          ? `manual gemini + pinned modelId=${resolvedModelId}`
          : "manual: gemini (direct)",
        requestedModelId,
        resolvedModelId,
        resolvedAdapterId: pinnedAdapter?.id,
        modelFallbackReason,
      };

    case "openai":
      // Manual OpenAI: fail loudly, no silent fallback. Direct API call
      // — does NOT consume Lovable image-generation credits.
      return {
        chain: [pinnedAdapter ?? ADAPTERS.openai],
        reason: pinnedAdapter
          ? `manual openai + pinned modelId=${resolvedModelId}`
          : "manual: openai (direct, no Lovable credits)",
        requestedModelId,
        resolvedModelId,
        resolvedAdapterId: pinnedAdapter?.id,
        modelFallbackReason,
      };

    case "sdxl":
      // SDXL preference now means "direct Replicate first, Lovable as
      // a safety fallback". This shifts SDXL traffic off Lovable while
      // keeping a working escape hatch. A pinned modelId can override
      // the primary, but the Lovable safety net is preserved.
      return {
        chain: pinnedAdapter
          ? (pinnedAdapter.id === "lovable"
              ? [pinnedAdapter]
              : [pinnedAdapter, ADAPTERS.lovable])
          : [ADAPTERS.replicate, ADAPTERS.lovable],
        reason: pinnedAdapter
          ? `manual sdxl + pinned modelId=${resolvedModelId} → ${pinnedAdapter.id}, fallback Lovable`
          : "manual: sdxl → direct Replicate, fallback Lovable",
        requestedModelId,
        resolvedModelId,
        resolvedAdapterId: pinnedAdapter?.id,
        modelFallbackReason,
      };

    case "auto":
    default: {
      const decision = decideRoute({
        styleKey: req.styleKey,
        isEdit,
        printIntent: !!req.printMode,
      });
      // Build a chain: primary → secondary direct provider → Lovable safety net.
      // Auto deliberately keeps OpenAI OUT of the default chain to avoid
      // running up OpenAI bills on every request — it's surfaced as a
      // manual selection / comparison-mode option only. (Style-routing
      // can opt OpenAI in later by returning `direct_openai` as primary.)
      let primary = adapterForFamily(decision.primary);
      let secondary: AdapterRun =
        primary.id === "gemini"
          ? ADAPTERS.replicate
          : primary.id === "openai"
          ? ADAPTERS.gemini
          : ADAPTERS.gemini;
      const safetyNet = ADAPTERS.lovable;

      // Feedback-driven re-ordering — deterministic, conservative.
      // If the primary direct provider is consistently rated 👎 for this
      // style, swap primary and secondary so we try the other direct
      // provider first. Lovable always stays last.
      let feedbackOverride: string | undefined;
      if (primary.id !== "lovable") {
        const sig = getFeedbackSignal(
          req.styleKey,
          feedbackProviderForAdapter(primary.id),
        );
        if (sig.deprioritized) {
          feedbackOverride =
            `style=${req.styleKey} primary=${primary.id} ` +
            `down=${sig.down} up=${sig.up} → swap to ${secondary.id}`;
          [primary, secondary] = [secondary, primary];
        }
      }

      return {
        chain: [primary, secondary, safetyNet].filter(
          // De-dup if primary === safetyNet (defensive)
          (a, i, arr) => arr.findIndex((b) => b.id === a.id) === i,
        ),
        reason: decision.reason,
        feedbackOverride,
        requestedModelId,
        modelFallbackReason,
      };
    }
  }
}

/**
 * Mark a fallback response with the right execution-route variant so the
 * UI can show a clear "🔁 fallback via X" badge. Pure transform — never
 * mutates the original response.
 */
function annotateFallback(
  response: NormalizedGenerationResponse,
  rescuerId: AdapterId,
  routingReason?: string,
): NormalizedGenerationResponse {
  const route =
    rescuerId === "gemini"
      ? "direct_gemini_fallback"
      : rescuerId === "replicate"
      ? "direct_replicate_fallback"
      : rescuerId === "openai"
      ? "direct_openai_fallback"
      : "lovable_gateway_fallback";
  return {
    ...response,
    executionRoute: route,
    fallbackUsed: true,
    routingReason,
  };
}

/**
 * Main entry point. Returns a normalized response plus diagnostics.
 *
 * Routing rules (deterministic):
 *   1. Resolve adapter chain from preference + style + feedback.
 *   2. Try primary; if it succeeds, return.
 *   3. If preference === "auto" and primary failed, try the next adapter.
 *      The fallback annotates the response with the matching `_fallback`
 *      execution route so the UI/DB reflects reality.
 *   4. If preference is manual (gemini), never silently switch.
 *      For "sdxl", the chain explicitly includes Lovable as a fallback —
 *      this is documented behavior (manual SDXL ≈ "any SDXL path that works").
 */
export async function generateImage(
  req: NormalizedGenerationRequest,
): Promise<{ response: NormalizedGenerationResponse; diagnostics: RouterDiagnostics }> {
  const pref = req.providerPreference ?? "auto";
  const {
    chain: effectiveChain,
    reason: routingReason,
    feedbackOverride,
    requestedModelId,
    resolvedModelId,
    resolvedAdapterId,
    modelFallbackReason,
  } = resolveAdapterChain(pref, req);
  const attempts: RouterDiagnostics["attemptedAdapters"] = [];

  console.log(
    `[generation-router] style=${req.styleKey} pref=${pref} ` +
      `chain=${effectiveChain.map((a) => a.id).join(" → ")} ` +
      `reason="${routingReason}"` +
      (requestedModelId ? ` requestedModelId=${requestedModelId}` : "") +
      (resolvedModelId ? ` resolvedModelId=${resolvedModelId}` : "") +
      (modelFallbackReason ? ` modelFallback="${modelFallbackReason}"` : "") +
      (feedbackOverride ? ` feedbackOverride="${feedbackOverride}"` : ""),
  );

  // For manual "gemini" we explicitly disallow silent fallback.
  const allowFallback = pref === "auto" || pref === "sdxl";

  // Resolve registry entry (if any) so we can pass providerModelId into
  // the adapter request and detect mismatches in the response.
  const registryEntry = resolvedModelId ? getModelById(resolvedModelId) : undefined;
  const adapterReq: NormalizedGenerationRequest = registryEntry
    ? {
        ...req,
        requestedModelId: req.modelId,
        providerModelId: registryEntry.modelId,
      }
    : req;

  for (let i = 0; i < effectiveChain.length; i++) {
    const adapter = effectiveChain[i];
    try {
      const response = await adapter.run(adapterReq);
      attempts.push({ id: adapter.id, ok: true });

      const fallbackTriggered = i > 0;
      let runtimeFallbackReason = modelFallbackReason;
      // Detect provider/model mismatch vs. what was requested.
      if (registryEntry) {
        if (response.generationProvider !== registryEntry.providerId) {
          runtimeFallbackReason =
            runtimeFallbackReason ||
            `requested ${registryEntry.providerId}/${registryEntry.modelId} but adapter ran ${response.generationProvider}/${response.generationModel}`;
        } else if (
          response.generationModel &&
          registryEntry.modelId &&
          response.generationModel !== registryEntry.modelId
        ) {
          runtimeFallbackReason =
            runtimeFallbackReason ||
            `requested model ${registryEntry.modelId} but adapter ran ${response.generationModel}`;
        }
      }

      const enriched: NormalizedGenerationResponse = {
        ...response,
        requestedModelId: req.modelId,
        resolvedModelId,
        selectedAdapterId: adapter.id,
        modelFallbackReason: runtimeFallbackReason,
        qualityProfile: req.qualityProfile,
        generationStrategy: req.generationStrategy,
      };
      const finalResponse = fallbackTriggered
        ? annotateFallback(enriched, adapter.id, routingReason)
        : { ...enriched, routingReason };

      console.log(
        `[generation-router] ✓ adapter=${adapter.id} ` +
          `provider=${response.generationProvider} ` +
          `route=${finalResponse.executionRoute} fallback=${fallbackTriggered}` +
          (runtimeFallbackReason ? ` modelFallback="${runtimeFallbackReason}"` : ""),
      );

      return {
        response: finalResponse,
        diagnostics: {
          attemptedAdapters: attempts,
          fallbackTriggered,
          routingReason,
          feedbackOverride,
          requestedModelId,
          resolvedModelId,
          resolvedAdapterId: adapter.id,
          modelFallbackReason: runtimeFallbackReason,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attempts.push({ id: adapter.id, ok: false, error: msg });
      console.error(
        `[generation-router] ✗ adapter=${adapter.id} failed: ${msg}` +
          (allowFallback && i < effectiveChain.length - 1
            ? " → trying next adapter"
            : ""),
      );
      if (!allowFallback) throw err;
    }
  }

  // Auto / sdxl exhausted everything — surface a useful aggregated error.
  const summary = attempts
    .map((a) => `${a.id}:${a.ok ? "ok" : a.error}`)
    .join(" | ");
  throw new Error(`All generation adapters failed. ${summary}`);
}
