/**
 * Lightweight presentation metadata for the style selector UI.
 * Does NOT replace src/lib/style-config.ts (which holds prompt rules,
 * edge-fn routing and generator behavior). This file is only used by
 * the top-nav / style-selector to render cards, descriptions, categories.
 *
 * If you add a new style page, also add a row here so it shows up in the
 * style selector. Generation logic is unaffected.
 *
 * Phase-1 taxonomy (added 2026-06):
 *   - `family`, `visibility`, `variantOf`, `printSuitability`,
 *     `textureProfile`, `shortUserDescription`, `styleIntent` are pure
 *     metadata to power grouping/badges in the UI and to seed future
 *     per-style prompt and upscale work.
 *   - `negativePromptHints`, `printIntentModifier`, `upscaleNotes` are
 *     reserved fields populated for a handful of styles. They are NOT
 *     wired into the prompt compiler or upscale router yet.
 *   - No existing style IDs or routes changed. Generation behavior is
 *     unchanged.
 */

export type StyleCategory =
  | "Classic print"
  | "Illustration"
  | "Modern & graphic"
  | "Travel Photography"
  | "Experimental";

export type StyleFamily =
  | "japanese_ink"
  | "printmaking"
  | "modernist_graphic"
  | "painterly"
  | "botanical_naturalist"
  | "street_tattoo"
  | "minimalist"
  | "photo_mood"
  | "heritage_vintage"
  | "experimental_tool";

export type StyleVisibility = "primary" | "variant" | "hidden";

export type PrintSuitability = "excellent" | "good" | "risky";

export type TextureProfile =
  | "flat"
  | "clean"
  | "medium_texture"
  | "heavy_texture"
  | "grain_risky";

/** Display label and order for each family in the style selector. */
export const FAMILY_LABELS: Record<StyleFamily, string> = {
  japanese_ink: "Japanese & Ink",
  printmaking: "Printmaking",
  modernist_graphic: "Modernist & Graphic",
  painterly: "Painterly",
  botanical_naturalist: "Painterly & Naturalist",
  street_tattoo: "Street & Tattoo",
  minimalist: "Minimal",
  photo_mood: "Vintage & Heritage",
  heritage_vintage: "Vintage & Heritage",
  experimental_tool: "Experimental",
};

/** Render order for family groups in the selector. */
export const FAMILY_ORDER: StyleFamily[] = [
  "japanese_ink",
  "printmaking",
  "modernist_graphic",
  "painterly",
  "botanical_naturalist",
  "minimalist",
  "heritage_vintage",
  "photo_mood",
  "street_tattoo",
  "experimental_tool",
];

export interface StyleCatalogEntry {
  /** Route path for the style's generator page — stable ID, do not rename. */
  route: string;
  /** Display name */
  name: string;
  /** Small emoji/icon */
  emoji: string;
  /** One-sentence description shown on the selected-style card and style cards */
  description: string;
  /** Best-for / tagline shown on the selected-style card */
  bestFor?: string;
  /** Legacy category — retained for back-compat. Prefer `family`. */
  category: StyleCategory;

  // --- Phase-1 taxonomy metadata (presentation only) ---
  /** Broad family used for grouping in the style selector. */
  family?: StyleFamily;
  /** Whether the style is shown as a primary card or as a variant. */
  visibility?: StyleVisibility;
  /** If this is a variant, the parent style's route. */
  variantOf?: string;
  /** How well this style typically reproduces at large print sizes. */
  printSuitability?: PrintSuitability;
  /** Surface/texture profile — informs future upscale recipes. */
  textureProfile?: TextureProfile;
  /** Very short helper description (UI badges / tooltips). */
  shortUserDescription?: string;
  /** Intent tag — what users typically reach for this style for. */
  styleIntent?: string;

  // --- Phase-1 reserved fields (NOT wired into generation yet) ---
  negativePromptHints?: string[];
  printIntentModifier?: string;
  upscaleNotes?: string;
}

