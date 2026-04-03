import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RULES = {
  visualGoal: ["dramatic vintage pulp magazine cover illustration", "classic painted action poster quality"],
  styleAnchors: ["pulp magazine cover illustration", "dramatic composition", "vintage print poster", "painted cover art", "strong shadows", "mid-century print aesthetic"],
  style: ["dramatic painted illustration style", "rich oil-paint or gouache-like rendering", "strong chiaroscuro lighting with deep shadows", "vintage mid-century illustration techniques", "slightly idealized heroic proportions"],
  composition: ["dramatic diagonal composition for energy", "strong central figure or action moment", "cinematic depth and atmosphere", "vintage magazine cover framing", "painted details near edges must be preserved"],
  color: ["rich saturated vintage palette", "warm tones with dramatic cool shadow accents", "slightly aged or printed color feel", "bold color contrasts for visual punch"],
  quality: ["professional painted illustration quality", "visible brushwork and paint texture", "dramatic lighting execution", "high detail", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
  avoid: ["photorealism", "digital vector look", "flat or minimal design", "any text, titles, or script"],
};

function buildPrompt(p: string, ar?: string, bg?: string): string {
  const bgText = bg === "cream" ? "Use a warm cream/off-white vintage paper background." : "The background MUST be pure white (#FFFFFF).";
  const ratioText = ar ? `The image must have a ${ar} aspect ratio.` : "";
  return [`PRIMARY SUBJECT: ${p}`, "", `VISUAL GOAL: ${RULES.visualGoal.join(". ")}`, "", `STYLE ANCHORS: ${RULES.styleAnchors.join(". ")}`, "", `STYLE RULES: ${RULES.style.join(". ")}`, "", `COMPOSITION: ${RULES.composition.join(". ")}`, "", `COLOR: ${RULES.color.join(". ")}`, "", `GLOBAL QUALITY: ${RULES.quality.join(". ")}`, "", `AVOID: ${RULES.avoid.join(". ")}`, "", bgText, ratioText, "EDGE SAFETY: preserve all intentional inner borders, edge lines, and frame-like details. Do not trim, fade, or blend edge details into the background. Artwork edges are sacred.", "Generate at maximum resolution with fine detail suitable for large format printing."].filter(Boolean).join("\n");
}

function buildEditPrompt(p: string, ar?: string, bg?: string): string {
  const bgText = bg === "cream" ? "Maintain cream vintage paper background." : "Background MUST be pure white (#FFFFFF).";
  return ["CRITICAL EDITING INSTRUCTIONS:", "You MUST keep the provided image almost entirely unchanged.", "Only make the SPECIFIC edit described below.", "Do NOT regenerate or reimagine the scene.", "", `VISUAL GOAL: ${RULES.visualGoal.join(". ")}`, `STYLE ANCHORS: ${RULES.styleAnchors.join(", ")}`, `STYLE TO MAINTAIN: ${RULES.style.join(", ")}`, "", `EDIT TO APPLY: ${p}`, "", bgText, ar ? `Maintain ${ar} aspect ratio.` : "", `GLOBAL QUALITY: ${RULES.quality.join(", ")}`, `AVOID: ${RULES.avoid.join(", ")}`, "EDGE SAFETY: preserve all edge details.", "Generate at maximum resolution."].filter(Boolean).join("\n");
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
  } catch (e) { console.error("generate-image-pulpmagazine error:", e); return new Response(JSON.stringify({ error: "An unexpected error occurred." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});