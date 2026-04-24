/**
 * Direct Replicate enhancement edge function.
 *
 * This is the dedicated, no-fallback path used by the "Enhance for print"
 * dialog. It accepts a method (`realesrgan` | `supir`) and runs that single
 * Replicate model end-to-end. There is intentionally NO Lovable fallback —
 * if Replicate fails, the caller gets a clear error and can retry.
 *
 * Inputs (POST body):
 *   - image_url   : string  (preferred)
 *   - storage_path: string  (alternative — resolved against generated-images bucket)
 *   - method      : "realesrgan" | "supir"   (default: "realesrgan")
 *   - scale       : number                    (default: 4 for realesrgan; ignored for supir)
 *
 * Returns 200 JSON:
 *   {
 *     upscaled_image_url: string, // public URL on generated-images bucket
 *     width:  number | null,
 *     height: number | null,
 *     method: "realesrgan" | "supir",
 *     scale:  number,
 *     provider: "replicate/real-esrgan" | "replicate/supir",
 *   }
 *
 * Returns 4xx/5xx JSON `{ error: string }` on failure. The caller MUST NOT
 * attempt to silently re-route to another provider.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Method = "realesrgan" | "supir";

const REAL_ESRGAN_VERSION =
  "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";
const SUPIR_VERSION =
  "2267e729dcfa0b7f5e6b5e7e5d7e4d5b3c2a1d0e9f8a7b6c5d4e3f2a1b0c9d8e";

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
): Promise<any | null> {
  const url = `https://api.replicate.com/v1/predictions/${predictionId}`;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!res.ok) {
      console.error("[replicate] poll error:", res.status, await res.text());
      return null;
    }
    const pred = await res.json();
    if (pred.status === "succeeded") return pred;
    if (pred.status === "failed" || pred.status === "canceled") {
      console.error("[replicate] prediction failed:", pred.error);
      return null;
    }
  }
  console.error("[replicate] prediction timed out");
  return null;
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
): Promise<string | null> {
  console.log(`[realesrgan] scale=${scale}`);
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: REAL_ESRGAN_VERSION,
      input: { image: imageUrl, scale, face_enhance: false },
    }),
  });
  if (!createRes.ok) {
    console.error("[realesrgan] create failed:", createRes.status, await createRes.text());
    return null;
  }
  let prediction = await createRes.json();
  if (prediction.status === "succeeded" && prediction.output) {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }
  prediction = await pollReplicate(prediction.id, apiToken, 90, 2000);
  if (!prediction) return null;
  return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output ?? null;
}

async function runSUPIR(
  imageUrl: string,
  apiToken: string,
): Promise<string | null> {
  console.log(`[supir] running refine pass`);
  // SUPIR is a refinement model — we run upscale=2 to boost resolution while
  // restoring fine detail. Conservative settings to avoid hallucination.
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: SUPIR_VERSION,
      input: {
        image: imageUrl,
        upscale: 2,
        a_prompt:
          "cinematic, hyper detailed, highest quality, masterpiece, intricate detail, clean edges",
        n_prompt:
          "blurry, deformed, disfigured, low quality, jpeg artifacts, watermark, text",
        edm_steps: 30,
        s_stage1: -1,
        s_stage2: 1,
        s_cfg: 7.5,
        s_churn: 5,
        s_noise: 1.003,
        color_fix_type: "Wavelet",
        linear_CFG: true,
        linear_s_stage2: false,
        spt_linear_CFG: 4,
        spt_linear_s_stage2: 0,
      },
    }),
  });
  if (!createRes.ok) {
    console.error("[supir] create failed:", createRes.status, await createRes.text());
    return null;
  }
  let prediction = await createRes.json();
  if (prediction.status === "succeeded" && prediction.output) {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }
  prediction = await pollReplicate(prediction.id, apiToken, 150, 2000);
  if (!prediction) return null;
  return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output ?? null;
}

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
    const method: Method = (body.method === "supir" ? "supir" : "realesrgan");
    const scale: number = method === "supir"
      ? 2
      : Math.max(2, Math.min(8, Number(body.scale ?? 4)));

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

    const t0 = Date.now();
    const remoteUrl = method === "supir"
      ? await runSUPIR(imageUrl, apiToken)
      : await runRealESRGAN(imageUrl, scale, apiToken);
    console.log(`[enhance] method=${method} elapsed=${Date.now() - t0}ms`);

    if (!remoteUrl) {
      return new Response(
        JSON.stringify({
          error:
            method === "supir"
              ? "SUPIR enhancement failed on Replicate. Please retry."
              : "Real-ESRGAN enhancement failed on Replicate. Please retry.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Re-host to our own bucket so the URL is stable (Replicate URLs expire).
    const hosted = await rehostToGeneratedImages(remoteUrl);
    if (!hosted) {
      return new Response(
        JSON.stringify({
          error: "Enhancement succeeded but storing the result failed.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dims = await fetchImageDimensions(hosted.publicUrl);
    const provider = method === "supir" ? "replicate/supir" : "replicate/real-esrgan";

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
