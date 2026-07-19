/**
 * Consistency-strength ↔ reference-strength mapping.
 *
 * The Stage 2 spec is explicit: DO NOT use `near_original` in the first
 * version, because collection members must remain free to differ from the
 * anchor in subject. The mapping is:
 *
 *   Loose    → inspiration
 *   Balanced → balanced        (default)
 *   Strict   → strong_reference
 */

import type { ReferenceStrength } from "@/lib/reference-strength";
import type { ConsistencyStrength } from "./types";

export const CONSISTENCY_STRENGTH_OPTIONS: Array<{
  id: ConsistencyStrength;
  label: string;
  description: string;
}> = [
  {
    id: "loose",
    label: "Loose",
    description:
      "Reference sets the mood and palette; each subject's composition can vary freely.",
  },
  {
    id: "balanced",
    label: "Balanced",
    description:
      "Clearly coordinated series while each subject adapts naturally.",
  },
  {
    id: "strict",
    label: "Strict",
    description:
      "Strongly prioritize matching palette, texture, framing, lighting, and composition.",
  },
];

export function consistencyToReferenceStrength(
  c: ConsistencyStrength,
): ReferenceStrength {
  switch (c) {
    case "loose":
      return "inspiration";
    case "balanced":
      return "balanced";
    case "strict":
      return "strong_reference";
  }
}

/**
 * Short imperative phrase inserted into the collection-consistency prompt
 * block. Emphasis scales with strength, but the block itself is short so
 * the compiled prompt does not bloat when many subjects are queued.
 */
export function consistencyEmphasisPhrase(c: ConsistencyStrength): string {
  switch (c) {
    case "loose":
      return "loosely echo";
    case "balanced":
      return "clearly maintain";
    case "strict":
      return "strictly preserve";
  }
}

export function isConsistencyStrength(v: unknown): v is ConsistencyStrength {
  return v === "loose" || v === "balanced" || v === "strict";
}
