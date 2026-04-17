import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

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

type UpscaleMode = "none" | "realesrgan_4x" | "tile_4x" | "tile_8x";

// Raised from 8192 → 12288. Clarity Upscaler can handle outputs up to ~12K px
// on the long side, so this allows 8× to actually run on typical 1024–1536 px
// generated sources without silently downshifting.
const TILE_8X_MAX_LONG_SIDE = 12288;
// Clarity's practical minimum short-side after pre-downscale. Below this we
// fall back to 4× rather than producing mush.
const TILE_8X_MIN_SHORT_SIDE = 512;

/* ------------------------------------------------------------------ */
/*  ImageMagick init (one-shot, cached at module scope)               */
/* ------------------------------------------------------------------ */

let magickReady: Promise<void> | null = null;
async function ensureMagick(): Promise<void> {
  if (!magickReady) {
    magickReady = (async () => {
      const wasmRes = await fetch(
        "https://esm.sh/@imagemagick/magick-wasm@0.0.30/dist/magick.wasm",
      );
      const wasmBytes = new Uint8Array(await wasmRes.arrayBuffer());
      await initialize(wasmBytes);
    })();
  }
  return magickReady;
}

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
 * dimension, using Lanczos resampling (sharpest reasonable filter for downscale).
 *
 * Returns a public data URL (PNG) suitable for handing to Replicate, plus the
 * new dimensions. Returns null on failure (caller should fall back).
 */
async function preDownscaleToFit(
  sourceUrl: string,
  targetLongSide: number,
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    await ensureMagick();
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      console.error("[predownscale] failed to fetch source:", res.status);
      return null;
    }
    const inputBytes = new Uint8Array(await res.arrayBuffer());

    return await new Promise((resolve) => {
      ImageMagick.read(inputBytes, (img) => {
        const srcW = img.width;
        const srcH = img.height;
        const longSide = Math.max(srcW, srcH);
        const ratio = targetLongSide / longSide;
        const newW = Math.max(1, Math.round(srcW * ratio));
        const newH = Math.max(1, Math.round(srcH * ratio));

        // Lanczos = sharpest standard downscale filter. magick-wasm exposes
        // it via FilterType.Lanczos (numeric 22 in ImageMagick's enum).
        // Using the numeric form avoids importing the FilterType binding.
        try {
          (img as any).filterType = 22; // Lanczos
        } catch { /* ignore — resize will still pick a sane default */ }
        img.resize(newW, newH);

        img.write(MagickFormat.Png, (data) => {
          // Build a data URL Replicate can fetch.
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < data.length; i += chunk) {
            binary += String.fromCharCode.apply(
              null,
              data.subarray(i, i + chunk) as unknown as number[],
            );
          }
          const b64 = btoa(binary);
          resolve({
            dataUrl: `data:image/png;base64,${b64}`,
            w: newW,
            h: newH,
          });
        });
      });
    });
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
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const imageUrl: string | undefined = body.imageUrl;

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
          pipeline: { mode: "none", scale: 1, provider: "none", downshifted: false },
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

    let downshifted = false;
    let preDownscaled = false;
    let appliedScale = 4;
    let provider = "replicate/real-esrgan";
    let outputUrl: string | null = null;

    if (mode === "realesrgan_4x") {
      appliedScale = 4;
      provider = "replicate/real-esrgan";
      outputUrl = await runRealESRGAN(imageUrl, 4, REPLICATE_API_TOKEN);
    } else if (mode === "tile_4x") {
      appliedScale = 4;
      provider = "replicate/clarity-upscaler";
      outputUrl = await runClarityUpscaler(imageUrl, 4, REPLICATE_API_TOKEN);
    } else if (mode === "tile_8x") {
      provider = "replicate/clarity-upscaler";

      // Decide between three paths:
      //   (a) source small enough → run 8× directly
      //   (b) source too large but pre-downscale leaves short-side >= 512 → pre-downscale, then 8×
      //   (c) source too large AND pre-downscale would shrink it below 512 short-side → fallback to 4×
      const dims = await fetchImageDimensions(imageUrl);
      const longSide = dims ? Math.max(dims.w, dims.h) : 0;
      const shortSide = dims ? Math.min(dims.w, dims.h) : 0;
      const projected8x = longSide * 8;

      if (!dims || projected8x <= TILE_8X_MAX_LONG_SIDE) {
        // (a) Direct 8× — source is small enough (or unknown; trust caller).
        appliedScale = 8;
        console.log(
          `[tile_8x] ran at 8× (source ${dims ? `${dims.w}x${dims.h}` : "unknown"}, projected ${projected8x || "?"}px)`,
        );
        outputUrl = await runClarityUpscaler(imageUrl, 8, REPLICATE_API_TOKEN);
      } else {
        // Source is too large for direct 8×. Compute the largest source size
        // that keeps 8× output under the cap.
        const targetLongSide = Math.floor(TILE_8X_MAX_LONG_SIDE / 8); // e.g. 1536
        const downscaleRatio = targetLongSide / longSide;
        const projectedShortSide = Math.round(shortSide * downscaleRatio);

        if (projectedShortSide >= TILE_8X_MIN_SHORT_SIDE) {
          // (b) Pre-downscale path
          const newTargetW = Math.round(dims.w * downscaleRatio);
          const newTargetH = Math.round(dims.h * downscaleRatio);
          console.log(
            `[tile_8x] pre-downscaling source from ${dims.w}x${dims.h} to ${newTargetW}x${newTargetH} then running at 8×`,
          );
          const downscaled = await preDownscaleToFit(imageUrl, targetLongSide);
          if (downscaled) {
            preDownscaled = true;
            appliedScale = 8;
            console.log(
              `[tile_8x] pre-downscaled source from ${dims.w}x${dims.h} to ${downscaled.w}x${downscaled.h} then ran at 8×`,
            );
            outputUrl = await runClarityUpscaler(downscaled.dataUrl, 8, REPLICATE_API_TOKEN);
          } else {
            // Pre-downscale failed → safe fallback to 4× on the original
            console.warn("[tile_8x] pre-downscale failed, falling back to 4× on original");
            downshifted = true;
            appliedScale = 4;
            outputUrl = await runClarityUpscaler(imageUrl, 4, REPLICATE_API_TOKEN);
          }
        } else {
          // (c) Source too small after pre-downscale → 4× fallback
          console.log(
            `[tile_8x] source too small (would shrink to ${projectedShortSide}px short-side, < ${TILE_8X_MIN_SHORT_SIDE}), downshifted to 4×`,
          );
          downshifted = true;
          appliedScale = 4;
          outputUrl = await runClarityUpscaler(imageUrl, 4, REPLICATE_API_TOKEN);
        }
      }
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown upscale mode: ${mode}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!outputUrl) {
      return new Response(
        JSON.stringify({
          error: "Upscale failed — original image preserved.",
          imageUrl,
          pipeline: { mode, scale: 1, provider, downshifted: false, failed: true },
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        imageUrl: outputUrl,
        pipeline: {
          mode,
          appliedMode: downshifted ? "tile_4x" : mode,
          scale: appliedScale,
          provider,
          downshifted,
          preDownscaled,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("upscale-image error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
