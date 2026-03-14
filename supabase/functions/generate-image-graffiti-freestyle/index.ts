import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STYLE_RULES = {
  style: ["graffiti and urban street art style", "spray paint effects, bold colors, urban energy", "stencil and freehand spray techniques"],
  composition: ["dynamic energetic layout", "subject-forward with urban texture"],
  color: ["vibrant neon and saturated tones", "spray paint color palette"],
  quality: ["authentic spray paint texture", "crisp detail in stencil areas", "high detail", "professional illustration", "sharp edges", "no artifacts", "print-ready resolution"],
  avoid: ["clean digital aesthetic", "muted tones", "any readable text or script"],
};

function buildPrompt(p: string, ar?: string, bg?: string): string {
  const bgText = bg === "cream" ? "Use a warm cream/off-white aged wall tone." : "The background MUST be pure white (#FFFFFF).";
  const ratioText = ar ? `The image must have a ${ar} aspect ratio.` : "";
  return [`SUBJECT: ${p}`, "", `STYLE: ${STYLE_RULES.style.join(". ")}`, `COMPOSITION: ${STYLE_RULES.composition.join(". ")}`, `COLOR: ${STYLE_RULES.color.join(". ")}`, `QUALITY: ${STYLE_RULES.quality.join(". ")}`, `AVOID: ${STYLE_RULES.avoid.join(". ")}`, "", bgText, ratioText, "Generate at maximum resolution."].filter(Boolean).join("\n");
}

function buildEditPrompt(p: string, ar?: string, bg?: string): string {
  const bgText = bg === "cream" ? "Maintain aged wall background." : "Background MUST be pure white (#FFFFFF).";
  return ["CRITICAL: Keep the image almost entirely unchanged. Only apply the SPECIFIC edit below.", `STYLE TO MAINTAIN: ${STYLE_RULES.style.join(", ")}`, `EDIT TO APPLY: ${p}`, bgText, ar ? `Maintain ${ar} aspect ratio.` : "", `AVOID: ${STYLE_RULES.avoid.join(", ")}`, "Generate at maximum resolution."].filter(Boolean).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { prompt, aspectRatio, sourceImageUrl, backgroundStyle } = await req.json();
    if (!prompt || typeof prompt !== "string") return new Response(JSON.stringify({ error: "Invalid prompt" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0 || trimmedPrompt.length > 1000) return new Response(JSON.stringify({ error: "Prompt must be between 1 and 1000 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY"); if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const messages = sourceImageUrl
      ? [{ role: "user", content: [{ type: "image_url", image_url: { url: sourceImageUrl } }, { type: "text", text: buildEditPrompt(trimmedPrompt, aspectRatio, backgroundStyle) }] }]
      : [{ role: "user", content: buildPrompt(trimmedPrompt, aspectRatio, backgroundStyle) }];
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "google/gemini-3-pro-image-preview", messages, modalities: ["image", "text"] }) });
    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Too many requests." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text(); console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Failed to generate image" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const responseText = await response.text();
    if (!responseText) return new Response(JSON.stringify({ error: "Empty response from AI." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    let data; try { data = JSON.parse(responseText); } catch { return new Response(JSON.stringify({ error: "Invalid response from AI." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) return new Response(JSON.stringify({ error: "No image was generated." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ imageUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) { console.error("generate-image-graffiti-freestyle error:", e); return new Response(JSON.stringify({ error: "An unexpected error occurred." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});
