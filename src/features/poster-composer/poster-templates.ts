/**
 * Poster Composer — template registry.
 *
 * Each template defines:
 *   - layout split between image area and reserved text area
 *   - default safe-area settings (position, height ratio, background)
 *   - typography defaults rendered in the live preview AND on export
 *
 * Templates are intentionally minimal — pick a template, tweak text,
 * export. Future extension: per-style font packs (NOT built now).
 */

import type {
  PosterTemplateId,
  PosterLayoutConfig,
  PosterTextContent,
} from "./poster-types";

export interface PosterTemplate {
  id: PosterTemplateId;
  name: string;
  description: string;
  /** Default text shown when the user picks the template. */
  defaultText: PosterTextContent;
  /** Default safe-area layout for the template. */
  defaultLayout: PosterLayoutConfig;
  layout: {
    /** Fraction of poster height occupied by the artwork. */
    imageArea: number;
    /** Fraction of poster height occupied by the text block. */
    textArea: number;
  };
  typography: {
    /** Title size, in points relative to a 1000px tall poster. */
    titleSize: number;
    subtitleSize: number;
    bodySize: number;
    /** CSS font-family stack — kept system-safe for reliable rendering. */
    titleFontFamily: string;
    bodyFontFamily: string;
    titleColor: string;
    bodyColor: string;
    /** Horizontal alignment within the safe area. */
    align: "left" | "center" | "right";
    /** Tracking (CSS letter-spacing) for the title. */
    titleLetterSpacing: string;
    /** Whether the title is uppercased on render. */
    titleUppercase: boolean;
  };
}

const SERIF = `"Playfair Display", "Source Serif Pro", Georgia, serif`;
const SANS = `"Inter", "Helvetica Neue", Arial, sans-serif`;

export const POSTER_TEMPLATES: Record<PosterTemplateId, PosterTemplate> = {
  minimal: {
    id: "minimal",
    name: "Minimal Poster",
    description:
      "Image-only — no text overlay. Use this when the artwork speaks for itself.",
    defaultText: {},
    defaultLayout: {
      // Templates MUST NOT auto-enable the safe area. The user explicitly
      // toggles it from the generator or composer UI.
      safeAreaEnabled: false,
      safeAreaPosition: "bottom",
      safeAreaHeightRatio: 0.25,
      backgroundColor: "#ffffff",
    },
    layout: { imageArea: 1, textArea: 0 },
    typography: {
      titleSize: 64,
      subtitleSize: 28,
      bodySize: 18,
      titleFontFamily: SERIF,
      bodyFontFamily: SANS,
      titleColor: "#111111",
      bodyColor: "#444444",
      align: "center",
      titleLetterSpacing: "0",
      titleUppercase: false,
    },
  },

  fika: {
    id: "fika",
    name: "Fika Poster",
    description:
      "Title + short description in a clean band beneath the artwork. Great for kitchen/Etsy prints.",
    defaultText: {
      title: "FIKA",
      subtitle: "A Swedish moment",
      description: "Coffee, something sweet, and a pause in the day.",
    },
    defaultLayout: {
      safeAreaEnabled: false,
      safeAreaPosition: "bottom",
      safeAreaHeightRatio: 0.3,
      backgroundColor: "#fdfaf3",
    },
    layout: { imageArea: 0.7, textArea: 0.3 },
    typography: {
      titleSize: 96,
      subtitleSize: 28,
      bodySize: 22,
      titleFontFamily: SERIF,
      bodyFontFamily: SANS,
      titleColor: "#1a1a1a",
      bodyColor: "#5a5040",
      align: "center",
      titleLetterSpacing: "0.18em",
      titleUppercase: true,
    },
  },

  botanical: {
    id: "botanical",
    name: "Botanical Ingredients",
    description:
      "Latin-name title + ingredient list. Inspired by herbarium / apothecary plates.",
    defaultText: {
      title: "Lavandula angustifolia",
      subtitle: "Common Lavender",
      ingredients: [
        "Linalool",
        "Linalyl acetate",
        "Camphor",
        "1,8-Cineole",
      ],
    },
    defaultLayout: {
      safeAreaEnabled: false,
      safeAreaPosition: "bottom",
      safeAreaHeightRatio: 0.22,
      backgroundColor: "#f5f1e8",
    },
    layout: { imageArea: 0.78, textArea: 0.22 },
    typography: {
      titleSize: 56,
      subtitleSize: 22,
      bodySize: 18,
      titleFontFamily: SERIF,
      bodyFontFamily: SANS,
      titleColor: "#2a2a1f",
      bodyColor: "#6b624f",
      align: "center",
      titleLetterSpacing: "0.04em",
      titleUppercase: false,
    },
  },
};

export const POSTER_TEMPLATE_LIST: PosterTemplate[] = Object.values(POSTER_TEMPLATES);

export function getPosterTemplate(id: PosterTemplateId): PosterTemplate {
  return POSTER_TEMPLATES[id];
}
