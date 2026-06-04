/**
 * Style Lab — backend helpers.
 *
 * Curation field updates (rating / favorite / archive / reject), Review
 * fetch + filters, and Collection workspace queries. The Style Lab UI
 * (Test / Review / Insights / Collections tabs) is built on top of these
 * helpers; analytics aggregation lives in `style-lab-insights.ts`.
 */

import { supabase } from "@/integrations/supabase/client";

export type ImageRating = 0 | 1 | 2 | 3 | 4 | 5;

// New curation columns are not in the generated Supabase types yet, so
// the update payloads are cast through `never`. Each helper is a tiny
// single-purpose write and the column names are validated by the DB.
type CurationUpdate =
  | { rating: ImageRating }
  | { is_favorite: boolean }
  | { is_archived: boolean }
  | { is_rejected: boolean };

async function updateCurationField(id: string, update: CurationUpdate): Promise<void> {
  const { error } = await supabase
    .from("generated_images")
    .update(update as never)
    .eq("id", id);
  if (error) throw error;
}

export async function setImageRating(id: string, rating: ImageRating): Promise<void> {
  return updateCurationField(id, { rating });
}

export async function setImageFavorite(id: string, value: boolean): Promise<void> {
  return updateCurationField(id, { is_favorite: value });
}

export async function setImageArchived(id: string, value: boolean): Promise<void> {
  return updateCurationField(id, { is_archived: value });
}

export async function setImageRejected(id: string, value: boolean): Promise<void> {
  return updateCurationField(id, { is_rejected: value });
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
  is_rejected: boolean;
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
  includeRejected?: boolean;
  rejectedOnly?: boolean;
  limit?: number;
}

export async function fetchReviewImages(opts: FetchReviewOptions = {}): Promise<ReviewImage[]> {
  let q = supabase
    .from("generated_images")
    .select(
      "id,prompt,mode,created_at,storage_path,master_storage_path,generation_provider,generation_model,execution_route,fallback_used,rating,is_favorite,is_archived,is_rejected,deleted_at",
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
  if (opts.rejectedOnly) {
    q = q.eq("is_rejected", true);
  } else if (!opts.includeRejected) {
    q = q.eq("is_rejected", false);
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
      is_rejected: Boolean(r.is_rejected),
      publicUrl,
      masterUrl,
    };
  });
}

// ── Collection workspace helpers (Phase 5) ─────────────────────────────

export interface CollectionImage extends ReviewImage {
  added_at: string;
}

export interface CollectionSummary {
  id: string;
  name: string;
  created_at: string;
  imageCount: number;
  avgRating: number;        // ratings > 0 only; 0 if no rated images
  ratedCount: number;
  favoriteCount: number;
  rejectCount: number;
  archivedCount: number;
}

/**
 * Loads all collections + per-collection stats. One query for collections,
 * one for membership rows, then chunked lookups for image metadata.
 */
