import { describe, it, expect } from "vitest";
import {
  STYLE_CATALOG,
  FAMILY_LABELS,
  FAMILY_ORDER,
  getStyleByRoute,
  getStyleBadge,
} from "./style-catalog";

describe("style-catalog taxonomy (phase 1)", () => {
  it("every style has a stable unique route", () => {
    const routes = STYLE_CATALOG.map((s) => s.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("every visible style declares a family", () => {
    for (const s of STYLE_CATALOG) {
      if (s.visibility === "hidden") continue;
      expect(s.family, `style ${s.name} missing family`).toBeTruthy();
    }
  });

  it("every declared family has a label and is in FAMILY_ORDER", () => {
    for (const s of STYLE_CATALOG) {
      if (!s.family) continue;
      expect(FAMILY_LABELS[s.family]).toBeTruthy();
      expect(FAMILY_ORDER).toContain(s.family);
    }
  });

  it("every variant points at a valid parent style route", () => {
    const routes = new Set(STYLE_CATALOG.map((s) => s.route));
    for (const s of STYLE_CATALOG) {
      if (s.visibility !== "variant") continue;
      expect(s.variantOf, `variant ${s.name} missing variantOf`).toBeTruthy();
      expect(routes.has(s.variantOf!)).toBe(true);
    }
  });

  it("preserves the existing core style routes (no IDs renamed)", () => {
    const expected = [
      "/",
      "/risograph",
      "/screenprint",
      "/xeroxzine",
      "/lineart",
      "/botanical",
      "/tattooflash",
      "/retrocomic",
      "/whimsical-japanese",
      "/modernist-cocktail",
      "/mediterranean-heritage",
      "/scandinavian-poster",
      "/brutalistposter",
      "/urbannoir",
      "/minimalism",
      "/blend",
      "/graffiti",
      "/pulpmagazine",
      "/popart",
      "/vintage",
    ];
    const routes = new Set(STYLE_CATALOG.map((s) => s.route));
    for (const r of expected) {
      expect(routes.has(r), `missing route ${r}`).toBe(true);
    }
  });

  it("getStyleByRoute resolves known routes", () => {
    expect(getStyleByRoute("/risograph")?.name).toBe("Risograph");
    expect(getStyleByRoute("/does-not-exist")).toBeUndefined();
  });

  it("getStyleBadge labels variants and risky textures", () => {
    const xerox = getStyleByRoute("/xeroxzine")!;
    expect(getStyleBadge(xerox)).toBe("Variant");
  });

  // ── Phase 3 — new primary styles ──────────────────────────────────────
  describe("phase 3: new primary styles", () => {
    const NEW_ROUTES = ["/artnouveau", "/midcenturymodern", "/loosewatercolor"] as const;

    it.each(NEW_ROUTES)("%s exists as a primary entry with taxonomy metadata", (route) => {
      const s = getStyleByRoute(route);
      expect(s, `missing ${route}`).toBeDefined();
      expect(s!.visibility ?? "primary").toBe("primary");
      expect(s!.family).toBeTruthy();
      expect(s!.printSuitability).toBeTruthy();
      expect(s!.textureProfile).toBeTruthy();
      expect(s!.shortUserDescription, `${route} missing shortUserDescription`).toBeTruthy();
      expect(s!.styleIntent).toBeTruthy();
    });

    it.each(NEW_ROUTES)("%s has negativePromptHints and printIntentModifier", (route) => {
      const s = getStyleByRoute(route)!;
      expect((s.negativePromptHints ?? []).length).toBeGreaterThan(0);
      expect(s.printIntentModifier).toBeTruthy();
    });

    it("places Art Nouveau under heritage_vintage, Mid-Century under modernist_graphic, Loose Watercolor under painterly", () => {
      expect(getStyleByRoute("/artnouveau")!.family).toBe("heritage_vintage");
      expect(getStyleByRoute("/midcenturymodern")!.family).toBe("modernist_graphic");
      expect(getStyleByRoute("/loosewatercolor")!.family).toBe("painterly");
    });
  });

  // ── Phase 3 — Urban Noir repositioning ────────────────────────────────
  describe("phase 3: Urban Noir repositioning", () => {
    it("keeps its existing route /urbannoir", () => {
      expect(getStyleByRoute("/urbannoir")).toBeDefined();
    });

    it("reflects the illustrative noir direction in its metadata", () => {
      const n = getStyleByRoute("/urbannoir")!;
      expect(n.shortUserDescription ?? "").toMatch(/illustration/i);
      expect(n.printIntentModifier ?? "").toMatch(/illustrative/i);
      expect((n.negativePromptHints ?? []).map((s) => s.toLowerCase())).toEqual(
        expect.arrayContaining(["realistic surveillance photo", "soft low-light photo"]),
      );
      expect(n.upscaleNotes ?? "").toMatch(/illustrative/i);
    });
  });
});
