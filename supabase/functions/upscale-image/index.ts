import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Mode-based upscale dispatcher.
 *
 * Modes:
 *   - realesrgan_4x  → Replicate Real-ESRGAN x4 (fast, single-pass super-resolution)
 *   - tile_4x        → Replicate Clarity Upscaler (SDXL + ControlNet tile, 4x)
 *   - tile_8x        → Clarity Upscaler at 8x (with ~12K hard cap + pre-downscale path)
 *
 * The frontend always sends one shared body: { imageUrl, mode }
 */

type UpscaleMode = "none" | "realesrgan_4x" | "tile_4x" | "tile_8x" | "print_plus";

// Raised from 8192 → 12288. Clarity Upscaler can handle outputs up to ~12K px
// on the long side, so this allows 8× to actually run on typical 1024–1536 px
// generated sources without silently downshifting.
const TILE_8X_MAX_LONG_SIDE = 12288;
// Clarity's practical minimum short-side after pre-downscale. Below this we
// fall back to 4× rather than producing mush.
const TILE_8X_MIN_SHORT_SIDE = 512;

/* ------------------------------------------------------------------ */
/*  (No external init needed — imagescript is pure TS/Wasm)            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function pollReplicate(
  predictionId: string,
  apiToken: string,
  maxAttempts = 90,
  intervalMs = 2000,
): Promise<any> {
  const pollUrl = `https://api.replicate.com/v1/predictions/${predictionId}`;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await fetch(pollUrl, { headers: { Authorization: `Bearer ${apiToken}` } });
    if (!res.ok) {
      console.error("Replicate poll error:", res.status, await res.text());
      return null;
    }
    const pred = await res.json();
    if (pred.status === "succeeded") return pred;
    if (pred.status === "failed" || pred.status === "canceled") {
      console.error("Replicate prediction failed:", pred.error);
      return null;
    }
  }
  console.error("Replicate prediction timed out");
  return null;
}

async function fetchImageDimensions(url: string): Promise<{ w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());

    // PNG: 8-byte signature, then IHDR chunk at offset 16 (width) & 20 (height).
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
      const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
      return { w, h };
    }

    // JPEG: scan for SOF marker (FFC0..FFCF except FFC4/FFC8/FFCC).
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
          return { w, h };
        }
        const segLen = (buf[i + 2] << 8) | buf[i + 3];
        i += 2 + segLen;
      }
    }
  } catch (err) {
    console.warn("Could not read image dimensions:", err);
  }
  return null;
}

/**
 * Pre-downscale a source image to fit within `targetLongSide` on its longest
 * dimension, using cubic resampling via imagescript (Deno-native, no native
 * deps). Cubic is sharper than bilinear and well-suited for moderate
 * downscales — Clarity will re-add detail downstream during the 8× pass.
 *
 * Returns a base64 data URL (PNG) suitable for handing to Replicate, plus the
 * new dimensions. Returns null on failure (caller should fall back).
 */
