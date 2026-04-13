import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ------------------------------------------------------------------ */
/*  Stage 1 — AI Artifact Cleanup (Gemini vision)                     */
/*  Focuses ONLY on cleaning artifacts, NOT on upscaling.             */
/* ------------------------------------------------------------------ */

function buildCleanupPrompt(): string {
  return `CRITICAL IMAGE CLEANUP INSTRUCTIONS:

You are an image artifact cleanup specialist. Your ONLY task is to clean this image — do NOT upscale, resize, or change composition.

DO:
- Remove compression artifacts (JPEG blocking, color banding, mosquito noise)
- Clean up halos and ringing around edges
- Smooth out noise in flat color areas while preserving intended texture
- Sharpen soft edges and improve line clarity
- Stabilize textures that appear grainy or inconsistent
- Fix color posterization in gradients
- Clean up any halftone or moiré patterns that are artifacts (not intentional)

DO NOT:
- Change the subject, style, composition, or color palette
- Add new elements or remove existing ones
- Upscale or resize the image
- Alter the artistic style, mood, or framing
- Remove intentional textures (paper grain, brush strokes, screen print dots)
- Crop, reframe, or alter borders/frames within the artwork
- Apply plastic smoothing or over-sharpen

EDGE SAFETY:
- All intentional borders, edge lines, and frame elements are part of the artwork
- Every pixel at the boundary must be preserved
- Thin lines near image edges must NOT be removed

Output the EXACT same image, same size, but with cleaner detail and fewer artifacts.`;
}

async function runArtifactCleanup(imageUrl: string, apiKey: string): Promise<string | null> {
  console.log("Stage 1: Running artifact cleanup…");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: buildCleanupPrompt() },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const t = await response.text();
    console.error("Cleanup API error:", response.status, t);
    return null;
  }

  const data = await response.json();
  const cleanedUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

  if (!cleanedUrl) {
    console.warn("Cleanup returned no image, skipping cleanup stage");
    return null;
  }

  console.log("Stage 1: Artifact cleanup complete");
  return cleanedUrl;
}

/* ------------------------------------------------------------------ */
/*  Stage 2 — True Super-Resolution via Replicate Real-ESRGAN         */
/* ------------------------------------------------------------------ */

async function runSuperResolution(
  imageUrl: string,
  scaleFactor: number,
  apiToken: string,
): Promise<string | null> {
  console.log(`Stage 2: Running Real-ESRGAN super-resolution (${scaleFactor}x)…`);

  // Create prediction
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa",
      input: {
        image: imageUrl,
        scale: scaleFactor,
        face_enhance: false,
      },
    }),
  });

  if (!createRes.ok) {
    const t = await createRes.text();
    console.error("Replicate create error:", createRes.status, t);
    return null;
  }

  let prediction = await createRes.json();

  // If the Prefer: wait header worked, we may already have output
  if (prediction.status === "succeeded" && prediction.output) {
    console.log("Stage 2: Super-resolution complete (immediate)");
    return prediction.output;
  }

  // Otherwise poll for completion (max ~120s)
  const predictionId = prediction.id;
  const pollUrl = `https://api.replicate.com/v1/predictions/${predictionId}`;
  const maxAttempts = 60;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    if (!pollRes.ok) {
      const t = await pollRes.text();
      console.error("Replicate poll error:", pollRes.status, t);
      return null;
    }

    prediction = await pollRes.json();

    if (prediction.status === "succeeded") {
      console.log("Stage 2: Super-resolution complete");
      return prediction.output;
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      console.error("Replicate prediction failed:", prediction.error);
      return null;
    }
  }

  console.error("Replicate prediction timed out");
  return null;
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      imageUrl,
      strength = "medium",
      scaleFactor: requestedScale,
    } = await req.json();

    if (!imageUrl || typeof imageUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing imageUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) throw new Error("REPLICATE_API_TOKEN is not configured");

    // Determine scale factor from strength or explicit request
    const scale = requestedScale ?? (strength === "strong" ? 4 : 2);

    console.log(`Enhancement pipeline: strength=${strength}, scale=${scale}x`);

    // ---- Stage 1: Artifact Cleanup ----
    let cleanedUrl: string | null = null;
    try {
      cleanedUrl = await runArtifactCleanup(imageUrl, LOVABLE_API_KEY);
    } catch (err) {
      console.warn("Artifact cleanup failed, continuing with original:", err);
    }

    const upscaleInput = cleanedUrl || imageUrl;

    // ---- Stage 2: True Super-Resolution ----
    let enhancedUrl: string | null = null;
    try {
      enhancedUrl = await runSuperResolution(upscaleInput, scale, REPLICATE_API_TOKEN);
    } catch (err) {
      console.warn("Super-resolution failed:", err);
    }

    // Return the best available result
    const finalUrl = enhancedUrl || cleanedUrl || imageUrl;

    if (!enhancedUrl) {
      console.warn("Super-resolution unavailable — returning cleanup-only or original");
    }

    return new Response(
      JSON.stringify({
        imageUrl: finalUrl,
        pipeline: {
          cleanup: !!cleanedUrl,
          superResolution: !!enhancedUrl,
          scale: enhancedUrl ? scale : 1,
          provider: enhancedUrl ? "replicate/real-esrgan" : "none",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("upscale-image error:", e);

    if (e.message?.includes("REPLICATE_API_TOKEN")) {
      return new Response(
        JSON.stringify({ error: "Upscaling service not configured. Please add your Replicate API token." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
