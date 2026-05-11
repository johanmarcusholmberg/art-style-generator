/**
 * GenerationPanel — scaffolded composition root for the new generation
 * UI (Part B incremental).
 *
 * The active full-feature generator UI still lives in
 * `src/components/ImageGenerator.tsx`. This panel exists so future
 * iterations of the split can land without touching call sites.
 *
 * For now we re-export the existing ImageGenerator component as the
 * default panel. The named export `GenerationPanelScaffold` is reserved
 * for the upcoming smaller composition.
 */
import ImageGenerator from "@/components/ImageGenerator";
import type { GenerationPanelProps } from "./types";

export default function GenerationPanel(props: GenerationPanelProps) {
  return <ImageGenerator {...props} />;
}

export { default as PromptInput } from "./PromptInput";
export { default as GenerationModeSelector } from "./GenerationModeSelector";
export { default as GeneratedImageActions } from "./GeneratedImageActions";
export { useGenerateImage } from "./useGenerateImage";
export { useSaveGeneratedImage } from "./useSaveGeneratedImage";
export { usePrintExport } from "./usePrintExport";
export * from "./types";
