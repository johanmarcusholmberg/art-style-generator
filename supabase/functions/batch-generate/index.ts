import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STYLE_CONFIGS: Record<string, { visualGoal: string[]; styleAnchors: string[]; style: string[]; composition: string[]; color: string[]; quality: string[]; avoid: string[] }> = {
  japanese: {
    visualGoal: ["authentic museum-quality ukiyo-e woodblock print", "feels like a genuine Edo period artwork"],
    styleAnchors: ["traditional Japanese ukiyo-e woodblock print", "Hokusai and Hiroshige aesthetic"],
    style: ["flat color areas with bold black outlines", "sumi ink details", "layered depth through overlapping planes"],
    composition: ["asymmetric balance", "foreground/middle/background layers", "dramatic negative space"],
    color: ["limited palette of 5-8 traditional pigment colors", "no gradients — flat blocks only"],
    quality: ["museum-quality woodblock print", "crisp registration", "high detail", "sharp rendering", "clean edges", "no artifacts", "print-ready resolution"],
    avoid: ["photorealism", "soft gradients", "any text or script"],
  },
  freestyle: {
    visualGoal: ["ukiyo-e woodblock print applied to any subject", "premium art print aesthetic"],
    styleAnchors: ["ukiyo-e woodblock print art style", "Japanese printmaking applied to modern subjects"],
    style: ["flat colors with bold outlines", "sumi ink details", "woodblock print aesthetic"],
    composition: ["centered or asymmetric balance", "clear subject with defined background"],
    color: ["rich limited traditional palette", "flat color blocks"],
    quality: ["museum-quality reproduction", "crisp lines", "high detail", "sharp rendering", "clean edges", "no artifacts", "print-ready resolution"],
    avoid: ["photorealism", "gradients", "any text or script"],
  },
  popart: {
    visualGoal: ["bold gallery-quality pop art print", "Warhol/Lichtenstein level graphic impact"],
    styleAnchors: ["Andy Warhol screen-print aesthetic", "Roy Lichtenstein comic panel style"],
    style: ["Ben-Day dots", "thick black outlines", "flat high-contrast colors", "comic book aesthetic"],
    composition: ["strong central subject", "graphic poster layout", "clear figure-ground separation"],
    color: ["vibrant saturated CMYK palette", "high contrast", "no subtle tones"],
    quality: ["crisp halftone dots", "clean outlines", "professional screen-print quality", "high detail", "sharp rendering", "no artifacts", "print-ready resolution"],
    avoid: ["photorealism", "soft pastels", "gradients", "any text or script"],
  },
  "popart-freestyle": {
    visualGoal: ["vibrant pop art illustration with graphic punch", "street-poster quality artwork"],
    styleAnchors: ["pop art visual language", "comic book and screen-print aesthetics"],
    style: ["Ben-Day dots, thick outlines, vivid colors", "comic book aesthetics"],
    composition: ["graphic composition", "strong central focus"],
    color: ["vibrant saturated colors", "high contrast bold palette"],
    quality: ["clean outlines", "crisp details", "high detail", "sharp rendering", "no artifacts", "print-ready resolution"],
    avoid: ["photorealism", "soft shading", "any text or script"],
  },
  lineart: {
    visualGoal: ["museum-quality pen-and-ink illustration", "fine art engraving-level detail"],
    styleAnchors: ["fine pen-and-ink illustration", "Victorian engraving tradition"],
    style: ["hatching and cross-hatching", "varying line weights", "stippling", "engraving quality"],
    composition: ["detailed focal subject", "depth through line density", "balanced space"],
    color: ["black ink on white only — monochrome", "tonal range through line density"],
    quality: ["botanical precision", "consistent line quality", "high detail", "sharp rendering", "clean edges", "no artifacts", "print-ready resolution"],
    avoid: ["color fills", "solid black areas", "cartoon style", "any text or script"],
  },
  "lineart-freestyle": {
    visualGoal: ["elegant pen-and-ink artwork", "premium illustration-quality line drawing"],
    styleAnchors: ["fine pen-and-ink line art", "elegant ink illustration tradition"],
    style: ["delicate ink lines with hatching", "varying weights"],
    composition: ["clear subject with detail", "depth through line density"],
    color: ["black ink on white — monochrome"],
    quality: ["consistent crisp linework", "fine detail", "high detail", "sharp rendering", "no artifacts", "print-ready resolution"],
    avoid: ["color", "cartoon style", "any text or script"],
  },
  "lineart-minimal": {
    visualGoal: ["gallery-quality minimal line art", "Picasso single-line drawing elegance"],
    styleAnchors: ["ultra-minimal continuous line drawing", "Picasso's single-line drawings"],
    style: ["fewest lines possible", "single-weight thin black line", "one-line art style"],
    composition: ["centered with maximum negative space", "every line essential"],
    color: ["single black line on white — nothing else"],
    quality: ["smooth continuous line", "elegant confident strokes", "high detail", "sharp rendering", "no artifacts", "print-ready resolution"],
    avoid: ["multiple line weights", "shading", "unnecessary detail", "any text or script"],
  },
  minimalism: {
    visualGoal: ["elegant minimalist illustration", "premium poster aesthetic", "gallery-ready minimal art"],
    styleAnchors: ["minimalist poster design", "Scandinavian design aesthetic", "Swiss graphic design"],
    style: ["clean geometric forms", "precise vector-like edges", "flat design"],
    composition: ["centered or rule-of-thirds", "generous negative space", "perfectly balanced"],
    color: ["limited 2-4 muted colors", "no gradients", "high contrast"],
    quality: ["pixel-perfect edges", "professional poster quality", "high detail", "sharp rendering", "no artifacts", "print-ready resolution"],
    avoid: ["clip-art", "visual clutter", "excessive detail", "more than 4 colors", "any text"],
  },
  "minimalism-freestyle": {
    visualGoal: ["clean minimalist artwork", "modern design poster quality"],
    styleAnchors: ["minimalist art style", "Scandinavian design aesthetic"],
    style: ["clean simplified forms", "geometric shapes", "flat design"],
    composition: ["generous negative space", "balanced minimal layout"],
    color: ["limited muted palette of 2-4 colors"],
    quality: ["precise clean edges", "high detail", "sharp rendering", "no artifacts", "print-ready resolution"],
    avoid: ["visual clutter", "excessive detail", "any text"],
  },
  graffiti: {
    visualGoal: ["authentic urban street art mural", "gallery-quality graffiti artwork"],
    styleAnchors: ["urban street art graffiti", "Banksy/KAWS inspired", "spray paint mural tradition"],
    style: ["spray paint with drips", "bold outlines", "stencil elements"],
    composition: ["dynamic asymmetric layout", "subject fills frame", "layered depth"],
    color: ["neon saturated spray paint colors", "fluorescent accents", "color bleeding"],
    quality: ["realistic spray paint texture", "authentic wall texture", "high detail", "sharp rendering", "no artifacts", "print-ready resolution"],
    avoid: ["clean digital look", "soft pastels", "formal composition", "any readable text"],
  },
  "graffiti-freestyle": {
    visualGoal: ["vibrant street art illustration", "urban energy captured in art"],
    styleAnchors: ["graffiti and urban street art", "spray paint mural aesthetic"],
    style: ["spray paint effects", "urban energy"],
    composition: ["dynamic energetic layout"],
    color: ["vibrant neon tones", "spray paint palette"],
    quality: ["authentic spray texture", "high detail", "sharp rendering", "no artifacts", "print-ready resolution"],
    avoid: ["clean digital aesthetic", "muted tones", "any text"],
  },
  botanical: {
    visualGoal: ["museum-quality scientific botanical illustration", "natural history art collection worthy"],
    styleAnchors: ["scientific botanical illustration", "Redouté/Haeckel tradition"],
    style: ["watercolor with ink outlines", "accurate botanical detail"],
    composition: ["specimen-style centered", "multiple views if appropriate"],
    color: ["soft natural watercolor palette", "transparent layered washes"],
    quality: ["museum-quality natural history art", "delicate brushwork", "fine ink detail", "high detail", "sharp rendering", "no artifacts", "print-ready resolution"],
    avoid: ["photorealism", "digital gradients", "any text or labels", "cartoonish plants"],
  },
  "botanical-freestyle": {
    visualGoal: ["artistic botanical watercolor artwork", "elegant natural history illustration"],
    styleAnchors: ["botanical watercolor illustration", "scientific accuracy with artistic flair"],
    style: ["delicate washes and ink outlines", "scientific accuracy with artistic expression"],
    composition: ["elegant natural arrangement"],
    color: ["natural watercolor palette", "transparent washes"],
    quality: ["museum-quality art", "fine detail", "high detail", "sharp rendering", "no artifacts", "print-ready resolution"],
    avoid: ["photorealism", "any text or labels"],
  },
};

