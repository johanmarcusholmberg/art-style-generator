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
  /** Print format fields (Phase 1) */
  printFormatId?: string;
  generationMode?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  exportWidth?: number;
  exportHeight?: number;
  exportReady?: boolean;
  exportType?: string;
  upscaleApplied?: boolean;
  upscaleMethod?: string;
  cropMode?: string;
  paddingMode?: string;
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
    print_format_id: opts.printFormatId || null,
    generation_mode: opts.generationMode || null,
    source_width: opts.sourceWidth || null,
    source_height: opts.sourceHeight || null,
    export_width: opts.exportWidth || null,
    export_height: opts.exportHeight || null,
    export_ready: opts.exportReady || false,
    export_type: opts.exportType || null,
    upscale_applied: opts.upscaleApplied || false,
    upscale_method: opts.upscaleMethod || null,
    crop_mode: opts.cropMode || null,
    padding_mode: opts.paddingMode || null,
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

export async function replaceInGallery(
  opts: GallerySaveOptions & { originalId: string; originalStoragePath: string },
) {
  const filename = `${opts.mode}-${Date.now()}.png`;
  const blob = dataUrlToBlob(opts.imageUrl);

  await supabase.storage.from("generated-images").remove([opts.originalStoragePath]);

  const { error: uploadError } = await supabase.storage
    .from("generated-images")
    .upload(filename, blob, { contentType: "image/png" });

  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase
    .from("generated_images")
    .update({
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
      print_format_id: opts.printFormatId || null,
      generation_mode: opts.generationMode || null,
      source_width: opts.sourceWidth || null,
      source_height: opts.sourceHeight || null,
      export_width: opts.exportWidth || null,
      export_height: opts.exportHeight || null,
      export_ready: opts.exportReady || false,
      export_type: opts.exportType || null,
      upscale_applied: opts.upscaleApplied || false,
      upscale_method: opts.upscaleMethod || null,
      crop_mode: opts.cropMode || null,
      padding_mode: opts.paddingMode || null,
    } as any)
    .eq("id", opts.originalId);

  if (dbError) throw dbError;
}
