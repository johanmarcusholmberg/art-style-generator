import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compilePrompt, corsHeaders } from "../_shared/prompt-compiler.ts";

// ── Concurrency control ──

const CONCURRENCY_FAST = 5;
const CONCURRENCY_QUALITY = 3;

const VARIATION_INSTRUCTIONS = [
  "alternate composition angle",
  "different lighting direction",
  "slight perspective shift",
  "variation in framing and cropping",
  "different focal emphasis",
];

/**
 * Process items with a concurrency-limited pool.
 */
async function runPool(
  items: any[],
  concurrency: number,
  worker: (item: any, index: number) => Promise<void>,
  shouldStop: () => Promise<boolean>,
) {
  let nextIdx = 0;
  let activeCount = 0;
  let resolve: () => void;
  const done = new Promise<void>((r) => { resolve = r; });

  async function startNext() {
    while (nextIdx < items.length && activeCount < concurrency) {
      if (await shouldStop()) { if (activeCount === 0) resolve!(); return; }

      const idx = nextIdx++;
      activeCount++;

      worker(items[idx], idx).finally(() => {
        activeCount--;
        if (nextIdx >= items.length && activeCount === 0) {
          resolve!();
        } else {
          startNext();
        }
      });
    }
    if (nextIdx >= items.length && activeCount === 0) resolve!();
  }

  await startNext();
  await done;
}

