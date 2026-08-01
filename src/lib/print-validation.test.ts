/**
 * Turn 3B — unit tests for the shared print-validation layer.
 */
import { describe, it, expect } from "vitest";
import {
  PRINT_RATIO_TOLERANCE,
  assessColorManagement,
  classifyPrintSource,
  isDisplayDerivativeUrl,
  isLocalPreviewSource,
  validatePrintReadiness,
  type PrintValidationInput,
} from "./print-validation";
import { getPrintFormat } from "./print-formats";

const MASTER = "https://x.supabase.co/storage/v1/object/public/generated-images/a.png";

function base(over: Partial<PrintValidationInput> = {}): PrintValidationInput {
  return {
    canonicalSourceUrl: MASTER,
    canonicalSourceKind: "canonical_master",
    canonicalWidth: 5906,
    canonicalHeight: 8268,
    printFormatId: "print_50x70",
    ratioAdjustment: "none",
    ...over,
  };
}

describe("registry coverage", () => {
  it("exposes every required format", () => {
    for (const id of [
      "print_50x70",
      "print_70x50",
      "print_30x40",
      "print_70x100",
      "print_a2",
      "print_a3",
      "print_a4",
    ]) {
      expect(getPrintFormat(id), id).toBeTruthy();
    }
  });
});

describe("1. exact 50×70 ratio", () => {
  it("is format ready and 300 PPI ready", () => {
    const r = validatePrintReadiness(base());
    expect(r.formatReady).toBe(true);
    expect(r.printReady).toBe(true);
    expect(r.ratioClassification).toBe("correct");
    expect(r.ppi300Ready).toBe(true);
    expect(r.blockingErrors).toEqual([]);
  });
});

describe("2. one-pixel ratio rounding", () => {
  it("tolerates ±1 px", () => {
    const r = validatePrintReadiness(base({ canonicalWidth: 5907, canonicalHeight: 8268 }));
    expect(r.ratioDifference!).toBeLessThan(PRINT_RATIO_TOLERANCE);
    expect(r.formatReady).toBe(true);
  });
});

describe("3. incorrect ratio", () => {
  it("blocks 3:4 artwork on a 5:7 poster", () => {
    const r = validatePrintReadiness(base({ canonicalWidth: 3000, canonicalHeight: 4000 }));
    expect(r.formatReady).toBe(false);
    expect(r.printReady).toBe(false);
    expect(r.severity).toBe("blocked");
    expect(r.blockingErrors.join(" ")).toMatch(/Aspect ratio does not match/);
  });
});

describe("4. landscape orientation", () => {
  it("validates 70×50 landscape masters", () => {
    const r = validatePrintReadiness(
      base({ printFormatId: "print_70x50", canonicalWidth: 8268, canonicalHeight: 5906 }),
    );
    expect(r.orientation).toBe("landscape");
    expect(r.formatReady).toBe(true);
    expect(r.ppi300Ready).toBe(true);
  });

  it("auto orientation swaps a portrait format for a landscape master", () => {
    const r = validatePrintReadiness(
      base({
        printFormatId: "print_50x70",
        orientation: "auto",
        canonicalWidth: 8268,
        canonicalHeight: 5906,
      }),
    );
    expect(r.targetWidthMm).toBe(700);
    expect(r.targetHeightMm).toBe(500);
    expect(r.formatReady).toBe(true);
  });
});

describe("5. A-series formats", () => {
  it("A4/A3/A2 at 300 PPI are format + PPI ready", () => {
    const cases: Array<[string, number, number]> = [
      ["print_a4", 2480, 3508],
      ["print_a3", 3508, 4961],
      ["print_a2", 4961, 7016],
    ];
    for (const [id, w, h] of cases) {
      const r = validatePrintReadiness(
        base({ printFormatId: id, canonicalWidth: w, canonicalHeight: h }),
      );
      expect(r.formatReady, id).toBe(true);
      expect(r.ppi300Ready, id).toBe(true);
    }
  });
});

describe("6-8. PPI tiers", () => {
  it("format ready but below 150 PPI", () => {
    const r = validatePrintReadiness(base({ canonicalWidth: 1000, canonicalHeight: 1400 }));
    expect(r.formatReady).toBe(true);
    expect(r.ppi150Ready).toBe(false);
    expect(r.ppi300Ready).toBe(false);
    expect(r.severity).toBe("warning");
  });

  it("150 ready but below 300", () => {
    const r = validatePrintReadiness(base({ canonicalWidth: 3600, canonicalHeight: 5040 }));
    expect(r.ppi150Ready).toBe(true);
    expect(r.ppi300Ready).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/not a true 300-PPI source/);
  });

  it("true 300 ready", () => {
    const r = validatePrintReadiness(base());
    expect(Math.round(r.effectivePpi!)).toBeGreaterThanOrEqual(300);
    expect(r.ppi300Ready).toBe(true);
    expect(r.severity).toBe("pass");
  });
});

