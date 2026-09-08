/**
 * TEMPORARY verification function for the Real-ESRGAN Large / A100 route.
 * Bypasses the registry `enabled: false` gate for live checks only.
 * DELETE once `realesrgan_large` has been verified and enabled.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const started = Date.now();
  try {
    const apiToken = Deno.env.get("REPLICATE_API_TOKEN")!;
    const deployment = Deno.env.get("REPLICATE_REALESRGAN_LARGE_DEPLOYMENT");
    if (!deployment) {
      return new Response(
        JSON.stringify({ error: "REPLICATE_REALESRGAN_LARGE_DEPLOYMENT unset" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const body = await req.json();
    const imageUrl: string = body.image_url;
    const scale: number = Number(body.scale);

    const endpoint =
      `https://api.replicate.com/v1/deployments/${deployment}/predictions`;
    const createRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: { image: imageUrl, scale, face_enhance: false },
      }),
    });
    const createText = await createRes.text();
    if (!createRes.ok) {
      return new Response(
        JSON.stringify({
          stage: "create",
          status: createRes.status,
          body: createText.slice(0, 800),
          elapsed_ms: Date.now() - started,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    let prediction = JSON.parse(createText);
    const synchronous = prediction.status === "succeeded";

    let attempts = 0;
    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled" &&
      attempts < 90
    ) {
      attempts++;
      await new Promise((r) => setTimeout(r, 2000));
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        { headers: { Authorization: `Bearer ${apiToken}` } },
      );
      prediction = await pollRes.json();
    }

    const output = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output ?? null;

    return new Response(
      JSON.stringify({
        deployment,
        prediction_id: prediction.id,
        status: prediction.status,
        settled_by_prefer_wait: synchronous,
        poll_attempts: attempts,
        model: prediction.model ?? null,
        version: prediction.version ?? null,
        output_url: output,
        logs_tail: typeof prediction.logs === "string"
          ? prediction.logs.slice(-600)
          : null,
        error: prediction.error ?? null,
        metrics: prediction.metrics ?? null,
        elapsed_ms: Date.now() - started,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), elapsed_ms: Date.now() - started }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
