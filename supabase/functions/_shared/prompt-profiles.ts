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

export type ResolvedProviderId = "gemini" | "sdxl" | "openai";

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

// ── OpenAI (gpt-image-1) profile ────────────────────────────────────────
//
// gpt-image-1 follows natural-language instructions well (closer to Gemini
// than to SDXL) but has a noticeable bias toward photographic / 3D-rendered
// output for poster, screen-print and minimal styles. It also tends to
// invent typography unless told not to.
//
// We do NOT replace the canonical compiled prompt — we APPEND a short,
// category-aware "PROVIDER GUIDANCE" tail block. This keeps `STYLE_RULES`
// as the single source of truth across providers.

interface OpenAIProfile {
  /** Short positive reinforcement clauses appended after the canonical prompt. */
  guidance: string[];
  /** Short prohibitions appended after guidance. Phrased in natural language. */
  avoid: string[];
}

export const OPENAI_CATEGORY_PROFILES: Record<StyleCategory, OpenAIProfile> = {
  poster_flat: {
    guidance: [
      "render this as a flat 2D illustration / printed poster — not a photograph and not a 3D render",
      "keep solid color blocks, hard edges, and bold graphic shapes",
      "preserve a graphic poster composition with clear figure-ground separation",
    ],
    avoid: [
      "photographic realism, depth of field, bokeh, or cinematic camera lighting",
      "3D rendering, octane / blender / unreal look, plastic or waxy surfaces",
      "soft gradients, airbrushing, or smooth digital shading inside color blocks",
      "any text, letters, words, captions, signatures, or watermarks",
    ],
  },
  minimal: {
    guidance: [
      "render this as a minimalist flat illustration — Scandinavian / Swiss poster design",
      "keep abundant negative space, two to four colors, and precise geometric edges",
      "no shading, no gradients, no extra decorative detail",
    ],
    avoid: [
      "photographic realism, depth of field, or cinematic lighting",
      "3D rendering or any rendered-engine look",
      "complex textures, busy backgrounds, or more than four colors",
      "any text, letters, words, captions, or signatures",
    ],
  },
  lineart: {
    guidance: [
      "render this as a pen-and-ink line illustration on a clean white background",
      "use only fine black ink lines, hatching, and stippling — strictly monochrome",
      "no color fills anywhere, no gray fills, no painted shading",
    ],
    avoid: [
      "color of any kind, watercolor washes, or painted fills",
      "photographic realism, 3D rendering, cartoon or anime styling",
      "smooth gradient shading or airbrushing",
      "any text, letters, watermarks, or signatures",
    ],
  },
  painterly: {
    guidance: [
      "render this as a traditional-media painted illustration with visible brushwork and pigment texture",
      "preserve atmospheric depth and natural color blending",
    ],
    avoid: [
      "photographic realism, photo, or 3D / CGI rendered look",
      "flat vector graphics or sterile digital smoothness",
      "any text, letters, watermarks, or signatures",
    ],
  },
  photographic_mono: {
    guidance: [
      "render this as a high-contrast black-and-white documentary photograph with analog film grain",
      "keep deep blacks, bright highlights, and a raw gritty aesthetic",
    ],
    avoid: [
      "any color, sepia tinting, or color cast",
      "vector illustration, cartoon, anime, or 3D rendering",
      "soft dreamy focus or smooth digital look",
      "any text, letters, watermarks, or signatures",
    ],
  },
  lo_fi_print: {
    guidance: [
      "render this as a screen-printed / risograph poster — visible halftone dots, ink bleed, and slight registration misalignment",
      "use a limited spot-color palette and bold simplified forms — keep it 2D and printed-looking",
    ],
    avoid: [
      "photographic realism, depth of field, or cinematic camera lighting",
      "3D rendering or high-fidelity digital smoothness",
      "smooth digital gradients or airbrushing inside color areas",
      "any text, letters, words, or watermarks",
    ],
  },
  comic_print: {
    guidance: [
      "render this as a vintage printed comic book panel — thick black ink outlines, halftone dot shading, and flat CMYK colors",
      "keep a 2D printed-comic look, not a smooth digital recolor",
    ],
    avoid: [
      "photographic realism, depth of field, or cinematic lighting",
      "3D rendering or modern smooth digital coloring",
      "manga / anime styling",
      "any speech bubbles, text, letters, sound effects, or watermarks",
    ],
  },
  tattoo_flash: {
    guidance: [
      "render this as a traditional American tattoo flash illustration — very thick black outlines and flat solid color fills",
      "keep the iconic centered flash-sheet composition",
    ],
    avoid: [
      "photographic realism or any rendered-engine look",
      "soft gradient shading inside shapes or watercolor tattoo styling",
      "any banner text, lettering, or watermarks",
    ],
  },
  default: {
    guidance: [
      "render this as a high-quality illustration with a clear focal subject and strong composition",
    ],
    avoid: [
      "low-quality output, blur, jpeg artifacts",
      "any text, letters, words, captions, watermarks, or signatures",
    ],
  },
};

/** Per-style fine-grained OpenAI overrides — same merge semantics as SDXL. */
export const STYLE_OPENAI_OVERRIDES: Record<string, StyleProviderOverride> = {
  // Ukiyo-e: lock to woodblock, not "anime" or "watercolor".
  japanese: {
    reinforcement: [
      "render as a traditional ukiyo-e woodblock print — flat color blocks, sumi ink outlines, visible wood grain",
    ],
    negative: [
      "anime, manga, modern digital illustration, or photographic realism",
    ],
  },
  freestyle: {
    reinforcement: [
      "render as a ukiyo-e woodblock print applied to this subject — flat color blocks and sumi ink outlines",
    ],
  },
  // Pop art: emphasize Ben-Day dots since gpt-image-1 sometimes smooths them
  popart: {
    reinforcement: [
      "explicitly include Ben-Day dot patterns in shadows and backgrounds — visible printed dots, not gradients",
    ],
  },
  "popart-freestyle": {
    reinforcement: [
      "explicitly include Ben-Day dot patterns and thick black outlines — comic / pop print look",
    ],
  },
  // Minimalism: harder anchor against decoration
  minimalism: {
    reinforcement: [
      "lock to Scandinavian poster minimalism — at most three colors, abstract simplification of forms",
    ],
  },
  "lineart-minimal": {
    reinforcement: [
      "single continuous black line on white, Picasso-style — absolute minimum strokes",
    ],
    negative: ["hatching, cross-hatching, shading, multiple line weights"],
  },
};

export interface OpenAIPromptParts {
  guidance: string[];
  avoid: string[];
  category: StyleCategory;
}

/** Resolve final OpenAI parts for a given style key (category + overrides). */
export function getOpenAIParts(styleKey: string): OpenAIPromptParts {
  const category = categoryFor(styleKey);
  const base = OPENAI_CATEGORY_PROFILES[category];
  const override = STYLE_OPENAI_OVERRIDES[styleKey];

  if (!override) {
    return { guidance: base.guidance, avoid: base.avoid, category };
  }
  if (override.replaceCategory) {
    return {
      guidance: override.reinforcement ?? base.guidance,
      avoid: override.negative ?? base.avoid,
      category,
    };
  }
  return {
    guidance: [...base.guidance, ...(override.reinforcement ?? [])],
    avoid: [...base.avoid, ...(override.negative ?? [])],
    category,
  };
}
