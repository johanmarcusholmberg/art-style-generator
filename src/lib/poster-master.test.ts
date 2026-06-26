/**
 * Central poster-master guard tests.
 *
 * Proves the contracts required by the print-ratio hardening pass:
 *   - Off-ratio raw provider output is corrected before becoming master.
 *   - Provider exact-match output is recorded as such (no spurious pad).
 *   - Enforcement failure throws — print-ready save is never silent.
 *   - The save-options invariant rewrites imageUrl + dims to the corrected
 *     master so gallery upload reads the ratio-correct asset.
 *   - Non-print rows are passed through untouched.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub dimension probe — value is overridden per test via `probedDims`.
let probedDims: { width: number; height: number } | null = { width: 1094, height: 1606 };
vi.mock("@/lib/image-metadata", () => ({
  loadImageDimensions: vi.fn(async (url: string) => {
    if (!probedDims) throw new Error("probe failed");
    return probedDims;
  }),
  classifyPrintReadiness: () => "ok" as const,
}));

// Stub enforcePosterRatio so we don't need a real canvas / supabase.
let enforceShouldFail = false;
let enforceOutput: { url: string; width: number; height: number } = {
  url: "https://stub.local/generated-images/normalized.png",
  width: 1147,
  height: 1606,
};
vi.mock("@/lib/poster-ratio-enforce", async () => {
  const actual = await vi.importActual<typeof import("@/lib/poster-ratio-enforce")>(
    "@/lib/poster-ratio-enforce",
  );
  return {
    ...actual,
    enforcePosterRatio: vi.fn(async () => {
      if (enforceShouldFail) throw new Error("canvas upload failed");
      return {
        url: enforceOutput.url,
        width: enforceOutput.width,
        height: enforceOutput.height,
        corrected: true,
        plan: {
          method: "pad" as const,
          sourceWidth: probedDims?.width ?? 0,
          sourceHeight: probedDims?.height ?? 0,
          outputWidth: enforceOutput.width,
          outputHeight: enforceOutput.height,
          padLeft: 0,
          padTop: 0,
          targetRatio: 5 / 7,
          sourceRatio: 0,
          ratioError: 0,
        },
      };
    }),
  };
});

import {
  preparePosterMaster,
  ensurePrintMasterInSaveOpts,
  isWithinPosterRatio,
} from "./poster-master";

beforeEach(() => {
  probedDims = { width: 1094, height: 1606 };
  enforceShouldFail = false;
  enforceOutput = {
    url: "https://stub.local/generated-images/normalized.png",
    width: 1147,
    height: 1606,
  };
});

describe("isWithinPosterRatio", () => {
  it("returns true when source matches target within tolerance", () => {
    expect(isWithinPosterRatio(1000, 1400, "print_50x70")).toBe(true);
  });
  it("returns false for the reported 1094x1606 bug case", () => {
    expect(isWithinPosterRatio(1094, 1606, "print_50x70")).toBe(false);
  });
  it("returns false when dims/format are missing", () => {
    expect(isWithinPosterRatio(null, 1400, "print_50x70")).toBe(false);
    expect(isWithinPosterRatio(1000, 1400, null)).toBe(false);
  });
});

describe("preparePosterMaster", () => {
  it("corrects the reported 1094x1606 → 5:7 master and flags providerAdjusted", async () => {
    const master = await preparePosterMaster({
      rawImageUrl: "https://raw/x.png",
      posterFormatId: "print_50x70",
    });
    expect(master.ratioCorrected).toBe(true);
    expect(master.ratioCorrectionMethod).toBe("pad");
    expect(master.providerAdjusted).toBe(true);
    expect(master.providerExactMatch).toBe(false);
    expect(master.rawProviderImageUrl).toBe("https://raw/x.png");
    expect(master.masterImageUrl).toBe(enforceOutput.url);
    expect(master.originalWidth).toBe(1094);
    expect(master.originalHeight).toBe(1606);
    expect(master.masterWidth).toBe(enforceOutput.width);
    expect(master.masterHeight).toBe(enforceOutput.height);
    // Final master ratio is in tolerance.
    expect(isWithinPosterRatio(master.masterWidth, master.masterHeight, "print_50x70")).toBe(true);
  });

  it("records providerExactMatch when raw output already matches", async () => {
    probedDims = { width: 1000, height: 1400 }; // 5:7 exact
    const master = await preparePosterMaster({
      rawImageUrl: "https://raw/exact.png",
      posterFormatId: "print_50x70",
    });
    expect(master.ratioCorrected).toBe(false);
    expect(master.ratioCorrectionMethod).toBe("none");
    expect(master.providerExactMatch).toBe(true);
    expect(master.providerAdjusted).toBe(false);
    expect(master.masterImageUrl).toBe("https://raw/exact.png");
  });

  it("supports the post-upscale correction label", async () => {
    const master = await preparePosterMaster({
      rawImageUrl: "https://raw/up.png",
      posterFormatId: "print_50x70",
      correctionMethod: "post_upscale_pad",
    });
    expect(master.ratioCorrectionMethod).toBe("post_upscale_pad");
  });

  it("throws when enforcement fails — never returns the raw URL silently", async () => {
    enforceShouldFail = true;
    await expect(
      preparePosterMaster({
        rawImageUrl: "https://raw/x.png",
        posterFormatId: "print_50x70",
      }),
    ).rejects.toThrow(/canvas upload failed/);
  });

  it("throws when dimension probe fails", async () => {
    probedDims = null;
    await expect(
      preparePosterMaster({
        rawImageUrl: "https://raw/x.png",
        posterFormatId: "print_50x70",
      }),
    ).rejects.toThrow(/probe/);
  });

  it("throws for unknown posterFormatId", async () => {
    await expect(
      preparePosterMaster({
        rawImageUrl: "https://raw/x.png",
        posterFormatId: "print_nope",
      }),
    ).rejects.toThrow(/unknown posterFormatId/);
  });

  it("throws if enforced output is somehow still off-ratio", async () => {
    enforceOutput = { url: "https://stub/bad.png", width: 1094, height: 1606 };
    await expect(
      preparePosterMaster({
        rawImageUrl: "https://raw/x.png",
        posterFormatId: "print_50x70",
      }),
    ).rejects.toThrow(/still off-ratio/);
  });
});

describe("ensurePrintMasterInSaveOpts", () => {
  it("rewrites imageUrl/master/dims to the corrected master for print rows", async () => {
    const input: Record<string, unknown> & { imageUrl: string; printFormatId: string } = {
      imageUrl: "https://raw/x.png",
      printFormatId: "print_50x70",
      prompt: "p",
      mode: "test",
    };
    const { opts, master } = await ensurePrintMasterInSaveOpts(input as any);
    expect(master).not.toBeNull();
    expect((opts as any).imageUrl).toBe(enforceOutput.url);
    expect((opts as any).masterImageUrl).toBe(enforceOutput.url);
    expect((opts as any).baseImageUrl).toBe(enforceOutput.url);
    expect((opts as any).masterWidth).toBe(enforceOutput.width);
    expect((opts as any).masterHeight).toBe(enforceOutput.height);
    expect((opts as any).actualWidthPx).toBe(enforceOutput.width);
    expect((opts as any).actualHeightPx).toBe(enforceOutput.height);
  });


  it("skips non-print rows untouched", async () => {
    const { opts, master } = await ensurePrintMasterInSaveOpts({
      imageUrl: "https://raw/x.png",
      prompt: "p",
      mode: "test",
    });
    expect(master).toBeNull();
    expect(opts.imageUrl).toBe("https://raw/x.png");
  });

  it("skips when caller already supplied on-ratio master dims", async () => {
    const { opts, master } = await ensurePrintMasterInSaveOpts({
      imageUrl: "https://already-correct/x.png",
      printFormatId: "print_50x70",
      masterWidth: 4000,
      masterHeight: 5600,
      prompt: "p",
      mode: "test",
    });
    expect(master).toBeNull();
    expect(opts.imageUrl).toBe("https://already-correct/x.png");
  });

  it("blocks the save (throws) when enforcement fails", async () => {
    enforceShouldFail = true;
    await expect(
      ensurePrintMasterInSaveOpts({
        imageUrl: "https://raw/x.png",
        printFormatId: "print_50x70",
        prompt: "p",
        mode: "test",
      }),
    ).rejects.toThrow(/Print-ready save blocked/);
  });
});
