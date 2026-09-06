/**
 * Direct Replicate enhancement edge function.
 *
 * This is the dedicated, no-fallback path used by the "Enhance for print"
 * dialog. It runs Real-ESRGAN end-to-end. There is intentionally NO Lovable
 * fallback — if Replicate fails, the caller gets a clear error and can retry.
 *
 * NOTE: The legacy `method: "supir"` (Print+) branch was removed in 2025-Q4.
 * Any historical client that still posts `method: "supir"` will be rejected
 * with a clear 400 — the dynamic Real-ESRGAN route (decimal scale 2..8)
 * covers the 300 PPI use case more cheaply and deterministically.
 *
 * Inputs (POST body):
 *   - image_url   : string  (preferred)
 *   - storage_path: string  (alternative — resolved against generated-images bucket)
 *   - method      : "realesrgan"   (default; "supir" is rejected)
 *   - scale       : number (default 4; clamped to 2..8)
 *
 * Returns 200 JSON:
 *   {
 *     upscaled_image_url: string,
 *     width:  number | null,
 *     height: number | null,
 *     method: "realesrgan",
 *     scale:  number,
 *     provider: "replicate/real-esrgan",
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { preflightUpscale } from "../_shared/upscale-preflight.ts";
import { UPSCALERS, type UpscalerId } from "../_shared/upscalers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Method = "realesrgan";

/** Engines this direct route can dispatch (Clarity stays on the async route). */
type RealesrganUpscalerId = "realesrgan_normal" | "realesrgan_large";

const REAL_ESRGAN_VERSION =
  "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";

/**
 * Provider configuration per engine.
 *
 * Normal is a pinned public model version. Large/A100 is intentionally NOT
 * hardcoded — the provider identifier must be supplied through the
 * `REPLICATE_REALESRGAN_LARGE_VERSION` (model version hash) or
 * `REPLICATE_REALESRGAN_LARGE_DEPLOYMENT` ("owner/deployment-name") secret.
 * Both routes reuse the existing `REPLICATE_API_TOKEN`.
 *
 * Large also stays `enabled: false` in the shared registry, so requests for
 * it are rejected before any prediction is created.
 */
function providerConfigFor(
  id: RealesrganUpscalerId,
):
  | { kind: "version"; version: string }
  | { kind: "deployment"; deployment: string }
  | { kind: "unconfigured"; missing: string } {
  if (id === "realesrgan_normal") {
    return { kind: "version", version: REAL_ESRGAN_VERSION };
  }
  const deployment = Deno.env.get("REPLICATE_REALESRGAN_LARGE_DEPLOYMENT");
  if (deployment) return { kind: "deployment", deployment };
  const version = Deno.env.get("REPLICATE_REALESRGAN_LARGE_VERSION");
  if (version) return { kind: "version", version };
  return {
    kind: "unconfigured",
    missing:
      "REPLICATE_REALESRGAN_LARGE_DEPLOYMENT or REPLICATE_REALESRGAN_LARGE_VERSION",
  };
}

const PROVIDER_TAG: Record<RealesrganUpscalerId, string> = {
  realesrgan_normal: "replicate/real-esrgan-normal",
  realesrgan_large: "replicate/real-esrgan-large",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

let _admin: ReturnType<typeof createClient> | null = null;
function admin() {
  if (_admin) return _admin;
  _admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return _admin;
}

async function pollReplicate(
  predictionId: string,
  apiToken: string,
  maxAttempts = 150,
  intervalMs = 2000,
): Promise<{ ok: true; prediction: any } | { ok: false; error: string } | null> {
  const url = `https://api.replicate.com/v1/predictions/${predictionId}`;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[replicate] poll error:", res.status, text);
      return { ok: false, error: `Replicate poll error ${res.status}` };
    }
    const pred = await res.json();
    if (pred.status === "succeeded") return { ok: true, prediction: pred };
    if (pred.status === "failed" || pred.status === "canceled") {
      const errMsg = typeof pred.error === "string" ? pred.error : JSON.stringify(pred.error ?? "unknown");
      console.error("[replicate] prediction failed:", errMsg);
      return { ok: false, error: errMsg };
    }
  }
  console.error("[replicate] prediction timed out");
  return { ok: false, error: "Replicate prediction timed out." };
}

