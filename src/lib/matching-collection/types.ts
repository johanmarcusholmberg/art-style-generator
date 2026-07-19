/**
 * Matching Collection — canonical shared types.
 *
 * A matching collection lets the user generate a coordinated series of
 * posters from a single anchor image. All members are generated FROM the
 * anchor (fan-out), never chained (Anchor → A, Anchor → B, Anchor → C).
 *
 * The saved collection freezes:
 *   - the anchor image (id, url, width, height, aspect ratio)
 *   - the inherited style / poster format / background
 *   - the resolved provider + model (which may differ from the anchor if
 *     the anchor's model can't do image-to-image; substitution + reason
 *     are both persisted and shown in the setup dialog)
 *   - the derived art-direction summary (structured JSON, versioned)
 *   - the consistency-strength choice (loose / balanced / strict)
 *   - the reference-strength id that maps from consistency-strength
 */

import type { ReferenceStrength } from "@/lib/reference-strength";

export const ART_DIRECTION_VERSION = 1;

export type ConsistencyStrength = "loose" | "balanced" | "strict";

export const DEFAULT_CONSISTENCY_STRENGTH: ConsistencyStrength = "balanced";

/** Structured, provider-friendly art direction extracted from the anchor. */
export interface CollectionArtDirection {
  /** Ordered dominant + accent color hex strings. */
  palette: string[];
  /** e.g. "warm sunlit earth tones", "cool overcast blue-grey". */
  colorMood: string;
  /** e.g. "soft directional light from the upper left, low contrast". */
  lighting: string;
  /** e.g. "centered subject, symmetrical, medium-wide". */
  composition: string;
  /** e.g. "medium — subject fills roughly 60% of frame". */
  subjectScale: string;
  /** e.g. "generous — quiet space around the subject". */
  negativeSpace: string;
  /** e.g. "matte, lightly grainy, screenprint-like flat inks". */
  texture: string;
  /** e.g. "full-bleed, no visible border". */
  framing: string;
  /** e.g. "low — simplified shapes, few small details". */
  detailDensity: string;
  /** e.g. "calm, nostalgic, sunlit". */
  mood: string;
  /** e.g. "no text of any kind" or "small serif caption bottom-center". */
  textPolicy: string;
}

/**
 * Metadata inherited from the anchor image. Frozen at collection-create
 * time so later edits to the anchor don't retroactively change existing
 * collection members.
 */
export interface AnchorInheritedSettings {
  styleKey: string;
  posterFormatId: string | null;
  aspectRatio: string;
  backgroundStyle: "white" | "cream" | string;
  /** The anchor's provider ("openai" | "gemini" | "sdxl" | ...). */
  provider: string | null;
  /** The anchor's provider-native model id, e.g. "gpt-image-2". */
  model: string | null;
  referenceStrength: ReferenceStrength | null;
  /** Actual pixel dimensions of the anchor image. */
  anchorWidthPx: number | null;
  anchorHeightPx: number | null;
}

/**
 * Result of picking a reference-image-capable provider for the collection.
 * When the anchor's own model supports image-to-image we keep it; when it
 * doesn't we substitute and record the reason so the setup dialog can
 * disclose the change BEFORE the user pays.
 */
export interface ResolvedCollectionProvider {
  providerPreference: "auto" | "sdxl" | "gemini" | "openai";
  provider: string;
  model: string;
  substituted: boolean;
  reason: string | null;
  /** Estimated USD cost per image at the resolved provider. */
  estimatedCostPerImageUsd: number | null;
}

/**
 * The per-item payload persisted into `generation_job_items.request_payload`
 * for a matching-collection job. Every field the durable worker needs to
 * regenerate a single member without recomputing anything.
 *
 * IMPORTANT: `anchorImageUrl` is the ONE canonical reference property. The
 * worker maps it into the normalized generation request's `referenceImageUrl`
 * at execution time — the payload does not duplicate under `sourceImageUrl`.
 */
export interface MatchingCollectionItemPayload {
  kind: "matching_collection";
  subject: string;
  /** Fully composed user-side prompt: subject + consistency block. */
  prompt: string;
  /** Original raw subject line (for regenerate & display). */
  rawSubject: string;
  anchorImageUrl: string;
  anchorImageId: string | null;
  matchingCollectionId: string;
  artDirection: CollectionArtDirection | null;
  artDirectionVersion: number;
  consistencyStrength: ConsistencyStrength;
  referenceStrength: ReferenceStrength;
  styleKey: string;
  providerPreference: "auto" | "sdxl" | "gemini" | "openai";
  aspectRatio: string;
  backgroundStyle: string;
  generationMode: "standard" | "print-ready";
  printFormatId: string | null;
  mode: string;
  providerLabel: string | null;
}
