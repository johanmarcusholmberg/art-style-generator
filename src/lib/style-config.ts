/** Style configuration for different art style generators */
import type { StyleRules } from "./prompt-rules";
import { STYLE_RULES } from "./prompt-rules";

export interface StyleConfig {
  /** Unique style key used for storage/caching prefixes */
  styleKey: string;
  /** Edge function name for the "themed" mode */
  themedEdgeFn: string;
  /** Edge function name for the "freestyle" mode */
  freestyleEdgeFn: string;
  /** Optional third edge function */
  tertiaryEdgeFn?: string;
  /** Label for the themed tab */
  themedTabLabel: string;
  /** Label for the freestyle tab */
  freestyleTabLabel: string;
  /** Optional third tab label */
  tertiaryTabLabel?: string;
  /** Button label for generation in themed mode */
  themedGenerateLabel: string;
  /** Button label for generation in freestyle mode */
  freestyleGenerateLabel: string;
  /** Optional third generate label */
  tertiaryGenerateLabel?: string;
  /** Placeholder for themed prompt textarea */
  themedPlaceholder: string;
  /** Placeholder for freestyle prompt textarea */
  freestylePlaceholder: string;
  /** Optional third placeholder */
  tertiaryPlaceholder?: string;
  /** Suggested prompts */
  prompts: {
    themed: { generate: string[]; edit: string[] };
    freestyle: { generate: string[]; edit: string[] };
    tertiary?: { generate: string[]; edit: string[] };
  };
  /** Mode value stored in the themed tab */
  themedModeValue: string;
  /** Mode value stored in the freestyle tab */
  freestyleModeValue: string;
  /** Optional third mode value */
  tertiaryModeValue?: string;
  /** Gallery badge emoji for themed mode */
  themedBadge: string;
  /** Gallery badge emoji for freestyle mode */
  freestyleBadge: string;
  /** Optional third badge */
  tertiaryBadge?: string;
  /** Download filename prefix */
  downloadPrefix: string;
  /** Structured prompt rules for themed mode */
  themedRules: StyleRules;
  /** Structured prompt rules for freestyle mode */
  freestyleRules: StyleRules;
  /** Optional third rules */
  tertiaryRules?: StyleRules;
}

export const UKIYOE_STYLE: StyleConfig = {
  styleKey: "ukiyoe",
  themedEdgeFn: "generate-image",
  freestyleEdgeFn: "generate-image-freestyle",
  themedTabLabel: "🏯 Japanese Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate 浮世絵",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A great wave crashing against coastal cliffs at golden hour with dramatic spray'",
  freestylePlaceholder: "Describe any scene… e.g. 'Manhattan skyline at dusk with neon reflections on wet pavement'",
  prompts: {
    themed: {
      generate: [
        "A great wave crashing against Mount Fuji at sunset with fishermen in wooden boats bracing against the surge",
        "Koi fish swimming through crystal-clear water beneath a stone bridge covered in wisteria blossoms",
        "A lone crane standing in morning mist over a bamboo grove with distant snow-capped peaks",
      ],
      edit: [
        "Change the sky to a dramatic sunset with vermilion and gold clouds",
        "Add more vibrant indigo and sumi ink contrast throughout",
        "Add cherry blossom petals falling gently across the entire scene",
      ],
    },
    freestyle: {
      generate: [
        "Central Park in autumn with golden maple trees reflected in a still lake and joggers on winding paths",
        "The Eiffel Tower silhouette at golden hour with long shadows stretching across the Champ de Mars",
        "A cozy Italian café terrace on a rainy cobblestone street with warm light spilling from the windows",
      ],
      edit: [
        "Change the background to a dramatic sunset sky with warm tones",
        "Increase the color saturation and deepen the sumi ink outlines",
        "Add rain and reflections on wet ground surfaces",
      ],
    },
  },
  themedModeValue: "japanese",
  freestyleModeValue: "freestyle",
  themedBadge: "🏯",
  freestyleBadge: "🎨",
  downloadPrefix: "ukiyoe",
  themedRules: STYLE_RULES["japanese"],
  freestyleRules: STYLE_RULES["freestyle"],
};

