import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STYLE_DESCRIPTIONS: Record<string, string> = {
  japanese: "traditional Japanese ukiyo-e woodblock print with flat colors, bold outlines, sumi ink details, Edo period aesthetic",
  freestyle: "ukiyo-e woodblock print style applied to modern subjects with flat colors and bold outlines",
  popart: "bold pop art with Ben-Day dots, thick black outlines, flat vivid colors, comic book aesthetic, screen-print texture",
  "popart-freestyle": "pop art inspired illustration with bold colors, halftone dots, and graphic shapes",
  lineart: "detailed fine line art with pen and ink, cross-hatching, stippling, varying line weights, engraving quality",
  "lineart-freestyle": "fine pen-and-ink line art with elegant technique and varying weights",
  "lineart-minimal": "ultra-minimal continuous line drawing with the fewest possible strokes, Picasso-inspired simplicity",
  minimalism: "minimalist art with clean geometric shapes, limited 2-3 color palette, generous negative space, Scandinavian design",
  "minimalism-freestyle": "minimalist illustration with simplified forms, muted tones, and flat design",
  graffiti: "urban street art graffiti with spray paint effects, bold lettering energy, drips, stencil elements, Banksy-inspired",
  "graffiti-freestyle": "street art inspired illustration with vibrant urban energy and spray paint texture",
  botanical: "detailed botanical illustration with scientific accuracy, delicate watercolor washes, fine ink outlines, Redouté tradition",
  "botanical-freestyle": "botanical-inspired artistic illustration with natural watercolor forms and scientific flair",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, style1, style2, aspectRatio, backgroundStyle } = await req.json();

    if (!prompt || typeof prompt !== "string") return new Response(JSON.stringify({ error: "Invalid prompt" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!style1 || !style2 || !STYLE_DESCRIPTIONS[style1] || !STYLE_DESCRIPTIONS[style2]) return new Response(JSON.stringify({ error: "Invalid styles" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0 || trimmedPrompt.length > 1000) return new Response(JSON.stringify({ error: "Prompt must be between 1 and 1000 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const useCream = backgroundStyle === "cream";
    const ratioText = aspectRatio ? `The image must have a ${aspectRatio} aspect ratio.` : "";
    const bgText = useCream ? "Use a warm cream/off-white vintage paper tone background." : "The background MUST be pure white (#FFFFFF). Do NOT use cream, beige, off-white, or any tinted color.";

    const enhancedPrompt = [
      `SUBJECT: ${trimmedPrompt}`,
      "",
      `STYLE BLEND:`,
      `Style 1: ${STYLE_DESCRIPTIONS[style1]}`,
      `Style 2: ${STYLE_DESCRIPTIONS[style2]}`,
      "",
      "Blend these styles evenly — the result should feel like a natural hybrid where elements of both styles coexist harmoniously. Do not split the image; integrate both aesthetics throughout.",
      "",
      `QUALITY: high detail, professional illustration, sharp edges, balanced composition, no artifacts, print-ready resolution`,
      `AVOID: any written text or script, visual clutter, inconsistent style mixing`,
      "",
      bgText,
      ratioText,
      "Generate at maximum resolution with fine detail suitable for large format printing.",
    ].filter(Boolean).join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-pro-image-preview", messages: [{ role: "user", content: enhancedPrompt }], modalities: ["image", "text"] }),
    });

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
  } catch (e) {
    console.error("generate-image-blend error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
