// Replicate webhook receiver for async upscale jobs.
//
// Replicate POSTs prediction status updates here as predictions move through
// `starting → processing → succeeded | failed | canceled`. We match the
// prediction back to its `upscale_jobs` row and:
//   - update job status / error
//   - on success: download the output, persist as the enhanced asset on
//     the gallery image, and write output_url + finished_at to the job.
//
// Auth model: this fn is public (verify_jwt=false in config.toml) — the
// match key is the prediction id which is unguessable. We additionally
// require `?token=<id>` to match the job's id, which Replicate echoes back
// from the webhook URL we registered.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Read PNG IHDR width/height from a byte buffer. Returns null on non-PNG. */
function readPngDims(buf: Uint8Array): { width: number; height: number } | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A; IHDR width/height at bytes 16..23
  if (
    buf.length < 24 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    return null;
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function uploadEnhancedFromUrl(
  remoteUrl: string,
): Promise<
  | {
      filename: string;
      publicUrl: string;
      width: number | null;
      height: number | null;
    }
  | null
> {
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) {
      console.error("[webhook] failed to download output:", res.status);
      return null;
    }
    const arrayBuf = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    const dims = readPngDims(bytes);
    const blob = new Blob([bytes], { type: "image/png" });
    const filename = `enh-${Date.now()}.png`;
    const { error } = await supabase.storage
      .from("generated-images")
      .upload(filename, blob, { contentType: "image/png" });
    if (error) {
      console.error("[webhook] upload error:", error);
      return null;
    }
    const { data } = supabase.storage.from("generated-images").getPublicUrl(filename);
    return {
      filename,
      publicUrl: data.publicUrl,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    };
  } catch (err) {
    console.error("[webhook] uploadEnhancedFromUrl error:", err);
    return null;
  }
}

/** Coarse upscale cost map — mirrors src/lib/admin-asset-cost.ts. */
const UPSCALE_COST_BY_KEY: Record<string, number> = {
  realesrgan: 0.0023,
  realesrgan_4x: 0.0023,
  supir: 0.05,
  print_plus: 0.05,
  tile_4x: 0.04,
  tile_8x: 0.08,
};
function estimateUpscaleCost(mode: string | null | undefined): number | null {
  const k = (mode || "").toLowerCase();
  if (!k) return null;
  for (const key of Object.keys(UPSCALE_COST_BY_KEY)) {
    if (k.includes(key)) return UPSCALE_COST_BY_KEY[key];
  }
  return null;
}

const FORMAT_50x70_WIN = 50 / 2.54;
const FORMAT_50x70_HIN = 70 / 2.54;
function classifyReadiness(
  w: number | null | undefined,
  h: number | null | undefined,
): { level: string; ppi: number | null } {
  if (!w || !h) return { level: "unknown", ppi: null };
  const ppi = Math.round(Math.min(w / FORMAT_50x70_WIN, h / FORMAT_50x70_HIN));
  if (ppi >= 280) return { level: "ready-300", ppi };
  if (ppi >= 140) return { level: "ready-150", ppi };
  if (ppi >= 90) return { level: "soft", ppi };
  return { level: "too-small", ppi };
}

/**
 * Record (or update) an asset_cost_events row for an async upscale.
 *
 * Duplicate-prevention: if a recent (≤2h) event for the same
 * (generated_image_id, event_type='upscale', mode) exists with a matching
 * job_id OR no job_id at all, we UPDATE it. Otherwise we INSERT a new row.
 *
 * Service role bypasses RLS (admin-only insert policy) safely.
 */