export const POPART_STYLE: StyleConfig = {
  styleKey: "popart",
  themedEdgeFn: "generate-image-popart",
  freestyleEdgeFn: "generate-image-popart-freestyle",
  themedTabLabel: "🎯 Pop Art Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Pop Art",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A woman with oversized sunglasses and bold red lips against a halftone background'",
  freestylePlaceholder: "Describe any scene… e.g. 'A vintage diner counter with chrome stools and a neon sign'",
  prompts: {
    themed: {
      generate: [
        "A woman with oversized cat-eye sunglasses and bold red lips against a cyan and magenta halftone background",
        "A classic cherry-red Cadillac convertible cruising Route 66 under a sky made of Ben-Day dots",
        "A row of Campbell's soup cans with vibrant pop color variations and screen-print texture",
      ],
      edit: [
        "Change the background to bright yellow with larger Ben-Day dots",
        "Add a bold halftone dot pattern to the sky and shadows",
        "Increase the color saturation and thicken all outlines",
      ],
    },
    freestyle: {
      generate: [
        "The Statue of Liberty against a neon-split sky of hot pink and electric blue with bold black outlines",
        "A chrome and neon retro diner interior with checkered floor and a jukebox in pop art style",
        "A city skyline at night reduced to bold graphic shapes with flat saturated colors",
      ],
      edit: [
        "Change the background to bright yellow with graphic pop elements",
        "Add stronger contrast, bolder outlines, and more Ben-Day dots",
        "Transform the entire scene to look like a comic book panel with thick borders",
      ],
    },
  },
  themedModeValue: "popart",
  freestyleModeValue: "popart-freestyle",
  themedBadge: "🎯",
  freestyleBadge: "🎨",
  downloadPrefix: "popart",
  themedRules: STYLE_RULES["popart"],
  freestyleRules: STYLE_RULES["popart-freestyle"],
};

export const LINEART_STYLE: StyleConfig = {
  styleKey: "lineart",
  themedEdgeFn: "generate-image-lineart",
  freestyleEdgeFn: "generate-image-lineart-freestyle",
  themedTabLabel: "✒️ Ink Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Line Art",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A lighthouse on a rocky cliff with crashing waves and seabirds'",
  freestylePlaceholder: "Describe any scene… e.g. 'A vintage bicycle leaning against a stone wall with ivy'",
  prompts: {
    themed: {
      generate: [
        "A weathered lighthouse on a craggy cliff overlooking turbulent seas with spray and circling gulls",
        "A detailed botanical study of wild roses with thorny stems, unfurling petals, and delicate fern fronds",
        "A Gothic cathedral facade with flying buttresses, rose window tracery, and gargoyle details",
      ],
      edit: [
        "Add more dense cross-hatching to the deepest shadow areas",
        "Make all lines finer and more delicate with varying weight",
        "Add a flock of birds in detailed flight formation in the background sky",
      ],
    },
    freestyle: {
      generate: [
        "A vintage bicycle with a wicker basket leaning against a crumbling stone wall draped in ivy",
        "A cozy log cabin nestled in pine woods with chimney smoke curling into a starry sky",
        "A bustling Moroccan market alley with hanging lanterns, spice stalls, and woven awnings",
      ],
      edit: [
        "Add significantly more architectural detail to the foreground structures",
        "Thicken all primary outlines and add stippling to shadow areas",
        "Add an ornate decorative vine and leaf border frame around the entire illustration",
      ],
    },
    tertiary: {
      generate: [
        "A woman's face captured in a single elegant continuous line with closed eyes and flowing hair",
        "A cat curled up sleeping rendered with the absolute fewest lines possible — pure contour",
        "A mountain landscape with lake reflection using only 5-6 confident brush strokes",
      ],
      edit: [
        "Simplify dramatically — remove all non-essential lines",
        "Convert to a true single continuous line drawing without lifting the pen",
        "Remove all shading and detail — keep only the purest outline contour",
      ],
    },
  },
  themedModeValue: "lineart",
  freestyleModeValue: "lineart-freestyle",
  tertiaryModeValue: "lineart-minimal",
  tertiaryEdgeFn: "generate-image-lineart-minimal",
  tertiaryTabLabel: "〰️ Minimal Lines",
  tertiaryGenerateLabel: "Generate Minimal Line Art",
  tertiaryPlaceholder: "Describe your scene… e.g. 'A dancer mid-leap captured in one flowing line'",
  themedBadge: "✒️",
  freestyleBadge: "🎨",
  tertiaryBadge: "〰️",
  downloadPrefix: "lineart",
  themedRules: STYLE_RULES["lineart"],
  freestyleRules: STYLE_RULES["lineart-freestyle"],
  tertiaryRules: STYLE_RULES["lineart-minimal"],
};

