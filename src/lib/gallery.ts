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

/**
 * Upload an image (data-URL or remote URL) to the generated-images bucket
 * and return the storage filename + public URL.
 */
async function uploadImage(imageUrl: string, prefix: string): Promise<{ filename: string; publicUrl: string }> {
  const filename = `${prefix}-${Date.now()}.png`;
  let blob: Blob;

  if (imageUrl.startsWith("data:")) {
    blob = dataUrlToBlob(imageUrl);
  } else {
    const res = await fetch(imageUrl);
    blob = await res.blob();
  }

  const { error } = await supabase.storage
    .from("generated-images")
    .upload(filename, blob, { contentType: "image/png" });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from("generated-images")
    .getPublicUrl(filename);

  return { filename, publicUrl: urlData.publicUrl };
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
  /** Asset model fields */
  enhancedImageUrl?: string;
  enhancementModel?: string;
  upscaleFactor?: number;
  baseWidthPx?: number;
  baseHeightPx?: number;
  enhancedWidthPx?: number;
  enhancedHeightPx?: number;
  /** Phase 1: generator provider metadata */
  generationProvider?: string;
  generationModel?: string;
  providerStrategy?: string;
  fallbackUsed?: boolean;
  /** Phase: cost-aware routing — explains where the image was generated. */
  executionRoute?: string;
}

export async function saveToGallery(opts: GallerySaveOptions) {
  // Upload the base image
  const base = await uploadImage(opts.imageUrl, opts.mode);

  // Upload enhanced image if provided
  let enhancedPath: string | null = null;
  if (opts.enhancedImageUrl && opts.enhancedImageUrl !== opts.imageUrl) {
    const enh = await uploadImage(opts.enhancedImageUrl, `${opts.mode}-enh`);
    enhancedPath = enh.filename;
  }

  // Master = enhanced if available, otherwise base
  const masterPath = enhancedPath || base.filename;

  const { error: dbError } = await supabase.from("generated_images").insert({
    prompt: opts.prompt,
    mode: opts.mode,
    aspect_ratio: opts.aspectRatio,
    print_size: opts.printSize,
    storage_path: base.filename,
    enhanced_storage_path: enhancedPath,
    master_storage_path: masterPath,
    quality_mode: opts.qualityMode || "quality",
    target_ppi: opts.targetPpi || null,
    target_width_px: opts.targetWidthPx || null,
    target_height_px: opts.targetHeightPx || null,
    actual_width_px: opts.actualWidthPx || null,
    actual_height_px: opts.actualHeightPx || null,
    enhanced: opts.enhanced || !!enhancedPath,
    print_format_id: opts.printFormatId || null,
    generation_mode: opts.generationMode || null,
    source_width: opts.sourceWidth || null,
    source_height: opts.sourceHeight || null,
    export_width: opts.exportWidth || null,
    export_height: opts.exportHeight || null,
    export_ready: opts.exportReady || false,
    export_type: opts.exportType || null,
    upscale_applied: opts.upscaleApplied || !!enhancedPath,
    upscale_method: opts.upscaleMethod || null,
    crop_mode: opts.cropMode || null,
    padding_mode: opts.paddingMode || null,
    enhancement_model: opts.enhancementModel || null,
    upscale_factor: opts.upscaleFactor || null,
    base_width_px: opts.baseWidthPx || null,
    base_height_px: opts.baseHeightPx || null,
    enhanced_width_px: opts.enhancedWidthPx || null,
    enhanced_height_px: opts.enhancedHeightPx || null,
    generation_provider: opts.generationProvider || null,
    generation_model: opts.generationModel || null,
    provider_strategy: opts.providerStrategy || null,
    fallback_used: opts.fallbackUsed || false,
    execution_route: opts.executionRoute || null,
  } as any);

  if (dbError) throw dbError;

  // Return the master public URL
  const { data: masterUrlData } = supabase.storage
    .from("generated-images")
    .getPublicUrl(masterPath);

  return masterUrlData.publicUrl;
}

/** Helper to resolve a storage path to a public URL */
function storageUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from("generated-images").getPublicUrl(path).data.publicUrl;
}

export async function fetchGalleryImages() {
  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data || []).map((img: any) => {
    const masterPath = img.master_storage_path || img.storage_path;
    return {
      ...img,
      // Preview = base storage path (lightweight for grid)
      publicUrl: storageUrl(img.storage_path)!,
      // Master = best available (for detail view & export)
      masterUrl: storageUrl(masterPath)!,
      // Enhanced URL (if it exists)
      enhancedUrl: storageUrl(img.enhanced_storage_path),
    };
  });
}

