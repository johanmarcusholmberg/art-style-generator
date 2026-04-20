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

async function uploadEnhancedFromUrl(
  remoteUrl: string,
): Promise<{ filename: string; publicUrl: string } | null> {
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) {
      console.error("[webhook] failed to download output:", res.status);
      return null;
    }
    const blob = await res.blob();
    const filename = `enh-${Date.now()}.png`;
    const { error } = await supabase.storage
      .from("generated-images")
      .upload(filename, blob, { contentType: "image/png" });
    if (error) {
      console.error("[webhook] upload error:", error);
      return null;
    }
    const { data } = supabase.storage.from("generated-images").getPublicUrl(filename);
    return { filename, publicUrl: data.publicUrl };
  } catch (err) {
    console.error("[webhook] uploadEnhancedFromUrl error:", err);
    return null;
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

      // Pipeline metadata stored on the job (e.g. provider, scale, supir flags)
      const pipeline = (job.pipeline as Record<string, unknown>) || {};
      const provider = (pipeline.provider as string) || "replicate";
      const scale = (pipeline.scale as number) || 4;

      // For print_plus we may want to chain SUPIR after ESRGAN. The job row's
      // `pipeline.next` field tells us what to do after this stage.
      const next = pipeline.next as string | undefined;
      const upload = await uploadEnhancedFromUrl(outputUrl);

      if (next === "supir_refine" && upload) {
        // Stage 1 of print_plus done (ESRGAN). Now create stage 2 (SUPIR).
        const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");
        if (!replicateToken) {
          await supabase
            .from("upscale_jobs")
            .update({
              status: "failed",
              error_message: "REPLICATE_API_TOKEN not configured for SUPIR stage",
              finished_at: new Date().toISOString(),
            })
            .eq("id", jobToken);
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
        }

        // Webhook URL for stage 2 reuses the same job id.
        const webhookUrl =
          `${SUPABASE_URL}/functions/v1/upscale-webhook?token=${jobToken}`;

        try {
          const supirRes = await fetch("https://api.replicate.com/v1/predictions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${replicateToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              version: "2267e729dcfa0b7f5e6b5e7e5d7e4d5b3c2a1d0e9f8a7b6c5d4e3f2a1b0c9d8e",
              input: {
                image: upload.publicUrl,
                upscale: 1,
                a_prompt:
                  "cinematic, hyper detailed, highest quality, masterpiece, intricate detail, clean edges",
                n_prompt:
                  "painting, oil painting, illustration, drawing, art, sketch, anime, cartoon, cgi, render, 3d, blurry, deformed, disfigured, low quality, jpeg artifacts",
                edm_steps: 30,
                s_stage1: -1,
                s_stage2: 1,
                s_cfg: 7.5,
                s_churn: 5,
                s_noise: 1.003,
                color_fix_type: "Wavelet",
                linear_CFG: true,
                linear_s_stage2: false,
                spt_linear_CFG: 4,
                spt_linear_s_stage2: 0,
              },
              webhook: webhookUrl,
              webhook_events_filter: ["completed"],
            }),
          });

          if (!supirRes.ok) {
            const txt = await supirRes.text();
            console.error("[webhook] SUPIR stage create failed:", supirRes.status, txt);
            // Fallback: keep the ESRGAN result as the final output.
            await supabase
              .from("upscale_jobs")
              .update({
                status: "succeeded",
                output_url: upload.publicUrl,
                pipeline: {
                  ...pipeline,
                  next: undefined,
                  esrganIntermediateUrl: upload.publicUrl,
                  supirAttempted: true,
                  supirSucceeded: false,
                  refineFailed: true,
                },
                finished_at: new Date().toISOString(),
              })
              .eq("id", jobToken);

            // Persist ESRGAN result on the gallery image
            if (job.image_id) {
              await persistEnhancedAsset(job.image_id, upload.filename, provider, scale, job.mode);
            }
            return new Response(JSON.stringify({ ok: true, fallback: true }), { status: 200, headers: corsHeaders });
          }

          const supirJson = await supirRes.json();
          await supabase
            .from("upscale_jobs")
            .update({
              status: "processing",
              replicate_prediction_id: supirJson.id,
              pipeline: {
                ...pipeline,
                next: undefined, // stage 2 is the final step
                esrganIntermediateUrl: upload.publicUrl,
                supirAttempted: true,
              },
            })
            .eq("id", jobToken);
          return new Response(JSON.stringify({ ok: true, stage: "supir_started" }), { status: 200, headers: corsHeaders });
        } catch (err) {
          console.error("[webhook] SUPIR stage error:", err);
          // Fallback: keep ESRGAN result.
          await supabase
            .from("upscale_jobs")
            .update({
              status: "succeeded",
              output_url: upload.publicUrl,
              pipeline: { ...pipeline, refineFailed: true },
              finished_at: new Date().toISOString(),
            })
            .eq("id", jobToken);
          if (job.image_id) {
            await persistEnhancedAsset(job.image_id, upload.filename, provider, scale, job.mode);
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
        }
      }

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
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
      }

      if (job.image_id) {
        await persistEnhancedAsset(job.image_id, upload.filename, provider, scale, job.mode);
      }

      const supirSucceeded = pipeline.supirAttempted === true; // we only set this when SUPIR ran; if it ran and we got here, it succeeded
      await supabase
        .from("upscale_jobs")
        .update({
          status: "succeeded",
          output_url: upload.publicUrl,
          pipeline: {
            ...pipeline,
            supirSucceeded: supirSucceeded || undefined,
            finalAsset: upload.filename,
          },
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobToken);

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
) {
  const { data: existing } = await supabase
    .from("generated_images")
    .select("storage_path, original_storage_path")
    .eq("id", imageId)
    .maybeSingle();

  const originalPath =
    (existing as any)?.original_storage_path || (existing as any)?.storage_path || null;

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
    } as any)
    .eq("id", imageId);
}
