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
        const { response: res } = await generateImage({
          prompt: input.prompt,
          styleKey,
          aspectRatio: input.aspectRatio,
          backgroundStyle: input.backgroundStyle,
          printMode: input.generationMode === "print-ready",
          posterFormatId: input.printFormatId ?? undefined,
          referenceImageUrl: input.sourceImageUrl ?? undefined,
          isEdit: !!input.sourceImageUrl,
          referenceStrength: input.sourceImageUrl ? input.referenceStrength : undefined,
        });
        setImageUrl(res.imageUrl);
        setBaseImageUrl(res.imageUrl);
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
