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

export const URBANNOIR_STYLE: StyleConfig = {
  styleKey: "urbannoir",
  themedEdgeFn: "generate-image-urbannoir",
  freestyleEdgeFn: "generate-image-urbannoir-freestyle",
  themedTabLabel: "🖤 Urban Noir",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Urban Noir",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A stray cat under a flickering streetlight in a rain-soaked alley'",
  freestylePlaceholder: "Describe any scene… e.g. 'A lone figure walking through fog on an empty highway at night'",
  prompts: {
    themed: {
      generate: [
        "A stray cat perched on a fire escape above a rain-soaked alley with harsh shadows and gritty textures",
        "A street corner at 3am with a flickering neon sign reflected in wet pavement and deep urban shadows",
        "An old boombox on a concrete stoop in a gritty neighborhood with dramatic flash photography lighting",
      ],
      edit: [
        "Increase the film grain and push the contrast harder",
        "Add rain and wet reflections on all surfaces",
        "Make the shadows deeper and more dramatic",
      ],
    },
    freestyle: {
      generate: [
        "A wolf howling on a rooftop silhouetted against a full moon in raw monochrome",
        "A vintage motorcycle parked in a dark garage with a single harsh light source",
        "A woman's portrait with dramatic side lighting and heavy film grain texture",
      ],
      edit: [
        "Add more grain and noise throughout the image",
        "Push the contrast to be more extreme — crush the blacks",
        "Add harsh directional flash lighting",
      ],
    },
  },
  themedModeValue: "urbannoir",
  freestyleModeValue: "urbannoir-freestyle",
  themedBadge: "🖤",
  freestyleBadge: "🎨",
  downloadPrefix: "urbannoir",
  themedRules: STYLE_RULES["urbannoir"],
  freestyleRules: STYLE_RULES["urbannoir-freestyle"],
};

export const SCREENPRINT_STYLE: StyleConfig = {
  styleKey: "screenprint",
  themedEdgeFn: "generate-image-screenprint",
  freestyleEdgeFn: "generate-image-screenprint-freestyle",
  themedTabLabel: "🖨️ Screen Print",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Screen Print",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A roaring bear with layered ink halftone texture on vintage paper'",
  freestylePlaceholder: "Describe any scene… e.g. 'A mountain landscape with limited colors and worn print texture'",
  prompts: {
    themed: {
      generate: [
        "A roaring bear with bold graphic shapes and layered halftone ink texture on aged paper",
        "A vintage surfboard leaning against a VW van with retro screen print color separation",
        "A soaring eagle with spread wings rendered in bold limited-color screen print layers",
      ],
      edit: [
        "Add more visible halftone dot texture throughout",
        "Make the ink bleed and registration misalignment more visible",
        "Reduce to fewer colors with stronger print texture",
      ],
    },
    freestyle: {
      generate: [
        "A city skyline at sunset with bold graphic shapes and vintage screen print ink layers",
        "A portrait in profile with halftone shading and limited retro color palette",
        "A classic hot rod with flames rendered in bold screen print poster style",
      ],
      edit: [
        "Add worn print texture and slight ink imperfections",
        "Push the halftone dots to be larger and more visible",
        "Make it look more like a vintage concert poster",
      ],
    },
  },
  themedModeValue: "screenprint",
  freestyleModeValue: "screenprint-freestyle",
  themedBadge: "🖨️",
  freestyleBadge: "🎨",
  downloadPrefix: "screenprint",
  themedRules: STYLE_RULES["screenprint"],
  freestyleRules: STYLE_RULES["screenprint-freestyle"],
};