async function preDownscaleToFit(
  sourceUrl: string,
  targetLongSide: number,
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      console.error("[predownscale] failed to fetch source:", res.status);
      return null;
    }
    const inputBytes = new Uint8Array(await res.arrayBuffer());
    const img = await Image.decode(inputBytes);
    const srcW = img.width;
    const srcH = img.height;
    const longSide = Math.max(srcW, srcH);
    const ratio = targetLongSide / longSide;
    const newW = Math.max(1, Math.round(srcW * ratio));
    const newH = Math.max(1, Math.round(srcH * ratio));

    img.resize(newW, newH, Image.RESIZE_AUTO, Image.RESIZE_BICUBIC);
    const pngBytes = await img.encode(); // PNG by default

    // Base64-encode in chunks to avoid call-stack limits on large images.
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < pngBytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        pngBytes.subarray(i, i + chunk) as unknown as number[],
      );
    }
    const b64 = btoa(binary);
    return {
      dataUrl: `data:image/png;base64,${b64}`,
      w: newW,
      h: newH,
    };
  } catch (err) {
    console.error("[predownscale] error:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Mode: Real-ESRGAN 4x (fast super-resolution)                       */
/* ------------------------------------------------------------------ */

async function runRealESRGAN(
  imageUrl: string,
  scaleFactor: number,
  apiToken: string,
): Promise<string | null> {
  console.log(`[realesrgan] running ${scaleFactor}x super-resolution…`);
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa",
      input: {
        image: imageUrl,
        scale: scaleFactor,
        face_enhance: false,
      },
    }),
  });

  if (!createRes.ok) {
    console.error("Real-ESRGAN create error:", createRes.status, await createRes.text());
    return null;
  }

  let prediction = await createRes.json();
  if (prediction.status === "succeeded" && prediction.output) {
    return typeof prediction.output === "string" ? prediction.output : prediction.output[0];
  }

  prediction = await pollReplicate(prediction.id, apiToken);
  if (!prediction) return null;
  return typeof prediction.output === "string" ? prediction.output : prediction.output?.[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Mode: Tiled SDXL via Clarity Upscaler                              */
/* ------------------------------------------------------------------ */

async function runClarityUpscaler(
  imageUrl: string,
  scaleFactor: number,
  apiToken: string,
): Promise<string | null> {
  console.log(`[clarity] running tiled SDXL ${scaleFactor}x…`);

  // philz1337x/clarity-upscaler — SDXL + ControlNet tile + native overlapping tiles
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: "dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e",
      input: {
        image: imageUrl,
        scale_factor: scaleFactor,
        // Lower creativity = more faithful to source (preserves composition,
        // borders, and frame elements). Higher resemblance = same.
        creativity: 0.3,
        resemblance: 0.75,
        dynamic: 6,
        sharpen: 0,
        handfix: "disabled",
        pattern: false,
        // Conservative tile size keeps memory under control on large outputs.
        tiling_width: 112,
        tiling_height: 144,
        sd_model: "juggernaut_reborn.safetensors [338b85bc4f]",
        scheduler: "DPM++ 3M SDE Karras",
        num_inference_steps: 18,
        seed: 1337,
        downscaling: false,
        downscaling_resolution: 768,
        lora_links: "",
        custom_sd_model: "",
        negative_prompt:
          "(worst quality, low quality, normal quality:2), text, watermark, signature, blurry, deformed, jpeg artifacts",
        prompt:
          "masterpiece, best quality, highres, intricate detail, clean edges, preserve composition",
      },
    }),
  });

  if (!createRes.ok) {
    console.error("Clarity create error:", createRes.status, await createRes.text());
    return null;
  }

  let prediction = await createRes.json();
  if (prediction.status === "succeeded" && prediction.output) {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }

  // Tiled jobs can take 1–3 minutes; poll up to ~5 minutes.
  prediction = await pollReplicate(prediction.id, apiToken, 150, 2000);
  if (!prediction) return null;
  return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output ?? null;
}

/* ------------------------------------------------------------------ */
/*  Mode: SUPIR refine (post-ESRGAN detail enhancement)                */
/* ------------------------------------------------------------------ */

/**
 * Run SUPIR as a refinement pass on an already-upscaled image.
 * SUPIR (Scaling-UP Image Restoration) adds fine detail and texture without
 * changing resolution. We use it as the optional final stage of `print_plus`.
 *
 * Returns null on any failure — caller MUST fall back to the input image.
 *
 * Replicate model: cjwbw/supir
 */
