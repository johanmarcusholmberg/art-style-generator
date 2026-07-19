/**
 * provider-capability — decide which provider actually runs a
 * matching-collection job.
 *
 * The anchor's provider/model is inherited ONLY when it supports
 * image-to-image. Otherwise we substitute a reference-capable alternative
 * from the model registry and record the reason so the setup dialog can
 * disclose the change BEFORE the user confirms the cost.
 */

import {
  PROVIDER_MODEL_REGISTRY,
  getModelById,
  selectModelFromRegistry,
  type ProviderModelEntry,
} from "@/lib/generation-providers/registry";
import type { GeneratorPreference } from "@/lib/generators";
import type { AnchorInheritedSettings, ResolvedCollectionProvider } from "./types";

/**
 * Maps a provider id ("openai" | "gemini" | "sdxl") to the router's
 * matching `GeneratorPreference`.
 */
function providerToPreference(providerId: string): GeneratorPreference {
  if (providerId === "openai") return "openai";
  if (providerId === "gemini") return "gemini";
  if (providerId === "sdxl") return "sdxl";
  return "auto";
}

/** Find the registry entry that matches the anchor's provider + model. */
function findAnchorEntry(anchor: AnchorInheritedSettings): ProviderModelEntry | null {
  if (!anchor.provider || !anchor.model) return null;
  // Prefer exact provider+model match.
  const exact = PROVIDER_MODEL_REGISTRY.find(
    (m) =>
      m.enabled &&
      m.providerId === (anchor.provider as ProviderModelEntry["providerId"]) &&
      m.modelId === anchor.model,
  );
  if (exact) return exact;
  // Fall back to first enabled entry for the provider.
  return (
    PROVIDER_MODEL_REGISTRY.find(
      (m) => m.enabled && m.providerId === (anchor.provider as ProviderModelEntry["providerId"]),
    ) ?? null
  );
}

/**
 * Resolve the collection provider.
 *
 *   1. If the anchor's model supports image-to-image → keep it.
 *   2. Otherwise pick a reference-capable model from the registry, ideally
 *      preserving the aspect ratio.
 *   3. If nothing matches (should not happen — registry always has
 *      Lovable+SDXL), fall back to "auto".
 */
export function resolveCollectionProvider(
  anchor: AnchorInheritedSettings,
): ResolvedCollectionProvider {
  const anchorEntry = findAnchorEntry(anchor);

  if (anchorEntry && anchorEntry.supportsImageToImage) {
    return {
      providerPreference: providerToPreference(anchorEntry.providerId),
      provider: anchorEntry.providerId,
      model: anchorEntry.modelId,
      substituted: false,
      reason: null,
      estimatedCostPerImageUsd: anchorEntry.estimatedCostUsd,
    };
  }

  const substitute = selectModelFromRegistry({
    aspectRatio: anchor.aspectRatio,
    needsImageToImage: true,
  });

  if (substitute) {
    const reason = anchorEntry
      ? `${anchorEntry.displayName} does not support image-to-image reference generation — substituted with ${substitute.displayName}.`
      : `Anchor provider is unknown — using ${substitute.displayName} for reference-image generation.`;
    return {
      providerPreference: providerToPreference(substitute.providerId),
      provider: substitute.providerId,
      model: substitute.modelId,
      substituted: true,
      reason,
      estimatedCostPerImageUsd: substitute.estimatedCostUsd,
    };
  }

  // Final safety net — Auto lets the router pick any working reference path.
  return {
    providerPreference: "auto",
    provider: "auto",
    model: "auto",
    substituted: true,
    reason: "No compatible reference-capable provider matched — using Auto routing.",
    estimatedCostPerImageUsd: null,
  };
}

/**
 * True when a model, identified by registry id (e.g. "openai:gpt-image-2"),
 * supports image-to-image reference generation.
 */
export function modelSupportsReferenceImage(modelRegistryId: string): boolean {
  return getModelById(modelRegistryId)?.supportsImageToImage === true;
}
