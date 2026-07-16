/**
 * Shared helper — durably persist a generated image before we mark the
 * generation_job_item as completed.
 *
 * Steps:
 *   1. Decode a data: URL or fetch a remote URL into bytes.
 *   2. Upload the PNG into the `generated-images` bucket.
 *   3. Insert a row into `generated_images` so it shows up in galleries.
 *   4. Return the storage path, gallery id and a public URL for realtime.
 *
 * Callers MUST await this before calling complete_generation_item.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface PersistArgs {
  imageUrl: string;
  prompt: string;
  mode: string;
  aspectRatio: string;
  printSize?: string | null;
  qualityMode?: string;
  targetPpi?: number | null;
  targetWidthPx?: number | null;
  targetHeightPx?: number | null;
  enhanced?: boolean;
  providerLabel?: string | null;
}

export interface PersistResult {
  storagePath: string;
  galleryImageId: string;
  publicUrl: string;
  bytes: number;
}

async function toBytes(imageUrl: string): Promise<Uint8Array> {
  if (imageUrl.startsWith("data:")) {
    const b64 = imageUrl.split(",")[1] ?? "";
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`fetch image failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE env");
  return createClient(url, key);
}

export async function persistGenerationResult(
  supabase: SupabaseClient,
  args: PersistArgs,
): Promise<PersistResult> {
  const bytes = await toBytes(args.imageUrl);
  const filename = `${args.mode}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`;

  const { error: upErr } = await supabase.storage
    .from("generated-images")
    .upload(filename, bytes, { contentType: "image/png" });
  if (upErr) throw new Error(`storage upload: ${upErr.message}`);

  const { data: pub } = supabase.storage.from("generated-images").getPublicUrl(filename);

  const { data: row, error: insErr } = await supabase
    .from("generated_images")
    .insert({
      prompt: args.prompt,
      mode: args.mode,
      aspect_ratio: args.aspectRatio,
      storage_path: filename,
      print_size: args.printSize ?? null,
      quality_mode: args.qualityMode ?? "quality",
      target_ppi: args.targetPpi ?? null,
      target_width_px: args.targetWidthPx ?? null,
      target_height_px: args.targetHeightPx ?? null,
      enhanced: args.enhanced ?? false,
    })
    .select("id")
    .single();
  if (insErr || !row) throw new Error(`gallery insert: ${insErr?.message}`);

  return {
    storagePath: filename,
    galleryImageId: row.id as string,
    publicUrl: pub.publicUrl,
    bytes: bytes.byteLength,
  };
}
