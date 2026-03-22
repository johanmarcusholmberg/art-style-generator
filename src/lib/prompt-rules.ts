/** Structured art direction system for each style */

export interface StyleRules {
  visualGoal: string[];
  styleAnchors: string[];
  styleRules: string[];
  compositionRules: string[];
  colorRules: string[];
  qualityRules: string[];
  avoidRules: string[];
  /** Traits that must never appear — stronger than avoidRules */
  blockedTraits?: string[];
  /** Edge-preservation guidance injected into every prompt */
  edgeSafety?: string[];
}

/** Universal quality tokens appended to every generation */
export const GLOBAL_QUALITY = [
  "high detail",
  "sharp focus",
  "clean edges",
  "high resolution",
  "detailed textures",
  "professional illustration",
  "sharp rendering",
  "balanced composition",
  "no artifacts",
  "print-ready resolution",
  "suitable for large format printing",
];

/** Universal edge-preservation rules appended to every generation */
export const EDGE_SAFETY_RULES = [
  "preserve all intentional inner borders, edge lines, and frame-like details",
  "do not trim, fade, or blend edge details into the background",
  "artwork edges are sacred — every pixel at the boundary is part of the composition",
  "decorative borders and internal framing elements must remain fully intact",
];

/** Variation instructions for batch generation */
export const VARIATION_INSTRUCTIONS = [
  "alternate composition angle",
  "different lighting direction",
  "slight perspective shift",
  "variation in framing and cropping",
  "different focal emphasis",
];

