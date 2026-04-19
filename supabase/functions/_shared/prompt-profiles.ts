/**
 * Provider-aware prompt profiles.
 *
 * Same style identity (visual goal, palette, composition) — different
 * "translation" depending on the resolved generator.
 *
 * Gemini → keep current rich descriptive language.
 * SDXL   → emit hard visual constraints + a strong negative prompt so
 *          the model doesn't drift toward generic photoreal output.
 */

export type ResolvedProviderId = "gemini" | "sdxl";

export type StyleCategory =
  | "poster_flat"
  | "minimal"
  | "lineart"
  | "painterly"
  | "photographic_mono"
  | "lo_fi_print"
  | "comic_print"
  | "tattoo_flash"
  | "default";

/** Per-style override of the default category mapping below. */
export const STYLE_CATEGORY_OVERRIDES: Record<string, StyleCategory> = {
  // Pop art / screen print / risograph / brutalist / retro comic → flat poster
  popart: "poster_flat",
  "popart-freestyle": "poster_flat",
  screenprint: "poster_flat",
  "screenprint-freestyle": "poster_flat",
  risograph: "lo_fi_print",
  "risograph-freestyle": "lo_fi_print",
  brutalistposter: "poster_flat",
  "brutalistposter-freestyle": "poster_flat",
  retrocomic: "comic_print",
  "retrocomic-freestyle": "comic_print",
  pulpmagazine: "painterly",
  "pulpmagazine-freestyle": "painterly",

  // Minimalist / Scandinavian
  minimalism: "minimal",
  "minimalism-freestyle": "minimal",

  // Line art family
  lineart: "lineart",
  "lineart-freestyle": "lineart",
  "lineart-minimal": "lineart",

  // Botanical → painterly (watercolor)
  botanical: "painterly",
  "botanical-freestyle": "painterly",

  // Ukiyo-e → flat poster (woodblock = flat colors + outlines)
  japanese: "poster_flat",
  freestyle: "poster_flat",

  // Graffiti / urban
  graffiti: "lo_fi_print",
  "graffiti-freestyle": "lo_fi_print",

  // Tattoo flash
  tattooflash: "tattoo_flash",
  "tattooflash-freestyle": "tattoo_flash",

  // Photographic monochrome
  urbannoir: "photographic_mono",
  "urbannoir-freestyle": "photographic_mono",
  xeroxzine: "photographic_mono",
  "xeroxzine-freestyle": "photographic_mono",
};

export function categoryFor(styleKey: string): StyleCategory {
  return STYLE_CATEGORY_OVERRIDES[styleKey] ?? "default";
}

// ── SDXL reinforcement tokens per category ──────────────────────────────
// These are appended FRONT of the SDXL prompt (SDXL weights early tokens
// more heavily) and re-stated in a "STYLE LOCK" tail block.

interface SdxlProfile {
  /** Concrete visual constraints in CLIP-friendly token style. */
  reinforcement: string[];
  /** Composition discipline keywords. */
  composition: string[];
  /** Negative prompt fragments, joined with ", ". */
  negative: string[];
}