export async function deleteFromGallery(id: string, storagePath: string) {
  // Also fetch enhanced path to clean up
  const { data: row } = await supabase
    .from("generated_images")
    .select("enhanced_storage_path, master_storage_path")
    .eq("id", id)
    .single();

  const pathsToRemove = [storagePath];
  if (row?.enhanced_storage_path && row.enhanced_storage_path !== storagePath) {
    pathsToRemove.push(row.enhanced_storage_path);
  }

  const { error: storageError } = await supabase.storage
    .from("generated-images")
    .remove(pathsToRemove);

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
  const base = await uploadImage(opts.imageUrl, opts.mode);

  let enhancedPath: string | null = null;
  if (opts.enhancedImageUrl && opts.enhancedImageUrl !== opts.imageUrl) {
    const enh = await uploadImage(opts.enhancedImageUrl, `${opts.mode}-enh`);
    enhancedPath = enh.filename;
  }

  const masterPath = enhancedPath || base.filename;

  // Remove old files
  await supabase.storage.from("generated-images").remove([opts.originalStoragePath]);

  const { error: dbError } = await supabase
    .from("generated_images")
    .update({
      prompt: opts.prompt,
      mode: opts.mode,
      aspect_ratio: opts.aspectRatio,
      print_size: opts.printSize,
      storage_path: base.filename,
      enhanced_storage_path: enhancedPath,
      master_storage_path: masterPath,
      quality_mode: opts.qualityMode || "quality",
      target_ppi: opts.targetPpi || null,
      target_width_px: opts.targetWidthPx || null,
      target_height_px: opts.targetHeightPx || null,
      actual_width_px: opts.actualWidthPx || null,
      actual_height_px: opts.actualHeightPx || null,
      enhanced: opts.enhanced || !!enhancedPath,
      print_format_id: opts.printFormatId || null,
      generation_mode: opts.generationMode || null,
      source_width: opts.sourceWidth || null,
      source_height: opts.sourceHeight || null,
      export_width: opts.exportWidth || null,
      export_height: opts.exportHeight || null,
      export_ready: opts.exportReady || false,
      export_type: opts.exportType || null,
      upscale_applied: opts.upscaleApplied || !!enhancedPath,
      upscale_method: opts.upscaleMethod || null,
      crop_mode: opts.cropMode || null,
      padding_mode: opts.paddingMode || null,
      enhancement_model: opts.enhancementModel || null,
      upscale_factor: opts.upscaleFactor || null,
      base_width_px: opts.baseWidthPx || null,
      base_height_px: opts.baseHeightPx || null,
      enhanced_width_px: opts.enhancedWidthPx || null,
      enhanced_height_px: opts.enhancedHeightPx || null,
      generation_provider: opts.generationProvider || null,
      generation_model: opts.generationModel || null,
      provider_strategy: opts.providerStrategy || null,
      fallback_used: opts.fallbackUsed || false,
      execution_route: opts.executionRoute || null,
    } as any)
    .eq("id", opts.originalId);

  if (dbError) throw dbError;
}

/**
 * Update enhanced asset for an existing gallery image after async enhancement completes.
 *
 * IMPORTANT: this never overwrites `storage_path` (the original/base asset) —
 * it only writes the enhanced asset and points `master_storage_path` at it.
 * `original_storage_path` is also preserved so re-upscaling always works from
 * the original image, never from an already-upscaled derivative.
 */
export async function updateEnhancedAsset(
  imageId: string,
  enhancedImageUrl: string,
  metadata?: {
    enhancementModel?: string;
    upscaleFactor?: number;
    upscaleMode?: string;
    enhancedWidthPx?: number;
    enhancedHeightPx?: number;
  },
) {
  const enh = await uploadImage(enhancedImageUrl, "enh");

  // Make sure original_storage_path is set on first enhancement so future
  // re-upscales can always source the original/base asset.
  const { data: existing } = await supabase
    .from("generated_images")
    .select("storage_path, original_storage_path")
    .eq("id", imageId)
    .single();

  const originalPath =
    (existing as any)?.original_storage_path || (existing as any)?.storage_path || null;

  const { error } = await supabase
    .from("generated_images")
    .update({
      enhanced_storage_path: enh.filename,
      master_storage_path: enh.filename,
      original_storage_path: originalPath,
      enhanced: true,
      upscale_applied: true,
      upscale_mode: metadata?.upscaleMode || null,
      upscaled_at: new Date().toISOString(),
      enhancement_model: metadata?.enhancementModel || null,
      upscale_factor: metadata?.upscaleFactor || null,
      enhanced_width_px: metadata?.enhancedWidthPx || null,
      enhanced_height_px: metadata?.enhancedHeightPx || null,
    } as any)
    .eq("id", imageId);

  if (error) throw error;

  return enh.publicUrl;
}
