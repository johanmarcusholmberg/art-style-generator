/**
 * useGenerateImage — incremental Part B extraction.
 *
 * Thin React hook around the existing generation router. Today it does
 * not own all of the generation state inside ImageGenerator.tsx; it is a
 * focused unit that future iterations of the split can call directly.
 *
 * Behavior parity: this uses the same `generateImage` path as the rest
 * of the app, so prompt/quality/upscale logic is unchanged.
 */
import { useCallback, useState } from "react";
import { generateImage } from "@/lib/generation-router";
import { enforcePosterRatio } from "@/lib/poster-ratio-enforce";
import type { GenerateInput, UseGenerateImageResult } from "./types";

export function useGenerateImage(styleKey: string): UseGenerateImageResult {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [baseImageUrl, setBaseImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const [promptVersion, setPromptVersion] = useState<string | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);

  const generate = useCallback(
    async (input: GenerateInput) => {
      setIsLoading(true);
      setError(null);
      try {
        const isPrint = input.generationMode === "print-ready";
        const { response: res } = await generateImage({
          prompt: input.prompt,
          styleKey,
          aspectRatio: input.aspectRatio,
          backgroundStyle: input.backgroundStyle,
          printMode: isPrint,
          // Print-ready mode must propagate the size intent so adapter
          // overrides (ratio-preserving sizing) are emitted to providers.
          sizeIntent: isPrint ? "print" : undefined,
          posterFormatId: input.printFormatId ?? undefined,
          referenceImageUrl: input.sourceImageUrl ?? undefined,
          isEdit: !!input.sourceImageUrl,
          referenceStrength: input.sourceImageUrl ? input.referenceStrength : undefined,
        });

        // Post-generation guard: providers (notably Gemini) often drift
        // off the requested poster ratio. Pad the master to the exact
        // poster ratio BEFORE we expose it as `imageUrl` so every
        // downstream flow (gallery save, upscale, PPI checks, export)
        // works on a correctly shaped asset.
        let finalUrl = res.imageUrl;
        if (isPrint && input.printFormatId) {
          try {
            const enforced = await enforcePosterRatio({
              imageUrl: res.imageUrl,
              formatId: input.printFormatId,
            });
            if (enforced) finalUrl = enforced.url;
          } catch (e) {
            console.warn("[useGenerateImage] poster ratio enforcement failed", e);
          }
        }

        setImageUrl(finalUrl);
        setBaseImageUrl(finalUrl);
        setProvider(res.generationProvider);
        setModel(res.generationModel);
        setRoute(res.executionRoute);
        const meta = (res.metadata as Record<string, unknown> | undefined) || {};
        setPromptVersion((meta.promptVersion as string) ?? null);
        setEstimatedCost(
          typeof meta.estimatedCost === "number" ? (meta.estimatedCost as number) : null,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Generation failed");
      } finally {
        setIsLoading(false);
      }
    },
    [styleKey],
  );


  const reset = useCallback(() => {
    setImageUrl(null);
    setBaseImageUrl(null);
    setError(null);
    setProvider(null);
    setModel(null);
    setRoute(null);
    setPromptVersion(null);
    setEstimatedCost(null);
  }, []);

  return {
    imageUrl,
    baseImageUrl,
    isLoading,
    isEnhancing,
    error,
    provider,
    model,
    route,
    promptVersion,
    estimatedCost,
    generate,
    reset,
  };
}