describe("9. limiting axis", () => {
  it("uses the lower axis PPI", () => {
    // Slightly narrow master: within ratio tolerance is not required here,
    // so use an explicit physical override to isolate the axis math.
    const r = validatePrintReadiness(
      base({
        canonicalWidth: 3000,
        canonicalHeight: 8268,
        physicalWidthMm: 500,
        physicalHeightMm: 700,
      }),
    );
    expect(r.limitingAxis).toBe("x");
    expect(r.effectivePpi).toBeCloseTo(r.ppiX!, 6);
    expect(r.effectivePpi!).toBeLessThan(r.ppiY!);
  });
});

describe("10-12. export geometry and bleed", () => {
  it("standard export has no bleed", () => {
    const r = validatePrintReadiness(base({ includeBleed: false }));
    expect(r.bleedPx).toBe(0);
    expect(r.exportPixels).toEqual(r.trimPixels);
    expect(r.trimPixels).toEqual({ width: 5906, height: 8268 });
  });

  it("3 mm bleed adds 35 px per side at 300 DPI", () => {
    const r = validatePrintReadiness(base({ includeBleed: true }));
    expect(r.bleedPx).toBe(35);
    expect(r.exportPixels).toEqual({ width: 5906 + 70, height: 8268 + 70 });
    expect(r.explanation).toMatch(/3 mm bleed included/);
  });

  it("bleed rounding follows half-up at the export PPI", () => {
    const r150 = validatePrintReadiness(base({ includeBleed: true, exportDpi: 150 }));
    expect(r150.bleedPx).toBe(18); // 3/25.4*150 = 17.72 → 18
    const r72 = validatePrintReadiness(base({ includeBleed: true, exportDpi: 72 }));
    expect(r72.bleedPx).toBe(9); // 8.50 → 9
  });
});

describe("13-15. crop / padding / distortion", () => {
  it("records crop metadata", () => {
    const box = { x: 0, y: 100, width: 5906, height: 8268 };
    const r = validatePrintReadiness(base({ ratioAdjustment: "crop", cropBox: box }));
    expect(r.cropApplied).toBe(true);
    expect(r.cropBox).toEqual(box);
    expect(r.ratioClassification).toBe("corrected_crop");
    expect(r.severity).toBe("warning");
  });

  it("detects padding and never calls it a crop", () => {
    const r = validatePrintReadiness(base({ ratioAdjustment: "pad" }));
    expect(r.paddingApplied).toBe(true);
    expect(r.cropApplied).toBe(false);
    expect(r.ratioClassification).toBe("padded");
  });

  it("detects distortion and blocks", () => {
    const r = validatePrintReadiness(base({ ratioAdjustment: "distort" }));
    expect(r.distortionDetected).toBe(true);
    expect(r.printReady).toBe(false);
    expect(r.severity).toBe("blocked");
  });
});

describe("16-18. source gating", () => {
  it("missing canonical dimensions blocks", () => {
    const r = validatePrintReadiness(base({ canonicalWidth: null, canonicalHeight: null }));
    expect(r.blockingErrors.join(" ")).toMatch(/dimensions are missing/);
    expect(r.printReady).toBe(false);
    expect(r.effectivePpi).toBeNull();
  });

  it("rejects blob previews and transformed display URLs", () => {
    expect(isLocalPreviewSource("blob:http://x/y")).toBe(true);
    expect(isDisplayDerivativeUrl(MASTER.replace("object", "render/image"))).toBe(true);
    const blob = validatePrintReadiness(base({ canonicalSourceUrl: "blob:http://x/y" }));
    expect(blob.canonicalSourceKind).toBe("local_preview");
    expect(blob.printReady).toBe(false);

    const derivative = validatePrintReadiness(
      base({
        canonicalSourceUrl:
          "https://x.supabase.co/storage/v1/render/image/public/generated-images/a.png?width=500",
      }),
    );
    expect(derivative.canonicalSourceKind).toBe("display_derivative");
    expect(derivative.printReady).toBe(false);
    expect(derivative.blockingErrors.join(" ")).toMatch(/display derivative/);
  });

  it("accepts the canonical master", () => {
    expect(classifyPrintSource(MASTER, "canonical_master")).toBe("canonical_master");
    expect(validatePrintReadiness(base()).printReady).toBe(true);
  });
});

