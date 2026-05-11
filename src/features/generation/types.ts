/**
 * Shared types for the generation feature folder.
 *
 * This folder holds the incremental Part B refactor of ImageGenerator.tsx
 * into smaller, testable units. ImageGenerator.tsx itself still owns the
 * full UI/behavior for now; these modules are introduced first so future
 * extractions can land without touching call sites.
 */
import type { StyleConfig } from "@/lib/style-config";
import type { QualityTarget } from "@/lib/print-resolution";

export type GenerationVariant = "themed" | "freestyle" | "tertiary";

export interface GenerationPanelProps {
  mode: GenerationVariant;
  styleConfig: StyleConfig;
  onImageSaved?: () => void;
  onExitEdit?: () => void;
  initialPrompt?: string;
  initialImageUrl?: string | null;
  originalImageId?: string | null;
  originalStoragePath?: string | null;
}

export interface UseGenerateImageResult {
  imageUrl: string | null;
  baseImageUrl: string | null;
  isLoading: boolean;
  isEnhancing: boolean;
  error: string | null;
  provider: string | null;
  model: string | null;
  route: string | null;
  promptVersion: string | null;
  estimatedCost: number | null;
  generate: (input: GenerateInput) => Promise<void>;
  reset: () => void;
}

export interface GenerateInput {
  prompt: string;
  aspectRatio?: string;
  backgroundStyle?: "white" | "cream";
  sourceImageUrl?: string | null;
  generationMode?: "standard" | "print-ready";
  printFormatId?: string | null;
}

export interface SaveImageInput {
  imageUrl: string;
  prompt: string;
  mode: string;
  aspectRatio: string;
  printSize: string;
  qualityMode?: QualityTarget;
  enhanced?: boolean;
  enhancedImageUrl?: string;
  provider?: string;
  model?: string;
  route?: string;
  promptVersion?: string;
  estimatedCost?: number | null;
  currency?: string;
  assetRole?: "base_generation" | "enhanced_master" | "print_export" | "mockup_preview";
  baseWidth?: number;
  baseHeight?: number;
  masterWidth?: number;
  masterHeight?: number;
  printFormatId?: string;
  printReadiness?: string;
}
