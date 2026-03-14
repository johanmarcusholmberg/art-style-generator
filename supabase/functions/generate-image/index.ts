import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STYLE_RULES = {
  style: [
    "traditional Japanese ukiyo-e woodblock print",
    "flat color areas with bold black outlines",
    "sumi ink details and brushwork",
    "Edo period aesthetic and composition",
    "layered depth through overlapping planes",
  ],
  composition: [
    "asymmetric balance typical of Japanese prints",
    "foreground, middle ground, background layers",
    "dramatic use of negative space",
    "natural flow guiding the eye",
  ],
  color: [
    "rich but limited palette of 5-8 traditional pigment colors",
    "indigo, vermilion, ochre, sap green, black",
    "no gradients — flat color blocks only",
  ],
  quality: [
    "museum-quality woodblock print reproduction",
    "visible wood grain texture in flat areas",
    "crisp registration between color layers",
    "high detail", "professional illustration", "sharp edges", "balanced composition", "no artifacts", "print-ready resolution",
  ],
  avoid: [
    "photorealistic rendering",
    "soft gradients or airbrushing",
    "modern digital effects",
    "Japanese text, kanji, hiragana, or katakana",
    "any written script or labels",
  ],
};

function buildPrompt(userPrompt: string, aspectRatio?: string, backgroundStyle?: string): string {
  const useCream = backgroundStyle === "cream";
  const bgText = useCream
    ? "Use a traditional warm beige/cream washi paper texture as the background."
    : "The background MUST be pure white (#FFFFFF). Do NOT use cream, beige, off-white, or any tinted paper color.";
  const ratioText = aspectRatio ? `The image must have a ${aspectRatio} aspect ratio, composed specifically for that format.` : "";

  return [
    `SUBJECT: ${userPrompt}`,
    "",
    `STYLE: ${STYLE_RULES.style.join(". ")}`,
    `COMPOSITION: ${STYLE_RULES.composition.join(". ")}`,
    `COLOR: ${STYLE_RULES.color.join(". ")}`,
    `QUALITY: ${STYLE_RULES.quality.join(". ")}`,
    `AVOID: ${STYLE_RULES.avoid.join(". ")}`,
    "",
    bgText,
    ratioText,
    "Generate at maximum resolution with fine detail suitable for large format printing.",
  ].filter(Boolean).join("\n");
}

function buildEditPrompt(userPrompt: string, aspectRatio?: string, backgroundStyle?: string): string {
  const useCream = backgroundStyle === "cream";
  const bgText = useCream
    ? "Use a traditional warm beige/cream washi paper texture as the background."
    : "The background MUST be pure white (#FFFFFF). Do NOT use cream, beige, off-white, or any tinted paper color.";
  const ratioText = aspectRatio ? `The image must have a ${aspectRatio} aspect ratio.` : "";

  return [
    "CRITICAL EDITING INSTRUCTIONS:",
    "You MUST keep the provided image almost entirely unchanged.",
    "Only make the SPECIFIC edit described below.",
    "Preserve the exact same composition, subjects, colors, background, perspective, lighting, and every other detail.",
    "The result must look like the same image with a small targeted modification, NOT a new image.",
    "",
    `STYLE TO MAINTAIN: ${STYLE_RULES.style.join(", ")}`,
    `EDIT TO APPLY: ${userPrompt}`,
    "",
    bgText,
    ratioText,
    `QUALITY: ${STYLE_RULES.quality.join(", ")}`,
    `AVOID: ${STYLE_RULES.avoid.join(", ")}`,
    "Generate at maximum resolution.",
  ].filter(Boolean).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, aspectRatio, sourceImageUrl, backgroundStyle } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Invalid prompt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0 || trimmedPrompt.length > 1000) {
      return new Response(JSON.stringify({ error: "Prompt must be between 1 and 1000 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let messages;

    if (sourceImageUrl) {
      messages = [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: sourceImageUrl } },
          { type: "text", text: buildEditPrompt(trimmedPrompt, aspectRatio, backgroundStyle) },
        ],
      }];
    } else {
      messages = [{ role: "user", content: buildPrompt(trimmedPrompt, aspectRatio, backgroundStyle) }];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-pro-image-preview", messages, modalities: ["image", "text"] }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Too many requests. Please wait a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Failed to generate image" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const responseText = await response.text();
    if (!responseText) return new Response(JSON.stringify({ error: "Empty response from AI. Please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    let data;
    try { data = JSON.parse(responseText); } catch {
      console.error("Failed to parse AI response:", responseText.slice(0, 200));
      return new Response(JSON.stringify({ error: "Invalid response from AI. Please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) return new Response(JSON.stringify({ error: "No image was generated. Try a different prompt." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ imageUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-image error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
