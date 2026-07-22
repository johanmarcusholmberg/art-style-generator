import { describe, it, expect } from "vitest";
import { freezeCollectionSettings, readFrozenCollectionSettings } from "./frozen-settings";
import { GENERATION_REQUEST_VERSION } from "@/lib/generation-contract-v2";
import { ART_DIRECTION_VERSION } from "./types";

const FROZEN = freezeCollectionSettings({
  anchorImageId: "img-1",
  anchorImageUrl: "https://x/a.png",
  anchorStoragePath: "generated/x.png",
  anchorWidthPx: 1024,
  anchorHeightPx: 1434,
  styleKey: "mediterranean-heritage",
  posterFormatId: "5x7",
  aspectRatio: "5:7",
  backgroundStyle: "white",
  anchorProvider: "gemini",
  anchorModel: "gemini-2.5-flash-image",
  resolvedProvider: "gemini",
  resolvedModel: "gemini-2.5-flash-image",
  providerPreference: "gemini",
  referenceStrength: "balanced",
  artDirection: null,
  consistencyStrength: "balanced",
});

describe("freezeCollectionSettings", () => {
  it("stamps art-direction and contract versions", () => {
    expect(FROZEN.artDirectionVersion).toBe(ART_DIRECTION_VERSION);
    expect(FROZEN.contractVersion).toBe(GENERATION_REQUEST_VERSION);
  });
});

describe("readFrozenCollectionSettings", () => {
  it("round-trips a fully populated row without fallbacks", () => {
    const row = {
      anchor_image_id: "img-1",
      anchor_image_url: "https://x/a.png",
      anchor_storage_path: "generated/x.png",
      anchor_width_px: 1024,
      anchor_height_px: 1434,
      anchor_style_key: "mediterranean-heritage",
      anchor_poster_format_id: "5x7",
      anchor_aspect_ratio: "5:7",
      anchor_background_style: "white",
      anchor_provider: "gemini",
      anchor_model: "gemini-2.5-flash-image",
      resolved_provider: "gemini",
      resolved_model: "gemini-2.5-flash-image",
      provider_preference: "gemini",
      reference_strength: "balanced",
      art_direction: null,
      art_direction_version: ART_DIRECTION_VERSION,
      consistency_strength: "balanced",
      contract_version: GENERATION_REQUEST_VERSION,
    };
    const r = readFrozenCollectionSettings(row);
    expect(r.usedFallbacks).toEqual([]);
    expect(r.settings.aspectRatio).toBe("5:7");
    expect(r.settings.styleKey).toBe("mediterranean-heritage");
  });

  it("derives aspect ratio from poster format when missing", () => {
    const r = readFrozenCollectionSettings({
      anchor_style_key: "x",
      anchor_poster_format_id: "5x7",
    });
    expect(r.settings.aspectRatio).toBe("5:7");
    expect(r.usedFallbacks).toContain("aspectRatio<-posterFormatId");
  });

  it("falls back to default aspect ratio + background when unknown", () => {
    const r = readFrozenCollectionSettings({ anchor_style_key: "x" });
    expect(r.settings.aspectRatio).toBe("5:7");
    expect(r.settings.backgroundStyle).toBe("white");
    expect(r.usedFallbacks).toEqual(
      expect.arrayContaining([
        "aspectRatio<-default(5:7)",
        "backgroundStyle<-default(white)",
      ]),
    );
  });

  it("reports unknown provider / model instead of inventing one", () => {
    const r = readFrozenCollectionSettings({ anchor_style_key: "x" });
    expect(r.settings.anchorProvider).toBeNull();
    expect(r.settings.resolvedProvider).toBeNull();
    expect(r.usedFallbacks).toEqual(
      expect.arrayContaining(["provider<-unknown", "model<-unknown"]),
    );
  });

  it("reports contract-version fallback for legacy rows", () => {
    const r = readFrozenCollectionSettings({ anchor_style_key: "x" });
    expect(r.settings.contractVersion).toBe(GENERATION_REQUEST_VERSION);
    expect(r.usedFallbacks).toContain("contractVersion<-default");
  });

  it("keeps dimensions null when missing (no invented dimensions)", () => {
    const r = readFrozenCollectionSettings({ anchor_style_key: "x" });
    expect(r.settings.anchorWidthPx).toBeNull();
    expect(r.settings.anchorHeightPx).toBeNull();
  });
});
