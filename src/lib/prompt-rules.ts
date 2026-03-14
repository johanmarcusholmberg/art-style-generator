/** Structured prompt rules for each art style */

export interface StyleRules {
  styleRules: string[];
  compositionRules: string[];
  colorRules: string[];
  qualityRules: string[];
  avoidRules: string[];
}

/** Universal quality tokens appended to every generation */
const UNIVERSAL_QUALITY = [
  "high detail",
  "professional illustration",
  "sharp edges",
  "balanced composition",
  "no artifacts",
  "print-ready resolution",
];

export const STYLE_RULES: Record<string, StyleRules> = {
  japanese: {
    styleRules: [
      "traditional Japanese ukiyo-e woodblock print",
      "flat color areas with bold black outlines",
      "sumi ink details and brushwork",
      "Edo period aesthetic and composition",
      "layered depth through overlapping planes",
    ],
    compositionRules: [
      "asymmetric balance typical of Japanese prints",
      "foreground, middle ground, background layers",
      "dramatic use of negative space",
      "natural flow guiding the eye",
    ],
    colorRules: [
      "rich but limited palette of 5-8 traditional pigment colors",
      "indigo, vermilion, ochre, sap green, black",
      "no gradients — flat color blocks only",
      "colors separated by bold outlines",
    ],
    qualityRules: [
      "museum-quality woodblock print reproduction",
      "visible wood grain texture in flat areas",
      "crisp registration between color layers",
    ],
    avoidRules: [
      "photorealistic rendering",
      "soft gradients or airbrushing",
      "modern digital effects",
      "Japanese text, kanji, hiragana, or katakana",
      "any written script or labels",
    ],
  },

  freestyle: {
    styleRules: [
      "ukiyo-e woodblock print art style applied to any subject",
      "flat color areas with bold black outlines",
      "sumi ink details and brushwork",
      "woodblock print aesthetic with modern subjects",
    ],
    compositionRules: [
      "centered or asymmetric balance",
      "clear subject with defined background",
      "layered depth through overlapping planes",
    ],
    colorRules: [
      "rich limited palette of traditional pigment colors",
      "flat color blocks without gradients",
      "colors separated by bold outlines",
    ],
    qualityRules: [
      "museum-quality woodblock print reproduction",
      "crisp lines and clean color registration",
    ],
    avoidRules: [
      "photorealistic rendering",
      "soft gradients",
      "any written text or script",
    ],
  },

  popart: {
    styleRules: [
      "bold pop art inspired by Andy Warhol and Roy Lichtenstein",
      "Ben-Day dots pattern in backgrounds and shadows",
      "thick black outlines around all forms",
      "flat color areas with high contrast",
      "comic book panel aesthetic",
      "screen-print texture and layering",
    ],
    compositionRules: [
      "strong central subject",
      "graphic, poster-like layout",
      "bold cropping for dramatic impact",
      "clear figure-ground separation",
    ],
    colorRules: [
      "vibrant saturated primary and secondary colors",
      "CMYK-inspired palette: cyan, magenta, yellow, black",
      "high contrast color combinations",
      "no subtle tones — everything bold and punchy",
    ],
    qualityRules: [
      "crisp halftone dots at consistent size",
      "clean sharp outlines with uniform weight",
      "professional screen-print quality",
    ],
    avoidRules: [
      "photorealism",
      "soft pastels or muted tones",
      "gradients or smooth shading",
      "visual clutter or excessive detail",
      "any written text or script",
    ],
  },

  "popart-freestyle": {
    styleRules: [
      "pop art visual style with bold graphic impact",
      "Ben-Day dots, thick outlines, flat vivid colors",
      "comic book and screen-print aesthetics",
    ],
    compositionRules: [
      "graphic poster-like composition",
      "strong central focus",
      "clear figure-ground separation",
    ],
    colorRules: [
      "vibrant saturated colors",
      "high contrast bold palette",
      "no subtle or muted tones",
    ],
    qualityRules: [
      "clean outlines and crisp details",
      "professional illustration quality",
    ],
    avoidRules: [
      "photorealism",
      "soft shading or gradients",
      "any written text or script",
    ],
  },

  lineart: {
    styleRules: [
      "fine pen-and-ink illustration",
      "delicate thin ink lines with precise control",
      "hatching and cross-hatching for tonal depth",
      "stippling for texture in selected areas",
      "varying line weights for emphasis and depth",
      "reminiscent of vintage engraving and etching",
    ],
    compositionRules: [
      "detailed focal subject with surrounding context",
      "depth created through line density variation",
      "balanced positive and negative space",
      "architectural drafting precision",
    ],
    colorRules: [
      "black ink on white only — strictly monochrome",
      "no color fills or solid black areas",
      "tonal range achieved through line density alone",
    ],
    qualityRules: [
      "botanical illustration precision in linework",
      "consistent line quality throughout",
      "fine detail suitable for large-format printing",
    ],
    avoidRules: [
      "color fills or washes",
      "solid black areas or silhouettes",
      "cartoon style or simplified forms",
      "inconsistent line thickness",
      "any written text or script",
    ],
  },

  "lineart-freestyle": {
    styleRules: [
      "fine pen-and-ink line art style",
      "delicate ink lines with hatching for depth",
      "elegant pen technique with varying weights",
    ],
    compositionRules: [
      "clear subject with supporting detail",
      "depth through line density",
      "balanced composition",
    ],
    colorRules: [
      "black ink on white — monochrome only",
      "no color fills",
    ],
    qualityRules: [
      "consistent crisp linework",
      "fine detail throughout",
    ],
    avoidRules: [
      "color or washes",
      "cartoon style",
      "any written text or script",
    ],
  },

  "lineart-minimal": {
    styleRules: [
      "ultra-minimal continuous line drawing",
      "absolute fewest lines possible to convey the subject",
      "single-weight thin black line",
      "inspired by Picasso's single-line drawings",
      "one-line art style with elegant simplicity",
    ],
    compositionRules: [
      "centered subject with maximum negative space",
      "every line must be essential",
      "abstract simplification of complex forms",
    ],
    colorRules: [
      "single black line on white — nothing else",
      "no shading, no fills, no hatching",
    ],
    qualityRules: [
      "perfectly smooth continuous line",
      "elegant confident strokes",
      "museum-quality minimal art",
    ],
    avoidRules: [
      "multiple line weights",
      "shading or cross-hatching",
      "unnecessary detail",
      "any written text or script",
    ],
  },

  minimalism: {
    styleRules: [
      "clean geometric minimalist illustration",
      "Scandinavian and Swiss design influence",
      "precise shapes with vector-like edges",
      "flat design with intentional subtle depth",
      "abstract simplification of natural forms",
    ],
    compositionRules: [
      "centered or rule-of-thirds subject placement",
      "generous negative space — at least 40% of canvas",
      "perfectly balanced layout",
      "every element must be intentional",
    ],
    colorRules: [
      "limited palette of 2-3 harmonious muted colors",
      "no gradients unless absolutely essential",
      "soft earth tones or cool neutrals",
      "high contrast between subject and background",
    ],
    qualityRules: [
      "pixel-perfect geometric edges",
      "professional poster illustration quality",
      "clean and precise throughout",
    ],
    avoidRules: [
      "clip-art or cartoon style",
      "visual clutter or busy compositions",
      "excessive detail or ornamentation",
      "more than 4 colors",
      "any written text or script",
    ],
  },

  "minimalism-freestyle": {
    styleRules: [
      "minimalist art style with clean simplified forms",
      "geometric shapes and flat design",
      "Scandinavian design aesthetic",
    ],
    compositionRules: [
      "generous negative space",
      "balanced minimal layout",
      "intentional element placement",
    ],
    colorRules: [
      "limited muted palette of 2-4 colors",
      "soft harmonious tones",
    ],
    qualityRules: [
      "precise clean edges",
      "professional quality",
    ],
    avoidRules: [
      "visual clutter",
      "excessive detail",
      "any written text or script",
    ],
  },

  graffiti: {
    styleRules: [
      "urban street art graffiti style",
      "vibrant spray paint colors with dripping effects",
      "bold outlines and stencil art elements",
      "brick wall or concrete texture backgrounds",
      "wildstyle lettering energy without actual letters",
      "inspired by Banksy, KAWS, and NYC subway graffiti",
    ],
    compositionRules: [
      "dynamic asymmetric layout",
      "subject fills the frame with energy",
      "layered depth: background texture, mid-ground tags, foreground subject",
      "controlled chaos — busy but intentional",
    ],
    colorRules: [
      "neon and saturated spray paint colors",
      "rich contrast against urban textures",
      "fluorescent accents over darker bases",
      "color bleeding and overlap effects",
    ],
    qualityRules: [
      "realistic spray paint texture and drip patterns",
      "authentic wall texture and weathering",
      "crisp stencil edges where appropriate",
    ],
    avoidRules: [
      "clean digital look",
      "soft pastels or muted tones",
      "symmetrical or formal composition",
      "any readable text, letters, or script",
    ],
  },

  "graffiti-freestyle": {
    styleRules: [
      "graffiti and urban street art style",
      "spray paint effects, bold colors, urban energy",
      "stencil and freehand spray techniques",
    ],
    compositionRules: [
      "dynamic energetic layout",
      "subject-forward with urban texture",
    ],
    colorRules: [
      "vibrant neon and saturated tones",
      "spray paint color palette",
    ],
    qualityRules: [
      "authentic spray paint texture",
      "crisp detail in stencil areas",
    ],
    avoidRules: [
      "clean digital aesthetic",
      "muted tones",
      "any readable text or script",
    ],
  },

  botanical: {
    styleRules: [
      "scientific botanical illustration",
      "tradition of Pierre-Joseph Redouté and Ernst Haeckel",
      "precise watercolor rendering with transparent washes",
      "fine ink outlines with watercolor color fills",
      "accurate botanical detail: leaves, petals, stems, veins",
    ],
    compositionRules: [
      "specimen-style centered presentation",
      "multiple views if appropriate: flower, leaf, cross-section",
      "elegant arrangement on the page",
      "scientific accuracy in proportions",
    ],
    colorRules: [
      "soft natural watercolor palette",
      "transparent layered washes",
      "true-to-life botanical colors",
      "subtle color gradations within petals and leaves",
    ],
    qualityRules: [
      "museum-quality natural history illustration",
      "visible delicate brushwork in watercolor areas",
      "fine ink line detail in veins and edges",
    ],
    avoidRules: [
      "photorealistic rendering",
      "digital gradient effects",
      "any text, labels, or annotations",
      "stylized or cartoonish plants",
    ],
  },

  "botanical-freestyle": {
    styleRules: [
      "botanical watercolor illustration style",
      "scientific accuracy with artistic flair",
      "delicate watercolor washes and fine ink outlines",
    ],
    compositionRules: [
      "elegant natural arrangement",
      "specimen presentation style",
    ],
    colorRules: [
      "natural watercolor palette",
      "transparent layered washes",
    ],
    qualityRules: [
      "museum-quality botanical art",
      "fine detail throughout",
    ],
    avoidRules: [
      "photorealism",
      "any text or labels",
    ],
  },
};