export const STYLE_RULES: Record<string, StyleRules> = {
  japanese: {
    visualGoal: [
      "authentic museum-quality ukiyo-e woodblock print",
      "feels like a genuine Edo period artwork",
    ],
    styleAnchors: [
      "traditional Japanese ukiyo-e woodblock print",
      "Hokusai and Hiroshige aesthetic",
      "Edo period visual language",
    ],
    styleRules: [
      "flat color areas with bold black outlines",
      "sumi ink details and brushwork",
      "layered depth through overlapping planes",
      "visible wood grain texture in flat areas",
    ],
    compositionRules: [
      "asymmetric balance typical of Japanese prints",
      "foreground, middle ground, background layers",
      "dramatic use of negative space",
      "natural flow guiding the eye through the scene",
      "all composition elements must stay fully within the image boundary",
    ],
    colorRules: [
      "rich but limited palette of 5-8 traditional pigment colors",
      "indigo, vermilion, ochre, sap green, black",
      "no gradients — flat color blocks only",
      "colors separated by bold outlines",
    ],
    qualityRules: [
      "museum-quality woodblock print reproduction",
      "crisp registration between color layers",
      "fine detail in linework and texture",
    ],
    avoidRules: [
      "photorealistic rendering",
      "soft gradients or airbrushing",
      "modern digital effects",
      "Japanese text, kanji, hiragana, or katakana",
      "any written script or labels",
    ],
    blockedTraits: [
      "3D rendering",
      "photographic realism",
      "digital painting brushwork",
    ],
    edgeSafety: [
      "traditional Japanese print borders and registration marks are part of the artwork",
      "bold outline edges at image borders must be preserved completely",
    ],
  },

  freestyle: {
    visualGoal: [
      "ukiyo-e woodblock print applied to any subject",
      "premium art print aesthetic",
    ],
    styleAnchors: [
      "ukiyo-e woodblock print art style",
      "Japanese printmaking applied to modern subjects",
      "bold flat-color illustration",
    ],
    styleRules: [
      "flat color areas with bold black outlines",
      "sumi ink details and brushwork",
      "woodblock print aesthetic regardless of subject",
    ],
    compositionRules: [
      "centered or asymmetric balance",
      "clear subject with defined background",
      "layered depth through overlapping planes",
      "all composition elements must stay fully within the image boundary",
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
    blockedTraits: [
      "3D rendering",
      "photographic realism",
    ],
    edgeSafety: [
      "bold outline edges at image borders must be preserved completely",
    ],
  },

  popart: {
    visualGoal: [
      "bold gallery-quality pop art print",
      "Warhol/Lichtenstein level graphic impact",
    ],
    styleAnchors: [
      "Andy Warhol screen-print aesthetic",
      "Roy Lichtenstein comic panel style",
      "1960s pop art movement",
    ],
    styleRules: [
      "Ben-Day dots pattern in backgrounds and shadows",
      "thick black outlines around all forms",
      "flat color areas with high contrast",
      "comic book panel aesthetic",
      "screen-print texture and layering",
    ],
    compositionRules: [
      "strong central subject",
      "graphic poster-like layout",
      "bold cropping for dramatic impact",
      "clear figure-ground separation",
      "all composition elements must stay fully within the image boundary",
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
    blockedTraits: [
      "watercolor washes",
      "pencil sketch texture",
      "photographic realism",
    ],
    edgeSafety: [
      "comic panel borders and thick outlines near edges are intentional and must be kept",
    ],
  },

  "popart-freestyle": {
    visualGoal: [
      "vibrant pop art illustration with graphic punch",
      "street-poster quality artwork",
    ],
    styleAnchors: [
      "pop art visual language",
      "comic book and screen-print aesthetics",
      "bold graphic illustration",
    ],
    styleRules: [
      "Ben-Day dots, thick outlines, flat vivid colors",
      "comic book and screen-print aesthetics",
    ],
    compositionRules: [
      "graphic poster-like composition",
      "strong central focus",
      "clear figure-ground separation",
      "all composition elements must stay fully within the image boundary",
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
    blockedTraits: [
      "watercolor texture",
      "pencil sketch style",
    ],
    edgeSafety: [
      "thick outlines near edges are intentional design elements",
    ],
  },

  lineart: {
    visualGoal: [
      "museum-quality pen-and-ink illustration",
      "fine art engraving-level detail",
    ],
    styleAnchors: [
      "fine pen-and-ink illustration",
      "Victorian engraving and etching tradition",
      "botanical illustration precision",
    ],
    styleRules: [
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
      "all line details must extend fully to image edges without fading",
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
    blockedTraits: [
      "color of any kind",
      "watercolor washes",
      "digital gradient fills",
    ],
    edgeSafety: [
      "ink lines, hatching, and decorative border details near edges must be preserved",
      "do not fade or soften linework near the image boundary",
    ],
  },

  "lineart-freestyle": {
    visualGoal: [
      "elegant pen-and-ink artwork",
      "premium illustration-quality line drawing",
    ],
    styleAnchors: [
      "fine pen-and-ink line art",
      "elegant ink illustration tradition",
      "detailed monochrome drawing",
    ],
    styleRules: [
      "delicate ink lines with hatching for depth",
      "elegant pen technique with varying weights",
    ],
    compositionRules: [
      "clear subject with supporting detail",
      "depth through line density",
      "balanced composition",
      "all line details must extend fully to image edges without fading",
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
    blockedTraits: [
      "color fills",
      "digital painting effects",
    ],
    edgeSafety: [
      "ink details at edges are part of the artwork and must not be trimmed",
    ],
  },

  "lineart-minimal": {
    visualGoal: [
      "gallery-quality minimal line art",
      "Picasso single-line drawing elegance",
    ],
    styleAnchors: [
      "ultra-minimal continuous line drawing",
      "Picasso's single-line drawings",
      "one-line art movement",
    ],
    styleRules: [
      "absolute fewest lines possible to convey the subject",
      "single-weight thin black line",
      "one-line art style with elegant simplicity",
    ],
    compositionRules: [
      "centered subject with maximum negative space",
      "every line must be essential",
      "abstract simplification of complex forms",
      "line strokes near edges are intentional and must be preserved",
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
    blockedTraits: [
      "hatching or stippling",
      "color of any kind",
      "complex detailed rendering",
    ],
    edgeSafety: [
      "line strokes that approach or touch the image edge are deliberate",
    ],
  },

  minimalism: {
    visualGoal: [
      "elegant minimalist illustration",
      "premium poster aesthetic",
      "gallery-ready minimal art",
    ],
    styleAnchors: [
      "minimalist poster design",
      "Scandinavian design aesthetic",
      "flat vector illustration",
      "Swiss graphic design tradition",
    ],
    styleRules: [
      "clean geometric forms",
      "precise edges",
      "Scandinavian minimalism influence",
      "abstract simplification of natural forms",
    ],
    compositionRules: [
      "centered subject",
      "large negative space — at least 40% of canvas",
      "balanced symmetry",
      "every element must be intentional",
      "geometric shapes near edges are deliberate design elements",
    ],
    colorRules: [
      "limited palette of 2-4 harmonious colors",
      "soft neutral background",
      "no gradients unless absolutely essential",
      "high contrast between subject and background",
    ],
    qualityRules: [
      "sharp edges",
      "high clarity",
      "professional illustration finish",
      "pixel-perfect geometric edges",
    ],
    avoidRules: [
      "clip-art style",
      "cartoon aesthetics",
      "inconsistent line thickness",
      "visual clutter",
      "random objects",
      "more than 4 colors",
      "any written text or script",
    ],
    blockedTraits: [
      "realistic textures",
      "complex shading",
      "photorealism",
      "more than 4 colors",
    ],
    edgeSafety: [
      "geometric shapes touching or near edges are part of the minimalist composition",
    ],
  },

  "minimalism-freestyle": {
    visualGoal: [
      "clean minimalist artwork",
      "modern design poster quality",
    ],
    styleAnchors: [
      "minimalist art style",
      "Scandinavian design aesthetic",
      "flat geometric illustration",
    ],
    styleRules: [
      "clean simplified forms",
      "geometric shapes and flat design",
    ],
    compositionRules: [
      "generous negative space",
      "balanced minimal layout",
      "intentional element placement",
      "elements near edges are part of the composition",
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
    blockedTraits: [
      "complex textures",
      "photorealistic rendering",
    ],
    edgeSafety: [
      "design elements at the image boundary are intentional",
    ],
  },

  graffiti: {
    visualGoal: [
      "authentic urban street art mural",
      "gallery-quality graffiti artwork",
    ],
    styleAnchors: [
      "urban street art graffiti",
      "Banksy, KAWS, and NYC subway graffiti",
      "spray paint mural tradition",
    ],
    styleRules: [
      "vibrant spray paint colors with dripping effects",
      "bold outlines and stencil art elements",
      "brick wall or concrete texture backgrounds",
      "wildstyle lettering energy without actual letters",
    ],
    compositionRules: [
      "dynamic asymmetric layout",
      "subject fills the frame with energy",
      "layered depth: background texture, mid-ground tags, foreground subject",
      "controlled chaos — busy but intentional",
      "spray paint effects and drips near edges are intentional and must be preserved",
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
    blockedTraits: [
      "clean vector graphics",
      "watercolor effects",
      "formal symmetrical layouts",
    ],
    edgeSafety: [
      "spray paint splatters, drips, and texture at image edges are authentic details",
      "wall texture and paint effects at the boundary must remain intact",
    ],
  },

  "graffiti-freestyle": {
    visualGoal: [
      "vibrant street art illustration",
      "urban energy captured in art",
    ],
    styleAnchors: [
      "graffiti and urban street art",
      "spray paint mural aesthetic",
      "stencil and freehand spray art",
    ],
    styleRules: [
      "spray paint effects, bold colors, urban energy",
      "stencil and freehand spray techniques",
    ],
    compositionRules: [
      "dynamic energetic layout",
      "subject-forward with urban texture",
      "spray effects at edges are part of the artwork",
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
    blockedTraits: [
      "clean digital illustration",
      "pastel color palette",
    ],
    edgeSafety: [
      "spray splatters and urban texture at edges must be preserved",
    ],
  },

  botanical: {
    visualGoal: [
      "museum-quality scientific botanical illustration",
      "natural history art collection worthy",
    ],
    styleAnchors: [
      "scientific botanical illustration",
      "Pierre-Joseph Redouté tradition",
      "Ernst Haeckel natural history art",
    ],
    styleRules: [
      "precise watercolor rendering with transparent washes",
      "fine ink outlines with watercolor color fills",
      "accurate botanical detail: leaves, petals, stems, veins",
    ],
    compositionRules: [
      "specimen-style centered presentation",
      "multiple views if appropriate: flower, leaf, cross-section",
      "elegant arrangement on the page",
      "scientific accuracy in proportions",
      "delicate botanical details near edges must be fully rendered",
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
    blockedTraits: [
      "cartoon or stylized plant forms",
      "bold flat colors without wash transparency",
      "digital airbrushing",
    ],
    edgeSafety: [
      "leaf tips, petal edges, and fine botanical details near the image boundary must be fully preserved",
      "do not crop or fade delicate botanical elements at the edges",
    ],
  },

  "botanical-freestyle": {
    visualGoal: [
      "artistic botanical watercolor artwork",
      "elegant natural history illustration",
    ],
    styleAnchors: [
      "botanical watercolor illustration",
      "scientific accuracy with artistic flair",
      "natural history art tradition",
    ],
    styleRules: [
      "delicate watercolor washes and fine ink outlines",
      "scientific accuracy with artistic expression",
    ],
    compositionRules: [
      "elegant natural arrangement",
      "specimen presentation style",
      "botanical details near edges must be fully rendered",
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
    blockedTraits: [
      "cartoon plant style",
      "digital gradient fills",
    ],
    edgeSafety: [
      "botanical elements at edges are part of the artwork",
    ],
  },
};

/**
 * Compiles a structured prompt from user input + style rules.
 * Never sends raw user prompt — always wrapped in art direction.
 */
export function compilePrompt(
  userPrompt: string,
  styleKey: string,
  options: {
    aspectRatio?: string;
    backgroundStyle?: "white" | "cream";
    isEdit?: boolean;
    variationIndex?: number;
  } = {}
): string {
  const rules = STYLE_RULES[styleKey];
  if (!rules) {
    return [
      `PRIMARY SUBJECT: ${userPrompt}`,
      "",
      `VISUAL GOAL: professional art illustration`,
      `GLOBAL QUALITY: ${GLOBAL_QUALITY.join(". ")}`,
      "",
      `EDGE SAFETY: ${EDGE_SAFETY_RULES.join(". ")}`,
      "Generate at maximum resolution.",
    ].join("\n");
  }

  const { aspectRatio, backgroundStyle = "white", isEdit = false, variationIndex } = options;
  const useCream = backgroundStyle === "cream";

  // Background is always OUTER presentation — never alters the artwork itself
  const bgText = useCream
    ? "Use a warm cream/off-white vintage paper background tone. This background is an OUTER presentation layer — it must NOT replace, blend into, or obscure any edge details, borders, or frame elements within the artwork itself."
    : "The background MUST be pure white (#FFFFFF). Do NOT use cream, beige, off-white, or any tinted color. This background is an OUTER presentation layer — it must NOT replace, blend into, or obscure any edge details, borders, or frame elements within the artwork itself.";

  const ratioText = aspectRatio
    ? `The image must have a ${aspectRatio} aspect ratio, composed specifically for that format.`
    : "";

  // Combine style-specific and universal edge safety
  const edgeSafetyLines = [
    ...EDGE_SAFETY_RULES,
    ...(rules.edgeSafety || []),
  ];

  // Blocked traits section
  const blockedSection = rules.blockedTraits?.length
    ? `\nBLOCKED TRAITS (must NEVER appear): ${rules.blockedTraits.join(". ")}`
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
      `VISUAL GOAL: ${rules.visualGoal.join(". ")}`,
      `STYLE ANCHORS: ${rules.styleAnchors.join(", ")}`,
      `STYLE TO MAINTAIN: ${rules.styleRules.join(", ")}`,
      "",
      `EDIT TO APPLY: ${userPrompt}`,
      "",
      `EDGE SAFETY: ${edgeSafetyLines.join(". ")}`,
      bgText,
      ratioText,
      `GLOBAL QUALITY: ${[...rules.qualityRules, ...GLOBAL_QUALITY].join(", ")}`,
      `AVOID: ${rules.avoidRules.join(", ")}`,
      blockedSection,
      "",
      "Generate at maximum resolution.",
    ].filter(Boolean).join("\n");
  }

  // Variation instruction for batch generation
  const variationText = variationIndex !== undefined && variationIndex > 0
    ? `\nVARIATION: Apply ${VARIATION_INSTRUCTIONS[variationIndex % VARIATION_INSTRUCTIONS.length]} while maintaining the same subject and style.`
    : "";

  return [
    `PRIMARY SUBJECT: ${userPrompt}`,
    "",
    `VISUAL GOAL: ${rules.visualGoal.join(". ")}`,
    "",
    `STYLE ANCHORS: ${rules.styleAnchors.join(". ")}`,
    "",
    `STYLE RULES: ${rules.styleRules.join(". ")}`,
    "",
    `COMPOSITION: ${rules.compositionRules.join(". ")}`,
    "",
    `COLOR: ${rules.colorRules.join(". ")}`,
    "",
    `GLOBAL QUALITY: ${[...rules.qualityRules, ...GLOBAL_QUALITY].join(". ")}`,
    "",
    `EDGE SAFETY: ${edgeSafetyLines.join(". ")}`,
    "",
    `AVOID: ${rules.avoidRules.join(". ")}`,
    blockedSection,
    "",
    bgText,
    ratioText,
    variationText,
    "",
    "Generate at maximum resolution with fine detail suitable for large format printing.",
  ].filter(Boolean).join("\n");
}

/** Backward-compatible alias */
export const buildStructuredPrompt = compilePrompt;
