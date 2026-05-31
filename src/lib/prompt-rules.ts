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
  "extremely sharp focus throughout the entire image",
  "crisp clean edges on all forms and outlines",
  "maximum native resolution",
  "rich detailed textures with visible micro-detail",
  "professional gallery-quality illustration",
  "razor-sharp rendering with no softness",
  "no compression artifacts or noise",
  "print-ready resolution suitable for large format wall art",
  "every detail must remain crisp when viewed at 300 PPI on large paper",
];

/** Wall-art composition rules — always applied to encourage print-suitable layouts */
export const WALL_ART_COMPOSITION = [
  "compose with large readable shapes that remain impactful at poster scale",
  "use balanced negative space — avoid overcrowded compositions",
  "establish a clear focal point that draws the eye immediately",
  "favor bold graphic forms over intricate tiny details that break when enlarged",
  "ensure strong subject separation from background",
  "design as if this will be printed at 50×70 cm and hung on a wall",
];

/** Base technical quality rules — always injected regardless of mode */
export const BASE_QUALITY_RULES = [
  "generate at the highest possible native resolution",
  "preserve micro textures: paper grain, ink splatter, brush fiber, canvas weave",
  "maintain crisp line clarity at all stroke widths",
  "avoid oversmoothing — retain natural texture variation",
  "high frequency detail retention for large format reproduction",
  "individual texture elements must remain distinct and separable",
  "clean crisp edges on all forms and outlines — no blur artifacts",
];

/** Print optimization rules — activated only in print mode */
export const PRINT_RULES = [
  "extremely sharp detail at all scales",
  "preserve micro textures: paper grain, ink splatter, brush fiber, canvas weave",
  "clean crisp edges on all forms and outlines",
  "no blur artifacts or soft focus anywhere",
  "avoid oversmoothing — retain natural texture variation",
  "high frequency detail retention for large format reproduction",
  "crisp line clarity even at finest stroke widths",
  "individual texture elements must remain distinct and separable",
];

