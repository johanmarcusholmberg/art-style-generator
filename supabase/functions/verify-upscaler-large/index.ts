/**
 * TEMPORARY diagnostic function for the Real-ESRGAN Large route.
 *
 * Modes:
 *   - { mode: "deployment_info" }            -> reads our deployment config (hardware, model, version)
 *   - { mode: "version", version, image_url, scale } -> runs the PUBLIC model version directly
 *   - default                                -> runs through our deployment
 *
 * Nothing is persisted. DELETE once the Large route is decided.
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
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiToken = Deno.env.get("REPLICATE_API_TOKEN")!;
    const deployment = Deno.env.get("REPLICATE_REALESRGAN_LARGE_DEPLOYMENT");
    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? "deployment";

    if (mode === "deployment_info") {
      if (!deployment) return json({ error: "no deployment secret" }, 500);
      const res = await fetch(
        `https://api.replicate.com/v1/deployments/${deployment}`,
        { headers: { Authorization: `Bearer ${apiToken}` } },
      );
      return json({ deployment, status: res.status, body: await res.json() });
    }

    const imageUrl: string = body.image_url;
    const scale: number = Number(body.scale);

    let endpoint: string;
    let payload: Record<string, unknown> = {
      input: { image: imageUrl, scale, face_enhance: false },
    };
    if (mode === "version") {
      endpoint = "https://api.replicate.com/v1/predictions";
      payload = { ...payload, version: body.version };
    } else {
      if (!deployment) return json({ error: "no deployment secret" }, 500);
      endpoint =
        `https://api.replicate.com/v1/deployments/${deployment}/predictions`;
    }

    const createRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify(payload),
    });
    const createText = await createRes.text();
    if (!createRes.ok) {
      return json({
        stage: "create",
        mode,
        status: createRes.status,
        body: createText.slice(0, 800),
        elapsed_ms: Date.now() - started,
      });
    }
    let prediction = JSON.parse(createText);
    const synchronous = prediction.status === "succeeded";

    let attempts = 0;
    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled" &&
      attempts < 60
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

    return json({
      mode,
      deployment: mode === "version" ? null : deployment,
      prediction_id: prediction.id,
      status: prediction.status,
      settled_by_prefer_wait: synchronous,
      poll_attempts: attempts,
      model: prediction.model ?? null,
      version: prediction.version ?? null,
      output_url: output,
      logs_tail: typeof prediction.logs === "string"
        ? prediction.logs.slice(-800)
        : null,
      error: prediction.error ?? null,
      metrics: prediction.metrics ?? null,
      elapsed_ms: Date.now() - started,
    });
  } catch (err) {
    return json({ error: String(err), elapsed_ms: Date.now() - started }, 500);
  }
});
