import { describe, it, expect } from "vitest";
import {
  buildPrintIntentLine,
  getCatalogEntryForStyleKey,
  getStylePromptMetadata,
  mergeNegativeHints,
  normalizeStyleKey,
} from "./style-prompt-metadata";
import { STYLE_CATALOG } from "./style-catalog";
// Phase 3 parity guard — load the edge runtime's prompt-metadata table
// directly. The file is pure data + pure helpers with no Deno-specific
// imports at module top, so Vitest can import it as-is.
import { STYLE_PROMPT_METADATA as EDGE_STYLE_PROMPT_METADATA } from "../../supabase/functions/_shared/style-prompt-metadata";

describe("normalizeStyleKey", () => {
  it("strips -freestyle suffix", () => {
    expect(normalizeStyleKey("popart-freestyle")).toBe("popart");
    expect(normalizeStyleKey("whimsical_japanese-freestyle")).toBe("whimsical_japanese");
  });
  it("maps lineart-minimal → lineart", () => {
    expect(normalizeStyleKey("lineart-minimal")).toBe("lineart");
  });
  it("maps the bare 'freestyle' key to japanese (Ukiyo-e)", () => {
    expect(normalizeStyleKey("freestyle")).toBe("japanese");
  });
  it("returns the key unchanged when no variant suffix is present", () => {
    expect(normalizeStyleKey("minimalism")).toBe("minimalism");
  });
});

describe("getStylePromptMetadata", () => {
  it("returns the catalog hints for a known styleKey", () => {
    const meta = getStylePromptMetadata("minimalism");
    expect(meta.negativeHints).toEqual([
      "ornate",
      "highly detailed",
      "busy background",
      "photorealistic texture",
    ]);
  });
  it("resolves -freestyle variants to the same metadata as the base key", () => {
    expect(getStylePromptMetadata("risograph-freestyle")).toEqual(
      getStylePromptMetadata("risograph"),
    );
  });
  it("returns {} for an unknown styleKey without throwing", () => {
    expect(getStylePromptMetadata("not_a_real_style")).toEqual({});
  });
  it("exposes printIntentModifier when defined on the catalog entry", () => {
    const meta = getStylePromptMetadata("risograph");
    expect(meta.printIntentModifier).toMatch(/large-format print/);
  });
});

describe("mergeNegativeHints", () => {
  it("appends hints not already present", () => {
    expect(mergeNegativeHints(["soft gradients"], ["photorealistic"])).toEqual([
      "soft gradients",
      "photorealistic",
    ]);
  });
  it("deduplicates case-insensitively while preserving original order", () => {
    expect(
      mergeNegativeHints(
        ["Photorealistic", "soft gradients"],
        ["photorealistic", "muddy colors"],
      ),
    ).toEqual(["Photorealistic", "soft gradients", "muddy colors"]);
  });
  it("trims whitespace and drops empty entries", () => {
    expect(mergeNegativeHints(["  bold "], [" ", "", "bold"])).toEqual(["bold"]);
  });
  it("handles missing args gracefully", () => {
    expect(mergeNegativeHints()).toEqual([]);
    expect(mergeNegativeHints(undefined, ["x"])).toEqual(["x"]);
  });
});

describe("buildPrintIntentLine", () => {
  it("returns the formatted line when printMode is true and modifier exists", () => {
    expect(buildPrintIntentLine("Use bold shapes.", true)).toBe(
      "PRINT INTENT: Use bold shapes.",
    );
  });
  it("returns '' when printMode is false even if modifier is set", () => {
    expect(buildPrintIntentLine("Use bold shapes.", false)).toBe("");
  });
  it("returns '' when modifier is missing or blank", () => {
    expect(buildPrintIntentLine(undefined, true)).toBe("");
    expect(buildPrintIntentLine("   ", true)).toBe("");
  });
});

describe("catalog wiring", () => {
  it("every catalog negativePromptHints entry contains no duplicates", () => {
    for (const entry of STYLE_CATALOG) {
      if (!entry.negativePromptHints) continue;
      const lowered = entry.negativePromptHints.map((s) => s.toLowerCase());
      const unique = new Set(lowered);
      expect(unique.size, `dupes in ${entry.route}`).toBe(lowered.length);
    }
  });

  it("Ukiyo-e (route '/') exposes the expected ban-list", () => {
    const entry = getCatalogEntryForStyleKey("japanese");
    expect(entry?.route).toBe("/");
    expect(entry?.negativePromptHints).toContain("photorealistic");
    expect(entry?.negativePromptHints).toContain("airbrushed");
  });

  it("Botanical defines both negative hints and a print intent modifier", () => {
    const meta = getStylePromptMetadata("botanical");
    expect(meta.negativeHints?.length).toBeGreaterThan(0);
    expect(meta.printIntentModifier).toBeTruthy();
  });

  it("Style IDs (routes) are unchanged, plus the 3 new phase-3 routes", () => {
    const routes = STYLE_CATALOG.map((s) => s.route).sort();
    expect(routes).toEqual(
      [
        "/",
        "/artnouveau",
        "/blend",
        "/botanical",
        "/brutalistposter",
        "/graffiti",
        "/lineart",
        "/loosewatercolor",
        "/mediterranean-heritage",
        "/midcenturymodern",
        "/minimalism",
        "/modernist-cocktail",
        "/popart",
        "/pulpmagazine",
        "/retrocomic",
        "/risograph",
        "/scandinavian-poster",
        "/screenprint",
        "/tattooflash",
        "/urbannoir",
        "/vintage",
        "/whimsical-japanese",
        "/xeroxzine",
      ].sort(),
    );
  });
});

