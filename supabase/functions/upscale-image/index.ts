import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageUrl, aspectRatio } = await req.json();

    if (!imageUrl || typeof imageUrl !== "string") {
      return new Response(JSON.stringify({ error: "Missing imageUrl" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const ratioText = aspectRatio ? ` Maintain the ${aspectRatio} aspect ratio exactly.` : "";

    const enhancePrompt = `CRITICAL UPSCALING AND ENHANCEMENT INSTRUCTIONS:

You are an image enhancement specialist. Your ONLY task is to upscale, sharpen, and clean this image for high-quality print output.

DO:
- Sharpen all edges and fine details for crisp print reproduction
- Enhance texture clarity: paper grain, brush strokes, ink lines, fabric patterns
- Increase overall resolution and definition to maximum output quality
- Apply subtle denoising to remove compression artifacts while preserving detail
- Deepen color richness and improve tonal range
- Refine fine architectural elements, botanical details, and facial features if present
- Ensure clean, sharp focus across the entire image
- Produce a premium print-ready version at the highest possible resolution

DO NOT:
- Change the subject, style, composition, or color palette
- Add new elements or remove existing ones
- Alter the artistic style or mood
- Regenerate or reimagine any part of the image
- Change the background color or texture
- Crop or reframe the image in any way
- Remove or alter any borders, frames, or decorative edges within the artwork
- Trim, fade, or soften any detail near the image edges
- Treat inner borders or edge lines as disposable margins

EDGE SAFETY (CRITICAL):
- All intentional inner borders, edge lines, and frame-like details are part of the artwork
- Every pixel at the boundary is part of the composition and must be preserved
- Decorative borders and internal framing elements must remain fully intact
- Thin lines or decorative elements near the image edge must NOT be removed or blended into the background

The output must be the EXACT same image but dramatically sharper, cleaner, and more detailed — suitable for large-format print at 300 DPI.${ratioText}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              { type: "text", text: enhancePrompt },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Too many requests. Please wait a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Failed to enhance image" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const enhancedUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!enhancedUrl) return new Response(JSON.stringify({ error: "Enhancement failed. Try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ imageUrl: enhancedUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("upscale-image error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