async function runSupirRefine(
  imageUrl: string,
  apiToken: string,
  strength: "low" | "medium" = "medium",
): Promise<string | null> {
  console.log(`[supir] running refine pass (strength=${strength})…`);
  try {
    // Tunables per strength tier. Keep conservative — SUPIR can hallucinate
    // when pushed too hard.
    const cfgScale = strength === "low" ? 5 : 7.5;
    const sNoise = strength === "low" ? 1.0 : 1.003;

    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        // cjwbw/supir — pinned version of the SUPIR restoration model
        version: "2267e729dcfa0b7f5e6b5e7e5d7e4d5b3c2a1d0e9f8a7b6c5d4e3f2a1b0c9d8e",
        input: {
          image: imageUrl,
          upscale: 1, // Refine only — ESRGAN already did the scaling
          a_prompt:
            "cinematic, hyper detailed, highest quality, masterpiece, intricate detail, clean edges",
          n_prompt:
            "painting, oil painting, illustration, drawing, art, sketch, anime, cartoon, cgi, render, 3d, blurry, deformed, disfigured, low quality, jpeg artifacts",
          edm_steps: 30,
          s_stage1: -1,
          s_stage2: 1,
          s_cfg: cfgScale,
          s_churn: 5,
          s_noise: sNoise,
          color_fix_type: "Wavelet",
          linear_CFG: true,
          linear_s_stage2: false,
          spt_linear_CFG: 4,
          spt_linear_s_stage2: 0,
        },
      }),
    });

    if (!createRes.ok) {
      console.error("[supir] create error:", createRes.status, await createRes.text());
      return null;
    }

    let prediction = await createRes.json();
    if (prediction.status === "succeeded" && prediction.output) {
      return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    }

    // SUPIR is slow — poll up to ~5 minutes.
    prediction = await pollReplicate(prediction.id, apiToken, 150, 2000);
    if (!prediction) return null;
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output ?? null;
  } catch (err) {
    console.error("[supir] unexpected error:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const imageUrl: string | undefined = body.imageUrl;
    const galleryImageId: string | undefined = body.galleryImageId;

    // Accept new mode-based API + legacy fields for backwards compatibility.
    let mode: UpscaleMode = body.mode ?? "realesrgan_4x";
    if (!mode && body.scaleFactor) {
      mode = body.scaleFactor >= 4 ? "realesrgan_4x" : "realesrgan_4x";
    }

    if (!imageUrl || typeof imageUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing imageUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "none") {
      return new Response(
        JSON.stringify({
          imageUrl,
          pipeline: { mode: "none", scale: 1, provider: "none", downshifted: false, async: false },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Upscaling service not configured. Please add your Replicate API token." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /* ---------------------------------------------------------------- */
    /*  SYNC PATH — fast modes only (realesrgan_4x).                     */
    /* ---------------------------------------------------------------- */
    if (mode === "realesrgan_4x") {
      console.log(`[sync] mode=realesrgan_4x src=${imageUrl}`);
      const t0 = Date.now();
      const outputUrl = await runRealESRGAN(imageUrl, 4, REPLICATE_API_TOKEN);
      console.log(`[sync] realesrgan_4x finished in ${Date.now() - t0}ms`);

      if (!outputUrl) {
        return new Response(
          JSON.stringify({
            error: "Upscale failed — original image preserved.",
            imageUrl,
            pipeline: { mode, scale: 1, provider: "replicate/real-esrgan", failed: true, async: false },
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          imageUrl: outputUrl,
          pipeline: {
            mode,
            appliedMode: mode,
            scale: 4,
            provider: "replicate/real-esrgan",
            downshifted: false,
            async: false,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /* ---------------------------------------------------------------- */
    /*  ASYNC PATH — heavy modes (tile_4x, tile_8x, print_plus).         */
    /*  Returns 202 immediately with a job id; webhook delivers result.  */
    /* ---------------------------------------------------------------- */
    if (mode === "tile_4x" || mode === "tile_8x" || mode === "print_plus") {
      const supabaseAdmin = createSupabaseAdmin();

      // Decide first-stage provider/inputs by mode.
      // print_plus → first stage is ESRGAN, then webhook chains SUPIR.
      // tile_4x / tile_8x → single Clarity stage at the requested scale.
      let firstStageProvider: string;
      let predictionBody: Record<string, unknown>;
      let nextStage: string | undefined;
      let appliedScale = 4;
      let downshifted = false;
      let preDownscaled = false;
      let sourceForReplicate = imageUrl;

      if (mode === "print_plus") {
        firstStageProvider = "replicate/real-esrgan+supir";
        nextStage = "supir_refine";
        appliedScale = 4;
        predictionBody = {
          version: "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa",
          input: {
            image: imageUrl,
            scale: 4,
            face_enhance: false,
          },
        };
      } else if (mode === "tile_4x") {
        firstStageProvider = "replicate/clarity-upscaler";
        appliedScale = 4;
        predictionBody = clarityPredictionBody(imageUrl, 4);
      } else {
        // tile_8x — apply the same 12K cap / pre-downscale logic as before.
        firstStageProvider = "replicate/clarity-upscaler";
        const dims = await fetchImageDimensions(imageUrl);
        const longSide = dims ? Math.max(dims.w, dims.h) : 0;
        const shortSide = dims ? Math.min(dims.w, dims.h) : 0;
        const projected8x = longSide * 8;

        if (!dims || projected8x <= TILE_8X_MAX_LONG_SIDE) {
          appliedScale = 8;
          console.log(
            `[async tile_8x] direct 8× (source ${dims ? `${dims.w}x${dims.h}` : "unknown"})`,
          );
        } else {
          const targetLongSide = Math.floor(TILE_8X_MAX_LONG_SIDE / 8);
          const downscaleRatio = targetLongSide / longSide;
          const projectedShortSide = Math.round(shortSide * downscaleRatio);

          if (projectedShortSide >= TILE_8X_MIN_SHORT_SIDE) {
            const downscaled = await preDownscaleToFit(imageUrl, targetLongSide);
            if (downscaled) {
              preDownscaled = true;
              appliedScale = 8;
              sourceForReplicate = downscaled.dataUrl;
              console.log(
                `[async tile_8x] pre-downscaled ${dims.w}x${dims.h} → ${downscaled.w}x${downscaled.h}`,
              );
            } else {
              downshifted = true;
              appliedScale = 4;
              console.warn("[async tile_8x] pre-downscale failed → 4× fallback");
            }
          } else {
            downshifted = true;
            appliedScale = 4;
            console.log(
              `[async tile_8x] source too small for 8× (would shrink to ${projectedShortSide}px) → 4× fallback`,
            );
          }
        }
        predictionBody = clarityPredictionBody(sourceForReplicate, appliedScale);
      }

      // 1) Insert the job row first so we have a stable id for the webhook URL.
      const { data: jobRow, error: insertErr } = await supabaseAdmin
        .from("upscale_jobs")
        .insert({
          image_id: galleryImageId ?? null,
          mode,
          status: "queued",
          source_url: imageUrl,
          pipeline: {
            mode,
            scale: appliedScale,
            provider: firstStageProvider,
            next: nextStage,
            downshifted,
            preDownscaled,
            async: true,
            ...(mode === "print_plus" ? { supirAttempted: false } : {}),
          },
        })
        .select("id")
        .single();

      if (insertErr || !jobRow) {
        console.error("[async] failed to insert upscale_jobs row:", insertErr);
        return new Response(
          JSON.stringify({ error: "Failed to create upscale job" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // 2) Create the Replicate prediction with our webhook URL.
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const webhookUrl = `${supabaseUrl}/functions/v1/upscale-webhook?token=${jobRow.id}`;
      const t0 = Date.now();
      let predictionId: string | null = null;
      try {
        const createRes = await fetch("https://api.replicate.com/v1/predictions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...predictionBody,
            webhook: webhookUrl,
            webhook_events_filter: ["start", "completed"],
          }),
        });
        if (!createRes.ok) {
          const txt = await createRes.text();
          throw new Error(`Replicate create failed [${createRes.status}]: ${txt}`);
        }
        const created = await createRes.json();
        predictionId = created.id;
        console.log(
          `[async] mode=${mode} job=${jobRow.id} prediction=${predictionId} created in ${Date.now() - t0}ms`,
        );
      } catch (err) {
        console.error("[async] failed to create Replicate prediction:", err);
        await supabaseAdmin
          .from("upscale_jobs")
          .update({
            status: "failed",
            error_message: String(err),
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobRow.id);
        return new Response(
          JSON.stringify({ error: "Failed to start remote upscale", jobId: jobRow.id }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await supabaseAdmin
        .from("upscale_jobs")
        .update({
          status: "processing",
          replicate_prediction_id: predictionId,
          started_at: new Date().toISOString(),
        })
        .eq("id", jobRow.id);

      return new Response(
        JSON.stringify({
          jobId: jobRow.id,
          status: "processing",
          pipeline: {
            mode,
            scale: appliedScale,
            provider: firstStageProvider,
            downshifted,
            preDownscaled,
            async: true,
          },
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown upscale mode: ${mode}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("upscale-image error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/* ------------------------------------------------------------------ */
/*  Helpers for async path                                             */
/* ------------------------------------------------------------------ */

function clarityPredictionBody(image: string, scaleFactor: number) {
  return {
    version: "dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e",
    input: {
      image,
      scale_factor: scaleFactor,
      creativity: 0.3,
      resemblance: 0.75,
      dynamic: 6,
      sharpen: 0,
      handfix: "disabled",
      pattern: false,
      tiling_width: 112,
      tiling_height: 144,
      sd_model: "juggernaut_reborn.safetensors [338b85bc4f]",
      scheduler: "DPM++ 3M SDE Karras",
      num_inference_steps: 18,
      seed: 1337,
      downscaling: false,
      downscaling_resolution: 768,
      lora_links: "",
      custom_sd_model: "",
      negative_prompt:
        "(worst quality, low quality, normal quality:2), text, watermark, signature, blurry, deformed, jpeg artifacts",
      prompt:
        "masterpiece, best quality, highres, intricate detail, clean edges, preserve composition",
    },
  };
}

let _adminClient: ReturnType<typeof createClient> | null = null;
function createSupabaseAdmin() {
  if (_adminClient) return _adminClient;
  _adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return _adminClient;
}