export const RISOGRAPH_STYLE: StyleConfig = {
  styleKey: "risograph",
  themedEdgeFn: "generate-image-risograph",
  freestyleEdgeFn: "generate-image-risograph-freestyle",
  themedTabLabel: "📠 Risograph",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Risograph",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A fox sitting in a forest clearing with layered riso ink colors'",
  freestylePlaceholder: "Describe any scene… e.g. 'A coffee cup on a table with morning light in riso print style'",
  prompts: {
    themed: {
      generate: [
        "A fox sitting in a forest clearing with layered spot-color riso inks and slight misregistration",
        "An indoor plant collection on a windowsill with grainy riso texture and warm paper base",
        "A sleeping cat curled up on a cushion rendered in bold simplified riso print forms",
      ],
      edit: [
        "Increase the misregistration between color layers",
        "Add more visible grain from the ink drum texture",
        "Simplify the forms further and reduce to fewer colors",
      ],
    },
    freestyle: {
      generate: [
        "A bicycle leaning against a wall with afternoon shadows in layered riso spot colors",
        "A portrait with bold simplified features in fluorescent riso ink tones on warm paper",
        "A still life of fruit on a table with overlapping riso color layers creating mixed tones",
      ],
      edit: [
        "Make the riso grain more prominent throughout",
        "Add more color overlap areas where inks mix",
        "Push the misregistration for a more authentic riso feel",
      ],
    },
  },
  themedModeValue: "risograph",
  freestyleModeValue: "risograph-freestyle",
  themedBadge: "📠",
  freestyleBadge: "🎨",
  downloadPrefix: "risograph",
  themedRules: STYLE_RULES["risograph"],
  freestyleRules: STYLE_RULES["risograph-freestyle"],
};

export const RETROCOMIC_STYLE: StyleConfig = {
  styleKey: "retrocomic",
  themedEdgeFn: "generate-image-retrocomic",
  freestyleEdgeFn: "generate-image-retrocomic-freestyle",
  themedTabLabel: "💥 Comic Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Retro Comic",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A superhero landing on a rooftop with the city below in dramatic perspective'",
  freestylePlaceholder: "Describe any scene… e.g. 'A detective in a trench coat walking through rain-soaked streets'",
  prompts: {
    themed: {
      generate: [
        "A masked hero standing on a rooftop with cape billowing against a halftone-dotted sky",
        "A dramatic car chase through city streets with speed lines and vintage comic color treatment",
        "A femme fatale in a noir setting with dramatic shadows and bold ink outlines",
      ],
      edit: [
        "Add larger halftone dots to all shaded areas",
        "Make the outlines bolder and more dramatic",
        "Age the colors to look more like a vintage comic page",
      ],
    },
    freestyle: {
      generate: [
        "A rocket ship blasting through space with halftone star trails and bold comic outlines",
        "A giant octopus attacking a ship in dramatic pulp comic style with vintage page colors",
        "A samurai in battle stance with speed lines and retro comic halftone shading",
      ],
      edit: [
        "Add more dramatic speed lines and action energy",
        "Push the vintage color treatment — more yellowed page feel",
        "Thicken all outlines to classic comic book weight",
      ],
    },
  },
  themedModeValue: "retrocomic",
  freestyleModeValue: "retrocomic-freestyle",
  themedBadge: "💥",
  freestyleBadge: "🎨",
  downloadPrefix: "retrocomic",
  themedRules: STYLE_RULES["retrocomic"],
  freestyleRules: STYLE_RULES["retrocomic-freestyle"],
};

