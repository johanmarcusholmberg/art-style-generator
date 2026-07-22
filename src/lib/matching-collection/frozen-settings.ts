/**
 * frozen-settings — one canonical shape for the anchor + collection
 * settings that are FROZEN at collection creation and reused verbatim
 * for every add-more generation. No hard-coded downstream defaults.
 *
 * `readFrozenCollectionSettings` returns the settings plus the list of
 * fields that were reconstructed via a documented fallback rule so
 * callers can surface / log the substitution instead of silently
 * presenting reconstructed values as originally-stored ones.
 */

import { GENERATION_REQUEST_VERSION } from "@/lib/generation-contract-v2";
import {
  ART_DIRECTION_VERSION,
  DEFAULT_CONSISTENCY_STRENGTH,
  type CollectionArtDirection,
  type ConsistencyStrength,
} from "./types";
import type { ReferenceStrength } from "@/lib/reference-strength";

export interface FrozenCollectionSettings {
  anchorImageId: string | null;
  anchorImageUrl: string | null;
  anchorStoragePath: string | null;
  anchorWidthPx: number | null;
  anchorHeightPx: number | null;

  styleKey: string;
  posterFormatId: string | null;
  aspectRatio: string;
  backgroundStyle: "white" | "cream" | string;

  anchorProvider: string | null;
  anchorModel: string | null;
  resolvedProvider: string | null;
  resolvedModel: string | null;
  providerPreference: "auto" | "sdxl" | "gemini" | "openai";

  referenceStrength: ReferenceStrength | null;

  artDirection: CollectionArtDirection | null;
  artDirectionVersion: number;

  consistencyStrength: ConsistencyStrength;

  contractVersion: number;
}

export interface FreezeInput {
  anchorImageId: string | null;
  anchorImageUrl: string | null;
  anchorStoragePath: string | null;
  anchorWidthPx: number | null;
  anchorHeightPx: number | null;
  styleKey: string;
  posterFormatId: string | null;
  aspectRatio: string;
  backgroundStyle: string;
  anchorProvider: string | null;
  anchorModel: string | null;
  resolvedProvider: string | null;
  resolvedModel: string | null;
  providerPreference: "auto" | "sdxl" | "gemini" | "openai";
  referenceStrength: ReferenceStrength | null;
  artDirection: CollectionArtDirection | null;
  artDirectionVersion?: number;
  consistencyStrength: ConsistencyStrength;
  contractVersion?: number;
}

export function freezeCollectionSettings(input: FreezeInput): FrozenCollectionSettings {
  return {
    anchorImageId: input.anchorImageId,
    anchorImageUrl: input.anchorImageUrl,
    anchorStoragePath: input.anchorStoragePath,
    anchorWidthPx: input.anchorWidthPx,
    anchorHeightPx: input.anchorHeightPx,
    styleKey: input.styleKey,
    posterFormatId: input.posterFormatId,
    aspectRatio: input.aspectRatio,
    backgroundStyle: input.backgroundStyle,
    anchorProvider: input.anchorProvider,
    anchorModel: input.anchorModel,
    resolvedProvider: input.resolvedProvider,
    resolvedModel: input.resolvedModel,
    providerPreference: input.providerPreference,
    referenceStrength: input.referenceStrength,
    artDirection: input.artDirection,
    artDirectionVersion: input.artDirectionVersion ?? ART_DIRECTION_VERSION,
    consistencyStrength: input.consistencyStrength,
    contractVersion: input.contractVersion ?? GENERATION_REQUEST_VERSION,
  };
}

/** Loosely typed collection row (matches `public.collections`). */
export type LooseCollectionRow = Record<string, unknown>;

export interface ReadFrozenResult {
  settings: FrozenCollectionSettings;
  usedFallbacks: string[];
}

/** Poster-format → aspect-ratio derivation (whitelisted, additive). */
const POSTER_FORMAT_TO_RATIO: Record<string, string> = {
  "5x7": "5:7",
  "50x70": "5:7",
  "50x70cm": "5:7",
  "a3": "297:420",
  "3x4": "3:4",
  "4x5": "4:5",
  "2x3": "2:3",
};

