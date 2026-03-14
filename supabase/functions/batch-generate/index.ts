import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Structured style rules for each mode
const STYLE_CONFIGS: Record<string, { style: string[]; composition: string[]; color: string[]; quality: string[]; avoid: string[] }> = {
  japanese: {
    style: ["traditional Japanese ukiyo-e woodblock print", "flat color areas with bold black outlines", "sumi ink details", "Edo period aesthetic"],
    composition: ["asymmetric balance", "foreground/middle/background layers", "dramatic negative space"],
    color: ["limited palette of 5-8 traditional pigment colors", "no gradients — flat blocks only"],
    quality: ["museum-quality woodblock print", "crisp registration", "high detail", "sharp edges", "no artifacts"],
    avoid: ["photorealism", "soft gradients", "any text or script"],
  },
  freestyle: {
    style: ["ukiyo-e woodblock print style applied to any subject", "flat colors with bold outlines", "sumi ink details"],
    composition: ["centered or asymmetric balance", "clear subject with defined background"],
    color: ["rich limited traditional palette", "flat color blocks"],
    quality: ["museum-quality reproduction", "crisp lines", "high detail", "sharp edges", "no artifacts"],
    avoid: ["photorealism", "gradients", "any text or script"],
  },
  popart: {
    style: ["bold pop art", "Ben-Day dots", "thick black outlines", "flat high-contrast colors", "comic book aesthetic"],
    composition: ["strong central subject", "graphic poster layout", "clear figure-ground separation"],
    color: ["vibrant saturated CMYK palette", "high contrast", "no subtle tones"],
    quality: ["crisp halftone dots", "clean outlines", "professional screen-print quality", "high detail", "no artifacts"],
    avoid: ["photorealism", "soft pastels", "gradients", "any text or script"],
  },
  "popart-freestyle": {
    style: ["pop art visual style", "Ben-Day dots, thick outlines, vivid colors", "comic book aesthetics"],
    composition: ["graphic composition", "strong central focus"],
    color: ["vibrant saturated colors", "high contrast bold palette"],
    quality: ["clean outlines", "crisp details", "high detail", "no artifacts"],
    avoid: ["photorealism", "soft shading", "any text or script"],
  },
  lineart: {
    style: ["fine pen-and-ink illustration", "hatching and cross-hatching", "varying line weights", "engraving quality"],
    composition: ["detailed focal subject", "depth through line density", "balanced space"],
    color: ["black ink on white only — monochrome", "tonal range through line density"],
    quality: ["botanical precision", "consistent line quality", "high detail", "sharp edges", "no artifacts"],
    avoid: ["color fills", "solid black areas", "cartoon style", "any text or script"],
  },
  "lineart-freestyle": {
    style: ["fine pen-and-ink line art", "delicate ink lines with hatching", "varying weights"],
    composition: ["clear subject with detail", "depth through line density"],
    color: ["black ink on white — monochrome"],
    quality: ["consistent crisp linework", "fine detail", "high detail", "no artifacts"],
    avoid: ["color", "cartoon style", "any text or script"],
  },
  "lineart-minimal": {
    style: ["ultra-minimal continuous line drawing", "fewest lines possible", "single-weight thin black line", "Picasso single-line inspiration"],
    composition: ["centered with maximum negative space", "every line essential"],
    color: ["single black line on white — nothing else"],
    quality: ["smooth continuous line", "elegant confident strokes", "high detail", "no artifacts"],
    avoid: ["multiple line weights", "shading", "unnecessary detail", "any text or script"],
  },
  minimalism: {
    style: ["clean geometric minimalist illustration", "Scandinavian/Swiss design", "precise vector-like edges", "flat design"],
    composition: ["centered or rule-of-thirds", "generous negative space", "perfectly balanced"],
    color: ["limited 2-3 muted colors", "no gradients", "high contrast"],
    quality: ["pixel-perfect edges", "professional poster quality", "high detail", "no artifacts"],
    avoid: ["clip-art", "visual clutter", "excessive detail", "more than 4 colors", "any text"],
  },
  "minimalism-freestyle": {
    style: ["minimalist art with clean simplified forms", "geometric shapes", "flat design"],
    composition: ["generous negative space", "balanced minimal layout"],
    color: ["limited muted palette of 2-4 colors"],
    quality: ["precise clean edges", "high detail", "no artifacts"],
    avoid: ["visual clutter", "excessive detail", "any text"],
  },
  graffiti: {
    style: ["urban street art graffiti", "spray paint with drips", "bold outlines", "stencil elements", "Banksy/KAWS inspired"],
    composition: ["dynamic asymmetric layout", "subject fills frame", "layered depth"],
    color: ["neon saturated spray paint colors", "fluorescent accents", "color bleeding"],
    quality: ["realistic spray paint texture", "authentic wall texture", "high detail", "no artifacts"],
    avoid: ["clean digital look", "soft pastels", "formal composition", "any readable text"],
  },
  "graffiti-freestyle": {
    style: ["graffiti street art style", "spray paint effects", "urban energy"],
    composition: ["dynamic energetic layout"],
    color: ["vibrant neon tones", "spray paint palette"],
    quality: ["authentic spray texture", "high detail", "no artifacts"],
    avoid: ["clean digital aesthetic", "muted tones", "any text"],
  },
  botanical: {
    style: ["scientific botanical illustration", "Redouté/Haeckel tradition", "watercolor with ink outlines", "accurate botanical detail"],
    composition: ["specimen-style centered", "multiple views if appropriate"],
    color: ["soft natural watercolor palette", "transparent layered washes"],
    quality: ["museum-quality natural history art", "delicate brushwork", "fine ink detail", "high detail", "no artifacts"],
    avoid: ["photorealism", "digital gradients", "any text or labels", "cartoonish plants"],
  },
  "botanical-freestyle": {
    style: ["botanical watercolor illustration", "scientific accuracy with artistic flair", "delicate washes and ink outlines"],
    composition: ["elegant natural arrangement"],
    color: ["natural watercolor palette", "transparent washes"],
    quality: ["museum-quality art", "fine detail", "high detail", "no artifacts"],
    avoid: ["photorealism", "any text or labels"],
  },
};

