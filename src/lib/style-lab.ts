/**
 * Style Lab — small helpers for curation fields on generated_images.
 *
 * Phase 1: lightweight DB updates for rating / favorite / archive. Kept
 * isolated from src/lib/gallery.ts so future Style Lab phases can grow
 * here without bloating the gallery module.
 */

import { supabase } from "@/integrations/supabase/client";

export type ImageRating = 0 | 1 | 2 | 3 | 4 | 5;

export async function setImageRating(id: string, rating: ImageRating): Promise<void> {
  const { error } = await supabase
    .from("generated_images")
    // Cast: new columns may not be in generated types yet.
    .update({ rating } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function setImageFavorite(id: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from("generated_images")
    .update({ is_favorite: value } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function setImageArchived(id: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from("generated_images")
    .update({ is_archived: value } as never)
    .eq("id", id);
  if (error) throw error;
}

/**
 * Find the most recently inserted gallery row that matches a prompt and
 * style key. Used by Style Lab to attach an id to each just-saved result
 * so per-image actions (rate/favorite/archive) can target it.
 *
 * Best-effort — returns null if nothing matches within `windowSeconds`.
 */
export async function findRecentGalleryRow(opts: {
  prompt: string;
  mode: string;
  withinSeconds?: number;
}): Promise<{ id: string } | null> {
  const since = new Date(
    Date.now() - (opts.withinSeconds ?? 60) * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("generated_images")
    .select("id, created_at")
    .eq("mode", opts.mode)
    .eq("prompt", opts.prompt)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return { id: (data[0] as { id: string }).id };
}