/** Print-specific avoid rules — activated only in print mode */
export const AVOID_PRINT_ARTIFACTS = [
  "soft gradients that lose definition at print scale",
  "washed out textures or faded detail areas",
  "melted edges where forms blur into each other",
  "plastic smoothing or waxy skin-like surfaces",
  "low frequency detail that appears blurry when enlarged",
  "interpolated or upscaled appearance",
  "banding in color transitions",
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

  urbannoir: {
    visualGoal: [
      "gritty black-and-white urban print",
      "raw documentary street photography feel",
      "underground zine or hip-hop poster aesthetic",
    ],
    styleAnchors: [
      "gritty black and white street photography",
      "analog film look",
      "heavy grain",
      "high contrast",
      "raw urban realism",
      "underground zine aesthetic",
      "documentary flash photography",
      "cinematic shadows",
      "monochrome street print",
    ],
    styleRules: [
      "strictly monochrome — black, white, and grey only",
      "heavy film grain texture throughout",
      "high contrast with deep blacks and blown-out whites",
      "raw unpolished documentary aesthetic",
      "analog camera flash harshness when appropriate",
    ],
    compositionRules: [
      "urban street-level perspective",
      "dynamic framing with gritty energy",
      "subject fills frame with presence",
      "all edge details and grain textures must be preserved fully",
    ],
    colorRules: [
      "strictly black and white — no color whatsoever",
      "full tonal range from pure black to pure white",
      "grain and noise as textural elements",
    ],
    qualityRules: [
      "authentic analog film grain quality",
      "sharp detail in focus areas",
      "professional print-ready monochrome",
    ],
    avoidRules: [
      "any color or tinted tones",
      "clean digital look",
      "soft or dreamy aesthetics",
      "any text, watermarks, or script",
    ],
    blockedTraits: [
      "color of any kind",
      "digital smoothness",
      "watercolor or painterly effects",
    ],
    edgeSafety: [
      "film grain and edge textures are authentic and must be preserved",
    ],
  },

  "urbannoir-freestyle": {
    visualGoal: [
      "raw monochrome urban art print",
      "underground street aesthetic applied to any subject",
    ],
    styleAnchors: [
      "gritty black and white photography style",
      "analog film grain",
      "high contrast monochrome",
      "underground zine print",
    ],
    styleRules: [
      "strictly monochrome with heavy grain",
      "high contrast analog film look",
      "raw documentary aesthetic",
    ],
    compositionRules: [
      "dynamic urban-energy framing",
      "subject-forward with gritty texture",
      "edge grain and textures must be preserved",
    ],
    colorRules: [
      "black and white only — no color",
      "deep blacks and bright whites",
    ],
    qualityRules: [
      "authentic film grain quality",
      "sharp where it matters",
    ],
    avoidRules: [
      "any color",
      "clean digital aesthetic",
      "any text or script",
    ],
    blockedTraits: [
      "color tints",
      "soft focus effects",
    ],
    edgeSafety: [
      "grain and edge texture are part of the artwork",
    ],
  },

  screenprint: {
    visualGoal: [
      "authentic vintage screen-printed poster",
      "retro merch and t-shirt print aesthetic",
    ],
    styleAnchors: [
      "vintage screen print poster",
      "halftone texture",
      "ink bleed",
      "limited color palette",
      "bold graphic shapes",
      "retro t-shirt print aesthetic",
      "worn print texture",
    ],
    styleRules: [
      "visible halftone dot patterns in mid-tones",
      "ink bleed and slight registration misalignment",
      "limited palette of 3-5 spot colors",
      "bold graphic simplified shapes",
      "worn and slightly imperfect print texture",
    ],
    compositionRules: [
      "bold poster-style composition",
      "strong central graphic element",
      "layered ink impression feel",
      "print imperfections near edges are authentic",
    ],
    colorRules: [
      "limited spot color palette — maximum 5 colors",
      "ink-on-paper color mixing where overlaps occur",
      "slightly desaturated retro tones",
      "visible paper texture through thin ink areas",
    ],
    qualityRules: [
      "authentic screen print reproduction quality",
      "visible ink texture and halftone dots",
      "professional vintage poster finish",
    ],
    avoidRules: [
      "photorealism",
      "smooth digital gradients",
      "more than 5 colors",
      "any text, letters, or script",
    ],
    blockedTraits: [
      "digital smoothness",
      "photographic rendering",
      "watercolor effects",
    ],
    edgeSafety: [
      "ink bleed and print texture at edges are authentic details",
    ],
  },

  "screenprint-freestyle": {
    visualGoal: [
      "retro screen print art applied to any subject",
      "vintage poster print quality",
    ],
    styleAnchors: [
      "vintage screen print style",
      "halftone and ink bleed texture",
      "limited color retro poster",
    ],
    styleRules: [
      "halftone dots, ink bleed, limited colors",
      "bold graphic simplification",
    ],
    compositionRules: [
      "poster-style bold layout",
      "strong graphic presence",
      "print imperfections at edges are authentic",
    ],
    colorRules: [
      "limited spot color palette",
      "slightly desaturated retro tones",
    ],
    qualityRules: [
      "authentic print texture quality",
      "visible ink and halftone detail",
    ],
    avoidRules: [
      "photorealism",
      "smooth digital gradients",
      "any text or script",
    ],
    blockedTraits: [
      "digital smoothness",
      "photographic rendering",
    ],
    edgeSafety: [
      "ink texture at edges is part of the artwork",
    ],
  },

  risograph: {
    visualGoal: [
      "authentic risograph print artwork",
      "indie art poster with layered inks",
    ],
    styleAnchors: [
      "risograph print",
      "layered spot colors",
      "grainy ink texture",
      "slight misregistration",
      "indie art poster aesthetic",
      "bold simplified forms",
    ],
    styleRules: [
      "visible grain from ink drum texture",
      "layered spot colors with overlap creating new tones",
      "slight registration misalignment between color layers",
      "bold simplified graphic forms",
      "paper texture visible through ink",
    ],
    compositionRules: [
      "bold graphic composition suited for poster format",
      "simplified forms with clear silhouettes",
      "layered color planes creating depth",
      "grain and misregistration at edges are authentic",
    ],
    colorRules: [
      "limited spot color palette — 2-4 riso ink colors",
      "color overlap creates mixed tones naturally",
      "fluorescent or soy-based ink color feel",
      "warm paper base visible in light areas",
    ],
    qualityRules: [
      "authentic risograph texture and grain",
      "professional indie print quality",
      "visible ink layering detail",
    ],
    avoidRules: [
      "photorealism",
      "smooth digital rendering",
      "complex detailed rendering",
      "any text or script",
    ],
    blockedTraits: [
      "digital smoothness",
      "photographic detail",
      "watercolor washes",
    ],
    edgeSafety: [
      "riso grain and ink misregistration at edges are authentic print artifacts",
    ],
  },

  "risograph-freestyle": {
    visualGoal: [
      "risograph print style applied to any subject",
      "indie art print quality",
    ],
    styleAnchors: [
      "risograph print aesthetic",
      "grainy layered inks",
      "slight misregistration",
      "bold simplified forms",
    ],
    styleRules: [
      "grainy ink texture with layered spot colors",
      "slight misregistration between layers",
      "bold graphic simplification",
    ],
    compositionRules: [
      "bold poster-style layout",
      "simplified graphic forms",
      "grain at edges is authentic",
    ],
    colorRules: [
      "limited spot color palette",
      "overlap mixing creates tones",
    ],
    qualityRules: [
      "authentic riso print quality",
      "visible grain and layering",
    ],
    avoidRules: [
      "photorealism",
      "smooth digital rendering",
      "any text or script",
    ],
    blockedTraits: [
      "digital smoothness",
      "photographic detail",
    ],
    edgeSafety: [
      "riso grain at edges is part of the artwork",
    ],
  },

  retrocomic: {
    visualGoal: [
      "classic retro comic book print panel",
      "vintage pulp comic page quality",
    ],
    styleAnchors: [
      "retro comic print",
      "halftone dots",
      "bold ink outlines",
      "vintage comic page colors",
      "graphic panel energy",
      "pulp print texture",
    ],
    styleRules: [
      "bold black ink outlines with consistent weight",
      "halftone dot patterns for shading and color",
      "vintage four-color process comic palette",
      "action-oriented dynamic energy",
      "slightly aged paper color treatment",
    ],
    compositionRules: [
      "dynamic action-oriented composition",
      "strong figure-ground separation",
      "dramatic perspective and foreshortening",
      "panel-like framing energy",
      "bold outlines at edges are intentional comic framing",
    ],
    colorRules: [
      "vintage CMYK four-color process palette",
      "halftone dots for mid-tones and shadows",
      "slightly warm aged-paper base",
      "bold primary and secondary colors",
    ],
    qualityRules: [
      "crisp bold ink outlines",
      "consistent halftone dot pattern",
      "professional vintage comic print quality",
    ],
    avoidRules: [
      "photorealism",
      "soft shading or smooth gradients",
      "modern digital comic style",
      "any readable text, speech bubbles, or script",
    ],
    blockedTraits: [
      "smooth digital coloring",
      "photographic rendering",
      "manga style",
    ],
    edgeSafety: [
      "bold ink outlines and panel borders at edges are intentional framing",
    ],
  },

  "retrocomic-freestyle": {
    visualGoal: [
      "retro comic print style applied to any subject",
      "vintage comic book aesthetic",
    ],
    styleAnchors: [
      "retro comic book style",
      "halftone dots and bold outlines",
      "vintage comic print",
    ],
    styleRules: [
      "bold ink outlines with halftone shading",
      "vintage four-color process palette",
      "action-energy composition",
    ],
    compositionRules: [
      "dynamic graphic composition",
      "strong figure-ground separation",
      "bold outlines at edges are intentional",
    ],
    colorRules: [
      "vintage CMYK comic palette",
      "halftone dot patterns",
    ],
    qualityRules: [
      "crisp outlines and consistent halftones",
      "professional comic print quality",
    ],
    avoidRules: [
      "photorealism",
      "smooth digital rendering",
      "any text or script",
    ],
    blockedTraits: [
      "smooth digital coloring",
      "photographic detail",
    ],
    edgeSafety: [
      "comic outlines at edges are intentional framing",
    ],
  },

  pulpmagazine: {
    visualGoal: [
      "dramatic vintage pulp magazine cover illustration",
      "classic painted action poster quality",
    ],
    styleAnchors: [
      "pulp magazine cover illustration",
      "dramatic composition",
      "vintage print poster",
      "painted cover art",
      "strong shadows",
      "mid-century print aesthetic",
    ],
    styleRules: [
      "dramatic painted illustration style",
      "rich oil-paint or gouache-like rendering",
      "strong chiaroscuro lighting with deep shadows",
      "vintage mid-century illustration techniques",
      "slightly idealized heroic proportions",
    ],
    compositionRules: [
      "dramatic diagonal composition for energy",
      "strong central figure or action moment",
      "cinematic depth and atmosphere",
      "vintage magazine cover framing",
      "painted details near edges must be preserved",
    ],
    colorRules: [
      "rich saturated vintage palette",
      "warm tones with dramatic cool shadow accents",
      "slightly aged or printed color feel",
      "bold color contrasts for visual punch",
    ],
    qualityRules: [
      "professional painted illustration quality",
      "visible brushwork and paint texture",
      "dramatic lighting execution",
    ],
    avoidRules: [
      "photorealism",
      "digital vector look",
      "flat or minimal design",
      "any text, titles, or script",
    ],
    blockedTraits: [
      "flat vector illustration",
      "minimalist design",
      "digital smoothness",
    ],
    edgeSafety: [
      "painted details and atmosphere at edges are part of the illustration",
    ],
  },

  "pulpmagazine-freestyle": {
    visualGoal: [
      "pulp illustration style applied to any subject",
      "dramatic vintage painted artwork",
    ],
    styleAnchors: [
      "pulp magazine illustration",
      "dramatic painted cover art",
      "vintage mid-century print",
    ],
    styleRules: [
      "dramatic painted illustration with rich rendering",
      "strong chiaroscuro lighting",
      "vintage mid-century aesthetic",
    ],
    compositionRules: [
      "dramatic cinematic composition",
      "strong central subject",
      "painted details at edges must be preserved",
    ],
    colorRules: [
      "rich saturated vintage palette",
      "dramatic lighting contrasts",
    ],
    qualityRules: [
      "professional painted illustration quality",
      "visible paint texture",
    ],
    avoidRules: [
      "photorealism",
      "flat design",
      "any text or script",
    ],
    blockedTraits: [
      "flat vector style",
      "digital smoothness",
    ],
    edgeSafety: [
      "painted atmosphere at edges is part of the artwork",
    ],
  },

  tattooflash: {
    visualGoal: [
      "authentic traditional tattoo flash sheet illustration",
      "classic tattoo parlor wall art quality",
    ],
    styleAnchors: [
      "traditional tattoo flash",
      "bold black outlines",
      "flat limited colors",
      "vintage flash sheet design",
      "graphic icon composition",
    ],
    styleRules: [
      "bold consistent black outlines — thicker than normal illustration",
      "flat solid color fills — no gradients within shapes",
      "classic American traditional tattoo vocabulary",
      "symbolic graphic icon composition",
      "slight vintage paper aging feel",
    ],
    compositionRules: [
      "centered iconic presentation like a flash sheet",
      "clean graphic isolation of the subject",
      "symmetry and balance in design",
      "bold outlines at edges are part of the tattoo design",
    ],
    colorRules: [
      "limited traditional tattoo palette: red, green, yellow, blue, black",
      "flat solid fills with no blending",
      "warm cream or aged paper background",
      "bold color contrast against thick outlines",
    ],
    qualityRules: [
      "crisp bold outlines with consistent weight",
      "clean flat color fills",
      "professional tattoo flash quality",
    ],
    avoidRules: [
      "photorealism",
      "soft shading or gradients within shapes",
      "modern tattoo realism style",
      "any text, banners with words, or script",
    ],
    blockedTraits: [
      "realistic shading",
      "photographic rendering",
      "watercolor tattoo style",
    ],
    edgeSafety: [
      "bold tattoo outlines at edges are intentional design elements",
    ],
  },

  "tattooflash-freestyle": {
    visualGoal: [
      "tattoo flash style applied to any subject",
      "bold graphic tattoo art quality",
    ],
    styleAnchors: [
      "traditional tattoo flash style",
      "bold outlines and flat colors",
      "vintage flash sheet design",
    ],
    styleRules: [
      "bold thick black outlines",
      "flat solid color fills",
      "graphic icon-style composition",
    ],
    compositionRules: [
      "centered iconic presentation",
      "clean graphic isolation",
      "bold outlines at edges are intentional",
    ],
    colorRules: [
      "limited traditional tattoo colors",
      "flat fills without gradients",
    ],
    qualityRules: [
      "crisp bold outlines",
      "clean flat fills",
    ],
    avoidRules: [
      "photorealism",
      "soft gradients",
      "any text or script",
    ],
    blockedTraits: [
      "realistic shading",
      "watercolor effects",
    ],
    edgeSafety: [
      "tattoo outlines at edges are part of the design",
    ],
  },

  brutalistposter: {
    visualGoal: [
      "harsh bold brutalist poster design",
      "raw contemporary graphic art",
    ],
    styleAnchors: [
      "brutalist poster design",
      "bold typography-inspired composition",
      "stark contrast",
      "raw graphic layout",
      "heavy black shapes",
      "modern print design aesthetic",
    ],
    styleRules: [
      "heavy bold graphic shapes and stark contrasts",
      "raw unrefined design energy",
      "large bold masses of black and color",
      "grid-breaking asymmetric layout",
      "industrial print aesthetic",
    ],
    compositionRules: [
      "bold asymmetric graphic layout",
      "heavy visual weight distribution",
      "dramatic scale contrasts",
      "raw edges and bold shapes are intentional design",
    ],
    colorRules: [
      "stark high-contrast palette — often black + 1-2 accent colors",
      "no subtle tones — everything bold and uncompromising",
      "industrial color feeling",
    ],
    qualityRules: [
      "crisp bold graphic edges",
      "professional print design quality",
      "intentional rawness in execution",
    ],
    avoidRules: [
      "photorealism",
      "soft or pretty aesthetics",
      "decorative ornament",
      "any text, typography, or script",
    ],
    blockedTraits: [
      "soft watercolor",
      "decorative illustration",
      "photographic rendering",
    ],
    edgeSafety: [
      "heavy shapes and bold elements at edges are intentional brutalist design",
    ],
  },

  "brutalistposter-freestyle": {
    visualGoal: [
      "brutalist graphic design applied to any subject",
      "raw bold poster art",
    ],
    styleAnchors: [
      "brutalist poster design",
      "stark contrast and bold shapes",
      "modern raw graphic aesthetic",
    ],
    styleRules: [
      "heavy bold graphic shapes",
      "stark contrast and raw energy",
      "industrial design aesthetic",
    ],
    compositionRules: [
      "bold asymmetric layout",
      "dramatic scale and weight",
      "raw edges are intentional",
    ],
    colorRules: [
      "high-contrast limited palette",
      "bold uncompromising tones",
    ],
    qualityRules: [
      "crisp graphic edges",
      "professional print quality",
    ],
    avoidRules: [
      "soft pretty aesthetics",
      "decorative ornament",
      "any text or script",
    ],
    blockedTraits: [
      "soft watercolor",
      "decorative style",
    ],
    edgeSafety: [
      "bold shapes at edges are intentional design elements",
    ],
  },

  xeroxzine: {
    visualGoal: [
      "authentic photocopied underground zine page",
      "DIY punk zine print aesthetic",
    ],
    styleAnchors: [
      "xerox zine aesthetic",
      "photocopy texture",
      "rough black and white contrast",
      "collage print style",
      "underground punk zine",
      "grainy copier artifacts",
    ],
    styleRules: [
      "harsh photocopy contrast — crushed blacks and blown whites",
      "visible copier noise, grain, and artifacts",
      "collage cut-and-paste energy",
      "rough unpolished DIY feel",
      "slightly skewed or imperfect alignment",
    ],
    compositionRules: [
      "raw collage-style layout",
      "cut-and-paste layered elements",
      "intentional imperfection and asymmetry",
      "copier artifacts at edges are authentic",
    ],
    colorRules: [
      "strictly black and white — photocopy monochrome",
      "harsh contrast with lost mid-tones",
      "copier grain as texture",
    ],
    qualityRules: [
      "authentic photocopy reproduction quality",
      "visible copier noise and artifacts",
      "intentional lo-fi print aesthetic",
    ],
    avoidRules: [
      "any color",
      "clean digital rendering",
      "polished professional look",
      "any readable text or script",
    ],
    blockedTraits: [
      "color of any kind",
      "digital smoothness",
      "high-fidelity rendering",
    ],
    edgeSafety: [
      "copier artifacts and rough edges are authentic zine details",
    ],
  },

  "xeroxzine-freestyle": {
    visualGoal: [
      "xerox zine style applied to any subject",
      "underground DIY print aesthetic",
    ],
    styleAnchors: [
      "xerox photocopy zine style",
      "rough black and white contrast",
      "collage punk print",
    ],
    styleRules: [
      "harsh photocopy contrast",
      "copier noise and grain artifacts",
      "DIY collage energy",
    ],
    compositionRules: [
      "raw collage layout",
      "intentional imperfection",
      "copier artifacts at edges are authentic",
    ],
    colorRules: [
      "black and white only",
      "harsh crushed contrast",
    ],
    qualityRules: [
      "authentic photocopy quality",
      "intentional lo-fi aesthetic",
    ],
    avoidRules: [
      "any color",
      "clean digital look",
      "any text or script",
    ],
    blockedTraits: [
      "color of any kind",
      "digital smoothness",
    ],
    edgeSafety: [
      "copier artifacts at edges are part of the artwork",
    ],
  },

  scandinavian_poster: {
    visualGoal: [
      "Minimal Scandinavian poster illustration",
      "Calm, balanced and timeless Nordic design",
      "Print-ready composition with strong negative space",
    ],
    styleAnchors: [
      "Scandinavian poster illustration",
      "Nordic minimalist design",
      "flat printed poster aesthetic",
    ],
    styleRules: [
      "flat illustration style",
      "no photorealism",
      "clean geometric shapes",
      "simplified and slightly abstracted forms",
      "Scandinavian minimalism",
      "subtle and smooth gradients only if needed",
      "very light optional paper or grain texture",
    ],
    compositionRules: [
      "strong balanced composition",
      "large negative space",
      "focus on one to three main elements",
      "poster-like framing, not photographic",
      "clear visual hierarchy",
      "generous spacing between elements",
      "minimal geometric backgrounds",
    ],
    colorRules: [
      "muted Nordic color palette",
      "warm off-white or light beige background",
      "dusty blue, sage green, terracotta accents",
      "maximum 3 to 5 colors",
      "no bright or neon colors",
      "avoid pure black, use soft dark tones",
    ],
    qualityRules: [
      "crisp clean edges",
      "vector-like clarity",
      "no visual noise",
      "print-friendly sharpness",
      "balanced alignment and spacing",
      "high readability at large print sizes",
    ],
    avoidRules: [
      "photorealism",
      "realistic textures",
      "depth of field",
      "camera effects",
      "lens blur",
      "heavy detail",
      "cluttered compositions",
      "dramatic lighting",
      "glossy or 3D rendering",
      "busy backgrounds",
      "text unless explicitly requested",
    ],
    blockedTraits: [
      "photorealism",
      "3D rendering",
      "lens blur",
      "depth of field",
      "neon colors",
    ],
    edgeSafety: [
      "geometric shapes and accent elements near edges are part of the poster composition",
    ],
  },

  "scandinavian_poster-freestyle": {
    visualGoal: [
      "Minimal Scandinavian poster illustration applied to any subject",
      "Calm, balanced and timeless Nordic poster",
      "Print-ready composition with strong negative space",
    ],
    styleAnchors: [
      "Scandinavian poster illustration",
      "Nordic minimalist design",
      "flat printed poster aesthetic",
    ],
    styleRules: [
      "flat illustration style",
      "no photorealism",
      "clean geometric shapes",
      "simplified and slightly abstracted forms",
      "Scandinavian minimalism",
      "subtle and smooth gradients only if needed",
      "very light optional paper or grain texture",
    ],
    compositionRules: [
      "strong balanced composition",
      "large negative space",
      "focus on one to three main elements",
      "poster-like framing, not photographic",
      "clear visual hierarchy",
      "generous spacing between elements",
      "minimal geometric backgrounds",
    ],
    colorRules: [
      "muted Nordic color palette",
      "warm off-white or light beige background",
      "dusty blue, sage green, terracotta accents",
      "maximum 3 to 5 colors",
      "no bright or neon colors",
      "avoid pure black, use soft dark tones",
    ],
    qualityRules: [
      "crisp clean edges",
      "vector-like clarity",
      "no visual noise",
      "print-friendly sharpness",
      "balanced alignment and spacing",
      "high readability at large print sizes",
    ],
    avoidRules: [
      "photorealism",
      "realistic textures",
      "depth of field",
      "camera effects",
      "lens blur",
      "heavy detail",
      "cluttered compositions",
      "dramatic lighting",
      "glossy or 3D rendering",
      "busy backgrounds",
      "text unless explicitly requested",
    ],
    blockedTraits: [
      "photorealism",
      "3D rendering",
      "lens blur",
      "depth of field",
      "neon colors",
    ],
    edgeSafety: [
      "geometric shapes and accent elements near edges are part of the poster composition",
    ],
  },

  vintage: {
    visualGoal: [
      "soft vintage hand-painted illustrated café/food poster",
      "elegant, charming, nostalgic and decorative wall art print",
      "feels like a collectible illustrated print on warm paper",
    ],
    styleAnchors: [
      "hand-painted gouache illustration",
      "soft acrylic on paper",
      "vintage European café poster",
      "decorative food and drink poster",
    ],
    styleRules: [
      "visible painterly brushstrokes throughout",
      "flat painted illustration with soft depth — never 3D, never glossy",
      "subtle paper grain and matte texture",
      "central hero composition: the food or drink is the main subject",
      "decorative patterned background behind the subject (textile, tile, floral, scallop, gingham — supporting, never overpowering)",
      "cream or warm off-white outer poster border framing the composition",
    ],
    compositionRules: [
      "vertical poster composition suitable for 50x70 print ratio",
      "decorative cream/off-white border around the entire poster — keep all art inside",
      "balanced, refined and cozy layout — minimal, never cluttered",
      "patterned background sits behind the subject and never competes for attention",
      "leave clear breathing room between subject, pattern and border",
      "all decorative pattern, border, and accents near edges must be fully preserved",
    ],
    colorRules: [
      "soft, slightly muted, harmonious palette tuned to the subject",
      "warm cream / off-white paper tones as the dominant base",
      "earthy supporting tones: terracotta, mustard, sage, dusty blue, soft rose, butter yellow",
      "no neon, no saturated digital colors, no harsh contrast",
      "subtle painterly color blending — gouache-like, never airbrushed",
    ],
    qualityRules: [
      "premium illustrated print quality",
      "visible brush texture preserved at full resolution",
      "crisp readable composition at 50x70 cm print scale",
      "tasteful timeless artisanal feel",
    ],
    avoidRules: [
      "photorealism",
      "harsh contrast",
      "overly modern or digital design",
      "messy or cluttered composition",
      "cartoon style",
      "hyper-detailed realism",
      "neon or saturated digital colors",
      "3D rendering or glossy surfaces",
      "any rendered text, headlines, or labels (text overlays are added separately by the composer)",
    ],
    blockedTraits: [
      "photorealism",
      "3D rendering",
      "glossy plastic surfaces",
      "neon colors",
      "cartoon style",
      "hyper-detailed realism",
    ],
    edgeSafety: [
      "the cream/off-white outer border, decorative pattern and any frame motifs near the edges are part of the poster — preserve them fully",
      "do not crop or fade the painted border or background pattern at the image boundary",
    ],
  },

  "vintage-freestyle": {
    visualGoal: [
      "soft vintage hand-painted illustrated poster applied to any subject",
      "elegant, charming, nostalgic and decorative wall art print",
      "feels like a collectible illustrated print on warm paper",
    ],
    styleAnchors: [
      "hand-painted gouache illustration",
      "soft acrylic on paper",
      "vintage European poster aesthetic",
      "decorative illustrated poster",
    ],
    styleRules: [
      "visible painterly brushstrokes throughout",
      "flat painted illustration with soft depth — never 3D, never glossy",
      "subtle paper grain and matte texture",
      "central hero composition: the chosen subject is the focal point",
      "decorative patterned background behind the subject (textile, tile, floral, scallop, gingham — supporting, never overpowering)",
      "cream or warm off-white outer poster border framing the composition",
    ],
    compositionRules: [
      "vertical poster composition suitable for 50x70 print ratio",
      "decorative cream/off-white border around the entire poster — keep all art inside",
      "balanced, refined and cozy layout — minimal, never cluttered",
      "patterned background sits behind the subject and never competes for attention",
      "leave clear breathing room between subject, pattern and border",
      "all decorative pattern, border, and accents near edges must be fully preserved",
    ],
    colorRules: [
      "soft, slightly muted, harmonious palette tuned to the subject",
      "warm cream / off-white paper tones as the dominant base",
      "earthy supporting tones: terracotta, mustard, sage, dusty blue, soft rose, butter yellow",
      "no neon, no saturated digital colors, no harsh contrast",
      "subtle painterly color blending — gouache-like, never airbrushed",
    ],
    qualityRules: [
      "premium illustrated print quality",
      "visible brush texture preserved at full resolution",
      "crisp readable composition at 50x70 cm print scale",
      "tasteful timeless artisanal feel",
    ],
    avoidRules: [
      "photorealism",
      "harsh contrast",
      "overly modern or digital design",
      "messy or cluttered composition",
      "cartoon style",
      "hyper-detailed realism",
      "neon or saturated digital colors",
      "3D rendering or glossy surfaces",
      "any rendered text, headlines, or labels",
    ],
    blockedTraits: [
      "photorealism",
      "3D rendering",
      "glossy plastic surfaces",
      "neon colors",
      "cartoon style",
      "hyper-detailed realism",
    ],
    edgeSafety: [
      "the cream/off-white outer border, decorative pattern and any frame motifs near the edges are part of the poster — preserve them fully",
      "do not crop or fade the painted border or background pattern at the image boundary",
    ],
  },

  whimsical_japanese: {
    visualGoal: [
      "refined vintage Japanese folk poster with a single anthropomorphic animal hero",
      "calm, iconic wall-art poster — mature collectible feel, not a children's book page",
      "feels like a hand-printed gouache poster on warm aged paper",
    ],
    styleAnchors: [
      "hand-painted gouache and watercolor illustration",
      "vintage Japanese folk print poster",
      "anthropomorphic animal character art with quiet dignity",
      "hand-inked outlines on textured paper",
      "iconic poster composition with quiet negative space",
    ],
    styleRules: [
      "ONE anthropomorphic Japanese animal character as the clear central hero (fox, frog, rabbit, tanuki, cat, crane, bear, etc.) — calm and composed expression",
      "frame the hero as a half-body, waist-up, or seated portrait — never a tiny full-body figure lost in space, never an extreme close-up of just the face",
      "ONE main food or drink interaction at most (a single ramen bowl, a single teacup, a single dumpling steamer, a single sake cup, a single plate of soba or sushi) held or placed clearly in front of / beside the hero",
      "when food or drink is included, render it clearly readable: recognizable shape, simple iconic silhouette, and clearly identifiable contents (visible noodles, broth, dumplings, etc.) — never abstract blobs",
      "Japanese folk-print art direction (kimono, yukata, simple noren motif, a single lantern, a small fan) used sparingly as accents on the character itself, not as scenery",
      "slightly imperfect, hand-drawn ink contours with consistent medium weight — never harsh, never digital, never perfectly clean, but consistent from poster to poster",
      "soft gouache / watercolor washes with restrained, slightly flatter shading — gentle pigment pooling and subtle print texture, but NOT loose painterly watercolor and NOT heavy realistic rendering",
      "visible vintage paper grain and faint hand-print imperfections throughout, at a consistent subtle level",
      "flat painted illustration with soft depth — never 3D, never glossy",
      "mature, quiet, slightly nostalgic mood — refined folk-poster tone, NOT cute kawaii and NOT storybook",
      "the character should usually have open, calm eyes and a soft neutral expression — avoid closed-eye cartoon smiles, blushing cheeks, sparkles, or exaggerated kawaii features by default",
      "iconic centered poster composition with the hero clearly readable from across a room",
      "include a subtle inner poster border or thin painted frame line a small distance inside the artwork edge to reinforce the collectible-print feel",
    ],
    compositionRules: [
      "vertical poster composition suitable for a framed wall print (5:7 / 50×70 cm friendly)",
      "single centered hero subject framed as half-body / waist-up / seated portrait — large, clear, and unmistakably the focal point",
      "the hero plus its single main prop should fill roughly 55–70% of the poster area — not tiny, not overflowing the edges",
      "background is soft, simple, and SECONDARY — a single flat color wash, or a flat wash with at most ONE faint folk pattern or one small quiet accent",
      "calm, evenly distributed negative space around the character — avoid large awkward empty zones AND avoid filling that space with extra props",
      "no interior scenes, no shop counters, no shelves of plates, no stacks of bowls, no decorated tables",
      "ZERO or ONE small supporting background accent only (a faint moon, a single distant branch, a soft cloud) — never multiple",
      "no multiple plants, no curtain assemblies, no lantern strings, no menu boards, no signage",
      "include a subtle painted poster border / thin frame line just inside the artwork edges",
      "any small accents near the edges are part of the artwork — preserve them fully",
    ],
    colorRules: [
      "muted earthy vintage Japanese palette: sage green, indigo, dusty blue, terracotta, cream, soft mustard, faded persimmon",
      "warm cream / off-white paper tone as the dominant base and most of the background",
      "low saturation throughout — gentle, harmonious, slightly faded folk-print feel",
      "no neon, no high-saturation digital colors, no harsh contrast, no candy palette",
      "soft painterly color blending — gouache/watercolor feel, never airbrushed or vector-flat",
    ],
    qualityRules: [
      "premium illustrated poster quality — collectible wall-art tier",
      "visible brush, ink, and paper texture preserved at full resolution",
      "crisp readable composition at 50×70 cm print scale",
      "tasteful, calm, artisanal vintage folk-poster feel",
    ],
    avoidRules: [
      "overly cute kawaii expressions, closed-eye smiles, blushing cheeks, sparkles, hearts, stars",
      "children's book illustration feel",
      "modern cozy café illustration look",
      "busy interior scenes (ramen shops, kitchens, restaurants with visible surroundings)",
      "tables crowded with multiple bowls, plates, chopsticks, condiments, or food props",
      "multiple plants, hanging lanterns, noren curtains, fans, scrolls, signage, or menu boards in the same image",
      "decorative background clutter or scenic storytelling",
      "photorealism",
      "3D rendering or glossy digital surfaces",
      "modern plastic cartoon sheen",
      "over-detailed anime rendering",
      "hyper-saturated or neon colors",
      "harsh digital outlines",
      "any rendered text, headlines, kanji captions, or labels (text overlays are added separately)",
      "copying any specific reference image composition verbatim",
    ],
    blockedTraits: [
      "kawaii cuteness",
      "children's book look",
      "busy interior scene",
      "cluttered tabletop",
      "photorealism",
      "3D rendering",
      "glossy plastic surfaces",
      "neon colors",
      "modern anime sheen",
      "hyper-detailed realism",
    ],
    edgeSafety: [
      "soft paper texture, paint edges, and any small accents near the borders are part of the poster — preserve them fully",
      "do not crop or fade the painted character at the image boundary",
    ],
  },

  "whimsical_japanese-freestyle": {
    visualGoal: [
      "refined vintage Japanese folk poster applied to any subject",
      "calm iconic wall-art poster — mature collectible feel, not a children's book page",
      "feels like a hand-printed gouache poster on warm aged paper",
    ],
    styleAnchors: [
      "hand-painted gouache and watercolor illustration",
      "vintage Japanese folk print poster",
      "hand-inked outlines on textured paper",
      "iconic poster composition with quiet negative space",
    ],
    styleRules: [
      "the chosen subject is the clear central hero of the poster — singular, calm, and iconic",
      "frame the subject as a half-body, waist-up, seated portrait, or a single iconic centered object — never a tiny figure lost in space, never an extreme close-up crop",
      "ONE main object interaction at most — no surrounding scene or prop collection",
      "if food, drink, or a held object is included, render it clearly readable with a simple iconic silhouette — never abstract blobs",
      "preserve vintage Japanese folk-print art direction even on non-Japanese subjects (muted palette, gouache feel, slightly imperfect ink contours, paper texture)",
      "slightly imperfect, hand-drawn ink contours with consistent medium weight — never harsh, never digital",
      "soft gouache / watercolor washes with restrained, slightly flatter shading — gentle pigment pooling and subtle print texture, NOT loose painterly watercolor",
      "visible vintage paper grain and faint hand-print imperfections throughout, at a consistent subtle level",
      "flat painted illustration with soft depth — never 3D, never glossy",
      "mature, quiet, slightly nostalgic mood — refined folk-poster tone, NOT cute kawaii and NOT storybook",
      "for characters: calm open-eyed neutral expression by default — no closed-eye smiles, blushing cheeks, or kawaii features",
      "include a subtle inner poster border or thin painted frame line a small distance inside the artwork edge",
    ],
    compositionRules: [
      "vertical poster composition suitable for a framed wall print",
      "single centered hero subject framed as half-body / waist-up / seated portrait / iconic centered object — large, clear, and unmistakably the focal point",
      "the hero subject should fill roughly 55–70% of the poster area — not tiny, not overflowing the edges",
      "background is soft, simple, and SECONDARY — a single flat color wash, or a wash with at most ONE faint folk pattern or one small quiet accent",
      "calm, evenly distributed negative space around the subject — no large awkward empty zones, no extra props filling the space",
      "no interior scenes, no busy environments, no crowded tabletops",
      "ZERO or ONE small supporting background accent only — never multiple",
      "include a subtle painted poster border / thin frame line just inside the artwork edges",
      "any small accents near the edges are part of the artwork — preserve them fully",
    ],
    colorRules: [
      "muted earthy vintage Japanese palette: sage green, indigo, dusty blue, terracotta, cream, soft mustard, faded persimmon",
      "warm cream / off-white paper tone as the dominant base",
      "low saturation throughout — gentle, harmonious and slightly faded",
      "no neon, no high-saturation digital colors, no harsh contrast",
      "soft painterly color blending — gouache/watercolor feel",
    ],
    qualityRules: [
      "premium illustrated poster quality — collectible wall-art tier",
      "visible brush, ink, and paper texture preserved at full resolution",
      "crisp readable composition at 50×70 cm print scale",
      "tasteful, calm, artisanal vintage folk-poster feel",
    ],
    avoidRules: [
      "overly cute kawaii expressions, closed-eye smiles, blushing cheeks, sparkles, hearts, stars",
      "children's book illustration feel",
      "modern cozy café illustration look",
      "busy interior or environmental scenes",
      "cluttered props or decorative storytelling background items",
      "photorealism",
      "3D rendering or glossy digital surfaces",
      "modern plastic cartoon sheen",
      "over-detailed anime rendering",
      "hyper-saturated or neon colors",
      "harsh digital outlines",
      "any rendered text, headlines, or labels",
      "copying any specific reference image composition verbatim",
    ],
    blockedTraits: [
      "kawaii cuteness",
      "children's book look",
      "busy scene",
      "cluttered background",
      "photorealism",
      "3D rendering",
      "glossy plastic surfaces",
      "neon colors",
      "modern anime sheen",
      "hyper-detailed realism",
    ],
    edgeSafety: [
      "soft paper texture, paint edges, and any accents near the borders are part of the poster — preserve them fully",
      "do not crop or fade the painted subject at the image boundary",
    ],
  },

  modernist_cocktail: {
    visualGoal: [
      "modernist cocktail poster with a single hero drink",
      "collectible mid-century wall-art poster",
      "feels like a hand-printed vintage advertising poster",
    ],
    styleAnchors: [
      "modernist cocktail poster",
      "mid-century modern graphic design",
      "Bauhaus and Swiss poster influence",
      "vintage advertising aesthetic",
      "screen-printed poster feel",
    ],
    styleRules: [
      "ONE central hero drink in ONE primary vessel (cocktail glass, wine glass, beer mug, coffee cup, tumbler, coupe) — never multiple competing drinks",
      "bold geometric construction: every form reduced to clean graphic shapes, ellipses, rectangles, triangles, segments",
      "flat vector-like rendering with clean hard edges — no photoreal glass, no realistic liquid",
      "liquid simplified into geometric reflections, abstract highlights, and layered flat color planes",
      "strong graphic poster composition with clear visual hierarchy",
      "intentional negative space framing the drink as a confident hero",
      "subtle screen-print texture and grain on flat color areas — never glossy, never digital-smooth",
      "graphic poster shadows: flat shape shadows or simple geometric blocks, never soft photographic shadows",
      "may include a small modernist typographic area (drink name or short ingredient list) — kept secondary, restrained, never paragraphs and never logos",
      "include a clean implied poster border or thin frame line just inside the artwork edges",
    ],
    compositionRules: [
      "vertical poster orientation suitable for a framed wall print",
      "single centered or balanced-asymmetric hero drink — large, clear, readable from across a room",
      "hero drink + vessel occupies roughly 50–75% of the poster area",
      "strong visual hierarchy: hero drink first, optional minor typographic accent second, everything else recedes",
      "intentional negative space around the hero — calm, geometric, never cluttered",
      "no realistic bar interiors, no shelves of bottles, no crowds, no busy scenery",
      "ZERO or ONE small supporting graphic accent only (one citrus slice, one olive, one geometric sun, one abstract shape)",
      "thin implied poster border / inner frame line just inside the artwork edges",
      "all composition elements must stay fully within the image boundary",
    ],
    colorRules: [
      "restrained modernist palette of 3–5 dominant colors only",
      "draw from poster palettes such as: deep navy + bright orange + cream + dark red; olive green + mustard + cream + charcoal; terracotta + teal + ivory + dark brown; burgundy + beige + black + dusty gold",
      "strong graphic contrast — bold but never neon, never candy",
      "flat color blocks — no realistic glass gradients, no airbrushed highlights",
      "any color blending happens only as discrete flat planes, not smooth gradients",
      "no rainbow palettes, no more than five dominant colors",
    ],
    qualityRules: [
      "premium illustrated poster quality — collectible wall-art tier",
      "subtle visible print texture preserved at full resolution",
      "crisp readable composition at 50×70 cm print scale",
      "tasteful, confident, mid-century editorial poster feel",
    ],
    avoidRules: [
      "photorealistic drinks or photorealistic glassware",
      "realistic glass reflections, refractions, or condensation",
      "realistic bar interiors, restaurants, or crowded scenes",
      "multiple drinks competing for attention",
      "stock-photo appearance or marketing photography look",
      "AI fantasy aesthetics, ornate decorations, busy backgrounds",
      "excessive text, paragraphs, ingredient walls, recipes",
      "any rendered logos, brand marks, or watermarks",
      "3D rendering, glossy digital surfaces, cinematic lighting",
      "watercolor, oil painting, anime, cartoon styling",
      "excessive smooth gradients or airbrushing inside color blocks",
      "rainbow palettes or more than five dominant colors",
    ],
    blockedTraits: [
      "photorealism",
      "3D rendering",
      "glossy plastic surfaces",
      "cinematic lighting",
      "watercolor wash",
      "oil painting",
      "anime",
      "cartoon",
      "busy bar interior",
      "logos and brand marks",
    ],
    edgeSafety: [
      "the inner poster border / frame line and any geometric accents near the edges are part of the artwork — preserve them fully",
      "do not crop or fade the drink or vessel at the image boundary",
    ],
  },

  "modernist_cocktail-freestyle": {
    visualGoal: [
      "modernist beverage poster applied to any drink subject",
      "collectible mid-century wall-art poster",
      "feels like a hand-printed vintage advertising poster",
    ],
    styleAnchors: [
      "modernist beverage poster",
      "mid-century modern graphic design",
      "Bauhaus and Swiss poster influence",
      "vintage advertising aesthetic",
      "screen-printed poster feel",
    ],
    styleRules: [
      "ONE central hero drink in ONE primary vessel — never multiple competing drinks",
      "bold geometric construction with clean graphic shapes, flat planes, and confident silhouettes",
      "flat vector-like rendering with hard edges — never photoreal glass, never realistic liquid",
      "liquid simplified into geometric reflections, abstract highlights, and layered flat color planes",
      "subtle screen-print texture / grain — never glossy digital sheen",
      "graphic poster shadows only — flat shape shadows or simple geometric blocks",
      "optional small modernist typographic accent (short drink name) — secondary, never logos, never paragraphs",
      "include a clean implied poster border or thin frame line just inside the artwork edges",
    ],
    compositionRules: [
      "vertical poster orientation suitable for a framed wall print",
      "single centered or balanced-asymmetric hero drink — large and clearly readable",
      "hero drink + vessel occupies roughly 50–75% of the poster area",
      "intentional negative space around the hero, calm and geometric",
      "ZERO or ONE small supporting graphic accent only",
      "no bar interiors, no scenes, no clutter",
      "thin implied poster border / inner frame line just inside the artwork edges",
      "all composition elements must stay fully within the image boundary",
    ],
    colorRules: [
      "restrained modernist palette of 3–5 dominant colors only",
      "use rich poster palettes (navy/orange/cream, olive/mustard/cream, terracotta/teal/ivory, burgundy/beige/black/gold)",
      "strong graphic contrast — bold but never neon, never candy",
      "flat color blocks — no smooth realistic gradients, no airbrushed highlights",
      "no rainbow palettes",
    ],
    qualityRules: [
      "premium illustrated poster quality — collectible wall-art tier",
      "subtle visible print texture preserved at full resolution",
      "crisp readable composition at 50×70 cm print scale",
      "tasteful, confident, mid-century editorial poster feel",
    ],
    avoidRules: [
      "photorealistic drinks or glassware",
      "realistic reflections, refractions, condensation",
      "realistic bar interiors or crowded scenes",
      "multiple drinks competing for attention",
      "stock-photo look, marketing photography aesthetic",
      "AI fantasy aesthetics, ornate decorations, busy backgrounds",
      "excessive text, paragraphs, recipes",
      "any rendered logos, brand marks, watermarks",
      "3D rendering, glossy digital surfaces, cinematic lighting",
      "watercolor, oil painting, anime, cartoon",
      "rainbow palettes",
    ],
    blockedTraits: [
      "photorealism",
      "3D rendering",
      "glossy plastic surfaces",
      "cinematic lighting",
      "watercolor",
      "oil painting",
      "anime",
      "cartoon",
      "busy bar interior",
      "logos and brand marks",
    ],
    edgeSafety: [
      "inner poster border, frame line, and geometric accents near the edges are part of the artwork — preserve them fully",
      "do not crop or fade the drink or vessel at the image boundary",
    ],
  },

  mediterranean_heritage: {
    visualGoal: [
      "fine-art Mediterranean travel photograph",
      "premium architectural and cultural photography",
      "collectible sunwashed heritage wall-art",
      "feels like a timeless editorial European destination photo",
    ],
    styleAnchors: [
      "fine-art Mediterranean travel photography",
      "premium architectural and cultural photography",
      "editorial color photography",
      "authentic sunwashed heritage location",
      "timeless European destination",
    ],
    styleRules: [
      "realistic premium photography — never illustration, never painting, never 3D",
      "authentic Mediterranean materials: limestone, weathered wood, peeling paint, aged plaster, terracotta, old stone, patina",
      "beauty must come from authenticity, age, character and craftsmanship — never pristine new construction or luxury-modern perfection",
      "soft natural Mediterranean sunlight (warm morning, golden afternoon) with gentle realistic shadows",
      "sunwashed naturally faded palette — sage, olive, terracotta, sandstone, limestone, cream, beige, dusty blue, faded turquoise, weathered white, ochre, muted earth tones",
      "no HDR, no neon, no oversaturation, no dramatic cinematic color grading — always natural and realistic",
      "professional editorial composition with clean framing and elegant visual hierarchy",
    ],
    compositionRules: [
      "strong focal point with intentional clean framing",
      "balanced composition with intentional negative space",
      "natural leading lines and elegant visual hierarchy",
      "subject occupies roughly 50 to 80 percent of the image area",
      "the visual identity stays consistent across all Mediterranean subjects: architecture (doors, windows, balconies, facades, staircases, courtyards, churches, alleyways, village streets), nature (olive trees, lemon trees, bougainvillea, vineyards, coastlines, cliffs), lifestyle (cafés, terraces, market stalls, fishing boats, harbors, plazas), details (ceramic pots, lanterns, shutters, fountains, stone textures)",
      "supporting Mediterranean plants (olive, bougainvillea, lemon, vines, potted greenery) may complement the subject but never overwhelm it",
      "people may appear occasionally but should rarely be the main subject",
      "no cluttered scenes, no competing focal points, no tourist snapshot framing, no random visual noise",
      "all composition elements must stay fully within the image boundary",
    ],
    colorRules: [
      "authentic Mediterranean palette — sunwashed, naturally faded, warm and timeless",
      "anchors: sage green, olive green, terracotta, sandstone, limestone, cream, beige, dusty blue, faded turquoise, weathered white, ochre, muted earth tones",
      "soft warm sunlight tone bathing the scene",
      "no neon colors, no hyper-saturation, no modern commercial palettes, no unrealistic color grading",
    ],
    qualityRules: [
      "gallery-worthy print-worthy fine-art photography",
      "extremely sharp realistic detail in materials and textures",
      "natural micro-textures: stone grain, paint cracks, wood grain, plaster pores, fabric weave",
      "professional high-end editorial photography finish",
    ],
    avoidRules: [
      "any illustration, painting, watercolor, gouache, vector, cartoon, anime, fantasy or surreal styling",
      "AI-art look, 3D render, CGI, or smooth digital plastic surfaces",
      "HDR effects, dramatic cinematic lighting, artificial neon lighting, extreme contrast, overprocessed photography",
      "instagram-style filters, teal-orange grade, oversaturation, social-media-filter aesthetics",
      "crowds, heavy traffic, modern advertisements, brand logos, watermarks, captions or letters",
      "futuristic elements, fantasy architecture, unrealistic colors, excessive decoration",
      "pristine new construction or luxury-modern perfection",
    ],
    blockedTraits: [
      "illustration",
      "painting",
      "watercolor",
      "cartoon",
      "anime",
      "fantasy",
      "surrealism",
      "AI-art aesthetic",
      "3D rendering",
      "HDR",
      "neon lighting",
      "logos and brand marks",
    ],
    edgeSafety: [
      "architectural details, plants, and materials near the borders are part of the photograph — preserve them fully",
      "do not crop, fade, or soften the subject at the image boundary",
    ],
  },

  "mediterranean_heritage-freestyle": {
    visualGoal: [
      "fine-art Mediterranean travel photograph applied to any Mediterranean subject",
      "collectible sunwashed heritage wall-art",
      "timeless editorial European destination feel",
    ],
    styleAnchors: [
      "fine-art Mediterranean travel photography",
      "premium architectural and cultural photography",
      "editorial color photography",
      "authentic sunwashed heritage location",
    ],
    styleRules: [
      "realistic premium photography — never illustration, never painting, never 3D",
      "authentic Mediterranean materials and natural aging — limestone, weathered wood, peeling paint, aged plaster, terracotta, old stone, patina",
      "soft natural Mediterranean sunlight with gentle realistic shadows",
      "sunwashed naturally faded palette of muted Mediterranean earth tones",
      "no HDR, no neon, no oversaturation, no dramatic cinematic color grading",
      "professional editorial composition with clean framing",
    ],
    compositionRules: [
      "strong focal point with intentional clean framing",
      "balanced composition with intentional negative space and natural leading lines",
      "subject occupies roughly 50 to 80 percent of the image area",
      "supporting Mediterranean plants may complement the subject but never overwhelm",
      "people may appear occasionally but rarely as the main subject",
      "no cluttered scenes, no tourist snapshots, no random visual noise",
      "all composition elements must stay fully within the image boundary",
    ],
    colorRules: [
      "authentic sunwashed Mediterranean palette — sage, olive, terracotta, sandstone, limestone, cream, dusty blue, faded turquoise, weathered white, ochre",
      "soft warm sunlight tone bathing the scene",
      "no neon, no hyper-saturation, no unrealistic grading",
    ],
    qualityRules: [
      "gallery-worthy print-worthy fine-art photography",
      "sharp realistic micro-textures in stone, wood, plaster and fabric",
      "professional high-end editorial photography finish",
    ],
    avoidRules: [
      "illustration, painting, watercolor, vector, cartoon, anime, fantasy or surreal styling",
      "AI-art look, 3D render, CGI, smooth digital plastic surfaces",
      "HDR, neon, oversaturation, dramatic cinematic grading, instagram filters, overprocessed look",
      "crowds, modern advertisements, brand logos, watermarks, captions or letters",
      "pristine new construction or luxury-modern perfection",
    ],
    blockedTraits: [
      "illustration",
      "painting",
      "watercolor",
      "cartoon",
      "anime",
      "fantasy",
      "3D rendering",
      "HDR",
      "neon lighting",
      "logos and brand marks",
    ],
    edgeSafety: [
      "architectural details, plants and materials near the borders are part of the photograph — preserve them fully",
      "do not crop or fade the subject at the image boundary",
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

  // Always-on quality block
  const alwaysOnQuality = [
    `\nTECHNICAL QUALITY: ${BASE_QUALITY_RULES.join(". ")}`,
    `\nPRINT OPTIMIZATION: ${PRINT_RULES.join(". ")}`,
    `\nAVOID ARTIFACTS: ${AVOID_PRINT_ARTIFACTS.join(". ")}`,
    `\nWALL ART COMPOSITION: ${WALL_ART_COMPOSITION.join(". ")}`,
  ].join("\n");

  if (!rules) {
    return [
      `PRIMARY SUBJECT: ${userPrompt}`,
      "",
      `VISUAL GOAL: professional art illustration`,
      `GLOBAL QUALITY: ${GLOBAL_QUALITY.join(". ")}`,
      "",
      `EDGE SAFETY: ${EDGE_SAFETY_RULES.join(". ")}`,
      alwaysOnQuality,
      "",
      "Generate at maximum native resolution. Output the highest fidelity image possible.",
    ].join("\n");
  }

  const { aspectRatio, backgroundStyle = "white", isEdit = false, variationIndex } = options;
  const useCream = backgroundStyle === "cream";

  const bgText = useCream
    ? "ARTWORK BACKGROUND: Use a warm cream/off-white vintage paper background tone within the artwork. This background is an OUTER presentation layer — it must NOT replace, blend into, or obscure any edge details, borders, or frame elements within the artwork itself."
    : "ARTWORK BACKGROUND: The background within the artwork MUST be pure white (#FFFFFF). Do NOT use cream, beige, off-white, or any tinted color. This background is an OUTER presentation layer — it must NOT replace, blend into, or obscure any edge details, borders, or frame elements within the artwork itself.";

  const ratioText = aspectRatio
    ? `The image must have a ${aspectRatio} aspect ratio, composed specifically for that format.`
    : "";

  const edgeSafetyLines = [
    ...EDGE_SAFETY_RULES,
    ...(rules.edgeSafety || []),
  ];

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
      `STYLE QUALITY: ${rules.qualityRules.join(". ")}`,
      `GLOBAL QUALITY: ${GLOBAL_QUALITY.join(". ")}`,
      `AVOID: ${rules.avoidRules.join(", ")}`,
      blockedSection,
      alwaysOnQuality,
      "",
      "Generate at maximum native resolution. Output the highest fidelity image possible.",
    ].filter(Boolean).join("\n");
  }

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
    `STYLE QUALITY: ${rules.qualityRules.join(". ")}`,
    "",
    `GLOBAL QUALITY: ${GLOBAL_QUALITY.join(". ")}`,
    "",
    `EDGE SAFETY: ${edgeSafetyLines.join(". ")}`,
    "",
    `AVOID: ${rules.avoidRules.join(". ")}`,
    blockedSection,
    alwaysOnQuality,
    "",
    bgText,
    ratioText,
    variationText,
    "",
    "Generate at maximum native resolution. Output the highest fidelity image possible.",
  ].filter(Boolean).join("\n");
}

/** Backward-compatible alias */
export const buildStructuredPrompt = compilePrompt;