/** Sync job counters from items. */
async function syncJobCounters(supabase: any, jobId: string) {
  const { data: allItems } = await supabase
    .from("generation_job_items")
    .select("status")
    .eq("job_id", jobId);
  if (!allItems) return;

  const completed = allItems.filter((it: any) => it.status === "completed").length;
  const failed = allItems.filter((it: any) => it.status === "failed").length;

  await supabase
    .from("generation_jobs")
    .update({ completed_images: completed, failed_images: failed, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobId } = await req.json();
    if (!jobId) return new Response(JSON.stringify({ error: "Missing jobId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing environment variables");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: job, error: jobError } = await supabase.from("generation_jobs").select("*").eq("id", jobId).single();
    if (jobError || !job) return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (job.status === "cancelled" || job.status === "completed") {
      return new Response(JSON.stringify({ status: job.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase
      .from("generation_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", ["queued", "processing"]);

    const { data: items } = await supabase
      .from("generation_job_items")
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "queued")
      .order("created_at");

    if (!items || items.length === 0) {
      await syncJobCounters(supabase, jobId);
      const { data: finalItems } = await supabase.from("generation_job_items").select("status").eq("job_id", jobId);
      const allDone = finalItems?.every((it: any) => it.status === "completed" || it.status === "failed" || it.status === "cancelled");
      if (allDone) {
        const failed = finalItems?.filter((it: any) => it.status === "failed").length || 0;
        const finalStatus = failed === finalItems?.length ? "failed" : "completed";
        await supabase.from("generation_jobs").update({ status: finalStatus, updated_at: new Date().toISOString() }).eq("id", jobId);
      }
      return new Response(JSON.stringify({ status: "completed", message: "No queued items" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const model = job.speed_mode === "fast" ? "google/gemini-3.1-flash-image-preview" : "google/gemini-3-pro-image-preview";
    const concurrency = job.speed_mode === "fast" ? CONCURRENCY_FAST : CONCURRENCY_QUALITY;

    // Debounced counter sync
    let syncPending = false;
    let lastSyncTime = 0;
    const debouncedSync = async () => {
      const now = Date.now();
      if (now - lastSyncTime < 2000) {
        if (!syncPending) {
          syncPending = true;
          setTimeout(async () => {
            syncPending = false;
            lastSyncTime = Date.now();
            await syncJobCounters(supabase, jobId);
          }, 2000);
        }
        return;
      }
      lastSyncTime = now;
      await syncJobCounters(supabase, jobId);
    };

    // Cache cancellation status
    let cancelledCache = false;
    let lastCancelCheck = 0;
    const checkCancelled = async (): Promise<boolean> => {
      if (cancelledCache) return true;
      const now = Date.now();
      if (now - lastCancelCheck < 3000) return cancelledCache;
      lastCancelCheck = now;
      const { data } = await supabase.from("generation_jobs").select("status").eq("id", jobId).single();
      cancelledCache = data?.status === "cancelled";
      return cancelledCache;
    };

    const processItem = async (item: any, itemIndex: number) => {
      if (await checkCancelled()) return;

      const { data: transitioned } = await supabase
        .from("generation_job_items")
        .update({ status: "generating", updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", "queued")
        .select("id");

      if (!transitioned || transitioned.length === 0) return;

      try {
        const mode = item.style || job.mode;

        // Use the shared prompt compiler instead of manual prompt building
        const fullPrompt = compilePrompt(item.prompt_variant, mode, {
          aspectRatio: job.aspect_ratio,
          backgroundStyle: job.background_style,
          variationIndex: itemIndex,
        });

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: fullPrompt }],
            modalities: ["image", "text"],
          }),
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          throw new Error(`AI gateway ${aiResponse.status}: ${errText.slice(0, 200)}`);
        }

        const aiData = await aiResponse.json();
        const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (!imageUrl) throw new Error("No image generated");

        let finalImageUrl = imageUrl;
        // Always run upscale pipeline for maximum quality
        try {
          const upRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-pro-image-preview",
              messages: [{
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: imageUrl } },
                  { type: "text", text: `CRITICAL UPSCALING AND ENHANCEMENT: Sharpen all edges, enhance textures, increase clarity and resolution to maximum quality. Apply subtle denoising to remove compression artifacts. Do NOT change subject, style, composition, or colors. Do NOT crop or reframe. Do NOT alter any borders or frames within the artwork. Do NOT trim, fade, or soften any detail near image edges. All intentional inner borders, edge lines, and frame-like details must be preserved exactly. Maintain ${job.aspect_ratio} aspect ratio. Output must be suitable for large-format print at 300 DPI.` },
                ],
              }],
              modalities: ["image", "text"],
            }),
          });
          if (upRes.ok) {
            const upData = await upRes.json();
            const enhanced = upData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (enhanced) finalImageUrl = enhanced;
          }
        } catch { /* skip upscale on error — use original */ }

        // Upload + gallery save
        const filename = `${mode}-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const base64Data = finalImageUrl.split(",")[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        const { error: uploadError } = await supabase.storage
          .from("generated-images")
          .upload(filename, bytes.buffer, { contentType: "image/png" });
        if (uploadError) throw new Error("Failed to save image to storage");

        const { data: galleryRow } = await supabase
          .from("generated_images")
          .insert({
            prompt: item.prompt_variant,
            mode,
            aspect_ratio: job.aspect_ratio,
            print_size: job.print_size,
            storage_path: filename,
            quality_mode: job.speed_mode === "fast" ? "web" : "quality",
            target_ppi: job.target_ppi || null,
            target_width_px: job.target_width_px || null,
            target_height_px: job.target_height_px || null,
            enhanced: job.hd_enhance || false,
          })
          .select("id")
          .single();

        await supabase
          .from("generation_job_items")
          .update({
            status: "completed",
            image_url: finalImageUrl,
            storage_path: filename,
            gallery_image_id: galleryRow?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("status", "generating");

        await debouncedSync();
      } catch (err: any) {
        console.error(`Item ${item.id} failed:`, err.message);
        await supabase
          .from("generation_job_items")
          .update({
            status: "failed",
            error_message: err.message || "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .in("status", ["queued", "generating"]);

        await debouncedSync();
      }
    };

    await runPool(items, concurrency, processItem, checkCancelled);

    // Final accurate counter sync + status
    if (!cancelledCache) {
      await syncJobCounters(supabase, jobId);

      const { data: finalItems } = await supabase
        .from("generation_job_items")
        .select("status")
        .eq("job_id", jobId);

      const completed = finalItems?.filter((it: any) => it.status === "completed").length || 0;
      const failed = finalItems?.filter((it: any) => it.status === "failed").length || 0;
      const total = finalItems?.length || 0;
      const finalStatus = completed + failed >= total
        ? (failed === total ? "failed" : "completed")
        : "processing";

      await supabase
        .from("generation_jobs")
        .update({
          status: finalStatus,
          completed_images: completed,
          failed_images: failed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    return new Response(
      JSON.stringify({ status: "completed", message: "Batch processing finished" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("batch-generate error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