export async function fetchCollectionsWithStats(): Promise<CollectionSummary[]> {
  const { data: cols, error: cErr } = await supabase
    .from("collections")
    .select("id,name,created_at")
    .order("created_at", { ascending: false });
  if (cErr) throw cErr;
  const collections = (cols ?? []) as Array<{ id: string; name: string; created_at: string }>;
  if (collections.length === 0) return [];

  const { data: links, error: lErr } = await supabase
    .from("collection_images")
    .select("collection_id,image_id");
  if (lErr) throw lErr;
  const rows = (links ?? []) as Array<{ collection_id: string; image_id: string }>;
  const imageIds = Array.from(new Set(rows.map((r) => r.image_id)));

  const imageMap = new Map<
    string,
    { rating: number; is_favorite: boolean; is_archived: boolean; is_rejected: boolean }
  >();
  if (imageIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < imageIds.length; i += chunkSize) {
      const slice = imageIds.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("generated_images")
        .select("id,rating,is_favorite,is_archived,is_rejected,deleted_at")
        .in("id", slice)
        .is("deleted_at", null);
      if (error) throw error;
      ((data ?? []) as Array<Record<string, unknown>>).forEach((r) => {
        imageMap.set(String(r.id), {
          rating: Number(r.rating ?? 0),
          is_favorite: Boolean(r.is_favorite),
          is_archived: Boolean(r.is_archived),
          is_rejected: Boolean(r.is_rejected),
        });
      });
    }
  }

  const byCol = new Map<string, string[]>();
  rows.forEach((r) => {
    const arr = byCol.get(r.collection_id) ?? [];
    arr.push(r.image_id);
    byCol.set(r.collection_id, arr);
  });

  return collections.map((c) => {
    const ids = byCol.get(c.id) ?? [];
    let ratingSum = 0;
    let ratedCount = 0;
    let favoriteCount = 0;
    let rejectCount = 0;
    let archivedCount = 0;
    let liveCount = 0;
    ids.forEach((id) => {
      const meta = imageMap.get(id);
      if (!meta) return;
      liveCount += 1;
      if (meta.rating > 0) {
        ratingSum += meta.rating;
        ratedCount += 1;
      }
      if (meta.is_favorite) favoriteCount += 1;
      if (meta.is_rejected) rejectCount += 1;
      if (meta.is_archived) archivedCount += 1;
    });
    return {
      id: c.id,
      name: c.name,
      created_at: c.created_at,
      imageCount: liveCount,
      avgRating: ratedCount > 0 ? ratingSum / ratedCount : 0,
      ratedCount,
      favoriteCount,
      rejectCount,
      archivedCount,
    };
  });
}

/** Load all images for a collection, joined with their metadata. */
export async function fetchCollectionImages(collectionId: string): Promise<CollectionImage[]> {
  const { data, error } = await supabase
    .from("collection_images")
    .select(
      "added_at,image_id,generated_images!inner(id,prompt,mode,created_at,storage_path,master_storage_path,generation_provider,generation_model,execution_route,fallback_used,rating,is_favorite,is_archived,is_rejected,deleted_at)",
    )
    .eq("collection_id", collectionId);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    added_at: string;
    image_id: string;
    generated_images: Record<string, unknown> | null;
  }>;

  return rows
    .filter((r) => r.generated_images && !(r.generated_images as { deleted_at?: unknown }).deleted_at)
    .map((r) => {
      const g = r.generated_images as Record<string, unknown>;
      const storagePath = String(g.storage_path ?? "");
      const masterPath = (g.master_storage_path as string | null) || storagePath;
      const publicUrl = supabase.storage.from("generated-images").getPublicUrl(storagePath).data.publicUrl;
      const masterUrl = supabase.storage.from("generated-images").getPublicUrl(masterPath).data.publicUrl;
      return {
        id: String(g.id),
        prompt: String(g.prompt ?? ""),
        mode: String(g.mode ?? ""),
        created_at: String(g.created_at ?? ""),
        storage_path: storagePath,
        master_storage_path: (g.master_storage_path as string | null) ?? null,
        generation_provider: (g.generation_provider as string | null) ?? null,
        generation_model: (g.generation_model as string | null) ?? null,
        execution_route: (g.execution_route as string | null) ?? null,
        fallback_used: (g.fallback_used as boolean | null) ?? null,
        rating: Number(g.rating ?? 0),
        is_favorite: Boolean(g.is_favorite),
        is_archived: Boolean(g.is_archived),
        is_rejected: Boolean(g.is_rejected),
        publicUrl,
        masterUrl,
        added_at: String(r.added_at ?? ""),
      };
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** CSV exporter for the spec'd fields. */
export function buildCollectionCsv(images: CollectionImage[]): string {
  const header = [
    "image_id",
    "prompt",
    "style",
    "provider",
    "model",
    "rating",
    "favorite",
    "archived",
    "rejected",
    "created_at",
  ];
  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const img of images) {
    lines.push(
      [
        img.id,
        img.prompt,
        img.mode,
        img.generation_provider ?? "",
        img.generation_model ?? "",
        img.rating,
        img.is_favorite ? "true" : "false",
        img.is_archived ? "true" : "false",
        img.is_rejected ? "true" : "false",
        img.created_at,
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n");
}
