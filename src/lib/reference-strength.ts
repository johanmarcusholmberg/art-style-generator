/**
 * Reference strength — how strongly an uploaded reference image should
 * influence the generation.
 *
 * The current generation backend (Lovable gateway → Gemini for edits) does
 * not expose a numeric image-strength / denoise parameter. We therefore
 * implement the four levels as PROMPT instructions that are prepended to
 * the compiled style prompt when a source image is provided.
 *
 * The same id is forwarded through the entire request chain so:
 *   - the router/adapter can log it,
 *   - the edge function can inject the matching instruction sentence,
 *   - the UI/debug panels can display the user's choice.
 */

export type ReferenceStrength =
  | "inspiration"
  | "balanced"
  | "strong_reference"
  | "near_original";

export const DEFAULT_REFERENCE_STRENGTH: ReferenceStrength = "balanced";

export interface ReferenceStrengthOption {
  id: ReferenceStrength;
  label: string;
  /** Short helper text shown in the UI (kept under ~100 chars). */
  description: string;
}

export const REFERENCE_STRENGTH_OPTIONS: ReferenceStrengthOption[] = [
  {
    id: "inspiration",
    label: "Inspiration",
    description:
      "Loose inspiration only — composition, subject, colors, and layout can change significantly.",
  },
  {
    id: "balanced",
    label: "Balanced",
    description:
      "Preserve the main subject and overall composition; clearly adapt to the selected style.",
  },
  {
    id: "strong_reference",
    label: "Strong reference",
    description:
      "Preserve composition, subject, proportions, pose, and major details; apply style on top.",
  },
  {
    id: "near_original",
    label: "Near original",
    description:
      "Treat the uploaded image as the master source; make minimal structural changes.",
  },
];

export function isReferenceStrength(v: unknown): v is ReferenceStrength {
  return (
    v === "inspiration" ||
    v === "balanced" ||
    v === "strong_reference" ||
    v === "near_original"
  );
}

/**
 * Prompt-side mapping: returned text is prepended to the compiled prompt
 * by the edge function when a reference image is attached. Keep these
 * sentences imperative and unambiguous so prompt-following models honor
 * them consistently.
 */
export function referenceStrengthInstruction(s: ReferenceStrength): string {
  switch (s) {
    case "inspiration":
      return "REFERENCE STRENGTH — Inspiration: Use the uploaded image only as loose inspiration. Allow composition, subject details, colors, and layout to change significantly while preserving the broad idea.";
    case "balanced":
      return "REFERENCE STRENGTH — Balanced: Preserve the main subject and overall composition of the uploaded image, but clearly adapt it to the selected art style.";
    case "strong_reference":
      return "REFERENCE STRENGTH — Strong reference: Preserve composition, subject, proportions, pose, and major visual details of the uploaded image as much as possible while applying the selected art style.";
    case "near_original":
      return "REFERENCE STRENGTH — Near original: Treat the uploaded image as the master source. Make minimal structural changes and mainly apply the selected style.";
  }
}

export function referenceStrengthLabel(s: ReferenceStrength): string {
  return REFERENCE_STRENGTH_OPTIONS.find((o) => o.id === s)?.label ?? s;
}
