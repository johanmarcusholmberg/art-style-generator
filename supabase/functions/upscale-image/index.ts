import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Build enhancement prompt based on strength level.
 * "medium" = general HD sharpening.
 * "strong" = print-optimized with resolution-aware detail generation.
 */
function buildEnhancePrompt(opts: {
  strength: string;
  aspectRatio?: string;
  targetWidthPx?: number;
  targetHeightPx?: number;
  targetPpi?: number;
  printFormatId?: string;
}): string {
  const { strength, aspectRatio, targetWidthPx, targetHeightPx, targetPpi, printFormatId } = opts;

  const ratioText = aspectRatio ? ` Maintain the ${aspectRatio} aspect ratio exactly.` : "";

  // Resolution directive for print-hd mode
  let resolutionDirective = "";
  if (targetWidthPx && targetHeightPx) {
    const ppiLabel = targetPpi ? ` at ${targetPpi} PPI` : "";
    const formatLabel = printFormatId ? ` (format: ${printFormatId.replace(/_/g, " ")})` : "";
    resolutionDirective = `

TARGET RESOLUTION (CRITICAL):
The final image must be optimized for ${targetWidthPx} × ${targetHeightPx} pixels${ppiLabel}${formatLabel}.
This is a large-format print target — every detail matters at this scale.
Generate TRUE fine detail at full resolution:
- Individual brush strokes, ink lines, and texture grain must be crisp and distinct
- Architectural elements must show clean edges at full zoom
- Botanical details must show leaf veins, petal texture, and fiber clarity
- Fabric and material textures must be individually resolved
- No detail should appear blurred, smudged, or interpolated at the target resolution
- Avoid any plastic, waxy, or over-smoothed appearance
- Preserve paper grain, canvas texture, and print imperfections where they exist in the original`;
  }

  // Strength-specific directives
  const strengthDirective = strength === "strong"
    ? `
ENHANCEMENT LEVEL: MAXIMUM (Print HD)
- Apply the strongest possible detail enhancement
- Generate new micro-detail where the source lacks it: texture grain, fine lines, surface variation
- Push sharpness and edge clarity to the limit without introducing ringing artifacts
- Treat this as preparing a museum-quality large-format print
- Every square centimeter of the final output must hold up under close inspection`
    : `
ENHANCEMENT LEVEL: HIGH DEFINITION
- Apply clear sharpening and detail improvement
- Enhance texture clarity and edge definition
- Remove compression artifacts while preserving artistic detail
- Produce a noticeably cleaner, crisper version of the original`;

  return `CRITICAL UPSCALING AND ENHANCEMENT INSTRUCTIONS:

You are an image enhancement specialist. Your ONLY task is to upscale, sharpen, and clean this image for high-quality output.
${resolutionDirective}
${strengthDirective}

DO:
- Sharpen all edges and fine details for crisp reproduction
- Enhance texture clarity: paper grain, brush strokes, ink lines, fabric patterns
- Increase overall resolution and definition to maximum output quality
- Apply subtle denoising to remove compression artifacts while preserving detail
- Deepen color richness and improve tonal range
- Refine fine architectural elements, botanical details, and facial features if present
- Ensure clean, sharp focus across the entire image
- Produce a premium print-ready version at the highest possible resolution
- Generate true detail — not interpolated blur
- Preserve the character and grain of the original medium

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
- Apply plastic smoothing or wax-like texture
- Blur fine lines or merge adjacent details

EDGE SAFETY (CRITICAL):
- All intentional inner borders, edge lines, and frame-like details are part of the artwork
- Every pixel at the boundary is part of the composition and must be preserved
- Decorative borders and internal framing elements must remain fully intact
- Thin lines or decorative elements near the image edge must NOT be removed or blended into the background

The output must be the EXACT same image but dramatically sharper, cleaner, and more detailed — suitable for large-format print at 300 DPI.${ratioText}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      imageUrl,
      aspectRatio,
      targetWidthPx,
      targetHeightPx,
      targetPpi,
      printFormatId,
      strength = "medium",
    } = await req.json();

    if (!imageUrl || typeof imageUrl !== "string") {
      return new Response(JSON.stringify({ error: "Missing imageUrl" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const enhancePrompt = buildEnhancePrompt({
      strength,
      aspectRatio,
      targetWidthPx,
      targetHeightPx,
      targetPpi,
      printFormatId,
    });

    console.log(`Enhancement request: strength=${strength}, target=${targetWidthPx}x${targetHeightPx}, ppi=${targetPpi}`);

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
