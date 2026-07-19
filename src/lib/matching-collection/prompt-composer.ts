/**
 * prompt-composer — builds ONLY the collection-consistency block and the
 * per-item subject. The canonical style prompt, print rules, and
 * poster-format instructions continue to be applied by the existing
 * prompt-compiler pipeline (`_shared/prompt-compiler.ts`) exactly once.
 *
 * This function returns a string that is placed into the user prompt
 * field of the generation request. The style compiler then wraps its
 * canonical rules around it. We deliberately do NOT re-emit any style,
 * print, or format instructions here.
 */

import type { CollectionArtDirection, ConsistencyStrength } from "./types";
import { consistencyEmphasisPhrase } from "./consistency-strength";

export interface ComposeCollectionPromptArgs {
  subject: string;
  artDirection: CollectionArtDirection | null;
  consistencyStrength: ConsistencyStrength;
}

/** Sentinel used in tests to detect duplicate style-prompt injection. */
export const COLLECTION_BLOCK_HEADER = "COLLECTION CONSISTENCY";

function formatArtDirectionLines(a: CollectionArtDirection): string[] {
  const lines: string[] = [];
  if (a.palette && a.palette.length) lines.push(`- Palette: ${a.palette.slice(0, 6).join(", ")}`);
  if (a.colorMood) lines.push(`- Color mood: ${a.colorMood}`);
  if (a.lighting) lines.push(`- Lighting: ${a.lighting}`);
  if (a.composition) lines.push(`- Composition: ${a.composition}`);
  if (a.subjectScale) lines.push(`- Subject scale: ${a.subjectScale}`);
  if (a.negativeSpace) lines.push(`- Negative space: ${a.negativeSpace}`);
  if (a.texture) lines.push(`- Texture: ${a.texture}`);
  if (a.framing) lines.push(`- Framing: ${a.framing}`);
  if (a.detailDensity) lines.push(`- Detail density: ${a.detailDensity}`);
  if (a.mood) lines.push(`- Mood: ${a.mood}`);
  if (a.textPolicy) lines.push(`- Text: ${a.textPolicy}`);
  return lines;
}

/**
 * Returns the composed user prompt for one collection item.
 *
 * Shape:
 *   {subject}
 *
 *   COLLECTION CONSISTENCY — {emphasis} the visual identity of the reference:
 *   - palette: ...
 *   - lighting: ...
 *   ...
 *
 * When `artDirection` is null (analysis failed), the block still names the
 * reference so the model treats the attached image as the coordination
 * anchor — the reference image itself carries the identity signal.
 */
export function composeCollectionPrompt(args: ComposeCollectionPromptArgs): string {
  const subject = args.subject.trim();
  const emphasis = consistencyEmphasisPhrase(args.consistencyStrength);

  if (!args.artDirection) {
    return (
      `${subject}\n\n` +
      `${COLLECTION_BLOCK_HEADER} — ${emphasis} the visual identity of the attached collection reference image ` +
      `(palette, lighting, texture, framing, mood).`
    );
  }

  const lines = formatArtDirectionLines(args.artDirection);
  return (
    `${subject}\n\n` +
    `${COLLECTION_BLOCK_HEADER} — ${emphasis} the visual identity of the attached collection reference:\n` +
    lines.join("\n")
  );
}
