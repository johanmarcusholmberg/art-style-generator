import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Style prompt templates keyed by mode
const STYLE_PROMPTS: Record<string, (prompt: string, bg: string, ratio: string, frame: boolean, cream: boolean) => string> = {
  japanese: (p, bg, ratio, frame, cream) =>
    `Create a high-resolution traditional Japanese ukiyo-e woodblock print style artwork: ${p}. Style: flat colors, bold outlines, traditional Japanese composition, ${cream ? "washi paper texture" : "clean white background"}, sumi ink details.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin black frame around the illustration." : ""}`,
  freestyle: (p, bg, ratio, frame) =>
    `Create a high-resolution traditional Japanese ukiyo-e woodblock print style artwork of a non-Japanese subject: ${p}. Style: flat colors, bold outlines, woodblock aesthetic, clean composition.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin black frame." : ""}`,
  popart: (p, bg, ratio, frame) =>
    `Create a high-resolution pop art style artwork inspired by Andy Warhol and Roy Lichtenstein: ${p}. Style: bold colors, Ben-Day dots, thick black outlines, comic book aesthetics, saturated palette.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin black frame." : ""}`,
  "popart-freestyle": (p, bg, ratio, frame) =>
    `Create a high-resolution pop art style artwork: ${p}. Style: bold colors, Ben-Day dots, thick outlines, high contrast, comic aesthetics.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin black frame." : ""}`,
  lineart: (p, bg, ratio, frame) =>
    `Create a high-resolution pen and ink line art illustration: ${p}. Style: fine pen strokes, cross-hatching, detailed linework, black ink on white.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin frame." : ""}`,
  "lineart-freestyle": (p, bg, ratio, frame) =>
    `Create a high-resolution pen and ink illustration: ${p}. Style: detailed linework, fine pen strokes, ink drawing.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin frame." : ""}`,
  "lineart-minimal": (p, bg, ratio, frame) =>
    `Create a minimal line art drawing with the fewest possible lines: ${p}. Style: single continuous line, minimal strokes, elegant simplicity.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin frame." : ""}`,
  minimalism: (p, bg, ratio, frame) =>
    `Create a high-resolution minimalist artwork: ${p}. Style: clean shapes, limited color palette, generous negative space, geometric simplicity.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin frame." : ""}`,
  "minimalism-freestyle": (p, bg, ratio, frame) =>
    `Create a high-resolution minimalist artwork: ${p}. Style: clean composition, limited palette, negative space, simple forms.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin frame." : ""}`,
  graffiti: (p, bg, ratio, frame) =>
    `Create a high-resolution graffiti/street art style artwork: ${p}. Style: spray paint, bold colors, drips, urban energy, stencil effects.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin frame." : ""}`,
  "graffiti-freestyle": (p, bg, ratio, frame) =>
    `Create a high-resolution graffiti/street art artwork: ${p}. Style: spray paint, neon colors, urban aesthetic.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin frame." : ""}`,
  botanical: (p, bg, ratio, frame) =>
    `Create a high-resolution botanical illustration: ${p}. Style: scientific watercolor, detailed plant study, delicate rendering, naturalist accuracy.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin frame." : ""}`,
  "botanical-freestyle": (p, bg, ratio, frame) =>
    `Create a high-resolution botanical watercolor illustration: ${p}. Style: watercolor technique, plant study aesthetic, detailed and delicate.${bg} Generate at maximum resolution.${ratio}${frame ? " Add a thin frame." : ""}`,
};

function buildPrompt(
  prompt: string,
  mode: string,
  whiteFrame: boolean,
  backgroundStyle: string,
  aspectRatio: string
): string {
  const cream = backgroundStyle === "cream";
  const bg = cream
    ? " Use a warm cream/off-white paper background."
    : " The background MUST be pure white (#FFFFFF).";
  const ratio = aspectRatio ? ` The image must have a ${aspectRatio} aspect ratio.` : "";
  const builder = STYLE_PROMPTS[mode];
  if (builder) return builder(prompt, bg, ratio, whiteFrame, cream);
  // Fallback
  return `Create a high-resolution artwork: ${prompt}.${bg} Generate at maximum resolution.${ratio}${whiteFrame ? " Add a thin black frame." : ""}`;
}

