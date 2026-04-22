/**
 * Generation router (Phase 2).
 *
 * Single frontend entry point for image generation. Resolves the user's
 * provider preference into a concrete adapter, runs it, and falls back
 * to the Lovable adapter on failure when (and only when) Auto was
 * selected. Manual selections fail loudly so users can see what broke.
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

export type AdapterId = "lovable" | "gemini";

interface AdapterRun {
  id: AdapterId;
  run: (req: NormalizedGenerationRequest) => Promise<NormalizedGenerationResponse>;
}

const ADAPTERS: Record<AdapterId, AdapterRun> = {
  lovable: { id: "lovable", run: generateWithLovableAdapter },
  gemini: { id: "gemini", run: generateWithGeminiAdapter },
};

/**
 * Resolve a user-facing provider preference into an ordered list of adapters
 * to try. Auto = Lovable first (which itself runs SDXL→Gemini internally).
 * Manual selections never auto-fallback — see runWithRouter for behavior.
 */
export function resolveAdapterChain(pref: GeneratorPreference): AdapterRun[] {
  switch (pref) {
    case "gemini":
      return [ADAPTERS.gemini];
    case "sdxl":
      // SDXL runs through the Lovable adapter (which respects
      // `providerPreference: "sdxl"` on the backend).
      return [ADAPTERS.lovable];
    case "auto":
    default:
      return [ADAPTERS.lovable];
  }
}

export interface RouterDiagnostics {
  attemptedAdapters: Array<{ id: AdapterId; ok: boolean; error?: string }>;
  fallbackTriggered: boolean;
}

/**
 * Main entry point. Returns a normalized response plus diagnostics.
 *
 * Routing rules (deterministic):
 *   1. Resolve adapter chain from preference.
 *   2. Try primary; if it succeeds, return.
 *   3. If preference === "auto" and primary failed, try the next adapter.
 *   4. If preference is manual, never silently switch — propagate the error.
 */
export async function generateImage(
  req: NormalizedGenerationRequest,
): Promise<{ response: NormalizedGenerationResponse; diagnostics: RouterDiagnostics }> {
  const pref = req.providerPreference ?? "auto";
  const chain = resolveAdapterChain(pref);
  const attempts: RouterDiagnostics["attemptedAdapters"] = [];

  // Image edits require an image-capable adapter. Today only Lovable's
  // backend resolver knows how to fall through to Gemini for edits, so
  // route edits through Lovable regardless of preference (matching the
  // existing per-style handler behavior).
  const isEdit = !!req.referenceImageUrl || !!req.isEdit;
  const effectiveChain =
    isEdit && pref !== "gemini" ? [ADAPTERS.lovable] : chain;

  for (let i = 0; i < effectiveChain.length; i++) {
    const adapter = effectiveChain[i];
    try {
      const response = await adapter.run(req);
      attempts.push({ id: adapter.id, ok: true });
      return {
        response,
        diagnostics: {
          attemptedAdapters: attempts,
          fallbackTriggered: i > 0,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attempts.push({ id: adapter.id, ok: false, error: msg });
      console.error(`[generation-router] adapter=${adapter.id} failed: ${msg}`);
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