export const MINIMALISM_STYLE: StyleConfig = {
  styleKey: "minimalism",
  themedEdgeFn: "generate-image-minimalism",
  freestyleEdgeFn: "generate-image-minimalism-freestyle",
  themedTabLabel: "◻ Minimal Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Minimal Art",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A solitary tree on a vast snow plain at dawn with long blue shadows'",
  freestylePlaceholder: "Describe any scene… e.g. 'A steaming coffee cup casting a long geometric shadow on a marble surface'",
  prompts: {
    themed: {
      generate: [
        "A solitary bare tree on a vast snowy plain at dawn with long blue shadows stretching toward the horizon",
        "Abstract geometric shapes — circles, triangles, rectangles — floating in soft pastel negative space",
        "A single sailboat on a perfectly calm lake with distant mountains reduced to simple silhouettes",
      ],
      edit: [
        "Reduce the entire color palette to just two complementary tones",
        "Add significantly more negative space around the subject — let it breathe",
        "Make all shapes more geometric and abstractly simplified",
      ],
    },
    freestyle: {
      generate: [
        "A steaming coffee cup casting a dramatic long shadow on a clean marble surface in morning light",
        "A city skyline reduced to simple geometric blocks and rectangles in a muted twilight palette",
        "A cat sitting in a perfect beam of sunlight by a tall window with clean minimal surroundings",
      ],
      edit: [
        "Simplify the composition further — remove any non-essential elements",
        "Change the palette to warm earth tones: terracotta, sand, and cream",
        "Make it more abstract with fewer details and sharper geometric edges",
      ],
    },
  },
  themedModeValue: "minimalism",
  freestyleModeValue: "minimalism-freestyle",
  themedBadge: "◻",
  freestyleBadge: "🎨",
  downloadPrefix: "minimalism",
  themedRules: STYLE_RULES["minimalism"],
  freestyleRules: STYLE_RULES["minimalism-freestyle"],
};

export const GRAFFITI_STYLE: StyleConfig = {
  styleKey: "graffiti",
  themedEdgeFn: "generate-image-graffiti",
  freestyleEdgeFn: "generate-image-graffiti-freestyle",
  themedTabLabel: "🎨 Street Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Graffiti",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A roaring lion with a spray-painted mane dripping neon colors on a brick wall'",
  freestylePlaceholder: "Describe any scene… e.g. 'A vintage muscle car parked in a graffiti-covered alley at night'",
  prompts: {
    themed: {
      generate: [
        "A roaring lion with a spray-painted mane of dripping neon colors on a weathered brick wall",
        "A vintage boombox with music notes and sound waves exploding outward in spray paint style",
        "A woman's face in profile with wildflowers growing from her hair rendered in stencil art layers",
      ],
      edit: [
        "Add more dripping paint effects and spray splatters throughout",
        "Make all colors more neon and fluorescent with stronger contrast",
        "Add a Banksy-style stencil element in the corner with urban grit",
      ],
    },
    freestyle: {
      generate: [
        "A city skyline at night with neon reflections on wet asphalt and spray-painted clouds",
        "A vintage muscle car parked in a graffiti-covered alley with dripping tags and wheat-paste posters",
        "An astronaut floating above a colorful urban landscape with stencil planets and spray-paint stars",
      ],
      edit: [
        "Add spray paint splatters and drip marks around all edges of the composition",
        "Transform the background to look like a weathered concrete wall with cracks and texture",
        "Add bold graphic outlines, drip effects, and layered urban street art tags",
      ],
    },
  },
  themedModeValue: "graffiti",
  freestyleModeValue: "graffiti-freestyle",
  themedBadge: "🎨",
  freestyleBadge: "🎨",
  downloadPrefix: "graffiti",
  themedRules: STYLE_RULES["graffiti"],
  freestyleRules: STYLE_RULES["graffiti-freestyle"],
};

export const BOTANICAL_STYLE: StyleConfig = {
  styleKey: "botanical",
  themedEdgeFn: "generate-image-botanical",
  freestyleEdgeFn: "generate-image-botanical-freestyle",
  themedTabLabel: "🌿 Botanical",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Botanical Art",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your plant… e.g. 'A blooming peony with detailed leaves, buds, and visible petal veins'",
  freestylePlaceholder: "Describe any scene… e.g. 'A cluster of wild chanterelle mushrooms on a mossy forest log'",
  prompts: {
    themed: {
      generate: [
        "A fully blooming peony with layered petals, detailed serrated leaves, and unopened buds on a single stem",
        "A branch of weeping cherry blossoms with translucent petals, dark bark texture, and tiny stamens visible",
        "A collection of forest floor specimens: fiddlehead ferns, club mosses, and shelf fungi arranged as a study",
      ],
      edit: [
        "Add more intricate detail to all leaf veins and petal textures",
        "Make the watercolor washes more transparent and delicately layered",
        "Add a cross-section botanical detail view of the main flower",
      ],
    },
    freestyle: {
      generate: [
        "A cluster of golden chanterelle mushrooms growing on a mossy fallen log with tiny ferns nearby",
        "A rare tropical orchid with spotted petals, aerial roots, and a detailed anatomical side view",
        "An arrangement of pressed autumn leaves — maple, oak, birch — in rich warm colors with visible veining",
      ],
      edit: [
        "Add realistic dewdrops catching light on the petals and leaves",
        "Warm the background to a richer cream aged-paper tone",
        "Add a small detailed insect — a honeybee or ladybug — visiting the main flower",
      ],
    },
  },
  themedModeValue: "botanical",
  freestyleModeValue: "botanical-freestyle",
  themedBadge: "🌿",
  freestyleBadge: "🎨",
  downloadPrefix: "botanical",
  themedRules: STYLE_RULES["botanical"],
  freestyleRules: STYLE_RULES["botanical-freestyle"],
};