export const SDXL_CATEGORY_PROFILES: Record<StyleCategory, SdxlProfile> = {
  poster_flat: {
    reinforcement: [
      "flat vector illustration",
      "solid color blocks",
      "hard edges",
      "thick clean outlines",
      "graphic poster composition",
      "screen print aesthetic",
      "high contrast flat shapes",
      "minimal shading",
      "limited color palette",
    ],
    composition: [
      "centered composition",
      "clear focal subject",
      "bold silhouette",
      "balanced negative space",
    ],
    negative: [
      "photorealism",
      "photo",
      "photograph",
      "realistic skin",
      "realistic lighting",
      "3d render",
      "octane render",
      "blender render",
      "depth of field",
      "bokeh",
      "cinematic lighting",
      "soft gradient",
      "smooth shading",
      "airbrush",
      "hdr",
      "lens flare",
      "film grain",
      "noise",
      "blurry",
      "low quality",
      "watermark",
      "signature",
      "text",
      "letters",
      "words",
      "ugly",
      "deformed",
      "extra fingers",
    ],
  },
  minimal: {
    reinforcement: [
      "flat minimalist illustration",
      "solid color blocks",
      "geometric simplification",
      "Scandinavian poster design",
      "Swiss graphic design",
      "very large negative space",
      "two to four colors only",
      "hard precise edges",
      "no shading",
    ],
    composition: [
      "single centered subject",
      "abundant empty background",
      "balanced symmetry",
      "intentional minimal layout",
    ],
    negative: [
      "photorealism",
      "photo",
      "realistic",
      "3d render",
      "depth of field",
      "bokeh",
      "cinematic",
      "complex texture",
      "busy background",
      "many colors",
      "gradient",
      "soft shading",
      "watercolor texture",
      "noise",
      "grain",
      "lens flare",
      "watermark",
      "text",
      "letters",
      "words",
      "ugly",
      "deformed",
    ],
  },
  lineart: {
    reinforcement: [
      "pen and ink illustration",
      "fine black ink lines on white",
      "hatching and cross-hatching",
      "engraving style",
      "monochrome",
      "no color",
      "no fills",
      "uniform white background",
    ],
    composition: [
      "clear central subject",
      "balanced negative space",
      "line density variation for depth",
    ],
    negative: [
      "color",
      "colored",
      "color fill",
      "watercolor",
      "paint",
      "gradient",
      "photorealism",
      "photo",
      "3d render",
      "shading with gray fill",
      "smooth shading",
      "cartoon",
      "anime",
      "blurry",
      "noise",
      "watermark",
      "text",
      "letters",
      "ugly",
      "deformed",
    ],
  },
  painterly: {
    reinforcement: [
      "painterly illustration",
      "visible brushwork",
      "traditional media texture",
      "rich pigment layering",
      "natural color blending",
    ],
    composition: [
      "clear focal subject",
      "atmospheric depth",
      "balanced composition",
    ],
    negative: [
      "photorealism",
      "photograph",
      "3d render",
      "octane render",
      "cgi",
      "plastic skin",
      "vector graphics",
      "flat vector",
      "low quality",
      "blurry",
      "watermark",
      "text",
      "ugly",
      "deformed",
      "extra fingers",
    ],
  },
  photographic_mono: {
    reinforcement: [
      "black and white photograph",
      "high contrast monochrome",
      "analog film grain",
      "documentary street photography",
      "raw gritty aesthetic",
    ],
    composition: [
      "natural urban framing",
      "subject-forward composition",
      "deep blacks and bright highlights",
    ],
    negative: [
      "color",
      "colored",
      "color tint",
      "sepia",
      "smooth digital look",
      "vector illustration",
      "cartoon",
      "anime",
      "3d render",
      "watercolor",
      "soft focus",
      "dreamy",
      "watermark",
      "text",
      "letters",
      "ugly",
      "deformed",
    ],
  },
  lo_fi_print: {
    reinforcement: [
      "screen print texture",
      "halftone dots",
      "ink bleed",
      "limited spot color palette",
      "slight registration misalignment",
      "grain and paper texture",
      "bold simplified forms",
    ],
    composition: [
      "bold poster layout",
      "clear silhouette",
      "graphic figure-ground separation",
    ],
    negative: [
      "photorealism",
      "photo",
      "3d render",
      "smooth digital gradient",
      "airbrush",
      "high fidelity rendering",
      "depth of field",
      "bokeh",
      "watermark",
      "text",
      "letters",
      "ugly",
      "deformed",
    ],
  },
  comic_print: {
    reinforcement: [
      "vintage comic book illustration",
      "thick black ink outlines",
      "halftone dot shading",
      "four-color CMYK process",
      "flat saturated colors",
      "panel art energy",
    ],
    composition: [
      "dynamic action composition",
      "strong figure-ground separation",
      "dramatic foreshortening",
    ],
    negative: [
      "photorealism",
      "photo",
      "3d render",
      "smooth digital coloring",
      "manga style",
      "anime",
      "soft gradient",
      "depth of field",
      "watermark",
      "text",
      "speech bubbles",
      "letters",
      "ugly",
      "deformed",
    ],
  },
  tattoo_flash: {
    reinforcement: [
      "traditional American tattoo flash",
      "very thick black outlines",
      "flat solid color fills",
      "no gradients within shapes",
      "iconic graphic composition",
      "flash sheet style",
    ],
    composition: [
      "centered iconic subject",
      "clean isolation on background",
      "symmetrical balanced design",
    ],
    negative: [
      "photorealism",
      "photo",
      "realistic shading inside shapes",
      "soft gradient",
      "watercolor tattoo style",
      "3d render",
      "depth of field",
      "watermark",
      "text",
      "banner letters",
      "ugly",
      "deformed",
    ],
  },
  default: {
    reinforcement: [
      "high quality illustration",
      "clear subject",
      "strong composition",
    ],
    composition: ["balanced composition", "clear focal subject"],
    negative: [
      "low quality",
      "blurry",
      "soft focus",
      "jpeg artifacts",
      "watermark",
      "signature",
      "text",
      "letters",
      "words",
      "ugly",
      "deformed",
    ],
  },
};