const VARIATION_INSTRUCTIONS = [
  "alternate composition angle",
  "different lighting direction",
  "slight perspective shift",
  "variation in framing and cropping",
  "different focal emphasis",
];

function buildPrompt(prompt: string, mode: string, backgroundStyle: string, aspectRatio: string, variationIndex?: number): string {
  const config = STYLE_CONFIGS[mode];
  const cream = backgroundStyle === "cream";
  const bg = cream ? "Use a warm cream/off-white paper background." : "The background MUST be pure white (#FFFFFF).";
  const ratio = aspectRatio ? `The image must have a ${aspectRatio} aspect ratio.` : "";

  if (!config) {
    return [`PRIMARY SUBJECT: ${prompt}`, "", "GLOBAL QUALITY: high detail, professional illustration, sharp rendering, clean edges, no artifacts, print-ready resolution", "", bg, ratio, "Generate at maximum resolution."].filter(Boolean).join("\n");
  }

  const variationText = variationIndex !== undefined && variationIndex > 0
    ? `\nVARIATION: Apply ${VARIATION_INSTRUCTIONS[variationIndex % VARIATION_INSTRUCTIONS.length]} while maintaining the same subject and style.`
    : "";

  return [
    `PRIMARY SUBJECT: ${prompt}`,
    "",
    `VISUAL GOAL: ${config.visualGoal.join(". ")}`,
    "",
    `STYLE ANCHORS: ${config.styleAnchors.join(". ")}`,
    "",
    `STYLE RULES: ${config.style.join(". ")}`,
    `COMPOSITION: ${config.composition.join(". ")}`,
    `COLOR: ${config.color.join(". ")}`,
    `GLOBAL QUALITY: ${config.quality.join(". ")}`,
    `AVOID: ${config.avoid.join(". ")}`,
    "",
    bg,
    ratio,
    variationText,
    "Generate at maximum resolution with fine detail suitable for large format printing.",
  ].filter(Boolean).join("\n");
}