export const PULPMAGAZINE_STYLE: StyleConfig = {
  styleKey: "pulpmagazine",
  themedEdgeFn: "generate-image-pulpmagazine",
  freestyleEdgeFn: "generate-image-pulpmagazine-freestyle",
  themedTabLabel: "📕 Pulp Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Pulp Art",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'An adventurer facing a giant serpent in a lost jungle temple'",
  freestylePlaceholder: "Describe any scene… e.g. 'A woman in a red dress on a moonlit balcony with dramatic shadows'",
  prompts: {
    themed: {
      generate: [
        "An adventurer with a torch facing a giant serpent in a vine-covered jungle temple",
        "A detective in a fedora aiming a revolver in a smoky noir office with dramatic lighting",
        "A rocket pilot in a retro spacesuit standing before a massive alien landscape",
      ],
      edit: [
        "Make the lighting more dramatic with deeper shadows",
        "Add a more vintage painted illustration feel",
        "Increase the color saturation and drama",
      ],
    },
    freestyle: {
      generate: [
        "A pirate ship in a stormy sea with dramatic waves and cinematic painted lighting",
        "A woman scientist in a retro lab with glowing experiments and dramatic shadows",
        "A lone cowboy on horseback silhouetted against a painted desert sunset",
      ],
      edit: [
        "Push the chiaroscuro lighting for more drama",
        "Add more visible brushwork and paint texture",
        "Make it feel more like a vintage magazine cover",
      ],
    },
  },
  themedModeValue: "pulpmagazine",
  freestyleModeValue: "pulpmagazine-freestyle",
  themedBadge: "📕",
  freestyleBadge: "🎨",
  downloadPrefix: "pulpmagazine",
  themedRules: STYLE_RULES["pulpmagazine"],
  freestyleRules: STYLE_RULES["pulpmagazine-freestyle"],
};

export const TATTOOFLASH_STYLE: StyleConfig = {
  styleKey: "tattooflash",
  themedEdgeFn: "generate-image-tattooflash",
  freestyleEdgeFn: "generate-image-tattooflash-freestyle",
  themedTabLabel: "🔥 Flash Designs",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Tattoo Flash",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your design… e.g. 'A traditional eagle with spread wings clutching a banner'",
  freestylePlaceholder: "Describe any design… e.g. 'A lighthouse in a storm with bold outlines and flat colors'",
  prompts: {
    themed: {
      generate: [
        "A traditional eagle with spread wings and bold black outlines in classic flash sheet style",
        "A dagger through a rose with a coiled snake in bold traditional tattoo design",
        "A sailing ship on stormy waves in vintage American traditional tattoo flash style",
      ],
      edit: [
        "Make the outlines bolder and more consistent",
        "Simplify to flatter color fills with no gradients",
        "Add more traditional tattoo design symmetry",
      ],
    },
    freestyle: {
      generate: [
        "A wolf head with geometric framing in bold traditional tattoo flash style",
        "A lighthouse in a storm with crashing waves in classic flash sheet design",
        "A hummingbird with flowers in traditional bold-outline tattoo art style",
      ],
      edit: [
        "Push to a more traditional tattoo color palette",
        "Make all outlines thicker and bolder",
        "Flatten all shading to solid color fills",
      ],
    },
  },
  themedModeValue: "tattooflash",
  freestyleModeValue: "tattooflash-freestyle",
  themedBadge: "🔥",
  freestyleBadge: "🎨",
  downloadPrefix: "tattooflash",
  themedRules: STYLE_RULES["tattooflash"],
  freestyleRules: STYLE_RULES["tattooflash-freestyle"],
};

export const BRUTALISTPOSTER_STYLE: StyleConfig = {
  styleKey: "brutalistposter",
  themedEdgeFn: "generate-image-brutalistposter",
  freestyleEdgeFn: "generate-image-brutalistposter-freestyle",
  themedTabLabel: "⬛ Brutalist",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Brutalist Poster",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A massive concrete structure with harsh shadows and bold graphic shapes'",
  freestylePlaceholder: "Describe any scene… e.g. 'A figure standing in an empty industrial space with stark contrast'",
  prompts: {
    themed: {
      generate: [
        "A massive concrete building facade with dramatic shadows and heavy bold graphic black shapes",
        "An industrial crane against a stark sky with raw graphic brutalist composition",
        "A subway entrance with harsh lighting and bold geometric brutalist poster treatment",
      ],
      edit: [
        "Push the contrast harder — more stark black and white",
        "Make the shapes heavier and more bold",
        "Remove any subtle details — keep only bold graphic elements",
      ],
    },
    freestyle: {
      generate: [
        "A portrait reduced to stark bold graphic shapes with heavy black masses and raw contrast",
        "An animal rendered as a bold brutalist graphic with minimal detail and maximum impact",
        "A landscape reduced to heavy geometric shapes with stark industrial poster energy",
      ],
      edit: [
        "Strip away detail — make it more raw and graphic",
        "Push to higher contrast with heavier black shapes",
        "Make it feel more like a stark brutalist poster",
      ],
    },
  },
  themedModeValue: "brutalistposter",
  freestyleModeValue: "brutalistposter-freestyle",
  themedBadge: "⬛",
  freestyleBadge: "🎨",
  downloadPrefix: "brutalistposter",
  themedRules: STYLE_RULES["brutalistposter"],
  freestyleRules: STYLE_RULES["brutalistposter-freestyle"],
};