// ── Phase 3 — metadata parity guard ────────────────────────────────────
// Catches the case where a new style is added to STYLE_CATALOG with
// negativePromptHints / printIntentModifier but never wired into the
// edge-runtime prompt-metadata table (which is what the compiler reads
// at generate time).
describe("phase 3: client ↔ edge prompt-metadata parity", () => {
  /** route → expected edge styleKey for catalog entries with prompt metadata */
  const CATALOG_ROUTE_TO_EDGE_KEY: Record<string, string> = {
    "/": "japanese",
    "/popart": "popart",
    "/lineart": "lineart",
    "/minimalism": "minimalism",
    "/graffiti": "graffiti",
    "/botanical": "botanical",
    "/urbannoir": "urbannoir",
    "/screenprint": "screenprint",
    "/risograph": "risograph",
    "/retrocomic": "retrocomic",
    "/pulpmagazine": "pulpmagazine",
    "/tattooflash": "tattooflash",
    "/brutalistposter": "brutalistposter",
    "/xeroxzine": "xeroxzine",
    "/scandinavian-poster": "scandinavian_poster",
    "/vintage": "vintage",
    "/whimsical-japanese": "whimsical_japanese",
    "/modernist-cocktail": "modernist_cocktail",
    "/mediterranean-heritage": "mediterranean_heritage",
    "/blend": "blend",
    "/artnouveau": "artnouveau",
    "/midcenturymodern": "midcenturymodern",
    "/loosewatercolor": "loosewatercolor",
  };

  it("every catalog entry with prompt metadata has an edge mapping", () => {
    for (const entry of STYLE_CATALOG) {
      const hasMeta =
        (entry.negativePromptHints && entry.negativePromptHints.length > 0) ||
        !!entry.printIntentModifier;
      if (!hasMeta) continue;
      expect(
        CATALOG_ROUTE_TO_EDGE_KEY[entry.route],
        `catalog route ${entry.route} has prompt metadata but no edge styleKey mapping in this test — add it to CATALOG_ROUTE_TO_EDGE_KEY`,
      ).toBeTruthy();
    }
  });

  it("every catalog entry with prompt metadata has matching edge STYLE_PROMPT_METADATA", () => {
    for (const entry of STYLE_CATALOG) {
      const hasMeta =
        (entry.negativePromptHints && entry.negativePromptHints.length > 0) ||
        !!entry.printIntentModifier;
      if (!hasMeta) continue;
      const edgeKey = CATALOG_ROUTE_TO_EDGE_KEY[entry.route];
      const edge = EDGE_STYLE_PROMPT_METADATA[edgeKey];
      expect(edge, `edge STYLE_PROMPT_METADATA missing entry for ${edgeKey} (${entry.route})`).toBeDefined();

      if (entry.negativePromptHints && entry.negativePromptHints.length > 0) {
        expect(
          (edge!.negativeHints ?? []).length,
          `edge negativeHints missing for ${edgeKey}`,
        ).toBeGreaterThan(0);
      }
      if (entry.printIntentModifier) {
        expect(
          edge!.printIntentModifier,
          `edge printIntentModifier missing for ${edgeKey}`,
        ).toBeTruthy();
      }
    }
  });

  it("phase-3 styles are present in the edge prompt-metadata table", () => {
    for (const k of ["artnouveau", "midcenturymodern", "loosewatercolor"]) {
      expect(EDGE_STYLE_PROMPT_METADATA[k], `missing edge entry for ${k}`).toBeDefined();
      expect(EDGE_STYLE_PROMPT_METADATA[k].negativeHints?.length ?? 0).toBeGreaterThan(0);
      expect(EDGE_STYLE_PROMPT_METADATA[k].printIntentModifier).toBeTruthy();
    }
  });

  it("Urban Noir edge metadata reflects the repositioned illustrative direction", () => {
    const n = EDGE_STYLE_PROMPT_METADATA["urbannoir"];
    expect(n).toBeDefined();
    expect((n.negativeHints ?? []).map((s) => s.toLowerCase())).toEqual(
      expect.arrayContaining(["realistic surveillance photo", "soft low-light photo"]),
    );
    expect(n.printIntentModifier ?? "").toMatch(/illustrative/i);
  });
});
