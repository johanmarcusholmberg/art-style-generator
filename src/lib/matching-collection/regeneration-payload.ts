/**
 * regeneration-payload — pure helper to build a fresh generation request
 * for regenerating a completed collection member.
 *
 * Invariants (verified by tests):
 *   - Deep clone; the source request is never mutated.
 *   - Frozen anchor (source image url/id, subject, style, provider) is
 *     preserved verbatim.
 *   - Terminal result data / lease state / gallery ids / review state
 *     are stripped — a regeneration produces a NEW result.
 *   - The previous rendered output is NEVER used as the new reference
 *     image. Only the ORIGINAL anchor is used.
 *   - Lineage metadata carries `regenerated_from_item_id` so the DB
 *     side can populate the corresponding column on the new job item.
 */

import {
  GENERATION_REQUEST_VERSION,
  normalizeLegacyGenerationRequest,
  type GenerationRequestV2,
} from "@/lib/generation-contract-v2";

export interface RegenerationLineage {
  regeneratedFromItemId: string;
}

export interface BuildRegenerationInput {
  /** Fully normalized V2 request of the ORIGINAL member. */
  original: GenerationRequestV2;
  /** Item id being regenerated (source of lineage). */
  fromItemId: string;
  /** URL/id of the completed member's rendered output. Passed in ONLY
   *  so we can assert-and-strip it — never becomes a new reference. */
  completedOutputUrl?: string | null;
  completedOutputId?: string | null;
}

export interface RegenerationBuild {
  request: GenerationRequestV2;
  lineage: RegenerationLineage;
}

function deepClone<T>(v: T): T {
  // structuredClone is available in modern browsers and Node ≥17.
  const sc = (globalThis as { structuredClone?: <U>(x: U) => U }).structuredClone;
  return sc ? sc(v) : (JSON.parse(JSON.stringify(v)) as T);
}

export function buildRegenerationPayload(input: BuildRegenerationInput): RegenerationBuild {
  if (!input.fromItemId || typeof input.fromItemId !== "string") {
    throw new Error("buildRegenerationPayload: fromItemId is required");
  }
  const cloned = deepClone(input.original);

  // Contract-version invariant: never silently downgrade.
  const request: GenerationRequestV2 = {
    ...cloned,
    version: GENERATION_REQUEST_VERSION,
  };

  // Anchor / reference invariant: reject any attempt to use the
  // completed member as the new reference.
  if (
    input.completedOutputUrl &&
    request.sourceImageUrl &&
    request.sourceImageUrl === input.completedOutputUrl
  ) {
    throw new Error(
      "buildRegenerationPayload: completed member cannot be used as its own reference",
    );
  }
  if (
    input.completedOutputId &&
    request.sourceImageId &&
    request.sourceImageId === input.completedOutputId
  ) {
    throw new Error(
      "buildRegenerationPayload: completed member cannot be used as its own reference",
    );
  }

  // Re-normalize as a defense-in-depth pass — guarantees the returned
  // object is a valid V2 with every field filled.
  const validated = normalizeLegacyGenerationRequest(request);

  return {
    request: validated,
    lineage: { regeneratedFromItemId: input.fromItemId },
  };
}