/**
 * Builds a structured prompt from user input + style rules.
 */
export function buildStructuredPrompt(
  userPrompt: string,
  styleKey: string,
  options: {
    aspectRatio?: string;
    backgroundStyle?: "white" | "cream";
    isEdit?: boolean;
    sourceImageDescription?: string;
  } = {}
): string {
  const rules = STYLE_RULES[styleKey];
  if (!rules) {
    // Fallback for unknown styles
    return `Create a high-resolution professional artwork: ${userPrompt}. ${UNIVERSAL_QUALITY.join(", ")}.`;
  }

  const { aspectRatio, backgroundStyle = "white", isEdit = false } = options;
  const useCream = backgroundStyle === "cream";

  const bgText = useCream
    ? "Use a warm cream/off-white vintage paper background tone."
    : "The background MUST be pure white (#FFFFFF). Do NOT use cream, beige, off-white, or any tinted color.";

  const ratioText = aspectRatio
    ? `The image must have a ${aspectRatio} aspect ratio, composed specifically for that format.`
    : "";

  if (isEdit) {
    return [
      "CRITICAL EDITING INSTRUCTIONS:",
      "You MUST keep the provided image almost entirely unchanged.",
      "Only make the SPECIFIC edit described below.",
      "Preserve the exact same composition, subjects, colors, background, perspective, lighting, and every other detail.",
      "The result must look like the same image with a small targeted modification, NOT a new image.",
      "Do NOT regenerate or reimagine the scene.",
      "",
      `STYLE TO MAINTAIN: ${rules.styleRules.join(", ")}`,
      "",
      `EDIT TO APPLY: ${userPrompt}`,
      "",
      bgText,
      ratioText,
      `QUALITY: ${[...rules.qualityRules, ...UNIVERSAL_QUALITY].join(", ")}`,
      `AVOID: ${rules.avoidRules.join(", ")}`,
      "",
      "Generate at maximum resolution.",
    ].filter(Boolean).join("\n");
  }

  return [
    `SUBJECT: ${userPrompt}`,
    "",
    `STYLE: ${rules.styleRules.join(". ")}`,
    "",
    `COMPOSITION: ${rules.compositionRules.join(". ")}`,
    "",
    `COLOR: ${rules.colorRules.join(". ")}`,
    "",
    `QUALITY: ${[...rules.qualityRules, ...UNIVERSAL_QUALITY].join(". ")}`,
    "",
    `AVOID: ${rules.avoidRules.join(". ")}`,
    "",
    bgText,
    ratioText,
    "",
    "Generate at maximum resolution with fine detail suitable for large format printing.",
  ].filter(Boolean).join("\n");
}