export const XEROXZINE_STYLE: StyleConfig = {
  styleKey: "xeroxzine",
  themedEdgeFn: "generate-image-xeroxzine",
  freestyleEdgeFn: "generate-image-xeroxzine-freestyle",
  themedTabLabel: "📋 Zine Pages",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Xerox Zine",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A punk band playing in a basement with harsh photocopy contrast'",
  freestylePlaceholder: "Describe any scene… e.g. 'A cat sleeping on a stack of books in rough photocopy style'",
  prompts: {
    themed: {
      generate: [
        "A punk band playing in a dark basement with harsh photocopy contrast and copier grain artifacts",
        "A protest march scene with collage-style layered figures and rough xerox texture",
        "A skateboard trick captured in harsh black and white with photocopy noise and grain",
      ],
      edit: [
        "Crush the blacks harder — more photocopy contrast",
        "Add more copier noise and grain artifacts",
        "Make it look more like a rough DIY zine page",
      ],
    },
    freestyle: {
      generate: [
        "A cat sleeping on books rendered in harsh photocopy black and white with copier grain",
        "A flower arrangement in rough xerox contrast with collage-style layering",
        "A cityscape at night crushed to harsh black and white photocopy texture",
      ],
      edit: [
        "Add more photocopy artifacts and noise",
        "Push the contrast to pure black and white — lose the mid-tones",
        "Add collage cut-and-paste energy to the composition",
      ],
    },
  },
  themedModeValue: "xeroxzine",
  freestyleModeValue: "xeroxzine-freestyle",
  themedBadge: "📋",
  freestyleBadge: "🎨",
  downloadPrefix: "xeroxzine",
  themedRules: STYLE_RULES["xeroxzine"],
  freestyleRules: STYLE_RULES["xeroxzine-freestyle"],
};

export const SCANDINAVIANPOSTER_STYLE: StyleConfig = {
  styleKey: "scandinavian_poster",
  themedEdgeFn: "generate-image-scandinavianposter",
  freestyleEdgeFn: "generate-image-scandinavianposter-freestyle",
  themedTabLabel: "🇸🇪 Nordic Poster",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Scandinavian Poster",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A lone pine tree against a calm Nordic lake at dawn'",
  freestylePlaceholder: "Describe any scene… e.g. 'A coffee cup on a wooden table beside a window'",
  prompts: {
    themed: {
      generate: [
        "A lone pine tree silhouetted against a calm Nordic lake at dawn with muted dusty blue tones",
        "A small wooden cabin in a snowy field with sage green pines and warm beige sky",
        "Three sailing boats arranged in negative space on a soft terracotta horizon",
      ],
      edit: [
        "Reduce the palette to three muted Nordic tones",
        "Add more negative space around the subject",
        "Simplify the forms into cleaner geometric shapes",
      ],
    },
    freestyle: {
      generate: [
        "A modern pour-over coffee setup arranged minimally on a warm beige background",
        "A single bicycle leaning against a soft sage green wall with generous empty space",
        "An abstract Nordic landscape of dusty blue hills with a small terracotta sun",
      ],
      edit: [
        "Make it flatter and more poster-like",
        "Reduce to a muted three-color Nordic palette",
        "Add more breathing room and remove background clutter",
      ],
    },
  },
  themedModeValue: "scandinavian_poster",
  freestyleModeValue: "scandinavian_poster-freestyle",
  themedBadge: "🇸🇪",
  freestyleBadge: "🎨",
  downloadPrefix: "scandinavian-poster",
  themedRules: STYLE_RULES["scandinavian_poster"],
  freestyleRules: STYLE_RULES["scandinavian_poster-freestyle"],
};

