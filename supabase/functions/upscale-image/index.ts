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

    const enhancePrompt = `CRITICAL UPSCALING INSTRUCTIONS:

You are an image enhancement specialist. Your ONLY task is to upscale and sharpen this image.

DO:
- Sharpen all edges and fine details
- Enhance texture clarity: paper grain, brush strokes, ink lines, fabric patterns
- Increase overall resolution and definition
- Deepen color richness and improve tonal range
- Refine fine architectural elements, botanical details, and facial features if present
- Produce a premium print-ready version

DO NOT:
- Change the subject, style, composition, or color palette
- Add new elements or remove existing ones
- Alter the artistic style or mood
- Regenerate or reimagine any part of the image
- Change the background color or texture

The output must be the EXACT same image but dramatically sharper and more detailed.${ratioText}`;

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