export const STYLE_CATALOG: StyleCatalogEntry[] = [
  // Classic print
  {
    route: "/",
    name: "Ukiyo-e",
    emoji: "🏯",
    description: "Traditional Japanese woodblock print style.",
    bestFor: "Atmospheric scenes, landscapes, waves, temples, cranes and poetic compositions.",
    category: "Classic print",
    family: "japanese_ink",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Poetic Japanese woodblock scenes",
    negativePromptHints: ["photorealistic", "3D render", "glossy", "cinematic photo", "airbrushed"],
  },
  {
    route: "/risograph",
    name: "Risograph",
    emoji: "📠",
    description: "Layered duplicator print with grainy spot colors.",
    bestFor: "Zine covers, indie posters, retro-feel illustrations.",
    category: "Classic print",
    family: "printmaking",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "heavy_texture",
    styleIntent: "Grainy two-tone risograph poster",
    negativePromptHints: ["glossy digital gradients", "photorealistic lighting", "tiny halftone dots"],
    printIntentModifier:
      "Use larger visible ink textures and broad halftone patterns suitable for large-format print.",
  },
  {
    route: "/screenprint",
    name: "Screen Print",
    emoji: "🖨️",
    description: "Bold, flat-color silkscreen poster style.",
    bestFor: "Gig posters, two- to three-tone graphic prints.",
    category: "Classic print",
    family: "printmaking",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "medium_texture",
    styleIntent: "Bold flat-color silkscreen poster",
    negativePromptHints: ["photographic detail", "soft airbrush", "complex gradients"],
    printIntentModifier:
      "Use clean spot-color separations, bold edges, and large readable shapes suitable for poster printing.",
  },
  {
    route: "/xeroxzine",
    name: "Xerox Zine",
    emoji: "📋",
    description: "High-contrast photocopy zine aesthetic.",
    bestFor: "DIY punk-zine art, lo-fi black-and-white compositions.",
    category: "Classic print",
    family: "printmaking",
    visibility: "variant",
    variantOf: "/screenprint",
    printSuitability: "risky",
    textureProfile: "grain_risky",
    styleIntent: "High-contrast photocopy zine look",
    negativePromptHints: ["smooth glossy finish", "polished corporate design", "photorealistic detail"],
    printIntentModifier:
      "Keep photocopy textures broad and graphic, avoiding noisy fine grain that breaks during upscale.",
  },

  // Illustration
  {
    route: "/lineart",
    name: "Line Art",
    emoji: "✒️",
    description: "Precise ink drawing with confident linework.",
    bestFor: "Botanical studies, architecture, single-line minimal sketches.",
    category: "Illustration",
    family: "japanese_ink",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    styleIntent: "Clean ink linework",
    negativePromptHints: ["photorealistic", "heavy shading", "noisy texture", "painterly brushwork"],
    printIntentModifier:
      "Keep linework clean, bold enough for large-format print, and avoid fragile micro-details.",
  },
  {
    route: "/botanical",
    name: "Botanical",
    emoji: "🌿",
    description: "Watercolor botanical study illustration.",
    bestFor: "Flowers, ferns, mushrooms, herbarium-style plates.",
    category: "Illustration",
    family: "botanical_naturalist",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "medium_texture",
    styleIntent: "Herbarium-style botanical plates",
    negativePromptHints: [
      "photorealistic background",
      "blurry petals",
      "cluttered composition",
      "plastic texture",
    ],
    printIntentModifier:
      "Preserve crisp botanical linework, readable ingredient shapes, and clean separation from the background.",
  },
  {
    route: "/tattooflash",
    name: "Tattoo Flash",
    emoji: "🔥",
    description: "Old-school tattoo flash sheet artwork.",
    bestFor: "Bold outlined icons, daggers, roses, hearts, eagles.",
    category: "Illustration",
    family: "street_tattoo",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    styleIntent: "Old-school tattoo flash sheet",
    negativePromptHints: ["soft watercolor", "photorealistic shading", "tiny fragile details"],
    printIntentModifier:
      "Use bold black outlines and clean color fills suitable for sharp poster reproduction.",
  },
  {
    route: "/retrocomic",
    name: "Retro Comic",
    emoji: "💥",
    description: "Vintage comic-book panel art.",
    bestFor: "Action poses, halftone-shaded heroes, retro speech-bubble vibes.",
    category: "Illustration",
    family: "printmaking",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "heavy_texture",
    styleIntent: "Vintage comic panel art",
    negativePromptHints: ["modern 3D render", "cinematic realism", "tiny unreadable text"],
    printIntentModifier:
      "Use bold comic inking, readable panels, and large halftone/Ben-Day textures.",
  },
  {
    route: "/whimsical-japanese",
    name: "Whimsical Japanese",
    emoji: "🦊",
    description: "Hand-painted Japanese-inspired storybook poster with anthropomorphic characters.",
    bestFor: "Whimsical animal heroes, ramen/tea/dumpling scenes, charming framed wall art.",
    category: "Illustration",
    family: "japanese_ink",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Storybook Japanese characters",
    negativePromptHints: ["photorealistic", "dark horror", "gritty realism", "3D render"],
  },
  {
    route: "/modernist-cocktail",
    name: "Modernist Cocktail",
    emoji: "🍸",
    description: "Geometric mid-century beverage poster with limited palette and flat shapes.",
    bestFor: "Cocktails, wine, coffee, beer and spirits as bold collectible wall posters.",
    category: "Modern & graphic",
    family: "modernist_graphic",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    styleIntent: "Mid-century beverage posters",
    negativePromptHints: [
      "photorealistic glassware",
      "cluttered bar scene",
      "tiny unreadable labels",
    ],
    printIntentModifier:
      "Use clean modernist shapes, readable ingredient silhouettes, and strong poster composition.",
  },

  // Travel Photography
  {
    route: "/mediterranean-heritage",
    name: "Mediterranean Heritage",
    emoji: "🚪",
    description: "Fine-art Mediterranean travel photography with sunwashed materials and warm light.",
    bestFor: "Doors, windows, alleys, olive trees, harbors and heritage details as collectible travel posters.",
    category: "Travel Photography",
    family: "heritage_vintage",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Sunwashed Mediterranean travel art",
    negativePromptHints: [
      "cold corporate palette",
      "photorealistic tourism photo",
      "cluttered details",
    ],
    printIntentModifier:
      "Keep forms warm, graphic, sunlit, and readable as a decorative wall print.",
  },

  // Modern & graphic
  {
    route: "/scandinavian-poster",
    name: "Scandinavian",
    emoji: "🇸🇪",
    description: "Minimal Nordic poster design with calm palette.",
    bestFor: "Mid-century-modern interior prints, geometric shapes.",
    category: "Modern & graphic",
    family: "modernist_graphic",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "clean",
    styleIntent: "Calm Nordic interior poster",
    negativePromptHints: ["cluttered composition", "gritty texture", "excessive decoration"],
    printIntentModifier:
      "Keep shapes clean, balanced, and legible with generous negative space.",
  },
  {
    route: "/brutalistposter",
    name: "Brutalist",
    emoji: "⬛",
    description: "Raw, typographic brutalist poster look.",
    bestFor: "Editorial covers, heavy type, off-grid layouts.",
    category: "Modern & graphic",
    family: "modernist_graphic",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    styleIntent: "Typographic brutalist poster",
    negativePromptHints: ["ornate decoration", "delicate details", "photorealism"],
    printIntentModifier:
      "Use sharp typography, strong geometry, and large flat areas suitable for crisp large-format print.",
  },
  {
    route: "/urbannoir",
    name: "Urban Noir",
    emoji: "🖤",
    description: "High-contrast noir illustration with bold shadows, silhouettes, and cinematic poster drama.",
    bestFor: "Cinematic noir illustration, bold silhouettes, dramatic shadow posters.",
    category: "Modern & graphic",
    family: "photo_mood",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    shortUserDescription:
      "High-contrast noir illustration with bold shadows, silhouettes, and cinematic poster drama.",
    styleIntent:
      "Create print-safe noir wall art using illustrative contrast, graphic shadow shapes, and cinematic composition rather than photographic noise.",
    negativePromptHints: [
      "photographic noise",
      "muddy shadows",
      "low-resolution grain",
      "blurry face",
      "realistic surveillance photo",
      "soft low-light photo",
    ],
    printIntentModifier:
      "Prefer bold illustrative noir shapes, crisp silhouettes, and controlled high-contrast shadows over photographic grain for large-format print.",
    upscaleNotes:
      "Grain-heavy if overdone. Prefer illustrative contrast and broad shadow shapes over fine noise for large prints.",
  },
  {
    route: "/minimalism",
    name: "Minimalism",
    emoji: "◻",
    description: "Calm, geometric minimal art.",
    bestFor: "Wall art with negative space and limited palettes.",
    category: "Modern & graphic",
    family: "minimalist",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    styleIntent: "Calm geometric minimal art",
    negativePromptHints: ["ornate", "highly detailed", "busy background", "photorealistic texture"],
    printIntentModifier:
      "Preserve large clean shapes, strong negative space, and crisp edges without fake texture.",
  },

  // Experimental
  {
    route: "/blend",
    name: "Blend",
    emoji: "✨",
    description: "Combine two styles into a hybrid output.",
    bestFor: "Exploring unexpected style crossovers.",
    category: "Experimental",
    family: "experimental_tool",
    visibility: "primary",
    styleIntent: "Hybrid style explorer",
    negativePromptHints: [
      "inconsistent mixed styles",
      "muddy hybrid composition",
      "random collage artifacts",
    ],
    printIntentModifier:
      "Keep the blended style coherent, with one dominant visual language and print-safe composition.",
  },
  {
    route: "/graffiti",
    name: "Graffiti",
    emoji: "🎨",
    description: "Spray-painted street art on urban surfaces.",
    bestFor: "Bold tags, dripping color, stencil portraits.",
    category: "Experimental",
    family: "street_tattoo",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Spray-painted street art",
    negativePromptHints: ["illegible micro-text", "photorealistic wall photo", "muddy overspray"],
    printIntentModifier:
      "Keep letterforms and shapes large, bold, and readable; avoid fine spray noise.",
  },
  {
    route: "/pulpmagazine",
    name: "Pulp Magazine",
    emoji: "📕",
    description: "1950s pulp-magazine cover art.",
    bestFor: "Lurid sci-fi and crime-fiction cover compositions.",
    category: "Experimental",
    family: "printmaking",
    visibility: "variant",
    variantOf: "/retrocomic",
    printSuitability: "good",
    textureProfile: "heavy_texture",
    styleIntent: "1950s pulp-magazine covers",
    negativePromptHints: ["modern digital realism", "3D render", "clean corporate poster"],
    printIntentModifier:
      "Use bold painted forms, strong silhouettes, and print-safe grain rather than fine photographic noise.",
  },
  {
    route: "/popart",
    name: "Pop Art",
    emoji: "🎯",
    description: "Saturated pop-art with Ben-Day dots and bold outlines.",
    bestFor: "Punchy graphic portraits and consumer-object icons.",
    category: "Experimental",
    family: "printmaking",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Saturated pop-art portraits",
    negativePromptHints: [
      "photorealistic rendering",
      "muddy colors",
      "subtle low-contrast palette",
    ],
    printIntentModifier:
      "Use bold flat color regions and controlled halftone areas that remain legible at large print sizes.",
  },
  {
    route: "/vintage",
    name: "Vintage",
    emoji: "🍷",
    description: "Aged vintage poster and label art.",
    bestFor: "Apothecary, travel-poster and old-label compositions.",
    category: "Experimental",
    family: "heritage_vintage",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Aged vintage posters and labels",
    negativePromptHints: [
      "modern glossy 3D render",
      "neon cyberpunk",
      "ultra-sharp digital realism",
    ],
    printIntentModifier:
      "Use controlled aged texture and avoid fine noise that may become muddy in large prints.",
  },

  // Phase 3 — new primary styles
  {
    route: "/artnouveau",
    name: "Art Nouveau",
    emoji: "🌸",
    description:
      "Ornamental decorative poster style with flowing lines, botanical borders, elegant figures, and vintage exhibition-poster composition.",
    bestFor:
      "Premium decorative wall art inspired by late-19th-century poster illustration with botanical ornament.",
    category: "Experimental",
    family: "heritage_vintage",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "clean",
    shortUserDescription:
      "Ornamental decorative poster with flowing lines, botanical borders, and elegant Mucha-style composition.",
    styleIntent:
      "Create premium decorative wall art inspired by late-19th-century poster illustration, with graceful linework, organic ornament, and strong central composition.",
    negativePromptHints: [
      "photorealistic",
      "3D render",
      "corporate minimalism",
      "messy collage",
      "harsh cyberpunk",
      "modern glossy advertising",
    ],
    printIntentModifier:
      "Use clean ornamental linework, readable botanical shapes, and large elegant color areas suitable for crisp poster printing.",
  },
  {
    route: "/midcenturymodern",
    name: "Mid-Century Modern",
    emoji: "🌞",
    description:
      "Warm 1950s-inspired illustration with simplified shapes, playful geometry, muted colors, and charming poster composition.",
    bestFor:
      "Commercial-friendly wall art inspired by mid-century editorial and travel illustration.",
    category: "Modern & graphic",
    family: "modernist_graphic",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    shortUserDescription:
      "Warm 1950s-inspired illustration with simplified shapes and playful editorial-poster composition.",
    styleIntent:
      "Create commercial-friendly wall art inspired by mid-century editorial and travel illustration, using simplified forms, warm palettes, and clean graphic structure.",
    negativePromptHints: [
      "photorealistic",
      "3D render",
      "glossy gradients",
      "excessive detail",
      "neon cyberpunk",
      "cluttered composition",
    ],
    printIntentModifier:
      "Use large simplified shapes, clean silhouettes, warm flat colors, and minimal fine texture for strong large-format print clarity.",
  },
  {
    route: "/loosewatercolor",
    name: "Loose Watercolor",
    emoji: "💧",
    description:
      "Soft expressive watercolor style with loose washes, gentle pigment blooms, and airy painterly compositions.",
    bestFor:
      "Softer painterly wall art that feels handmade and organic, distinct from precise botanical studies.",
    category: "Illustration",
    family: "painterly",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    shortUserDescription:
      "Soft expressive watercolor with loose washes, gentle pigment blooms, and airy composition.",
    styleIntent:
      "Create softer painterly wall art that feels handmade and organic, distinct from the more precise Botanical style.",
    negativePromptHints: [
      "photorealistic",
      "hard vector edges",
      "3D render",
      "overly sharp digital detail",
      "muddy overworked paint",
      "plastic texture",
    ],
    printIntentModifier:
      "Use broad watercolor washes, clear subject silhouettes, and avoid tiny fragile pigment details that may become muddy in large prints.",
  },
];

export const STYLE_CATEGORIES: StyleCategory[] = [
  "Classic print",
  "Illustration",
  "Modern & graphic",
  "Travel Photography",
  "Experimental",
];

export function getStyleByRoute(route: string): StyleCatalogEntry | undefined {
  return STYLE_CATALOG.find((s) => s.route === route);
}

/**
 * Short label suitable for a UI badge based on a style's texture/print
 * profile. Returns null when no badge is useful.
 */
export function getStyleBadge(entry: StyleCatalogEntry): string | null {
  if (entry.visibility === "variant") return "Variant";
  if (entry.textureProfile === "grain_risky") return "Grain-heavy";
  if (entry.textureProfile === "heavy_texture") return "Textured";
  if (entry.printSuitability === "excellent" && entry.textureProfile === "flat")
    return "Sharp print";
  if (entry.printSuitability === "excellent") return "Large-format friendly";
  return null;
}