export const VINTAGE_STYLE: StyleConfig = {
  styleKey: "vintage",
  themedEdgeFn: "generate-image-vintage",
  freestyleEdgeFn: "generate-image-vintage-freestyle",
  themedTabLabel: "🍷 Café & Food",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Vintage Poster",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your hero subject… e.g. 'A steaming cappuccino in a porcelain cup with gingham background'",
  freestylePlaceholder: "Describe any subject… e.g. 'A bouquet of wildflowers on a vintage tile background'",
  prompts: {
    themed: {
      generate: [
        "A glass of red wine on a soft sage scallop pattern background with a cream poster border",
        "A steaming cappuccino in a porcelain cup centered on a warm gingham terracotta pattern",
        "A rustic loaf of sourdough bread on a dusty blue floral textile background, painterly café poster",
      ],
      edit: [
        "Make the brushstrokes more visible and the palette more muted",
        "Soften the background pattern so the subject stands out more",
        "Warm up the cream paper border and add a touch more painterly texture",
      ],
    },
    freestyle: {
      generate: [
        "A small terracotta espresso cup on a soft butter-yellow tile background with hand-painted brushstrokes",
        "A bowl of fresh lemons on a dusty blue floral pattern with a cream off-white poster border",
        "A vase of garden roses on a sage scallop background, painted in gouache with visible brushwork",
      ],
      edit: [
        "Push the palette to be softer and more muted",
        "Make the painterly brush texture more visible",
        "Add a thicker cream off-white poster border around the composition",
      ],
    },
  },
  themedModeValue: "vintage",
  freestyleModeValue: "vintage-freestyle",
  themedBadge: "🍷",
  freestyleBadge: "🎨",
  downloadPrefix: "vintage",
  themedRules: STYLE_RULES["vintage"],
  freestyleRules: STYLE_RULES["vintage-freestyle"],
};

export const WHIMSICALJAPANESE_STYLE: StyleConfig = {
  styleKey: "whimsical_japanese",
  themedEdgeFn: "generate-image-whimsicaljapanese",
  freestyleEdgeFn: "generate-image-whimsicaljapanese-freestyle",
  themedTabLabel: "🦊 Whimsical Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Whimsical Poster",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your character… e.g. 'A calm frog in an indigo kimono, waist-up portrait, holding a single steaming bowl of ramen, soft cream background'",
  freestylePlaceholder: "Describe any subject… e.g. 'A single clay teapot, centered iconic object, on a soft sage background'",
  prompts: {
    themed: {
      generate: [
        "A calm frog in an indigo kimono, waist-up portrait, holding a single steaming bowl of ramen with visible noodles, centered on a soft cream background with a thin painted poster border",
        "A quiet fox in a faded persimmon yukata, seated portrait, pouring tea from a small clay kyusu into a single cup, simple sage background",
        "A composed rabbit, waist-up portrait, holding a single bamboo steamer of dumplings, centered on a dusty blue background with a faint folk pattern",
        "A dignified cat in a sage apron, half-body portrait, presenting a single piece of nigiri on a small plate, soft cream background, no other props",
        "A graceful crane, seated portrait, gently holding a small bowl of udon with visible noodles, centered on a faded terracotta background",
        "A calm tanuki, waist-up portrait, holding a single sake cup, centered on a soft mustard background with one small faint moon accent",
      ],
      edit: [
        "Soften the palette toward dustier sage and indigo, less saturated",
        "Add more visible paper grain and gouache brush texture",
        "Simplify the background to a single flat color wash — remove all extra props",
        "Make the character's expression calmer and more neutral — open eyes, no kawaii smile",
        "Reframe as a waist-up portrait with the character and main prop filling about two thirds of the poster",
      ],
    },
    freestyle: {
      generate: [
        "A single clay teapot, iconic centered object, on a soft cream paper background with a thin painted poster border",
        "A composed owl in a small scholar's robe, waist-up portrait, holding a single closed book, centered on dusty blue",
        "A single sprig of cherry blossom, centered iconic object, on a faded sage background, gouache and ink",
        "A calm bear, seated portrait, holding a single ceramic cup of tea, centered on a soft terracotta background",
        "A single round persimmon fruit, iconic centered object, on a warm cream background with subtle paper grain and a thin frame line",
      ],
      edit: [
        "Reduce the palette to three muted vintage tones",
        "Make the ink outlines slightly finer and more hand-drawn",
        "Remove all background props — keep only the centered subject and quiet negative space",
        "Reframe as a centered half-body portrait with a thin painted poster border",
      ],
    },
  },

  themedModeValue: "whimsical_japanese",
  freestyleModeValue: "whimsical_japanese-freestyle",
  themedBadge: "🦊",
  freestyleBadge: "🎨",
  downloadPrefix: "whimsical-japanese",
  themedRules: STYLE_RULES["whimsical_japanese"],
  freestyleRules: STYLE_RULES["whimsical_japanese-freestyle"],
};

