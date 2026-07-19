/**
 * anchor-analysis — client-side helper that asks the `analyze-anchor-image`
 * edge function to return a structured `CollectionArtDirection` for a given
 * anchor image URL.
 *
 * Failure is non-blocking by contract: the caller should treat `null` as
 * "no analysis available" and continue with the anchor image + inherited
 * metadata alone. See `create-job.ts` and the Stage 2 spec.
 */

import { supabase } from "@/integrations/supabase/client";
import { ART_DIRECTION_VERSION, type CollectionArtDirection } from "./types";

export interface AnchorAnalysisResult {
  artDirection: CollectionArtDirection | null;
  version: number;
  error: string | null;
}

const STRING_FIELDS: Array<keyof CollectionArtDirection> = [
  "colorMood",
  "lighting",
  "composition",
  "subjectScale",
  "negativeSpace",
  "texture",
  "framing",
  "detailDensity",
  "mood",
  "textPolicy",
];

/**
 * Validate & sanitize the raw JSON returned by the analyzer. Rejects
 * anything that isn't the expected shape so we never persist junk into
 * `generation_jobs.art_direction`.
 */
export function sanitizeArtDirection(raw: unknown): CollectionArtDirection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const palette = Array.isArray(r.palette)
    ? r.palette.filter((v): v is string => typeof v === "string").slice(0, 8)
    : [];

  const out: CollectionArtDirection = {
    palette,
    colorMood: "",
    lighting: "",
    composition: "",
    subjectScale: "",
    negativeSpace: "",
    texture: "",
    framing: "",
    detailDensity: "",
    mood: "",
    textPolicy: "",
  };

  for (const k of STRING_FIELDS) {
    const v = r[k];
    if (typeof v === "string") (out as unknown as Record<string, unknown>)[k] = v.slice(0, 240);
  }

  // Require at least a palette OR one non-empty descriptor to be useful.
  const anyDescriptor = STRING_FIELDS.some((k) => out[k].length > 0);
  if (out.palette.length === 0 && !anyDescriptor) return null;
  return out;
}

export async function analyzeAnchorImage(
  anchorImageUrl: string,
): Promise<AnchorAnalysisResult> {
  try {
    const { data, error } = await supabase.functions.invoke("analyze-anchor-image", {
      body: { anchorImageUrl },
    });
    if (error) {
      return { artDirection: null, version: ART_DIRECTION_VERSION, error: error.message };
    }
    const cleaned = sanitizeArtDirection((data as { artDirection?: unknown })?.artDirection);
    return { artDirection: cleaned, version: ART_DIRECTION_VERSION, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { artDirection: null, version: ART_DIRECTION_VERSION, error: msg };
  }
}
