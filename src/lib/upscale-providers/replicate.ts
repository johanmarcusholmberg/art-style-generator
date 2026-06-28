/**
 * Direct Replicate enhancement adapter (frontend).
 *
 * Thin wrapper around the `upscale-image-replicate` edge function. Used by
 * `useUpscale` for the manual "Enhance for print" flow. There is NO silent
 * fallback to Lovable — if the call fails, the caller surfaces the error
 * and the user can retry.
 *
 * Methods:
 *   - "realesrgan" — Low cost, fast 4× super-resolution. Also serves the
 *     dynamic `print_target_300` route (decimal scale clamped 2..8 by the
 *     edge function).
 *
 * NOTE: The legacy "supir" method (Print+) was removed in 2025-Q4 because
 * the dynamic Real-ESRGAN route covers the 300 PPI use case more cheaply.
 * Historical rows that recorded `provider: "replicate/supir"` are still
 * read correctly by the admin cost views and the version selector.
 */

import { supabase } from "@/integrations/supabase/client";

export type ReplicateUpscaleMethod = "realesrgan";

export interface ReplicateUpscaleInput {
  imageUrl?: string;
  storagePath?: string;
  method: ReplicateUpscaleMethod;
  /** Only meaningful for `realesrgan`. Default 4. */
  scale?: number;
}

export interface ReplicateUpscaleResult {
  /** Public URL of the enhanced master, hosted on our `generated-images` bucket. */
  upscaledImageUrl: string;
  /** Storage path of the enhanced master inside `generated-images`. */
  storagePath?: string | null;
  width: number | null;
  height: number | null;
  method: ReplicateUpscaleMethod;
  scale: number;
  /** Provider tag persisted on the gallery row (`enhancement_model` column). */
  provider: "replicate/real-esrgan";
}

export async function runReplicateUpscale(
  input: ReplicateUpscaleInput,
): Promise<ReplicateUpscaleResult> {
  if (!input.imageUrl && !input.storagePath) {
    throw new Error("runReplicateUpscale: imageUrl or storagePath required");
  }

  const body = {
    image_url: input.imageUrl,
    storage_path: input.storagePath,
    method: input.method,
    scale: input.scale ?? 4,
  };

  const { data, error } = await supabase.functions.invoke(
    "upscale-image-replicate",
    { body },
  );

  if (error) {
    let serverMessage: string | null = null;
    const ctxResponse = (error as any)?.context?.response;
    if (ctxResponse && typeof ctxResponse.json === "function") {
      try {
        const parsed = await ctxResponse.clone().json();
        if (parsed?.error) serverMessage = String(parsed.error);
      } catch {
        try {
          const text = await ctxResponse.clone().text();
          if (text) serverMessage = text.slice(0, 300);
        } catch { /* ignore */ }
      }
    }
    throw new Error(serverMessage || error.message || "Direct Replicate enhancement failed.");
  }
  if (!data || data.error) {
    throw new Error(data?.error || "Direct Replicate enhancement failed.");
  }
  if (!data.upscaled_image_url) {
    throw new Error("Replicate enhancement returned no image.");
  }

  return {
    upscaledImageUrl: data.upscaled_image_url,
    storagePath: data.storage_path ?? null,
    width: typeof data.width === "number" ? data.width : null,
    height: typeof data.height === "number" ? data.height : null,
    method: data.method ?? input.method,
    scale: typeof data.scale === "number" ? data.scale : (input.scale ?? 4),
    provider: data.provider ?? "replicate/real-esrgan",
  };
}