function readString(row: LooseCollectionRow, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
function readNumber(row: LooseCollectionRow, key: string): number | null {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function readFrozenCollectionSettings(row: LooseCollectionRow): ReadFrozenResult {
  const usedFallbacks: string[] = [];

  const anchorImageId = readString(row, "anchor_image_id");
  const anchorImageUrl = readString(row, "anchor_image_url");
  const anchorStoragePath = readString(row, "anchor_storage_path");
  const anchorWidthPx = readNumber(row, "anchor_width_px");
  const anchorHeightPx = readNumber(row, "anchor_height_px");

  const styleKey = readString(row, "anchor_style_key") ?? "";
  const posterFormatId = readString(row, "anchor_poster_format_id");

  let aspectRatio = readString(row, "anchor_aspect_ratio");
  if (!aspectRatio && posterFormatId && POSTER_FORMAT_TO_RATIO[posterFormatId]) {
    aspectRatio = POSTER_FORMAT_TO_RATIO[posterFormatId];
    usedFallbacks.push("aspectRatio<-posterFormatId");
  }
  if (!aspectRatio) {
    aspectRatio = "5:7";
    usedFallbacks.push("aspectRatio<-default(5:7)");
  }

  let backgroundStyle = readString(row, "anchor_background_style");
  if (!backgroundStyle) {
    backgroundStyle = "white";
    usedFallbacks.push("backgroundStyle<-default(white)");
  }

  const anchorProvider = readString(row, "anchor_provider");
  const anchorModel = readString(row, "anchor_model");
  const resolvedProvider = readString(row, "resolved_provider");
  const resolvedModel = readString(row, "resolved_model");

  if (!anchorProvider && !resolvedProvider) usedFallbacks.push("provider<-unknown");
  if (!anchorModel && !resolvedModel) usedFallbacks.push("model<-unknown");

  const rawPref = readString(row, "provider_preference");
  const providerPreference: FrozenCollectionSettings["providerPreference"] =
    rawPref === "auto" || rawPref === "sdxl" || rawPref === "gemini" || rawPref === "openai"
      ? rawPref
      : "auto";
  if (!rawPref) usedFallbacks.push("providerPreference<-default(auto)");

  const rawRef = readString(row, "reference_strength") as ReferenceStrength | null;
  const referenceStrength: ReferenceStrength | null = rawRef ?? null;

  const artDirection = (row["art_direction"] ?? null) as CollectionArtDirection | null;
  let artDirectionVersion = readNumber(row, "art_direction_version");
  if (artDirectionVersion == null) {
    artDirectionVersion = ART_DIRECTION_VERSION;
    usedFallbacks.push("artDirectionVersion<-default");
  }

  const rawCS = readString(row, "consistency_strength");
  const consistencyStrength: ConsistencyStrength =
    rawCS === "loose" || rawCS === "balanced" || rawCS === "strict"
      ? (rawCS as ConsistencyStrength)
      : DEFAULT_CONSISTENCY_STRENGTH;
  if (!rawCS) usedFallbacks.push("consistencyStrength<-default(balanced)");

  const contractVersion = readNumber(row, "contract_version") ?? GENERATION_REQUEST_VERSION;
  if (row["contract_version"] == null) usedFallbacks.push("contractVersion<-default");

  const settings: FrozenCollectionSettings = {
    anchorImageId,
    anchorImageUrl,
    anchorStoragePath,
    anchorWidthPx,
    anchorHeightPx,
    styleKey,
    posterFormatId,
    aspectRatio,
    backgroundStyle,
    anchorProvider,
    anchorModel,
    resolvedProvider,
    resolvedModel,
    providerPreference,
    referenceStrength,
    artDirection,
    artDirectionVersion,
    consistencyStrength,
    contractVersion,
  };
  return { settings, usedFallbacks };
}