// ── Per-style fine-grained overrides ───────────────────────────────────
// Allows a single style to add to (or replace) the category defaults.

export interface StyleProviderOverride {
  reinforcement?: string[];
  composition?: string[];
  negative?: string[];
  /** If true, REPLACE category defaults instead of extending them. */
  replaceCategory?: boolean;
}

export const STYLE_SDXL_OVERRIDES: Record<string, StyleProviderOverride> = {
  // Ukiyo-e: woodblock print is flat but we want wood grain texture preserved
  japanese: {
    reinforcement: [
      "ukiyo-e woodblock print",
      "Hokusai aesthetic",
      "indigo vermilion ochre palette",
      "visible wood grain texture",
    ],
  },
  freestyle: {
    reinforcement: ["ukiyo-e woodblock print", "bold flat color blocks", "sumi ink outlines"],
  },
  // Pop art: extra Ben-Day reinforcement
  popart: {
    reinforcement: ["Ben-Day dots pattern", "Roy Lichtenstein style", "CMYK pop palette"],
  },
  "popart-freestyle": {
    reinforcement: ["Ben-Day dots pattern", "comic panel pop art"],
  },
  // Minimalism: stronger Scandi anchor
  minimalism: {
    reinforcement: [
      "Scandinavian minimal poster",
      "two to three colors only",
      "abstract geometric simplification",
    ],
  },
  // Line art minimal: extreme constraint
  "lineart-minimal": {
    reinforcement: [
      "single continuous line drawing",
      "Picasso one-line style",
      "absolute minimum strokes",
    ],
    negative: ["hatching", "cross hatching", "shading", "multiple line weights"],
  },
  // Pulp magazine — painterly, allow some realism
  pulpmagazine: {
    reinforcement: [
      "vintage pulp magazine cover painting",
      "gouache and oil illustration",
      "dramatic chiaroscuro",
    ],
  },
  // Brutalist poster: maximum graphic
  brutalistposter: {
    reinforcement: [
      "brutalist graphic poster",
      "heavy black masses",
      "stark high contrast",
      "raw industrial layout",
    ],
  },
  // Xerox zine — punk photocopy
  xeroxzine: {
    reinforcement: [
      "photocopied zine page",
      "harsh xerox contrast",
      "crushed blacks blown whites",
      "DIY punk collage",
    ],
  },
};

// ── Public API used by the compiler ─────────────────────────────────────

export interface SdxlPromptParts {
  reinforcement: string[];
  composition: string[];
  negative: string[];
  category: StyleCategory;
}

/** Resolve final SDXL parts for a given style key, merging category + override. */
export function getSdxlParts(styleKey: string): SdxlPromptParts {
  const category = categoryFor(styleKey);
  const base = SDXL_CATEGORY_PROFILES[category];
  const override = STYLE_SDXL_OVERRIDES[styleKey];

  if (!override) {
    return { ...base, category };
  }

  if (override.replaceCategory) {
    return {
      reinforcement: override.reinforcement ?? base.reinforcement,
      composition: override.composition ?? base.composition,
      negative: override.negative ?? base.negative,
      category,
    };
  }

  return {
    reinforcement: [...base.reinforcement, ...(override.reinforcement ?? [])],
    composition: [...base.composition, ...(override.composition ?? [])],
    negative: [...base.negative, ...(override.negative ?? [])],
    category,
  };
}
