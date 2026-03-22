import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RULES = {
  visualGoal: ["authentic urban street art mural", "gallery-quality graffiti artwork"],
  styleAnchors: ["urban street art graffiti", "Banksy, KAWS, and NYC subway graffiti", "spray paint mural tradition"],
  style: ["vibrant spray paint colors with dripping effects", "bold outlines and stencil art elements", "brick wall or concrete texture backgrounds", "wildstyle lettering energy without actual letters"],
  composition: ["dynamic asymmetric layout", "subject fills the frame with energy", "layered depth: background texture, mid-ground tags, foreground subject", "controlled chaos — busy but intentional"],
  color: ["neon and saturated spray paint colors", "rich contrast against urban textures", "fluorescent accents over darker bases", "color bleeding and overlap effects"],
  quality: ["realistic spray paint texture and drip patterns", "authentic wall texture and weathering", "crisp stencil edges where appropriate", "high detail", "professional illustration", "sharp rendering", "balanced composition", "clean edges", "no artifacts", "sharp focus", "high resolution", "detailed textures", "print-ready resolution", "suitable for large format printing"],
  avoid: ["clean digital look", "soft pastels or muted tones", "symmetrical or formal composition", "any readable text, letters, or script"],
};

function buildPrompt(p: string, ar?: string, bg?: string): string {
  const bgText = bg === "cream" ? "Use a warm cream/off-white aged wall tone as the background." : "The background MUST be pure white (#FFFFFF). Do NOT use cream, beige, off-white, or any tinted color.";
  const ratioText = ar ? `The image must have a ${ar} aspect ratio.` : "";
  return [`PRIMARY SUBJECT: ${p}`, "", `VISUAL GOAL: ${RULES.visualGoal.join(". ")}`, "", `STYLE ANCHORS: ${RULES.styleAnchors.join(". ")}`, "", `STYLE RULES: ${RULES.style.join(". ")}`, "", `COMPOSITION: ${RULES.composition.join(". ")}`, "", `COLOR: ${RULES.color.join(". ")}`, "", `GLOBAL QUALITY: ${RULES.quality.join(". ")}`, "", `AVOID: ${RULES.avoid.join(". ")}`, "", bgText, ratioText, "Generate at maximum resolution with fine detail suitable for large format printing."].filter(Boolean).join("\n");
}

function buildEditPrompt(p: string, ar?: string, bg?: string): string {
  const bgText = bg === "cream" ? "Maintain aged wall background." : "Background MUST be pure white (#FFFFFF).";
  return ["CRITICAL EDITING INSTRUCTIONS:", "You MUST keep the provided image almost entirely unchanged.", "Only make the SPECIFIC edit described below.", "Do NOT regenerate or reimagine the scene.", "", `VISUAL GOAL: ${RULES.visualGoal.join(". ")}`, `STYLE ANCHORS: ${RULES.styleAnchors.join(", ")}`, `STYLE TO MAINTAIN: ${RULES.style.join(", ")}`, "", `EDIT TO APPLY: ${p}`, "", bgText, ar ? `Maintain ${ar} aspect ratio.` : "", `GLOBAL QUALITY: ${RULES.quality.join(", ")}`, `AVOID: ${RULES.avoid.join(", ")}`, "Generate at maximum resolution."].filter(Boolean).join("\n");
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
  } catch (e) { console.error("generate-image-graffiti error:", e); return new Response(JSON.stringify({ error: "An unexpected error occurred." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});
