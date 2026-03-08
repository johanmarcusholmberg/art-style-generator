import { supabase } from "@/integrations/supabase/client";

/**
 * Converts a base64 data URL to a Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function saveToGallery({
  imageUrl,
  prompt,
  mode,
  aspectRatio,
  printSize,
}: {
  imageUrl: string;
  prompt: string;
  mode: "japanese" | "freestyle";
  aspectRatio: string;
  printSize: string;
}) {
  const filename = `${mode}-${Date.now()}.png`;
  const blob = dataUrlToBlob(imageUrl);

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from("generated-images")
    .upload(filename, blob, { contentType: "image/png" });

  if (uploadError) throw uploadError;

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("generated-images")
    .getPublicUrl(filename);

  // Save metadata
  const { error: dbError } = await supabase.from("generated_images").insert({
    prompt,
    mode,
    aspect_ratio: aspectRatio,
    print_size: printSize,
    storage_path: filename,
  });

  if (dbError) throw dbError;

  return urlData.publicUrl;
}

export async function fetchGalleryImages() {
  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data || []).map((img: any) => ({
    ...img,
    publicUrl: supabase.storage
      .from("generated-images")
      .getPublicUrl(img.storage_path).data.publicUrl,
  }));
}

export async function deleteFromGallery(id: string, storagePath: string) {
  const { error: storageError } = await supabase.storage
    .from("generated-images")
    .remove([storagePath]);

  if (storageError) throw storageError;

  const { error: dbError } = await supabase
    .from("generated_images")
    .delete()
    .eq("id", id);

  if (dbError) throw dbError;
}

/**
 * Replace an existing gallery image with a new one.
 * Deletes the old storage file, uploads the new one, and updates the DB row.
 */
export async function replaceInGallery({
  originalId,
  originalStoragePath,
  imageUrl,
  prompt,
  mode,
  aspectRatio,
  printSize,
}: {
  originalId: string;
  originalStoragePath: string;
  imageUrl: string;
  prompt: string;
  mode: "japanese" | "freestyle";
  aspectRatio: string;
  printSize: string;
}) {
  const filename = `${mode}-${Date.now()}.png`;
  const blob = dataUrlToBlob(imageUrl);

  // Remove old file
  await supabase.storage.from("generated-images").remove([originalStoragePath]);

  // Upload new file
  const { error: uploadError } = await supabase.storage
    .from("generated-images")
    .upload(filename, blob, { contentType: "image/png" });

  if (uploadError) throw uploadError;

  // Update DB row
  const { error: dbError } = await supabase
    .from("generated_images")
    .update({
      prompt,
      mode,
      aspect_ratio: aspectRatio,
      print_size: printSize,
      storage_path: filename,
    })
    .eq("id", originalId);

  if (dbError) throw dbError;
}