export const MODERNISTCOCKTAIL_STYLE: StyleConfig = {
  styleKey: "modernist_cocktail",
  themedEdgeFn: "generate-image-modernistcocktail",
  freestyleEdgeFn: "generate-image-modernistcocktail-freestyle",
  themedTabLabel: "🍸 Cocktail Posters",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Cocktail Poster",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your drink… e.g. 'A Negroni poster' or 'An Aperol Spritz'",
  freestylePlaceholder: "Describe any drink subject… e.g. 'A geometric espresso poster in mid-century palette'",
  prompts: {
    themed: {
      generate: [
        "A Negroni poster",
        "An Aperol Spritz poster",
        "An Espresso Martini poster",
        "A Manhattan cocktail poster",
        "A glass of Rioja red wine",
        "A Japanese whisky poster",
        "An iced matcha poster",
        "A craft beer poster",
      ],
      edit: [
        "Reduce to a stricter three-color modernist palette",
        "Simplify the liquid into flatter geometric color blocks",
        "Increase the negative space around the glass and remove background props",
        "Push the composition more vertical and poster-like",
      ],
    },
    freestyle: {
      generate: [
        "A geometric Negroni in deep orange and navy",
        "An abstract Aperol Spritz with Mediterranean colors",
        "A modernist espresso poster inspired by Italian cafés",
        "A bold graphic whiskey poster with Bauhaus influences",
        "A minimalist wine poster using only burgundy, cream, and black",
        "A modernist gin and tonic poster with olive and teal accents",
      ],
      edit: [
        "Restrict the palette to three flat poster colors",
        "Flatten the glass into geometric planes and abstract highlights",
        "Add a thin painted poster border just inside the artwork edges",
        "Center the drink and increase the surrounding negative space",
      ],
    },
  },
  themedModeValue: "modernist_cocktail",
  freestyleModeValue: "modernist_cocktail-freestyle",
  themedBadge: "🍸",
  freestyleBadge: "🎨",
  downloadPrefix: "modernist-cocktail",
  themedRules: STYLE_RULES["modernist_cocktail"],
  freestyleRules: STYLE_RULES["modernist_cocktail-freestyle"],
};

