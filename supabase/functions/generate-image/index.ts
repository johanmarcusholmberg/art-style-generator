import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, aspectRatio, sourceImageUrl, whiteFrame } = await req.json();

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

    const ratioText = aspectRatio ? ` The image must have a ${aspectRatio} aspect ratio, composed specifically for that format.` : "";
    const frameText = whiteFrame ? " Replace the beige/cream paper background with pure white (#FFFFFF) only. Keep the margin size exactly the same around the illustration. Do NOT add any extra outer frame, border, outline, line, or decorative edge." : "";

    let messages;

    const marginText = " IMPORTANT: Leave a clean, empty 1 cm margin of blank paper space around all sides of the artwork. This margin must be the same color as the paper (beige/cream or white depending on instructions). Do NOT draw any lines, frames, borders, decorative elements, or any marks in this margin area - it must be completely plain and empty.";

    if (sourceImageUrl) {
      // Edit mode: user provides a source image and describes changes
      const editPrompt = `CRITICAL: You MUST keep the provided image almost entirely unchanged. Only make the SPECIFIC edit described below — preserve the exact same composition, subjects, colors, background, perspective, lighting, and every other detail. The result must look like the same image with a small targeted modification, NOT a new image. Do NOT regenerate or reimagine the scene. Keep the traditional Japanese ukiyo-e woodblock print style. Specific edit to apply: ${trimmedPrompt}. Generate at maximum resolution.${ratioText}${frameText}${marginText}`;
      messages = [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: sourceImageUrl } },
            { type: "text", text: editPrompt },
          ],
        },
      ];
    } else {
      // Generate mode: create from scratch
      const enhancedPrompt = `Create a high-resolution, highly detailed traditional Japanese ukiyo-e woodblock print style artwork: ${trimmedPrompt}. Style: flat colors, bold outlines, traditional Japanese composition, washi paper texture, sumi ink details, Edo period aesthetic. Generate at maximum resolution with fine detail suitable for large format printing.${ratioText}${frameText}${marginText}`;
      messages = [{ role: "user", content: enhancedPrompt }];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages,
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

    const data = await response.json();
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
    console.error("generate-image error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
