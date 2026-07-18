import { describe, it, expect } from "vitest";
import {
  STYLE_MODES,
  STYLE_CONFIG_BY_ROUTE,
  getStyleModeByValue,
  getEdgeFnForMode,
  styleKeyForRoute,
  getBatchStyleOptions,
  getCompareStyleOptions,
  getControlPanelStyleOptions,
  getStyleLabStyles,
  getGalleryOnboardingStyles,
} from "./style-registry";
import { STYLE_CATALOG } from "./style-catalog";
import { ALL_STYLES } from "./batch-jobs";
import { STYLE_LAB_STYLES } from "./style-lab-styles";

describe("style-registry (Stage 1 canonical registry)", () => {
  it("every primary catalog entry (except /blend) has a matching StyleConfig", () => {
    const missing = STYLE_CATALOG
      .filter((s) => (s.visibility ?? "primary") === "primary")
      .filter((s) => s.route !== "/blend")
      .filter((s) => !STYLE_CONFIG_BY_ROUTE[s.route]);
    expect(missing.map((s) => s.route)).toEqual([]);
  });

  it("routes are unique across the registry", () => {
    const routes = Object.keys(STYLE_CONFIG_BY_ROUTE);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("style keys are unique across the registry", () => {
    const keys = Object.values(STYLE_CONFIG_BY_ROUTE).map((c) => c.styleKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("mode values are unique across STYLE_MODES", () => {
    const modes = STYLE_MODES.map((m) => m.mode);
    expect(new Set(modes).size).toBe(modes.length);
  });

  it("existing canonical routes and styleKeys are preserved", () => {
    // NOTE: the ukiyo-e page uses mode value "japanese" for legacy DB
    // compatibility, while its styleKey is "ukiyoe".
    expect(styleKeyForRoute("/")).toBe("ukiyoe");
    expect(styleKeyForRoute("/popart")).toBe("popart");
    expect(styleKeyForRoute("/lineart")).toBe("lineart");
    expect(styleKeyForRoute("/whimsical-japanese")).toBe("whimsical_japanese");
    expect(styleKeyForRoute("/modernist-cocktail")).toBe("modernist_cocktail");
    expect(styleKeyForRoute("/scandinavian-poster")).toBe("scandinavian_poster");
    expect(styleKeyForRoute("/mediterranean-heritage")).toBe("mediterranean_heritage");
  });

  it("getEdgeFnForMode returns the expected legacy edge function names", () => {
    expect(getEdgeFnForMode("japanese")).toBe("generate-image");
    expect(getEdgeFnForMode("freestyle")).toBe("generate-image-freestyle");
    expect(getEdgeFnForMode("popart")).toBe("generate-image-popart");
    expect(getEdgeFnForMode("popart-freestyle")).toBe("generate-image-popart-freestyle");
    expect(getEdgeFnForMode("lineart-minimal")).toBe("generate-image-lineart-minimal");
    expect(getEdgeFnForMode("whimsical_japanese")).toBe("generate-image-whimsicaljapanese");
  });

  it("STYLE_MODES includes freestyle rows for every themed row", () => {
    const themed = STYLE_MODES.filter((m) => m.kind === "themed");
    for (const t of themed) {
      const freestyle = STYLE_MODES.find(
        (m) => m.kind === "freestyle" && m.parentStyleKey === t.parentStyleKey,
      );
      expect(freestyle, `missing freestyle mode for ${t.parentStyleKey}`).toBeDefined();
    }
  });

  it("newer styles (Whimsical Japanese, Modernist Cocktail, Mediterranean, etc.) are exposed to Batch and Compare", () => {
    const batchValues = new Set(getBatchStyleOptions().map((s) => s.value));
    const compareValues = new Set(getCompareStyleOptions().map((s) => s.value));
    for (const key of [
      "whimsical_japanese",
      "modernist_cocktail",
      "mediterranean_heritage",
      "scandinavian_poster",
      "vintage",
      "artnouveau",
      "midcenturymodern",
      "loosewatercolor",
    ]) {
      expect(batchValues.has(key), `batch missing ${key}`).toBe(true);
      expect(compareValues.has(key), `compare missing ${key}`).toBe(true);
    }
  });

  it("Batch Studio ALL_STYLES is derived from the registry (identity)", () => {
    expect(ALL_STYLES).toEqual(getBatchStyleOptions());
  });

  it("every Style Lab entry exists in the registry", () => {
    for (const s of STYLE_LAB_STYLES) {
      expect(getStyleLabStyles().find((r) => r.styleKey === s.styleKey)).toBeDefined();
      expect(styleKeyForRoute(s.route)).toBe(s.styleKey);
    }
  });

  it("Control Panel style rows all resolve to a real StyleConfig", () => {
    for (const row of getControlPanelStyleOptions()) {
      const mode = getStyleModeByValue(row.id);
      expect(mode, `control-panel row ${row.id} not in STYLE_MODES`).toBeDefined();
    }
  });

  it("Gallery onboarding shows a small primary-only subset", () => {
    const cards = getGalleryOnboardingStyles(6);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(6);
    for (const card of cards) {
      const entry = STYLE_CATALOG.find((s) => s.route === card.to);
      expect(entry).toBeDefined();
      expect((entry!.visibility ?? "primary")).toBe("primary");
    }
  });

  it("every registered primary style has a route and canonical styleKey", () => {
    for (const [route, cfg] of Object.entries(STYLE_CONFIG_BY_ROUTE)) {
      expect(route.startsWith("/")).toBe(true);
      expect(cfg.styleKey.length).toBeGreaterThan(0);
    }
  });
});
