import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STYLE_DESCRIPTIONS: Record<string, { visualGoal: string; anchors: string }> = {
  japanese: { visualGoal: "authentic museum-quality ukiyo-e woodblock print", anchors: "traditional ukiyo-e, Hokusai/Hiroshige aesthetic, flat colors, bold outlines, sumi ink, Edo period" },
  freestyle: { visualGoal: "ukiyo-e woodblock print applied to modern subjects", anchors: "woodblock print style, flat colors, bold outlines, sumi ink details" },
  popart: { visualGoal: "bold gallery-quality pop art print", anchors: "Andy Warhol screen-print, Roy Lichtenstein comic panel, Ben-Day dots, thick black outlines, flat vivid colors" },
  "popart-freestyle": { visualGoal: "vibrant pop art illustration", anchors: "pop art bold colors, halftone dots, graphic shapes" },
  lineart: { visualGoal: "museum-quality pen-and-ink illustration", anchors: "fine pen-and-ink, cross-hatching, stippling, varying line weights, engraving quality" },
  "lineart-freestyle": { visualGoal: "elegant pen-and-ink artwork", anchors: "fine ink line art, elegant technique, varying weights" },
  "lineart-minimal": { visualGoal: "gallery-quality minimal line art", anchors: "ultra-minimal continuous line, Picasso-inspired, fewest possible strokes" },
  minimalism: { visualGoal: "elegant minimalist poster art", anchors: "Scandinavian design, clean geometric shapes, limited 2-4 color palette, generous negative space" },
  "minimalism-freestyle": { visualGoal: "clean minimalist artwork", anchors: "minimalist illustration, simplified forms, muted tones, flat design" },
  graffiti: { visualGoal: "authentic urban street art mural", anchors: "spray paint effects, bold outlines, drips, stencil elements, Banksy/KAWS inspired" },
  "graffiti-freestyle": { visualGoal: "vibrant street art illustration", anchors: "street art inspired, urban energy, spray paint texture" },
  botanical: { visualGoal: "museum-quality botanical illustration", anchors: "scientific botanical art, Redouté tradition, delicate watercolor washes, fine ink outlines" },
  "botanical-freestyle": { visualGoal: "artistic botanical watercolor", anchors: "botanical watercolor, natural forms, scientific flair" },
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

    const s1 = STYLE_DESCRIPTIONS[style1];
    const s2 = STYLE_DESCRIPTIONS[style2];
    const useCream = backgroundStyle === "cream";
    const ratioText = aspectRatio ? `The image must have a ${aspectRatio} aspect ratio.` : "";
    const bgText = useCream ? "Use a warm cream/off-white vintage paper tone background." : "The background MUST be pure white (#FFFFFF). Do NOT use cream, beige, off-white, or any tinted color.";

    const enhancedPrompt = [
      `PRIMARY SUBJECT: ${trimmedPrompt}`,
      "",
      `VISUAL GOAL: A harmonious fusion of "${s1.visualGoal}" and "${s2.visualGoal}"`,
      "",
      `STYLE BLEND:`,
      `Style 1 anchors: ${s1.anchors}`,
      `Style 2 anchors: ${s2.anchors}`,
      "",
      "Blend these styles evenly — the result should feel like a natural hybrid where elements of both styles coexist harmoniously. Do not split the image; integrate both aesthetics throughout.",
      "",
      `GLOBAL QUALITY: high detail, sharp focus, clean edges, high resolution, detailed textures, professional illustration, sharp rendering, balanced composition, no artifacts, print-ready resolution, suitable for large format printing`,
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