describe("19-20. color management", () => {
  it("known sRGB", () => {
    expect(assessColorManagement({ space: "srgb" }).status).toBe("srgb_confirmed");
  });
  it("unknown metadata", () => {
    expect(assessColorManagement(null).status).toBe("profile_unknown");
    expect(assessColorManagement({ space: "unknown" }).status).toBe("profile_unknown");
  });
  it("embedded profile with a canvas pipeline is not supported", () => {
    const a = assessColorManagement({ embedded: true, profileName: "AdobeRGB" });
    expect(a.status).toBe("profile_not_supported");
  });
  it("preserves a profile only when the pipeline proves it", () => {
    const a = assessColorManagement({ embedded: true, exportPreservesProfile: true });
    expect(a.status).toBe("profile_preserved");
  });
  it("never claims CMYK conversion", () => {
    const r = validatePrintReadiness(base({ colorProfile: { space: "cmyk" } }));
    expect(r.colorStatus).toBe("cmyk_not_available");
    expect(JSON.stringify(r)).not.toMatch(/CMYK ready|cmyk_converted/i);
  });
  it("defaults to RGB assumption for untagged masters", () => {
    const r = validatePrintReadiness(base({ colorProfile: { space: "rgb", embedded: false } }));
    expect(r.colorStatus).toBe("rgb_assumed");
  });
});

describe("21-23. derivative workflows", () => {
  it("existing 50×70 derivative stays valid at trim size", () => {
    const r = validatePrintReadiness(base({ exportType: "derivative", includeBleed: false }));
    expect(r.printReady).toBe(true);
    expect(r.exportPixels).toEqual({ width: 5906, height: 8268 });
  });

  it("50×70 → A3 requires a crop and reports it", () => {
    // A3 ratio 0.7071 vs 5:7 0.7143 — crop-corrected master matches A3.
    const r = validatePrintReadiness(
      base({
        printFormatId: "print_a3",
        canonicalWidth: 3508,
        canonicalHeight: 4961,
        ratioAdjustment: "crop",
        cropBox: { x: 0, y: 0, width: 3508, height: 4961 },
      }),
    );
    expect(r.formatReady).toBe(true);
    expect(r.ratioClassification).toBe("corrected_crop");
    expect(r.warnings.join(" ")).toMatch(/cropping/);
  });

  it("A-series master on a 50×70 target warns via a blocking ratio error", () => {
    const r = validatePrintReadiness(
      base({ printFormatId: "print_50x70", canonicalWidth: 3508, canonicalHeight: 4961 }),
    );
    expect(r.formatReady).toBe(false);
    expect(r.severity).toBe("blocked");
    expect(r.explanation).toMatch(/Aspect ratio does not match/);
  });
});

describe("malformed canonical print sources (Turn 3B regression)", () => {
  const base = { canonicalWidth: 5906, canonicalHeight: 8268, printFormatId: "print_50x70" };

  it("rejects a malformed source string", () => {
    const r = validatePrintReadiness({ ...base, canonicalSourceUrl: "not a url" });
    expect(r.canonicalSourceKind).toBe("unknown");
    expect(r.severity).toBe("blocked");
    expect(r.blockingErrors.join(" ")).toMatch(/malformed/i);
  });

  it("rejects a malformed source even when a kind is declared", () => {
    const r = validatePrintReadiness({
      ...base,
      canonicalSourceUrl: "http://",
      canonicalSourceKind: "canonical_master",
    });
    expect(r.canonicalSourceKind).toBe("unknown");
    expect(r.severity).toBe("blocked");
  });

  it("still accepts legitimate canonical forms", () => {
    const ok = [
      "https://p.supabase.co/storage/v1/object/public/generated-images/a.png",
      "https://p.supabase.co/storage/v1/object/public/generated-images/a.png?v=2",
      "https://p.supabase.co/storage/v1/object/sign/generated-images/a.png?token=x",
      "generated-images/whimsical_japanese-1782285116589.png",
    ];
    for (const u of ok) {
      const r = validatePrintReadiness({ ...base, canonicalSourceUrl: u });
      expect(r.canonicalSourceKind).not.toBe("unknown");
      expect(r.blockingErrors).toEqual([]);
    }
  });
});
