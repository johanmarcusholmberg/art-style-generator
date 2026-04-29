/**
 * Server-side generator provider abstraction (Phase 1).
 *
 * Mirrors `src/lib/generators.ts` but runs in Deno. Each provider exposes
 * a single `generate()` function that returns a normalized response.
 */

import { compilePrompt, compilePromptForSDXL } from "./prompt-compiler.ts";
import {
  defaultStrictnessFor,
  validateCompiledPrompt,
  type Strictness,
} from "./style-meta.ts";
import { STYLE_RULES } from "./prompt-compiler.ts";
import { sdxlSizeForFormat } from "./provider-sizing.ts";

export type ResolvedProviderId = "gemini" | "sdxl";
export type GeneratorPreference = "auto" | ResolvedProviderId;

export interface ProviderResult {
  imageUrl: string;
  providerId: ResolvedProviderId;
  modelId: string;
  width?: number;
  height?: number;
  warnings?: string[];
}

export interface GenerateArgs {
  userPrompt: string;
  styleKey: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  printMode?: boolean;
  isEdit?: boolean;
  sourceImageUrl?: string;
  /** Optional style strictness — defaults per-style + per-provider. */
  strictness?: Strictness;
  /**
   * Poster format hint — propagated into the prompt compiler so every
   * provider composes for the right canvas (e.g. "vertical 5:7 poster
   * format suitable for 50 × 70 cm print").
   */
  posterFormatHint?: string;
  /**
   * Poster format id (from `src/lib/print-formats.ts`). When set, providers
   * derive output pixel dimensions from the registry's recommended size
   * instead of the legacy aspect-ratio token map.
   */
  posterFormatId?: string;
}

// ── Gemini provider (existing path) ─────────────────────────────────────

