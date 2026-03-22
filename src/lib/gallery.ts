import { supabase } from "@/integrations/supabase/client";
import type { QualityTarget } from "@/lib/print-resolution";

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

export interface GallerySaveOptions {
  imageUrl: string;
  prompt: string;
  mode: string;
  aspectRatio: string;
  printSize: string;
  qualityMode?: QualityTarget;
  targetPpi?: number;
  targetWidthPx?: number;
  targetHeightPx?: number;
  actualWidthPx?: number;
  actualHeightPx?: number;
  enhanced?: boolean;
}

export async function saveToGallery(opts: GallerySaveOptions) {
  const filename = `${opts.mode}-${Date.now()}.png`;
  const blob = dataUrlToBlob(opts.imageUrl);

  const { error: uploadError } = await supabase.storage
    .from("generated-images")
    .upload(filename, blob, { contentType: "image/png" });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from("generated-images")
    .getPublicUrl(filename);

  const { error: dbError } = await supabase.from("generated_images").insert({
    prompt: opts.prompt,
    mode: opts.mode,
    aspect_ratio: opts.aspectRatio,
    print_size: opts.printSize,
    storage_path: filename,
    quality_mode: opts.qualityMode || "quality",
    target_ppi: opts.targetPpi || null,
    target_width_px: opts.targetWidthPx || null,
    target_height_px: opts.targetHeightPx || null,
    actual_width_px: opts.actualWidthPx || null,
    actual_height_px: opts.actualHeightPx || null,
    enhanced: opts.enhanced || false,
  } as any);

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

export async function replaceInGallery({
  originalId,
  originalStoragePath,
  imageUrl,
  prompt,
  mode,
  aspectRatio,
  printSize,
  qualityMode,
  targetPpi,
  targetWidthPx,
  targetHeightPx,
  actualWidthPx,
  actualHeightPx,
  enhanced,
}: GallerySaveOptions & { originalId: string; originalStoragePath: string }) {
  const filename = `${mode}-${Date.now()}.png`;
  const blob = dataUrlToBlob(imageUrl);

  await supabase.storage.from("generated-images").remove([originalStoragePath]);

  const { error: uploadError } = await supabase.storage
    .from("generated-images")
    .upload(filename, blob, { contentType: "image/png" });

  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase
    .from("generated_images")
    .update({
      prompt,
      mode,
      aspect_ratio: aspectRatio,
      print_size: printSize,
      storage_path: filename,
      quality_mode: qualityMode || "quality",
      target_ppi: targetPpi || null,
      target_width_px: targetWidthPx || null,
      target_height_px: targetHeightPx || null,
      actual_width_px: actualWidthPx || null,
      actual_height_px: actualHeightPx || null,
      enhanced: enhanced || false,
    } as any)
    .eq("id", originalId);

  if (dbError) throw dbError;
}
