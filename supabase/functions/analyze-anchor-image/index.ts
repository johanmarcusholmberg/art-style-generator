// analyze-anchor-image — extracts a compact CollectionArtDirection JSON
// from an anchor image URL. Uses the Lovable AI Gateway (Gemini vision)
// with structured JSON output. Never throws on model errors — returns
// { artDirection: null, error } so the caller can proceed with the
// anchor image + inherited metadata alone.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface RequestBody {
  anchorImageUrl?: string;
}

const SYSTEM_PROMPT = `You are an art director analyzing a single reference poster.
Return a compact, provider-friendly JSON description of its visual identity
(NOT its subject) so future posters in the same collection can match.
Never describe what the poster depicts — only how it looks.`;

const USER_PROMPT = `Analyze the reference image. Return ONLY JSON, no prose.
Fields (all strings unless noted):
- palette: array of 3-6 hex color strings (dominant + accent)
- colorMood: warm/cool direction + contrast level
- lighting: direction and softness
- composition: symmetry, subject placement, framing type
- subjectScale: how much of the frame the subject fills
- negativeSpace: how much and where
- texture: matte/gloss/grain/print character
- framing: full-bleed, bordered, etc.
- detailDensity: low/medium/high with a short justification
- mood: 2-4 adjectives
- textPolicy: whether text is present, and if so, style + placement`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    return new Response(
      JSON.stringify({ artDirection: null, error: "LOVABLE_API_KEY missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ artDirection: null, error: "invalid_json_body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const anchorImageUrl = body.anchorImageUrl?.trim();
  if (!anchorImageUrl) {
    return new Response(
      JSON.stringify({ artDirection: null, error: "anchorImageUrl required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: USER_PROMPT },
              { type: "image_url", image_url: { url: anchorImageUrl } },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(
        JSON.stringify({ artDirection: null, error: `gateway_${resp.status}: ${text.slice(0, 200)}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const j = await resp.json();
    const content: string | undefined = j?.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(
        JSON.stringify({ artDirection: null, error: "empty_response" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Sometimes the model wraps JSON in code fences — strip and retry.
      const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      try {
        parsed = JSON.parse(stripped);
      } catch {
        return new Response(
          JSON.stringify({ artDirection: null, error: "invalid_json_from_model" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({ artDirection: parsed, error: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ artDirection: null, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
