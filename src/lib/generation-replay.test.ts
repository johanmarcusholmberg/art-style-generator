import { describe, it, expect } from "vitest";
import {
  buildGenerationReplayPreset,
  generatorReplayProps,
  replayEditKey,
  replayIntentOf,
  replayDialogCopy,
  type EditRequest,
} from "@/lib/generation-replay";
import { DEFAULT_PRINT_FORMAT_ID, PRINT_FORMATS } from "@/lib/print-formats";

const printRow = {
  prompt: "a quiet harbour at dusk",
  mode: "vintage-themed",
  generation_mode: "print-ready",
  print_format_id: PRINT_FORMATS[1].id,
  quality_mode: "print-300",
  provider_strategy: "manual",
  generation_provider: "openai",
  requested_model_id: null,
  resolved_model_id: "some-resolved-model",
  quality_profile: "strict",
  generation_strategy: "poster",
};

describe("buildGenerationReplayPreset", () => {
  it("reconstructs prompt, mode and print format for a print-ready row", () => {
    const p = buildGenerationReplayPreset(printRow);
    expect(p.prompt).toBe("a quiet harbour at dusk");
    expect(p.mode).toBe("vintage-themed");
    expect(p.generationMode).toBe("print-ready");
    expect(p.printFormatId).toBe(PRINT_FORMATS[1].id);
    expect(p.qualityTarget).toBe("print-300");
  });

  it("reconstructs standard-generation settings", () => {
    const p = buildGenerationReplayPreset({
      ...printRow,
      generation_mode: "standard",
      quality_mode: "web",
    });
    expect(p.generationMode).toBe("standard");
    expect(p.qualityTarget).toBe("web");
  });

  it("prefers the requested model over the resolved fallback model", () => {
    const p = buildGenerationReplayPreset({
      ...printRow,
      requested_model_id: "definitely-not-a-model",
      resolved_model_id: "some-resolved-model",
    });
    expect(p.modelId).toBeNull();
    expect(p.warnings.join(" ")).toMatch(/no longer selectable/);
  });

  it("never carries post-processing or provenance state", () => {
    const p = buildGenerationReplayPreset(printRow) as unknown as Record<string, unknown>;
    for (const banned of [
      "upscaleApplied",
      "enhancedImageUrl",
      "executionRoute",
      "estimatedCost",
      "actualWidthPx",
      "collectionId",
      "adminStatus",
      "resolvedModelId",
      "imageUrl",
      "storagePath",
    ]) {
      expect(p[banned]).toBeUndefined();
    }
  });

  it("does not reuse the source image and warns when one existed", () => {
    const p = buildGenerationReplayPreset({
      ...printRow,
      source_image_url: "https://example.com/a.png",
    });
    expect(p.warnings.join(" ")).toMatch(/Source image not automatically reused/);
    expect(JSON.stringify(p)).not.toContain("example.com");
  });

  it("falls back safely for missing legacy fields", () => {
    const p = buildGenerationReplayPreset({});
    expect(p.prompt).toBe("");
    expect(p.generationMode).toBe("print-ready");
    expect(p.printFormatId).toBe(DEFAULT_PRINT_FORMAT_ID);
    expect(p.qualityTarget).toBe("print-300");
    expect(p.providerPreference).toBe("auto");
    expect(p.qualityProfile).toBe("balanced");
    expect(p.generationStrategy).toBeNull();
  });

  it("does not crash on deprecated provider / model / print format values", () => {
    const p = buildGenerationReplayPreset({
      ...printRow,
      generation_provider: "supir",
      print_format_id: "gone-format",
      quality_profile: "ludicrous",
      generation_strategy: "nope",
    });
    expect(p.providerPreference).toBe("auto");
    expect(p.printFormatId).toBe(DEFAULT_PRINT_FORMAT_ID);
    expect(p.qualityProfile).toBe("balanced");
    expect(p.generationStrategy).toBeNull();
    expect(p.warnings.length).toBeGreaterThan(0);
  });

  it("preserves the exact registered mode for themed/freestyle/tertiary", () => {
    for (const mode of ["lineart-themed", "lineart-freestyle", "popart-freestyle"]) {
      expect(buildGenerationReplayPreset({ ...printRow, mode }).mode).toBe(mode);
    }
  });
});

describe("generator hydration props", () => {
  const preset = buildGenerationReplayPreset(printRow);

  it("Generate again is source-free and auto-generates via the normal generator", () => {
    const req: EditRequest = {
      prompt: preset.prompt,
      mode: preset.mode,
      intent: "replay",
      preset,
      requestId: "r1",
    };
    const props = generatorReplayProps(req, preset.mode, () => {});
    expect(props.initialImageUrl).toBeUndefined();
    expect(props.originalImageId).toBeUndefined();
    expect(props.originalStoragePath).toBeUndefined();
    expect(props.autoGenerate).toBe(true);
    expect(props.initialPreset).toBe(preset);
  });

  it("Reuse settings hydrates but does not auto-generate", () => {
    const req: EditRequest = { prompt: "p", mode: preset.mode, intent: "reuse", preset };
    const props = generatorReplayProps(req, preset.mode, () => {});
    expect(props.autoGenerate).toBe(false);
    expect(props.initialPreset).toBe(preset);
    expect(props.initialImageUrl).toBeUndefined();
  });

  it("Gallery Edit still passes the image as a source", () => {
    const req: EditRequest = {
      prompt: "p",
      mode: preset.mode,
      imageUrl: "https://x/i.png",
      originalId: "id-1",
      originalStoragePath: "path/i.png",
    };
    expect(replayIntentOf(req)).toBe("edit");
    const props = generatorReplayProps(req, preset.mode, () => {});
    expect(props.initialImageUrl).toBe("https://x/i.png");
    expect(props.originalImageId).toBe("id-1");
    expect(props.originalStoragePath).toBe("path/i.png");
    expect(props.autoGenerate).toBe(false);
  });

  it("gives no props for a different mode", () => {
    expect(generatorReplayProps({ prompt: "", mode: "a" }, "b", () => {})).toEqual({});
  });

  it("remounts the generator per request", () => {
    const a = replayEditKey({ prompt: "", mode: "m", intent: "replay", requestId: "1" });
    const b = replayEditKey({ prompt: "", mode: "m", intent: "replay", requestId: "2" });
    expect(a).not.toBe(b);
    expect(replayEditKey(null)).toBe("default");
  });

  it("keeps unsaved-work protection copy for every intent", () => {
    for (const intent of ["edit", "replay", "reuse"] as const) {
      const copy = replayDialogCopy({ prompt: "", mode: "m", intent }, true);
      expect(copy.title).toBe("You have an unsaved image");
      expect(copy.action).toMatch(/^Discard & /);
    }
  });
});
