import { supabase } from "@/integrations/supabase/client";
import {
  executeAssetMutation,
  previewCollectionMembershipRemoval,
} from "@/lib/asset-integrity/mutation-service";

export interface Collection {
  id: string;
  name: string;
  created_at: string;
}

export async function fetchCollections(): Promise<Collection[]> {
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export class CollectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectionValidationError";
  }
}

export async function createCollection(name: string): Promise<Collection> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new CollectionValidationError("Collection name cannot be empty.");
  }

  // Case-insensitive duplicate check against existing collections.
  const existing = await fetchCollections();
  const dup = existing.find(
    (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (dup) {
    throw new CollectionValidationError(
      `A collection named "${dup.name}" already exists.`,
    );
  }

  // Ownership is resolved server-side; never trust a client-supplied id.
  const { data: profileId, error: profileError } = await supabase.rpc(
    "current_profile_id",
  );
  if (profileError) throw profileError;
  if (!profileId) {
    throw new CollectionValidationError(
      "You must be signed in to create a collection.",
    );
  }

  const { data, error } = await supabase
    .from("collections")
    .insert({ name: trimmed, profile_id: profileId })
    .select()
    .single();
  if (error) throw error;
  return data;
}


export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("collections").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function addToCollection(collectionId: string, imageId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_images")
    .insert({ collection_id: collectionId, image_id: imageId });
  if (error) throw error;
}

export async function addBulkToCollection(collectionId: string, imageIds: string[]): Promise<void> {
  if (imageIds.length === 0) return;
  const rows = imageIds.map((image_id) => ({ collection_id: collectionId, image_id }));
  const { error } = await supabase.from("collection_images").upsert(rows, { onConflict: "collection_id,image_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeBulkFromCollection(collectionId: string, imageIds: string[]): Promise<void> {
  if (imageIds.length === 0) return;
  const { data, error } = await supabase
    .from("collection_images")
    .select("id,image_id")
    .eq("collection_id", collectionId)
    .in("image_id", imageIds);
  if (error) throw error;
  await Promise.all(
    (data ?? []).map((row: { id: string; image_id: string }) =>
      executeAssetMutation(
        previewCollectionMembershipRemoval(row.image_id, row.id, collectionId),
      ),
    ),
  );
}

export async function removeFromCollection(collectionId: string, imageId: string): Promise<void> {
  const { data, error } = await supabase
    .from("collection_images")
    .select("id")
    .eq("collection_id", collectionId)
    .eq("image_id", imageId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return;
  await executeAssetMutation(
    previewCollectionMembershipRemoval(imageId, data.id, collectionId),
  );
}

export async function fetchCollectionImageIds(collectionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("collection_images")
    .select("image_id")
    .eq("collection_id", collectionId);
  if (error) throw error;
  return (data || []).map((r: any) => r.image_id);
}