export async function generateWithGemini(args: GenerateArgs): Promise<ProviderResult> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new ProviderError("missing-key", "LOVABLE_API_KEY is not configured");
  }

  const compiled = compilePrompt(args.userPrompt, args.styleKey, {
    aspectRatio: args.aspectRatio,
    backgroundStyle: args.backgroundStyle,
    isEdit: !!args.isEdit,
    printMode: !!args.printMode,
    posterFormatHint: args.posterFormatHint,
  });

  const messages = args.isEdit && args.sourceImageUrl
    ? [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: args.sourceImageUrl } },
          { type: "text", text: compiled },
        ],
      }]
    : [{ role: "user", content: compiled }];

  const modelId = "google/gemini-3-pro-image-preview";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw new ProviderError("rate-limited", "Gemini rate-limited", 429);
    if (res.status === 402) throw new ProviderError("payment-required", "Gemini usage limit reached", 402);
    throw new ProviderError("connection-failed", `Gemini error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => null);
  const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) throw new ProviderError("no-image", "Gemini returned no image");

  return {
    imageUrl,
    providerId: "gemini",
    modelId,
  };
}

// ── SDXL provider (Replicate) ───────────────────────────────────────────

const REPLICATE_SDXL_VERSION =
  "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"; // stability-ai/sdxl

export async function generateWithSDXL(args: GenerateArgs): Promise<ProviderResult> {
  const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
  if (!REPLICATE_API_TOKEN) {
    throw new ProviderError("missing-key", "REPLICATE_API_TOKEN is not configured");
  }

  // SDXL doesn't accept image input in this phase
  if (args.isEdit && args.sourceImageUrl) {
    throw new ProviderError(
      "unsupported",
      "SDXL does not support image-to-image edits yet. Use Gemini for edits.",
    );
  }

  const strictness: Strictness =
    args.strictness ?? defaultStrictnessFor(args.styleKey, "sdxl");

  const compiled = compilePromptForSDXL(args.userPrompt, args.styleKey, {
    aspectRatio: args.aspectRatio,
    backgroundStyle: args.backgroundStyle,
    isEdit: false,
    printMode: !!args.printMode,
    provider: "sdxl",
    strictness,
    posterFormatHint: args.posterFormatHint,
  });

  // Pre-generation validation — log issues but only block on errors.
  const rules = STYLE_RULES[args.styleKey];
  const report = validateCompiledPrompt({
    styleKey: args.styleKey,
    provider: "sdxl",
    prompt: compiled.prompt,
    negativePrompt: compiled.negativePrompt,
    styleMustHavesCount:
      (rules?.styleAnchors.length ?? 0) + (rules?.styleRules.length ?? 0),
    styleAvoidCount:
      (rules?.avoidRules.length ?? 0) + (rules?.blockedTraits?.length ?? 0),
  });
  for (const i of report.issues) {
    console.log(`[sdxl/validation] ${i.level}: ${i.message}`);
  }
  if (!report.ok) {
    throw new ProviderError(
      "invalid-prompt",
      `SDXL prompt failed validation: ${report.issues.map((i) => i.message).join("; ")}`,
    );
  }

  console.log(
    `[sdxl] style=${args.styleKey} category=${compiled.category} strictness=${strictness} ` +
      `prompt_len=${compiled.prompt.length} neg_len=${(compiled.negativePrompt ?? "").length}`,
  );

  const sized = sdxlSizeForFormat(args.posterFormatId, args.aspectRatio);
  const { width, height } = sized;
  console.log(
    `[sdxl] size=${width}x${height} source=${sized.source} posterFormatId=${args.posterFormatId ?? "none"} aspectRatio=${args.aspectRatio ?? "none"}`,
  );

  // Create prediction
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      version: REPLICATE_SDXL_VERSION,
      input: {
        prompt: compiled.prompt,
        width,
        height,
        num_inference_steps: 40,
        guidance_scale: 7.5,
        scheduler: "K_EULER",
        refine: "expert_ensemble_refiner",
        high_noise_frac: 0.8,
        apply_watermark: false,
        negative_prompt:
          compiled.negativePrompt ||
          "low quality, blurry, soft focus, jpeg artifacts, watermark, signature, text, words, letters, ugly deformed",
      },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    throw new ProviderError(
      "connection-failed",
      `Replicate SDXL error ${createRes.status}: ${text.slice(0, 200)}`,
    );
  }

  let prediction = await createRes.json();

  // If Prefer: wait didn't finish it, poll
  const start = Date.now();
  const TIMEOUT = 120_000;
  while (
    prediction.status !== "succeeded" &&
    prediction.status !== "failed" &&
    prediction.status !== "canceled"
  ) {
    if (Date.now() - start > TIMEOUT) {
      throw new ProviderError("timeout", "SDXL generation timed out after 120s");
    }
    await new Promise((r) => setTimeout(r, 1500));
    const pollRes = await fetch(prediction.urls.get, {
      headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
    });
    prediction = await pollRes.json();
  }

  if (prediction.status !== "succeeded") {
    throw new ProviderError(
      "generation-failed",
      `SDXL ${prediction.status}: ${prediction.error || "unknown"}`,
    );
  }

  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!output || typeof output !== "string") {
    throw new ProviderError("no-image", "SDXL returned no image URL");
  }

  return {
    imageUrl: output,
    providerId: "sdxl",
    modelId: "stability-ai/sdxl",
    width,
    height,
  };
}

// ── Provider error type ────────────────────────────────────────────────

export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// ── Resolver + run with fallback ───────────────────────────────────────

export interface ResolvedRun {
  primary: ResolvedProviderId;
  fallbackChain: ResolvedProviderId[];
  strategy: "auto" | "manual";
}

export function resolveProviders(pref: GeneratorPreference): ResolvedRun {
  if (pref === "auto") {
    return { primary: "sdxl", fallbackChain: ["gemini"], strategy: "auto" };
  }
  return { primary: pref, fallbackChain: [], strategy: "manual" };
}

const PROVIDER_RUNNERS: Record<
  ResolvedProviderId,
  (args: GenerateArgs) => Promise<ProviderResult>
> = {
  gemini: generateWithGemini,
  sdxl: generateWithSDXL,
};

export interface RunOutcome extends ProviderResult {
  fallbackUsed: boolean;
  strategy: "auto" | "manual";
  attempted: Array<{ providerId: ResolvedProviderId; ok: boolean; error?: string }>;
}

/** Run the resolved primary provider; if Auto, try fallbacks on error. */
export async function runWithResolver(
  pref: GeneratorPreference,
  args: GenerateArgs,
): Promise<RunOutcome> {
  const resolved = resolveProviders(pref);
  const chain = [resolved.primary, ...resolved.fallbackChain];
  const attempted: RunOutcome["attempted"] = [];

  for (let i = 0; i < chain.length; i++) {
    const id = chain[i];
    const isFallback = i > 0;
    try {
      console.log(
        `[generator] attempting=${id} strategy=${resolved.strategy}` +
          (isFallback ? ` (fallback from ${chain[i - 1]})` : ""),
      );
      const result = await PROVIDER_RUNNERS[id](args);
      attempted.push({ providerId: id, ok: true });
      console.log(
        `[generator] success provider=${id} model=${result.modelId} fallback=${isFallback}`,
      );
      return {
        ...result,
        fallbackUsed: isFallback,
        strategy: resolved.strategy,
        attempted,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attempted.push({ providerId: id, ok: false, error: msg });
      console.error(`[generator] provider=${id} failed: ${msg}`);
      // Manual selections never auto-fallback
      if (resolved.strategy === "manual") throw err;
    }
  }

  // Auto exhausted all providers
  const summary = attempted
    .map((a) => `${a.providerId}:${a.ok ? "ok" : a.error}`)
    .join(" | ");
  throw new ProviderError(
    "all-providers-failed",
    `All generators failed. Attempted: ${summary}`,
  );
}