export const MEDITERRANEAN_HERITAGE_STYLE: StyleConfig = {
  styleKey: "mediterranean_heritage",
  themedEdgeFn: "generate-image-mediterraneanheritage",
  freestyleEdgeFn: "generate-image-mediterraneanheritage-freestyle",
  themedTabLabel: "🚪 Heritage Places",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Mediterranean Photo",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your subject… e.g. 'A weathered green door' or 'A lemon tree beside a stone wall'",
  freestylePlaceholder: "Describe any Mediterranean subject… e.g. 'A fishing boat in a quiet harbor at golden hour'",
  prompts: {
    themed: {
      generate: [
        "A weathered green Mediterranean door",
        "An old blue shuttered window",
        "A stone staircase in a hillside village",
        "A whitewashed village alley with bougainvillea",
        "An olive tree beside a limestone wall",
        "A lemon tree in a Mediterranean garden",
        "A fishing boat in a quiet harbor",
        "A historic stone fountain in a small plaza",
      ],
      edit: [
        "Soften the light to warm golden afternoon and reduce contrast",
        "Push the palette toward sunwashed sage, terracotta and cream",
        "Simplify the background and increase intentional negative space",
        "Add gentle realistic patina and weathered texture to the materials",
      ],
    },
    freestyle: {
      generate: [
        "A traditional Maltese courtyard at golden hour",
        "A coastal cliff in southern Spain bathed in warm light",
        "A Mediterranean café terrace under olive trees",
        "An outdoor market stall in a historic town",
        "A weathered ceramic pot beside an old doorway",
        "Traditional Mediterranean shutters with peeling paint",
      ],
      edit: [
        "Calm the composition — fewer props, more negative space",
        "Warm the light toward soft morning Mediterranean sun",
        "Mute the palette toward authentic sunwashed earth tones",
        "Make the materials feel more aged and authentic — more patina",
      ],
    },
  },
  themedModeValue: "mediterranean_heritage",
  freestyleModeValue: "mediterranean_heritage-freestyle",
  themedBadge: "🚪",
  freestyleBadge: "🎨",
  downloadPrefix: "mediterranean-heritage",
  themedRules: STYLE_RULES["mediterranean_heritage"],
  freestyleRules: STYLE_RULES["mediterranean_heritage-freestyle"],
};

export const ARTNOUVEAU_STYLE: StyleConfig = {
  styleKey: "artnouveau",
  themedEdgeFn: "generate-image-artnouveau",
  freestyleEdgeFn: "generate-image-artnouveau-freestyle",
  themedTabLabel: "🌸 Art Nouveau",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Art Nouveau",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder:
    "Describe your scene… e.g. 'A Valencia orange spritz bottle surrounded by flowing orange blossoms with decorative borders'",
  freestylePlaceholder:
    "Describe any subject… e.g. 'A Mediterranean balcony with bougainvillea in an elegant exhibition poster composition'",
  prompts: {
    themed: {
      generate: [
        "A Valencia orange spritz bottle surrounded by flowing orange blossoms and decorative Art Nouveau borders",
        "A Mediterranean balcony with bougainvillea in an elegant vintage exhibition-poster composition",
        "A botanical cocktail poster with graceful linework, ornate frame, and premium decorative typography",
      ],
      edit: [
        "Add more flowing ornamental linework around the subject",
        "Strengthen the decorative botanical border",
        "Push the palette toward muted sage, cream and gold ochre",
      ],
    },
    freestyle: {
      generate: [
        "A lemon tree framed by an Art Nouveau decorative arch with flowing botanical ornament",
        "A wine bottle surrounded by elegant Mucha-style floral borders and refined linework",
        "A coastal scene wrapped in an ornamental Art Nouveau poster frame",
      ],
      edit: [
        "Add a more elaborate decorative arch around the subject",
        "Increase the ornamental border detail with botanical motifs",
        "Soften the palette toward refined heritage tones",
      ],
    },
  },
  themedModeValue: "artnouveau",
  freestyleModeValue: "artnouveau-freestyle",
  themedBadge: "🌸",
  freestyleBadge: "🎨",
  downloadPrefix: "artnouveau",
  themedRules: STYLE_RULES["artnouveau"],
  freestyleRules: STYLE_RULES["artnouveau-freestyle"],
};