/** Resolve a storage_path against the generated-images bucket → public URL. */
function resolveStoragePath(storagePath: string): string {
  const { data } = admin().storage.from("generated-images").getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Read width/height from a PNG/JPEG byte stream. Best-effort. */
async function fetchImageDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (
      buf.length > 24 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    ) {
      const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
      const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
      return { width: w, height: h };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (
          marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
        ) {
          const h = (buf[i + 5] << 8) | buf[i + 6];
          const w = (buf[i + 7] << 8) | buf[i + 8];
          return { width: w, height: h };
        }
        const segLen = (buf[i + 2] << 8) | buf[i + 3];
        i += 2 + segLen;
      }
    }
  } catch (err) {
    console.warn("[dim] could not read image dimensions:", err);
  }
  return null;
}

/** Re-host the Replicate output into our generated-images bucket. */
async function rehostToGeneratedImages(
  remoteUrl: string,
): Promise<{ filename: string; publicUrl: string } | null> {
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) {
      console.error("[rehost] download failed:", res.status);
      return null;
    }
    const blob = await res.blob();
    const filename = `enh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const { error } = await admin()
      .storage
      .from("generated-images")
      .upload(filename, blob, { contentType: "image/png" });
    if (error) {
      console.error("[rehost] upload error:", error);
      return null;
    }
    const { data } = admin().storage.from("generated-images").getPublicUrl(filename);
    return { filename, publicUrl: data.publicUrl };
  } catch (err) {
    console.error("[rehost] error:", err);
    return null;
  }
}

async function runRealESRGAN(
  imageUrl: string,
  scale: number,
  apiToken: string,
  upscalerId: RealesrganUpscalerId,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const cfg = providerConfigFor(upscalerId);
  if (cfg.kind === "unconfigured") {
    return {
      ok: false,
      error: `${UPSCALERS[upscalerId].label} has no Replicate configuration (set ${cfg.missing}).`,
    };
  }
  console.log(`[realesrgan] engine=${upscalerId} scale=${scale}`);
  const endpoint = cfg.kind === "deployment"
    ? `https://api.replicate.com/v1/deployments/${cfg.deployment}/predictions`
    : "https://api.replicate.com/v1/predictions";
  const payload: Record<string, unknown> = {
    input: { image: imageUrl, scale, face_enhance: false },
  };
  if (cfg.kind === "version") payload.version = cfg.version;

  const createRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify(payload),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    console.error("[realesrgan] create failed:", createRes.status, text);
    return { ok: false, error: `Real-ESRGAN: ${createRes.status} ${text.slice(0, 200)}` };
  }
  const prediction = await createRes.json();
  if (prediction.status === "succeeded" && prediction.output) {
    const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    return { ok: true, url: out };
  }
  if (prediction.status === "failed") {
    const errMsg = typeof prediction.error === "string" ? prediction.error : "Replicate refused the input.";
    return { ok: false, error: errMsg };
  }
  const polled = await pollReplicate(prediction.id, apiToken, 90, 2000);
  if (!polled || !polled.ok) {
    return { ok: false, error: (polled && !polled.ok) ? polled.error : "Real-ESRGAN failed." };
  }
  const out = Array.isArray(polled.prediction.output)
    ? polled.prediction.output[0]
    : polled.prediction.output ?? null;
  if (!out) return { ok: false, error: "Real-ESRGAN returned no image." };
  return { ok: true, url: out };
}