async function recordUpscaleCostEvent(opts: {
  imageId: string;
  jobId: string;
  mode: string;
  provider: string;
  status: "succeeded" | "failed";
  estimatedCost: number | null;
  metadata: Record<string, unknown>;
}) {
  try {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("asset_cost_events")
      .select("id, metadata")
      .eq("generated_image_id", opts.imageId)
      .eq("event_type", "upscale")
      .eq("mode", opts.mode)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);

    const match =
      (existing || []).find((e: any) => {
        const j = e.metadata?.job_id;
        return !j || j === opts.jobId;
      }) || null;

    const mergedMetadata = {
      ...(match?.metadata || {}),
      ...opts.metadata,
      job_id: opts.jobId,
      source: "webhook",
    };

    if (match) {
      await supabase
        .from("asset_cost_events")
        .update({
          status: opts.status,
          provider: opts.provider,
          model: opts.provider,
          estimated_cost:
            opts.status === "succeeded" ? opts.estimatedCost : null,
          metadata: mergedMetadata,
        } as any)
        .eq("id", match.id);
    } else {
      await supabase.from("asset_cost_events").insert({
        generated_image_id: opts.imageId,
        event_type: "upscale",
        provider: opts.provider,
        model: opts.provider,
        mode: opts.mode,
        estimated_cost:
          opts.status === "succeeded" ? opts.estimatedCost : null,
        currency: "USD",
        status: opts.status,
        metadata: mergedMetadata,
      } as any);
    }
  } catch (err) {
    console.warn("[webhook] cost event record failed:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const jobToken = url.searchParams.get("token");
    if (!jobToken) {
      return new Response(JSON.stringify({ error: "Missing job token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    const status = payload.status as string | undefined;
    const predictionId = payload.id as string | undefined;
    const output = payload.output;
    const errorMsg = payload.error as string | undefined;

    console.log(
      `[webhook] job=${jobToken} prediction=${predictionId} status=${status}`,
    );

    // Look up the job. Match on either the job id or prediction id for safety.
    const { data: job, error: jobErr } = await supabase
      .from("upscale_jobs")
      .select("id, image_id, mode, source_url, pipeline, status")
      .eq("id", jobToken)
      .maybeSingle();

    if (jobErr || !job) {
      console.error("[webhook] job not found:", jobToken, jobErr);
      return new Response(JSON.stringify({ ok: false, error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ignore stale webhooks for already-finished jobs.
    if (job.status === "succeeded" || job.status === "failed") {
      console.log(`[webhook] job ${jobToken} already ${job.status}, ignoring`);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "starting" || status === "processing") {
      await supabase
        .from("upscale_jobs")
        .update({
          status: "processing",
          replicate_prediction_id: predictionId ?? null,
          started_at: job.status === "queued" ? new Date().toISOString() : undefined,
        })
        .eq("id", jobToken);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "failed" || status === "canceled") {
      await supabase
        .from("upscale_jobs")
        .update({
          status: status === "canceled" ? "cancelled" : "failed",
          error_message: errorMsg || `Replicate prediction ${status}`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobToken);
      if (job.image_id) {
        const pipeline = (job.pipeline as Record<string, unknown>) || {};
        await recordUpscaleCostEvent({
          imageId: job.image_id,
          jobId: jobToken,
          mode: job.mode,
          provider: (pipeline.provider as string) || "replicate",
          status: "failed",
          estimatedCost: null,
          metadata: {
            error: errorMsg || `Replicate prediction ${status}`,
            completed_at: new Date().toISOString(),
          },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "succeeded") {
      const outputUrl = Array.isArray(output) ? output[0] : output;
      if (!outputUrl || typeof outputUrl !== "string") {
        await supabase
          .from("upscale_jobs")
          .update({
            status: "failed",
            error_message: "Replicate succeeded but no output URL",
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobToken);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Pipeline metadata stored on the job (e.g. provider, scale)
      const pipeline = (job.pipeline as Record<string, unknown>) || {};
      const provider = (pipeline.provider as string) || "replicate";
      const scale = (pipeline.scale as number) || 4;

      // SUPIR / print_plus stage-2 chaining was removed in 2025-Q4. If we
      // ever encounter a legacy `pipeline.next === "supir_refine"` from a
      // job created before the migration, we no-op the chain and treat the
      // ESRGAN result as the final output (graceful read-only fallback).
      const upload = await uploadEnhancedFromUrl(outputUrl);


      // Final stage (or single-stage modes): persist as enhanced asset.
      if (!upload) {
        await supabase
          .from("upscale_jobs")
          .update({
            status: "failed",
            error_message: "Failed to download/upload Replicate output",
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobToken);
        if (job.image_id) {
          await recordUpscaleCostEvent({
            imageId: job.image_id,
            jobId: jobToken,
            mode: job.mode,
            provider,
            status: "failed",
            estimatedCost: null,
            metadata: {
              error: "Failed to download/upload Replicate output",
              completed_at: new Date().toISOString(),
            },
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
      }

      let persisted:
        | Awaited<ReturnType<typeof persistEnhancedAsset>>
        | null = null;
      if (job.image_id) {
        persisted = await persistEnhancedAsset(
          job.image_id,
          upload.filename,
          provider,
          scale,
          job.mode,
          { width: upload.width, height: upload.height },
        );
      }

      await supabase
        .from("upscale_jobs")
        .update({
          status: "succeeded",
          output_url: upload.publicUrl,
          pipeline: {
            ...pipeline,
            finalAsset: upload.filename,
          },
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobToken);

      if (job.image_id) {
        const newReadiness = classifyReadiness(upload.width, upload.height);
        await recordUpscaleCostEvent({
          imageId: job.image_id,
          jobId: jobToken,
          mode: job.mode,
          provider,
          status: "succeeded",
          estimatedCost: estimateUpscaleCost(job.mode),
          metadata: {
            label: job.mode,
            scale,
            completed_at: new Date().toISOString(),
            previous_dimensions:
              persisted && persisted.prevDims.width
                ? persisted.prevDims
                : null,
            new_dimensions:
              upload.width && upload.height
                ? { width: upload.width, height: upload.height }
                : null,
            previous_print_readiness: persisted?.prevReadiness ?? "unknown",
            new_print_readiness: newReadiness.level,
            effective_ppi: newReadiness.ppi,
          },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[webhook] fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Persist enhanced asset onto the gallery image record (mirrors src/lib/gallery.ts updateEnhancedAsset). */
async function persistEnhancedAsset(
  imageId: string,
  filename: string,
  provider: string,
  scale: number,
  mode: string,
  dims?: { width: number | null; height: number | null },
): Promise<{
  prevDims: { width: number | null; height: number | null };
  prevReadiness: string;
  printFormatId: string | null;
}> {
  const { data: existing } = await supabase
    .from("generated_images")
    .select(
      "storage_path, original_storage_path, enhanced_width_px, enhanced_height_px, actual_width_px, actual_height_px, base_width_px, base_height_px, print_format_id",
    )
    .eq("id", imageId)
    .maybeSingle();

  const ex = (existing || {}) as any;
  const originalPath =
    ex.original_storage_path || ex.storage_path || null;

  const prevW =
    ex.enhanced_width_px || ex.actual_width_px || ex.base_width_px || null;
  const prevH =
    ex.enhanced_height_px || ex.actual_height_px || ex.base_height_px || null;
  const prevReadiness = classifyReadiness(prevW, prevH).level;

  await supabase
    .from("generated_images")
    .update({
      enhanced_storage_path: filename,
      master_storage_path: filename,
      original_storage_path: originalPath,
      enhanced: true,
      upscale_applied: true,
      upscale_mode: mode,
      upscaled_at: new Date().toISOString(),
      enhancement_model: provider,
      upscale_factor: scale,
      enhanced_width_px: dims?.width ?? null,
      enhanced_height_px: dims?.height ?? null,
    } as any)
    .eq("id", imageId);

  return {
    prevDims: { width: prevW, height: prevH },
    prevReadiness,
    printFormatId: ex.print_format_id ?? null,
  };
}
