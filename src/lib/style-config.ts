/** Style configuration for different art style generators */
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
}

export const UKIYOE_STYLE: StyleConfig = {
  styleKey: "ukiyoe",
  themedEdgeFn: "generate-image",
  freestyleEdgeFn: "generate-image-freestyle",
  themedTabLabel: "🏯 Japanese Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate 浮世絵",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A crane flying over misty mountains'",
  freestylePlaceholder: "Describe any scene… e.g. 'Central Park in New York during autumn'",
  prompts: {
    themed: {
      generate: [
        "A great wave crashing against Mount Fuji at sunset",
        "Koi fish swimming in a tranquil garden pond",
        "A crane flying over misty mountains at dawn",
      ],
      edit: [
        "Change the background to a sunset sky",
        "Make the colors more vibrant and saturated",
        "Add cherry blossoms falling in the scene",
      ],
    },
    freestyle: {
      generate: [
        "Central Park in New York during autumn",
        "The Eiffel Tower at golden hour",
        "A cozy Italian café on a rainy day",
      ],
      edit: [
        "Change the background to a sunset sky",
        "Make the colors more vibrant and saturated",
        "Add rain and reflections on the ground",
      ],
    },
  },
  themedModeValue: "japanese",
  freestyleModeValue: "freestyle",
  themedBadge: "🏯",
  freestyleBadge: "🎨",
  downloadPrefix: "ukiyoe",
};

export const POPART_STYLE: StyleConfig = {
  styleKey: "popart",
  themedEdgeFn: "generate-image-popart",
  freestyleEdgeFn: "generate-image-popart-freestyle",
  themedTabLabel: "🎯 Pop Art Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Pop Art",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A sports car on a neon-lit highway'",
  freestylePlaceholder: "Describe any scene… e.g. 'A bowl of fruit on a kitchen table'",
  prompts: {
    themed: {
      generate: [
        "A woman with sunglasses and bold red lips",
        "A classic Cadillac on Route 66 at sunset",
        "A can of soup on a supermarket shelf",
      ],
      edit: [
        "Change the background to bright yellow",
        "Add Ben-Day dots to the sky",
        "Make the colors even more saturated",
      ],
    },
    freestyle: {
      generate: [
        "The Statue of Liberty against a neon sky",
        "A retro diner with chrome details",
        "A city skyline with bold graphic shapes",
      ],
      edit: [
        "Change the background to bright yellow",
        "Add more contrast and bolder outlines",
        "Make it look like a comic book panel",
      ],
    },
  },
  themedModeValue: "popart",
  freestyleModeValue: "popart-freestyle",
  themedBadge: "🎯",
  freestyleBadge: "🎨",
  downloadPrefix: "popart",
};

export const LINEART_STYLE: StyleConfig = {
  styleKey: "lineart",
  themedEdgeFn: "generate-image-lineart",
  freestyleEdgeFn: "generate-image-lineart-freestyle",
  themedTabLabel: "✒️ Ink Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Line Art",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A lighthouse on a rocky cliff'",
  freestylePlaceholder: "Describe any scene… e.g. 'A vintage bicycle in a garden'",
  prompts: {
    themed: {
      generate: [
        "A lighthouse on a rocky cliff overlooking stormy seas",
        "A detailed botanical study of roses and ferns",
        "An old European cathedral with flying buttresses",
      ],
      edit: [
        "Add more cross-hatching to the shadows",
        "Make the lines finer and more delicate",
        "Add birds flying in the background",
      ],
    },
    freestyle: {
      generate: [
        "A vintage bicycle leaning against a stone wall",
        "A cozy cabin in the woods with smoke from the chimney",
        "A bustling street market with awnings and crates",
      ],
      edit: [
        "Add more detail to the foreground",
        "Make the lines thicker and bolder",
        "Add a frame of decorative vines around the image",
      ],
    },
  },
  themedModeValue: "lineart",
  freestyleModeValue: "lineart-freestyle",
  themedBadge: "✒️",
  freestyleBadge: "🎨",
  downloadPrefix: "lineart",
};

export const MINIMALISM_STYLE: StyleConfig = {
  styleKey: "minimalism",
  themedEdgeFn: "generate-image-minimalism",
  freestyleEdgeFn: "generate-image-minimalism-freestyle",
  themedTabLabel: "◻ Minimal Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Minimal Art",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A single tree on a vast plain'",
  freestylePlaceholder: "Describe any scene… e.g. 'A coffee cup on a marble table'",
  prompts: {
    themed: {
      generate: [
        "A single tree on a vast snowy plain at dawn",
        "Abstract geometric shapes floating in soft pastel space",
        "A solitary boat on a calm lake with mountains",
      ],
      edit: [
        "Reduce the color palette to just two tones",
        "Add more negative space around the subject",
        "Make the shapes more geometric and abstract",
      ],
    },
    freestyle: {
      generate: [
        "A coffee cup casting a long shadow on a table",
        "A city skyline reduced to simple geometric blocks",
        "A cat sitting in a sunbeam by a window",
      ],
      edit: [
        "Simplify the composition further",
        "Change the palette to warm earth tones",
        "Make it more abstract with fewer details",
      ],
    },
  },
  themedModeValue: "minimalism",
  freestyleModeValue: "minimalism-freestyle",
  themedBadge: "◻",
  freestyleBadge: "🎨",
  downloadPrefix: "minimalism",
};

export const GRAFFITI_STYLE: StyleConfig = {
  styleKey: "graffiti",
  themedEdgeFn: "generate-image-graffiti",
  freestyleEdgeFn: "generate-image-graffiti-freestyle",
  themedTabLabel: "🎨 Street Scenes",
  freestyleTabLabel: "🎨 Freestyle",
  themedGenerateLabel: "Generate Graffiti",
  freestyleGenerateLabel: "Generate Image",
  themedPlaceholder: "Describe your scene… e.g. 'A roaring lion on a brick wall'",
  freestylePlaceholder: "Describe any scene… e.g. 'A city skyline at night with neon lights'",
  prompts: {
    themed: {
      generate: [
        "A roaring lion sprayed on a brick wall",
        "A boombox with music notes exploding out of it",
        "A woman's face with flowers growing from her hair",
      ],
      edit: [
        "Add more dripping paint effects",
        "Make the colors more neon and vibrant",
        "Add a stencil-style Banksy element",
      ],
    },
    freestyle: {
      generate: [
        "A city skyline at night with neon reflections",
        "A vintage car parked in a graffiti-covered alley",
        "An astronaut floating above a colorful urban landscape",
      ],
      edit: [
        "Add spray paint splatters around the edges",
        "Make it look like it's on a concrete wall",
        "Add bold outlines and street art tags",
      ],
    },
  },
  themedModeValue: "graffiti",
  freestyleModeValue: "graffiti-freestyle",
  themedBadge: "🎨",
  freestyleBadge: "🎨",
  downloadPrefix: "graffiti",
};
