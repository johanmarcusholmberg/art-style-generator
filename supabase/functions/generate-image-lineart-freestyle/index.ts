import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, aspectRatio, sourceImageUrl, whiteFrame, backgroundStyle } = await req.json();

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

    const useCream = backgroundStyle === "cream";
    const ratioText = aspectRatio ? ` The image must have a ${aspectRatio} aspect ratio, composed specifically for that format.` : "";
    const frameText = whiteFrame ? " Add a thin black frame/border around the artwork itself. Inside this black frame, keep the fine line art composition as normal. Outside the black frame, the margin area must be clean pure white (#FFFFFF) — just solid white." : "";
    const bgText = useCream ? " The background should be a warm cream/off-white vintage paper tone, like aged parchment or fine art paper." : " CRITICAL: The background MUST be pure white (#FFFFFF). Do NOT use cream, beige, off-white, or any tinted paper color — only clean pure white.";

    let messages;

    if (sourceImageUrl) {
      const editPrompt = `CRITICAL: You MUST keep the provided image almost entirely unchanged. Only make the SPECIFIC edit described below — preserve the exact same composition, subjects, line work, background, perspective, and every other detail. The result must look like the same image with a small targeted modification, NOT a new image. Do NOT regenerate or reimagine the scene. Keep the fine line art style.${bgText} Do NOT include any text or written script in the image. Only apply the art style, nothing else. Specific edit to apply: ${trimmedPrompt}. Generate at maximum resolution.${ratioText}${frameText}`;
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
      const enhancedPrompt = `Create a high-resolution, highly detailed image. Render the following scene in a fine line art style — use delicate thin ink lines, precise hatching and cross-hatching, elegant pen-and-ink technique, varying line weights for depth. The subject itself should be exactly as described, rendered in fine line art style.${bgText} Do NOT include any text or written script in the image. Only apply the art style, nothing else. Generate at maximum resolution with crisp detail suitable for large format printing: ${trimmedPrompt}.${ratioText}${frameText}`;
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

    const responseText = await response.text();
    if (!responseText) {
      console.error("AI gateway returned empty response");
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
    console.error("generate-image-lineart-freestyle error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});