function buildPrompt(prompt: string, mode: string, backgroundStyle: string, aspectRatio: string): string {
  const config = STYLE_CONFIGS[mode];
  const cream = backgroundStyle === "cream";
  const bg = cream ? "Use a warm cream/off-white paper background." : "The background MUST be pure white (#FFFFFF).";
  const ratio = aspectRatio ? `The image must have a ${aspectRatio} aspect ratio.` : "";

  if (!config) {
    return [`SUBJECT: ${prompt}`, "", "QUALITY: high detail, professional illustration, sharp edges, no artifacts, print-ready", "", bg, ratio, "Generate at maximum resolution."].filter(Boolean).join("\n");
  }

  return [
    `SUBJECT: ${prompt}`,
    "",
    `STYLE: ${config.style.join(". ")}`,
    `COMPOSITION: ${config.composition.join(". ")}`,
    `COLOR: ${config.color.join(". ")}`,
    `QUALITY: ${config.quality.join(". ")}`,
    `AVOID: ${config.avoid.join(". ")}`,
    "",
    bg,
    ratio,
    "Generate at maximum resolution with fine detail suitable for large format printing.",
  ].filter(Boolean).join("\n");
}

const PARALLEL_WORKERS = 3;

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
    if (job.status === "cancelled") return new Response(JSON.stringify({ status: "cancelled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    await supabase.from("generation_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", jobId);

    const { data: items } = await supabase.from("generation_job_items").select("*").eq("job_id", jobId).eq("status", "queued").order("created_at");

    if (!items || items.length === 0) {
      await supabase.from("generation_jobs").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", jobId);
      return new Response(JSON.stringify({ status: "completed", message: "No items to process" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const processItem = async (item: any) => {
      const { data: currentJob } = await supabase.from("generation_jobs").select("status").eq("id", jobId).single();
      if (currentJob?.status === "cancelled") return;

      await supabase.from("generation_job_items").update({ status: "generating", updated_at: new Date().toISOString() }).eq("id", item.id);

      try {
        const mode = item.style || job.mode;
        const fullPrompt = buildPrompt(item.prompt_variant, mode, job.background_style, job.aspect_ratio);

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: job.speed_mode === "fast" ? "google/gemini-3.1-flash-image-preview" : "google/gemini-3-pro-image-preview",
            messages: [{ role: "user", content: fullPrompt }],
            modalities: ["image", "text"],
          }),
        });

        if (!aiResponse.ok) { const errText = await aiResponse.text(); throw new Error(`AI gateway ${aiResponse.status}: ${errText.slice(0, 200)}`); }

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

        const filename = `${mode}-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const base64Data = finalImageUrl.split(",")[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        const { error: uploadError } = await supabase.storage.from("generated-images").upload(filename, bytes.buffer, { contentType: "image/png" });
        if (uploadError) throw new Error("Failed to save image to storage");

        const { data: galleryRow, error: dbError } = await supabase.from("generated_images").insert({ prompt: item.prompt_variant, mode, aspect_ratio: job.aspect_ratio, print_size: job.print_size, storage_path: filename }).select("id").single();
        if (dbError) console.error("DB error:", dbError);

        await supabase.from("generation_job_items").update({ status: "completed", image_url: finalImageUrl, storage_path: filename, gallery_image_id: galleryRow?.id || null, updated_at: new Date().toISOString() }).eq("id", item.id);
      } catch (err: any) {
        console.error(`Item ${item.id} failed:`, err.message);
        await supabase.from("generation_job_items").update({ status: "failed", error_message: err.message || "Unknown error", updated_at: new Date().toISOString() }).eq("id", item.id);
      }
    };

    for (let i = 0; i < items.length; i += PARALLEL_WORKERS) {
      const { data: checkJob } = await supabase.from("generation_jobs").select("status").eq("id", jobId).single();
      if (checkJob?.status === "cancelled") break;

      const batch = items.slice(i, i + PARALLEL_WORKERS);
      await Promise.allSettled(batch.map(processItem));

      const { data: updatedItems } = await supabase.from("generation_job_items").select("status").eq("job_id", jobId);
      if (updatedItems) {
        const completed = updatedItems.filter((it: any) => it.status === "completed").length;
        const failed = updatedItems.filter((it: any) => it.status === "failed").length;
        await supabase.from("generation_jobs").update({ completed_images: completed, failed_images: failed, updated_at: new Date().toISOString() }).eq("id", jobId);
      }
    }

    const { data: finalItems } = await supabase.from("generation_job_items").select("status").eq("job_id", jobId);
    const { data: finalJob } = await supabase.from("generation_jobs").select("status").eq("id", jobId).single();

    if (finalJob?.status !== "cancelled") {
      const completed = finalItems?.filter((it: any) => it.status === "completed").length || 0;
      const failed = finalItems?.filter((it: any) => it.status === "failed").length || 0;
      const finalStatus = failed === finalItems?.length ? "failed" : "completed";
      await supabase.from("generation_jobs").update({ status: finalStatus, completed_images: completed, failed_images: failed, updated_at: new Date().toISOString() }).eq("id", jobId);
    }

    return new Response(JSON.stringify({ status: "done" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("batch-generate error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
