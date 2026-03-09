/** Style configuration for different art style generators */
export interface StyleConfig {
  /** Unique style key used for storage/caching prefixes */
  styleKey: string;
  /** Edge function name for the "themed" mode */
  themedEdgeFn: string;
  /** Edge function name for the "freestyle" mode */
  freestyleEdgeFn: string;
  /** Label for the themed tab */
  themedTabLabel: string;
  /** Label for the freestyle tab */
  freestyleTabLabel: string;
  /** Button label for generation in themed mode */
  themedGenerateLabel: string;
  /** Button label for generation in freestyle mode */
  freestyleGenerateLabel: string;
  /** Placeholder for themed prompt textarea */
  themedPlaceholder: string;
  /** Placeholder for freestyle prompt textarea */
  freestylePlaceholder: string;
  /** Suggested prompts */
  prompts: {
    themed: { generate: string[]; edit: string[] };
    freestyle: { generate: string[]; edit: string[] };
  };
  /** Mode value stored in the themed tab */
  themedModeValue: string;
  /** Mode value stored in the freestyle tab */
  freestyleModeValue: string;
  /** Gallery badge emoji for themed mode */
  themedBadge: string;
  /** Gallery badge emoji for freestyle mode */
  freestyleBadge: string;
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