// runSUPIR removed in 2025-Q4 — see file header.


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiToken = Deno.env.get("REPLICATE_API_TOKEN");
    if (!apiToken) {
      return new Response(
        JSON.stringify({
          error:
            "Enhancement service not configured (missing REPLICATE_API_TOKEN).",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    if (body.method && body.method !== "realesrgan") {
      return new Response(
        JSON.stringify({
          error:
            `Method "${body.method}" is no longer supported. Use "realesrgan" (or the dynamic print_target_300 route).`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const method: Method = "realesrgan";
    const scale: number = Math.max(2, Math.min(8, Number(body.scale ?? 4)));

    /* ---------- Engine identity (no silent substitution) ---------- */
    // Defaults to Normal only when the caller sends no engine at all
    // (legacy clients). An explicit unknown/disabled engine is rejected.
    const rawEngine = body.upscaler_id ?? body.upscalerId ?? null;
    const requestedEngine: UpscalerId =
      rawEngine == null ? "realesrgan_normal" : String(rawEngine) as UpscalerId;

    if (!(requestedEngine in UPSCALERS)) {
      return new Response(
        JSON.stringify({ error: `Unknown upscaler "${String(rawEngine)}".` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (
      requestedEngine !== "realesrgan_normal" &&
      requestedEngine !== "realesrgan_large"
    ) {
      return new Response(
        JSON.stringify({
          error:
            `Upscaler "${requestedEngine}" does not run on the direct Real-ESRGAN route.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const engine: RealesrganUpscalerId = requestedEngine;
    if (!UPSCALERS[engine].enabled) {
      return new Response(
        JSON.stringify({
          error:
            `${UPSCALERS[engine].label} is not available yet — it remains disabled until its Replicate deployment has been verified.`,
          upscaler_id: engine,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let imageUrl: string | null = typeof body.image_url === "string"
      ? body.image_url
      : (typeof body.imageUrl === "string" ? body.imageUrl : null);
    const storagePath: string | null = typeof body.storage_path === "string"
      ? body.storage_path
      : (typeof body.storagePath === "string" ? body.storagePath : null);

    if (!imageUrl && storagePath) {
      imageUrl = resolveStoragePath(storagePath);
    }
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "Missing image_url or storage_path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Defense in depth: server-side preflight on the ACTUAL input bytes.
    // The client runs the authoritative check post-correction; this guard
    // makes sure no ineligible source ever reaches the provider.
    const inputDims = await fetchImageDimensions(imageUrl);
    if (inputDims) {
      const pre = preflightUpscale({
        sourceWidth: inputDims.width,
        sourceHeight: inputDims.height,
        scale,
        upscalerId: engine,
      });
      if (!pre.ok) {
        return new Response(
          JSON.stringify({ error: pre.reason ?? `Upscale blocked (${pre.code}).`, preflight: pre }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const t0 = Date.now();
    const result = await runRealESRGAN(imageUrl, scale, apiToken);
    console.log(`[enhance] method=${method} elapsed=${Date.now() - t0}ms`);

    if (!result.ok) {
      // Surface the real provider message so the UI can show something
      // actionable (e.g. "input too large", "rate limited", etc.).
      let friendly = result.error;
      if (/total number of pixels/i.test(result.error)) {
        friendly =
          "This image is too large for HD 4× (Replicate's worker rejects inputs over ~2MP). Try a smaller source version, or use the Tile 4× mode instead.";
      } else if (/throttled|rate limit/i.test(result.error)) {
        friendly = "Replicate is rate-limiting requests right now. Please retry in a few seconds.";
      } else if (/version does not exist/i.test(result.error)) {
        friendly = "The upscale model is misconfigured (invalid version). Please contact support.";
      }
      return new Response(
        JSON.stringify({ error: friendly, raw: result.error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Re-host to our own bucket so the URL is stable (Replicate URLs expire).
    const hosted = await rehostToGeneratedImages(result.url);
    if (!hosted) {
      return new Response(
        JSON.stringify({
          error: "Enhancement succeeded but storing the result failed.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dims = await fetchImageDimensions(hosted.publicUrl);
    const provider = "replicate/real-esrgan";

    return new Response(
      JSON.stringify({
        upscaled_image_url: hosted.publicUrl,
        storage_path: hosted.filename,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        method,
        scale,
        provider,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[upscale-image-replicate] fatal:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
