/**
 * Lightweight presentation metadata for the style selector UI.
 * Does NOT replace src/lib/style-config.ts (which holds prompt rules,
 * edge-fn routing and generator behavior). This file is only used by
 * the top-nav / style-selector to render cards, descriptions, categories.
 *
 * If you add a new style page, also add a row here so it shows up in the
 * style selector. Generation logic is unaffected.
 */

export type StyleCategory =
  | "Classic print"
  | "Illustration"
  | "Modern & graphic"
  | "Experimental";

export interface StyleCatalogEntry {
  /** Route path for the style's generator page */
  route: string;
  /** Display name */
  name: string;
  /** Small emoji/icon */
  emoji: string;
  /** One-sentence description shown on the selected-style card and style cards */
  description: string;
  /** Best-for / tagline shown on the selected-style card */
  bestFor?: string;
  /** Category group used in the selector */
  category: StyleCategory;
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
  },
  {
    route: "/risograph",
    name: "Risograph",
    emoji: "📠",
    description: "Layered duplicator print with grainy spot colors.",
    bestFor: "Zine covers, indie posters, retro-feel illustrations.",
    category: "Classic print",
  },
  {
    route: "/screenprint",
    name: "Screen Print",
    emoji: "🖨️",
    description: "Bold, flat-color silkscreen poster style.",
    bestFor: "Gig posters, two- to three-tone graphic prints.",
    category: "Classic print",
  },
  {
    route: "/xeroxzine",
    name: "Xerox Zine",
    emoji: "📋",
    description: "High-contrast photocopy zine aesthetic.",
    bestFor: "DIY punk-zine art, lo-fi black-and-white compositions.",
    category: "Classic print",
  },

  // Illustration
  {
    route: "/lineart",
    name: "Line Art",
    emoji: "✒️",
    description: "Precise ink drawing with confident linework.",
    bestFor: "Botanical studies, architecture, single-line minimal sketches.",
    category: "Illustration",
  },
  {
    route: "/botanical",
    name: "Botanical",
    emoji: "🌿",
    description: "Watercolor botanical study illustration.",
    bestFor: "Flowers, ferns, mushrooms, herbarium-style plates.",
    category: "Illustration",
  },
  {
    route: "/tattooflash",
    name: "Tattoo Flash",
    emoji: "🔥",
    description: "Old-school tattoo flash sheet artwork.",
    bestFor: "Bold outlined icons, daggers, roses, hearts, eagles.",
    category: "Illustration",
  },
  {
    route: "/retrocomic",
    name: "Retro Comic",
    emoji: "💥",
    description: "Vintage comic-book panel art.",
    bestFor: "Action poses, halftone-shaded heroes, retro speech-bubble vibes.",
    category: "Illustration",
  },

  // Modern & graphic
  {
    route: "/scandinavian-poster",
    name: "Scandinavian",
    emoji: "🇸🇪",
    description: "Minimal Nordic poster design with calm palette.",
    bestFor: "Mid-century-modern interior prints, geometric shapes.",
    category: "Modern & graphic",
  },
  {
    route: "/brutalistposter",
    name: "Brutalist",
    emoji: "⬛",
    description: "Raw, typographic brutalist poster look.",
    bestFor: "Editorial covers, heavy type, off-grid layouts.",
    category: "Modern & graphic",
  },
  {
    route: "/urbannoir",
    name: "Urban Noir",
    emoji: "🖤",
    description: "Gritty monochrome street-photography look.",
    bestFor: "Rain-slick nights, harsh shadows, cinematic moodboards.",
    category: "Modern & graphic",
  },
  {
    route: "/minimalism",
    name: "Minimalism",
    emoji: "◻",
    description: "Calm, geometric minimal art.",
    bestFor: "Wall art with negative space and limited palettes.",
    category: "Modern & graphic",
  },

  // Experimental
  {
    route: "/blend",
    name: "Blend",
    emoji: "✨",
    description: "Combine two styles into a hybrid output.",
    bestFor: "Exploring unexpected style crossovers.",
    category: "Experimental",
  },
  {
    route: "/graffiti",
    name: "Graffiti",
    emoji: "🎨",
    description: "Spray-painted street art on urban surfaces.",
    bestFor: "Bold tags, dripping color, stencil portraits.",
    category: "Experimental",
  },
  {
    route: "/pulpmagazine",
    name: "Pulp Magazine",
    emoji: "📕",
    description: "1950s pulp-magazine cover art.",
    bestFor: "Lurid sci-fi and crime-fiction cover compositions.",
    category: "Experimental",
  },
  {
    route: "/popart",
    name: "Pop Art",
    emoji: "🎯",
    description: "Saturated pop-art with Ben-Day dots and bold outlines.",
    bestFor: "Punchy graphic portraits and consumer-object icons.",
    category: "Experimental",
  },
  {
    route: "/vintage",
    name: "Vintage",
    emoji: "🍷",
    description: "Aged vintage poster and label art.",
    bestFor: "Apothecary, travel-poster and old-label compositions.",
    category: "Experimental",
  },
];

export const STYLE_CATEGORIES: StyleCategory[] = [
  "Classic print",
  "Illustration",
  "Modern & graphic",
  "Experimental",
];

export function getStyleByRoute(route: string): StyleCatalogEntry | undefined {
  return STYLE_CATALOG.find((s) => s.route === route);
}
