import { supabase } from "@/integrations/supabase/client";

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

export async function createCollection(name: string): Promise<Collection> {
  const { data, error } = await supabase
    .from("collections")
    .insert({ name })
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

export async function removeFromCollection(collectionId: string, imageId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_images")
    .delete()
    .eq("collection_id", collectionId)
    .eq("image_id", imageId);
  if (error) throw error;
}

export async function fetchCollectionImageIds(collectionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("collection_images")
    .select("image_id")
    .eq("collection_id", collectionId);
  if (error) throw error;
  return (data || []).map((r: any) => r.image_id);
}
