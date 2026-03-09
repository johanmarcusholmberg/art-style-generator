import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STYLE_DESCRIPTIONS: Record<string, string> = {
  japanese: "traditional Japanese ukiyo-e woodblock print with flat colors, bold outlines, sumi ink details, Edo period aesthetic",
  freestyle: "artistic illustration with rich colors and painterly quality",
  popart: "bold pop art with Ben-Day dots, thick black outlines, flat vivid colors, comic book aesthetic",
  "popart-freestyle": "pop art inspired illustration with bold colors and graphic shapes",
  lineart: "detailed fine line art with pen and ink, cross-hatching, stippling, and intricate linework",
  "lineart-freestyle": "line art illustration with clean ink strokes",
  "lineart-minimal": "ultra-minimal continuous line drawing with the fewest possible strokes",
  minimalism: "minimalist art with clean shapes, limited palette, geometric forms, and ample negative space",
  "minimalism-freestyle": "minimalist illustration with simplified forms and muted tones",
  graffiti: "urban street art graffiti with spray paint effects, bold lettering energy, drips, and stencil elements",
  "graffiti-freestyle": "street art inspired illustration with vibrant urban energy",
  botanical: "detailed botanical illustration with scientific accuracy, delicate watercolor washes, fine ink outlines",
  "botanical-freestyle": "botanical-inspired artistic illustration with natural forms",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, style1, style2, aspectRatio, whiteFrame, backgroundStyle } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Invalid prompt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!style1 || !style2 || !STYLE_DESCRIPTIONS[style1] || !STYLE_DESCRIPTIONS[style2]) {
      return new Response(JSON.stringify({ error: "Invalid styles" }), {
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

    const useCream = backgroundStyle === "cream";
    const ratioText = aspectRatio ? ` The image must have a ${aspectRatio} aspect ratio.` : "";
    const bgText = useCream
      ? " Use a warm cream/off-white vintage paper tone background."
      : " CRITICAL: The background MUST be pure white (#FFFFFF). Do NOT use cream, beige, off-white, or any tinted color.";

    const frameText = whiteFrame
      ? ` Add a thin black frame around the illustration. Outside the frame, use clean pure white (#FFFFFF).`
      : "";

    const marginText = whiteFrame ? "" : " IMPORTANT: Leave a clean, empty 1 cm margin of blank space around all sides of the artwork.";

    const desc1 = STYLE_DESCRIPTIONS[style1];
    const desc2 = STYLE_DESCRIPTIONS[style2];

    const enhancedPrompt = `Create a high-resolution artwork that blends TWO art styles together into a cohesive fusion:

STYLE 1: ${desc1}
STYLE 2: ${desc2}

Blend these styles evenly — the result should feel like a natural hybrid where elements of both styles coexist harmoniously. Do not split the image; integrate both aesthetics throughout.

Subject: ${trimmedPrompt}

${bgText} Generate at maximum resolution with fine detail suitable for large format printing.${ratioText}${frameText}${marginText}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [{ role: "user", content: enhancedPrompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Too many requests. Please wait a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Failed to generate image" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Response(JSON.stringify({ error: "Empty response from AI. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("Failed to parse AI response:", responseText.slice(0, 200));
      return new Response(JSON.stringify({ error: "Invalid response from AI. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "No image was generated. Try a different prompt." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-image-blend error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
