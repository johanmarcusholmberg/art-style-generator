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