const PARALLEL_WORKERS = 3;

/**
 * Atomically update job counters by re-counting from items.
 * This avoids race conditions when multiple workers finish simultaneously.
 */
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
    .update({
      completed_images: completed,
      failed_images: failed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/**
 * Check if job is cancelled. Used before and during processing.
 */
async function isJobCancelled(supabase: any, jobId: string): Promise<boolean> {
  const { data } = await supabase
    .from("generation_jobs")
    .select("status")
    .eq("id", jobId)
    .single();
  return data?.status === "cancelled";
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

    // Fetch job — validate it exists and is in a processable state
    const { data: job, error: jobError } = await supabase.from("generation_jobs").select("*").eq("id", jobId).single();
    if (jobError || !job) return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Only process jobs that are queued or processing (idempotent: re-invocations are safe)
    if (job.status === "cancelled" || job.status === "completed") {
      return new Response(JSON.stringify({ status: job.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Atomically set to processing — only if still queued or processing (prevents race)
    await supabase
      .from("generation_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", ["queued", "processing"]);

    // Fetch only queued items (retry-safe: already completed/failed items are skipped)
    const { data: items } = await supabase
      .from("generation_job_items")
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "queued")
      .order("created_at");

    if (!items || items.length === 0) {
      // Sync counters and finalize
      await syncJobCounters(supabase, jobId);
      const { data: finalItems } = await supabase.from("generation_job_items").select("status").eq("job_id", jobId);
      const allDone = finalItems?.every((it: any) => it.status === "completed" || it.status === "failed");
      if (allDone) {
        const failed = finalItems?.filter((it: any) => it.status === "failed").length || 0;
        const finalStatus = failed === finalItems?.length ? "failed" : "completed";
        await supabase.from("generation_jobs").update({ status: finalStatus, updated_at: new Date().toISOString() }).eq("id", jobId);
      }
      return new Response(JSON.stringify({ status: "completed", message: "No queued items to process" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const processItem = async (item: any, itemIndex: number) => {
      // Check cancellation before starting
      if (await isJobCancelled(supabase, jobId)) return;

      // Idempotent: only transition from queued → generating
      const { data: transitioned, error: transErr } = await supabase
        .from("generation_job_items")
        .update({ status: "generating", updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", "queued")
        .select("id");

      // If no rows updated, item was already picked up (duplicate invocation) — skip
      if (transErr || !transitioned || transitioned.length === 0) return;

      try {
        const mode = item.style || job.mode;
        const fullPrompt = buildPrompt(item.prompt_variant, mode, job.background_style, job.aspect_ratio, itemIndex);

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: job.speed_mode === "fast" ? "google/gemini-3.1-flash-image-preview" : "google/gemini-3-pro-image-preview",
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
        if (job.hd_enhance) {
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
                    { type: "text", text: `CRITICAL UPSCALING: Sharpen edges, enhance textures, increase clarity and resolution. Do NOT change subject, style, composition, or colors. Same image but dramatically sharper. Maintain ${job.aspect_ratio} aspect ratio.` },
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
          } catch { /* skip upscale on error */ }
        }

        // Upload to storage
        const filename = `${mode}-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const base64Data = finalImageUrl.split(",")[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        const { error: uploadError } = await supabase.storage
          .from("generated-images")
          .upload(filename, bytes.buffer, { contentType: "image/png" });
        if (uploadError) throw new Error("Failed to save image to storage");

        // Save to gallery immediately — duplicate protection via unique storage_path
        const { data: galleryRow, error: dbError } = await supabase
          .from("generated_images")
          .insert({
            prompt: item.prompt_variant,
            mode,
            aspect_ratio: job.aspect_ratio,
            print_size: job.print_size,
            storage_path: filename,
          })
          .select("id")
          .single();
        if (dbError) console.error("Gallery save error:", dbError);

        // Idempotent completion: only update if still in "generating" state
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

        // Sync job counters after each item (real-time progress)
        await syncJobCounters(supabase, jobId);
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

        // Sync counters even on failure
        await syncJobCounters(supabase, jobId);
      }
    };

    // Process in parallel batches
    let globalIndex = 0;
    for (let i = 0; i < items.length; i += PARALLEL_WORKERS) {
      if (await isJobCancelled(supabase, jobId)) break;

      const batch = items.slice(i, i + PARALLEL_WORKERS);
      await Promise.allSettled(batch.map((item, batchIdx) => processItem(item, globalIndex + batchIdx)));
      globalIndex += batch.length;
    }

    // Final status determination
    if (!(await isJobCancelled(supabase, jobId))) {
      await syncJobCounters(supabase, jobId);

      const { data: finalItems } = await supabase
        .from("generation_job_items")
        .select("status")
        .eq("job_id", jobId);

      const completed = finalItems?.filter((it: any) => it.status === "completed").length || 0;
      const failed = finalItems?.filter((it: any) => it.status === "failed").length || 0;
      const finalStatus = failed === finalItems?.length ? "failed" : "completed";

      await supabase
        .from("generation_jobs")
        .update({
          status: finalStatus,
          completed_images: completed,
          failed_images: failed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .in("status", ["processing", "queued"]);
    }

    return new Response(JSON.stringify({ status: "done" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("batch-generate error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
