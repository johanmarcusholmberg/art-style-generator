/**
 * Durable OpenAI runner.
 *
 * The durable worker (`generate-single`) previously refused OpenAI because
 * its adapter only ran in the browser. OpenAI generation is in fact fully
 * server-side already — it lives in the `generate-image-direct-openai`
 * edge function — so the durable path just needs to call it.
 *
 * This module keeps that call in one place and returns an outcome shaped
 * like `runWithResolver`'s result so `generate-single` can treat every
 * provider identically.
 */

import { ProviderError, type GenerateArgs } from "./generators.ts";

export interface OpenAIDurableOutcome {
  imageUrl: string;
  providerId: "openai";
  modelId: string;
  strategy: "manual";
  fallbackUsed: false;
  attempted: string[];
  width?: number;
  height?: number;
  requestedWidth?: number;
  requestedHeight?: number;
  requestedAspectRatio?: string;
  providerExactMatch?: boolean;
  providerAdjusted?: boolean;
}

export async function runOpenAIDurable(args: GenerateArgs): Promise<OpenAIDurableOutcome> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new ProviderError("missing-key", "Supabase service credentials are not configured");
  }
  if (!Deno.env.get("OPENAI_API_KEY")) {
    throw new ProviderError("missing-key", "OPENAI_API_KEY is not configured");
  }

  const isEdit = !!args.sourceImageUrl && !!args.isEdit;

  const body: Record<string, unknown> = {
    prompt: args.userPrompt,
    styleKey: args.styleKey,
    aspectRatio: args.aspectRatio,
    backgroundStyle: args.backgroundStyle,
    printMode: !!args.printMode,
    sizeIntent: args.sizeIntent ?? "standard",
  };
  if (args.strictness) body.strictness = args.strictness;
  if (args.posterFormatHint) body.posterFormatHint = args.posterFormatHint;
  if (args.posterFormatId) body.posterFormatId = args.posterFormatId;
  if (isEdit) {
    body.sourceImageUrl = args.sourceImageUrl;
    body.isEdit = true;
    if (args.referenceStrength) body.referenceStrength = args.referenceStrength;
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-image-direct-openai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!res.ok || !data || data.error) {
    const message = (data?.error as string) ?? `OpenAI generation failed (HTTP ${res.status})`;
    // 4xx from the OpenAI function means the request itself is wrong —
    // retrying will not help, so surface it as terminal.
    const code = res.status >= 400 && res.status < 500 ? "invalid-prompt" : "provider-error";
    throw new ProviderError(code, message);
  }
  if (typeof data.imageUrl !== "string" || !data.imageUrl) {
    throw new ProviderError("provider-error", "OpenAI returned no image");
  }

  return {
    imageUrl: data.imageUrl,
    providerId: "openai",
    modelId: (data.model as string) ?? "gpt-image-2",
    strategy: "manual",
    fallbackUsed: false,
    attempted: ["openai"],
    width: data.width as number | undefined,
    height: data.height as number | undefined,
    requestedWidth: (data.requestedWidth as number | undefined) ?? (data.width as number | undefined),
    requestedHeight: (data.requestedHeight as number | undefined) ?? (data.height as number | undefined),
    requestedAspectRatio: (data.requestedAspectRatio as string | undefined) ?? args.aspectRatio,
    providerExactMatch: data.providerExactMatch as boolean | undefined,
    providerAdjusted: data.providerAdjusted as boolean | undefined,
  };
}