const PARALLEL_WORKERS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return new Response(JSON.stringify({ error: "Missing jobId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch job
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.status === "cancelled") {
      return new Response(JSON.stringify({ status: "cancelled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update job to processing
    await supabase
      .from("generation_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // Fetch all queued items
    const { data: items } = await supabase
      .from("generation_job_items")
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "queued")
      .order("created_at");

    if (!items || items.length === 0) {
      await supabase
        .from("generation_jobs")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      return new Response(JSON.stringify({ status: "completed", message: "No items to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process items in parallel batches
    const processItem = async (item: any) => {
      // Check if job was cancelled
      const { data: currentJob } = await supabase
        .from("generation_jobs")
        .select("status")
        .eq("id", jobId)
        .single();

      if (currentJob?.status === "cancelled") return;

      // Update item to generating
      await supabase
        .from("generation_job_items")
        .update({ status: "generating", updated_at: new Date().toISOString() })
        .eq("id", item.id);

      try {
        const mode = item.style || job.mode;
        const fullPrompt = buildPrompt(
          item.prompt_variant,
          mode,
          job.white_frame,
          job.background_style,
          job.aspect_ratio
        );

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
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

        if (!imageUrl) {
          throw new Error("No image generated");
        }

        // Optionally upscale if HD enhance is on
        let finalImageUrl = imageUrl;
        if (job.hd_enhance) {
          try {
            const upRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-pro-image-preview",
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "image_url", image_url: { url: imageUrl } },
                      {
                        type: "text",
                        text: `Enhance this image to highest resolution. Sharpen edges, enhance textures, increase clarity. Same composition and style. Maintain ${job.aspect_ratio} aspect ratio.`,
                      },
                    ],
                  },
                ],
                modalities: ["image", "text"],
              }),
            });

            if (upRes.ok) {
              const upData = await upRes.json();
              const enhanced = upData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
              if (enhanced) finalImageUrl = enhanced;
            }
          } catch {
            // Skip upscale on error, use original
          }
        }

        // Save to gallery (auto-save)
        const filename = `${mode}-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;

        // Convert base64 to blob for upload
        const base64Data = finalImageUrl.split(",")[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const { error: uploadError } = await supabase.storage
          .from("generated-images")
          .upload(filename, bytes.buffer, { contentType: "image/png" });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          throw new Error("Failed to save image to storage");
        }

        // Save to generated_images table
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

        if (dbError) {
          console.error("DB error:", dbError);
        }

        // Update item as completed
        await supabase
          .from("generation_job_items")
          .update({
            status: "completed",
            image_url: finalImageUrl,
            storage_path: filename,
            gallery_image_id: galleryRow?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        // Increment completed count
        await supabase.rpc("increment_job_completed", { job_id: jobId }).catch(() => {
          // Fallback: manual update
          supabase
            .from("generation_jobs")
            .update({
              completed_images: (job.completed_images || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        });
      } catch (err: any) {
        console.error(`Item ${item.id} failed:`, err.message);
        await supabase
          .from("generation_job_items")
          .update({
            status: "failed",
            error_message: err.message || "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        // Increment failed count
        await supabase
          .from("generation_jobs")
          .update({
            failed_images: job.failed_images + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
    };

    // Process in parallel batches of PARALLEL_WORKERS
    for (let i = 0; i < items.length; i += PARALLEL_WORKERS) {
      // Check cancellation before each batch
      const { data: checkJob } = await supabase
        .from("generation_jobs")
        .select("status")
        .eq("id", jobId)
        .single();

      if (checkJob?.status === "cancelled") break;

      const batch = items.slice(i, i + PARALLEL_WORKERS);
      await Promise.allSettled(batch.map(processItem));

      // Update completed/failed counts accurately after each batch
      const { data: updatedItems } = await supabase
        .from("generation_job_items")
        .select("status")
        .eq("job_id", jobId);

      if (updatedItems) {
        const completed = updatedItems.filter((it: any) => it.status === "completed").length;
        const failed = updatedItems.filter((it: any) => it.status === "failed").length;
        await supabase
          .from("generation_jobs")
          .update({
            completed_images: completed,
            failed_images: failed,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
    }

    // Final status update
    const { data: finalItems } = await supabase
      .from("generation_job_items")
      .select("status")
      .eq("job_id", jobId);

    const { data: finalJob } = await supabase
      .from("generation_jobs")
      .select("status")
      .eq("id", jobId)
      .single();

    if (finalJob?.status !== "cancelled") {
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
        .eq("id", jobId);
    }

    return new Response(JSON.stringify({ status: "done" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("batch-generate error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