export const MIDCENTURYMODERN_STYLE: StyleConfig = {
  styleKey: "midcenturymodern",
  themedEdgeFn: "generate-image-midcenturymodern",
  freestyleEdgeFn: "generate-image-midcenturymodern-freestyle",
  themedTabLabel: "🌞 Mid-Century",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Mid-Century Poster",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder:
    "Describe your scene… e.g. 'A mid-century Valencia street café with oranges and striped awnings'",
  freestylePlaceholder:
    "Describe any subject… e.g. 'A 1950s-style coastal travel poster with sailboats and palms'",
  prompts: {
    themed: {
      generate: [
        "A mid-century Valencia street café with oranges, striped awnings, and simplified sunlit architecture",
        "A playful 1950s-style coastal travel poster with sailboats, palms, and warm geometric shapes",
        "A stylized cocktail ingredient poster using simplified bottles, citrus shapes, and retro editorial charm",
      ],
      edit: [
        "Simplify the shapes further and remove fussy detail",
        "Push the palette toward warm mustard, terracotta, and dusty blue",
        "Add more breathing room around the central subject",
      ],
    },
    freestyle: {
      generate: [
        "A retro travel poster of a hillside village with simplified geometric forms",
        "A mid-century botanical scene with stylized birds and warm muted tones",
        "A 1950s editorial poster of a coffee cup with playful geometric accents",
      ],
      edit: [
        "Reduce detail and lean into clean silhouettes",
        "Warm the palette toward editorial mid-century tones",
        "Add a subtle paper-grain feel without noise",
      ],
    },
  },
  themedModeValue: "midcenturymodern",
  freestyleModeValue: "midcenturymodern-freestyle",
  themedBadge: "🌞",
  freestyleBadge: "🎨",
  downloadPrefix: "midcenturymodern",
  themedRules: STYLE_RULES["midcenturymodern"],
  freestyleRules: STYLE_RULES["midcenturymodern-freestyle"],
};

export const LOOSEWATERCOLOR_STYLE: StyleConfig = {
  styleKey: "loosewatercolor",
  themedEdgeFn: "generate-image-loosewatercolor",
  freestyleEdgeFn: "generate-image-loosewatercolor-freestyle",
  themedTabLabel: "💧 Loose Watercolor",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Watercolor",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder:
    "Describe your scene… e.g. 'Agua de Valencia ingredients with oranges, cava bottle, and soft botanical washes'",
  freestylePlaceholder:
    "Describe any subject… e.g. 'A Mediterranean window with flowers and expressive watercolor blooms'",
  prompts: {
    themed: {
      generate: [
        "A loose watercolor painting of Agua de Valencia ingredients with oranges, cava bottle, and soft botanical washes",
        "A Mediterranean window with flowers, sunlight, and expressive watercolor blooms",
        "A soft painterly botanical cocktail poster with airy white space and gentle handwritten-style composition",
      ],
      edit: [
        "Loosen the brushwork and let the pigment bloom more freely",
        "Add more airy white space around the subject",
        "Soften the palette toward gentle natural watercolor tones",
      ],
    },
    freestyle: {
      generate: [
        "A loose watercolor of a coffee cup with soft pigment blooms and airy negative space",
        "A painterly watercolor of olive branches with broad washes and gentle bleed edges",
        "A soft expressive watercolor of a coastal scene with handmade paper feel",
      ],
      edit: [
        "Make the washes broader and looser",
        "Remove tight detail in favor of suggestive silhouettes",
        "Add gentle pigment bloom edges around the subject",
      ],
    },
  },
  themedModeValue: "loosewatercolor",
  freestyleModeValue: "loosewatercolor-freestyle",
  themedBadge: "💧",
  freestyleBadge: "🎨",
  downloadPrefix: "loosewatercolor",
  themedRules: STYLE_RULES["loosewatercolor"],
  freestyleRules: STYLE_RULES["loosewatercolor-freestyle"],
};
