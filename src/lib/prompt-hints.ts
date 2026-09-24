import type { StyleRules } from "./prompt-rules";

/** Hints derived purely from a style's existing rules — no AI, no cost. */
export interface StylePromptHints {
  worksWellWith: string[];
  composition: string[];
  defaultPalette: string[];
  avoid: string[];
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function getStylePromptHints(rules: StyleRules | undefined | null): StylePromptHints {
  if (!rules) return { worksWellWith: [], composition: [], defaultPalette: [], avoid: [] };
  const avoidSource = [...(rules.blockedTraits ?? []), ...(rules.avoidRules ?? [])];
  return {
    worksWellWith: [...(rules.visualGoal ?? []), ...(rules.styleAnchors ?? [])].slice(0, 3).map(clean).map(cap),
    composition: (rules.compositionRules ?? []).slice(0, 2).map(clean).map(cap),
    defaultPalette: (rules.colorRules ?? []).slice(0, 2).map(clean).map(cap),
    avoid: Array.from(new Set(avoidSource.map(clean))).slice(0, 3).map(cap),
  };
}

/** Prompt words that commonly clash with style rules, with a friendly label. */
const CONFLICT_TERMS: { pattern: RegExp; ruleWords: string[]; message: string }[] = [
  { pattern: /\b(photo|photograph|photographic|photorealistic|photo-?realism|realistic|hyper-?realistic)\b/i, ruleWords: ["photo", "realis"], message: "This style avoids photographic or realistic looks." },
  { pattern: /\b(3d|render|rendered|cgi|octane|unreal)\b/i, ruleWords: ["3d", "render", "cgi"], message: "This style avoids 3D / rendered looks." },
  { pattern: /\b(gradient|gradients)\b/i, ruleWords: ["gradient"], message: "This style avoids gradients." },
  { pattern: /\b(neon|glow|glowing)\b/i, ruleWords: ["neon", "glow"], message: "This style avoids neon or glowing effects." },
  { pattern: /\b(anime|manga|cartoon|cartoonish)\b/i, ruleWords: ["anime", "manga", "cartoon"], message: "This style avoids anime / cartoon looks." },
  { pattern: /\b(text|lettering|words|title|typography|caption)\b/i, ruleWords: ["text", "letter", "typograph", "watermark"], message: "This style avoids text in the artwork." },
  { pattern: /\b(glossy|shiny|metallic|chrome)\b/i, ruleWords: ["gloss", "shiny", "metallic", "chrome"], message: "This style avoids glossy or metallic surfaces." },
  { pattern: /\b(digital|airbrush|airbrushed)\b/i, ruleWords: ["digital", "airbrush"], message: "This style avoids a digital / airbrushed look." },
  { pattern: /\b(blurry|blur|bokeh|soft focus)\b/i, ruleWords: ["blur", "bokeh", "soft focus"], message: "This style avoids blur and soft focus." },
];

export function detectPromptConflicts(prompt: string, rules: StyleRules | undefined | null): string[] {
  if (!rules || !prompt.trim()) return [];
  const avoidText = [...(rules.blockedTraits ?? []), ...(rules.avoidRules ?? [])].join(" ").toLowerCase();
  const out: string[] = [];
  for (const t of CONFLICT_TERMS) {
    if (t.pattern.test(prompt) && t.ruleWords.some((w) => avoidText.includes(w))) out.push(t.message);
  }
  return out;
}

/** Appends a strong palette-override directive to the prompt when set. */
export function applyColorOverride(prompt: string, colors: string): string {
  const c = colors.trim();
  const p = prompt.trim();
  if (!c) return p;
  return `${p}. COLOR PALETTE OVERRIDE (takes priority over the style's usual colors): use ${c} as the dominant palette`;
}
