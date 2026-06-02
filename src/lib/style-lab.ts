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

// ── Review helpers ─────────────────────────────────────────────────────

export interface ReviewImage {
  id: string;
  prompt: string;
  mode: string;
  created_at: string;
  storage_path: string;
  master_storage_path: string | null;
  generation_provider: string | null;
  generation_model: string | null;
  execution_route: string | null;
  fallback_used: boolean | null;
  rating: number;
  is_favorite: boolean;
  is_archived: boolean;
  publicUrl: string;
  masterUrl: string;
}

export interface FetchReviewOptions {
  mode?: string | null;
  provider?: string | null;
  minRating?: number;
  favoritesOnly?: boolean;
  includeArchived?: boolean;
  archivedOnly?: boolean;
  limit?: number;
}

export async function fetchReviewImages(opts: FetchReviewOptions = {}): Promise<ReviewImage[]> {
  let q = supabase
    .from("generated_images")
    .select(
      "id,prompt,mode,created_at,storage_path,master_storage_path,generation_provider,generation_model,execution_route,fallback_used,rating,is_favorite,is_archived,deleted_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.mode) q = q.eq("mode", opts.mode);
  if (opts.provider) q = q.eq("generation_provider", opts.provider);
  if (opts.minRating && opts.minRating > 0) q = q.gte("rating", opts.minRating);
  if (opts.favoritesOnly) q = q.eq("is_favorite", true);
  if (opts.archivedOnly) {
    q = q.eq("is_archived", true);
  } else if (!opts.includeArchived) {
    q = q.eq("is_archived", false);
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const storagePath = String(r.storage_path ?? "");
    const masterPath = (r.master_storage_path as string | null) || storagePath;
    const publicUrl = supabase.storage.from("generated-images").getPublicUrl(storagePath).data.publicUrl;
    const masterUrl = supabase.storage.from("generated-images").getPublicUrl(masterPath).data.publicUrl;
    return {
      id: String(r.id),
      prompt: String(r.prompt ?? ""),
      mode: String(r.mode ?? ""),
      created_at: String(r.created_at ?? ""),
      storage_path: storagePath,
      master_storage_path: (r.master_storage_path as string | null) ?? null,
      generation_provider: (r.generation_provider as string | null) ?? null,
      generation_model: (r.generation_model as string | null) ?? null,
      execution_route: (r.execution_route as string | null) ?? null,
      fallback_used: (r.fallback_used as boolean | null) ?? null,
      rating: Number(r.rating ?? 0),
      is_favorite: Boolean(r.is_favorite),
      is_archived: Boolean(r.is_archived),
      publicUrl,
      masterUrl,
    };
  });
}
