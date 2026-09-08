/**
 * Engine-identity routing tests for the Real-ESRGAN print path.
 *
 * Covers: Auto resolution, disabled Large, no cross-engine substitution, and
 * the frontend adapter carrying `upscalerId` into the edge-function request.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { preflightUpscale, selectAutoUpscaler } from "@/lib/upscale-preflight";
import { UPSCALERS } from "@/lib/upscalers";
import { SDXL_SIZE_PRESETS } from "@/lib/sdxl-size-presets";

/* --------------------------- adapter test rig --------------------------- */

const invokeCalls: Array<{ name: string; body: Record<string, unknown> }> = [];
let invokeResult: { data: Record<string, unknown> | null; error: unknown } = {
  data: null,
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (name: string, opts: { body: Record<string, unknown> }) => {
        invokeCalls.push({ name, body: opts.body });
        return Promise.resolve(invokeResult);
      },
    },
  },
}));

import { runReplicateUpscale } from "@/lib/upscale-providers/replicate";

beforeEach(() => {
  invokeCalls.length = 0;
  invokeResult = {
    data: {
      upscaled_image_url: "https://stub.local/out.png",
      storage_path: "out.png",
      width: 4000,
      height: 5600,
      method: "realesrgan",
      scale: 4,
    },
    error: null,
  };
});

/* ------------------------------- routing -------------------------------- */

describe("Auto engine routing", () => {
  it("resolves realesrgan_normal for an eligible small source", () => {
    const r = preflightUpscale({ sourceWidth: 1000, sourceHeight: 1400, scale: 4 });
    expect(r.ok).toBe(true);
    expect(r.upscalerId).toBe("realesrgan_normal");
    expect(r.autoSelected).toBe(true);
  });

  it("escalates a >2MP source to Large, and blocks beyond the verified envelope", () => {
    const ok = preflightUpscale({ sourceWidth: 1200, sourceHeight: 1680, scale: 4 });
    expect(ok.ok).toBe(true);
    expect(ok.upscalerId).toBe("realesrgan_large");

    const blocked = preflightUpscale({ sourceWidth: 2000, sourceHeight: 2800, scale: 4 });
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe("no_eligible_upscaler");
    expect(blocked.upscalerId).toBeNull();
  });

  it("never selects Clarity", () => {
    for (const px of [500_000, 2_016_000, 20_000_000]) {
      expect(selectAutoUpscaler(px).upscalerId).not.toBe("clarity");
    }
  });
});

describe("manual engine selection", () => {
  it("blocks Large above its verified envelope instead of substituting", () => {
    const r = preflightUpscale({
      sourceWidth: 2000,
      sourceHeight: 2800,
      scale: 2,
      upscalerId: "realesrgan_large",
    });
    expect(r.ok).toBe(false);
    expect(r.upscalerId).toBe("realesrgan_large");
  });

  it("blocks oversized Normal instead of promoting to Large", () => {
    const r = preflightUpscale({
      sourceWidth: 1200,
      sourceHeight: 1680,
      scale: 4,
      upscalerId: "realesrgan_normal",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("input_too_large");
    expect(r.upscalerId).toBe("realesrgan_normal");
  });

  it("never alters the source dimensions to satisfy a limit", () => {
    const r = preflightUpscale({
      sourceWidth: 1200,
      sourceHeight: 1680,
      scale: 4,
      upscalerId: "realesrgan_normal",
    });
    expect(r.inputPixels).toBe(1200 * 1680);
  });
});

/* --------------------------- adapter contract --------------------------- */

describe("runReplicateUpscale carries engine identity", () => {
  it("sends realesrgan_normal", async () => {
    const res = await runReplicateUpscale({
      imageUrl: "https://stub.local/src.png",
      method: "realesrgan",
      scale: 4,
      upscalerId: "realesrgan_normal",
    });
    expect(invokeCalls[0].name).toBe("upscale-image-replicate");
    expect(invokeCalls[0].body.upscaler_id).toBe("realesrgan_normal");
    expect(res.upscalerId).toBe("realesrgan_normal");
    expect(res.provider).toBe("replicate/real-esrgan-normal");
  });

  it("sends realesrgan_large unchanged", async () => {
    await runReplicateUpscale({
      imageUrl: "https://stub.local/src.png",
      method: "realesrgan",
      scale: 2,
      upscalerId: "realesrgan_large",
    });
    expect(invokeCalls[0].body.upscaler_id).toBe("realesrgan_large");
  });

  it("throws if the backend echoes a different engine", async () => {
    invokeResult = {
      data: {
        upscaled_image_url: "https://stub.local/out.png",
        upscaler_id: "realesrgan_normal",
      },
      error: null,
    };
    await expect(
      runReplicateUpscale({
        imageUrl: "https://stub.local/src.png",
        method: "realesrgan",
        scale: 2,
        upscalerId: "realesrgan_large",
      }),
    ).rejects.toThrow(/mismatch/i);
  });
});

/* ------------------------------ UI state -------------------------------- */

describe("registry state today", () => {
  it("has Large enabled with a verified 1440x2016 envelope", () => {
    expect(UPSCALERS.realesrgan_large.enabled).toBe(true);
    expect(UPSCALERS.realesrgan_large.verifiedInputPixels).toBe(2_903_040);
  });

  it("Small SDXL preset is above the Normal input ceiling", () => {
    const small = SDXL_SIZE_PRESETS.small;
    expect(small.width * small.height).toBe(2_016_000);
    expect(small.width * small.height).toBeGreaterThan(
      UPSCALERS.realesrgan_normal.maxInputPixels!,
    );
    // Normal stays blocked; Auto escalates to Large instead of downscaling.
    expect(
      preflightUpscale({
        sourceWidth: small.width,
        sourceHeight: small.height,
        scale: 2,
        upscalerId: "realesrgan_normal",
      }).ok,
    ).toBe(false);
    expect(
      preflightUpscale({
        sourceWidth: small.width,
        sourceHeight: small.height,
        scale: 4.11,
      }).upscalerId,
    ).toBe("realesrgan_large");
  });

  it("manual Clarity stays available for that same source", () => {
    const small = SDXL_SIZE_PRESETS.small;
    const r = preflightUpscale({
      sourceWidth: small.width,
      sourceHeight: small.height,
      scale: 4,
      upscalerId: "clarity",
    });
    expect(r.ok).toBe(true);
    expect(r.upscalerId).toBe("clarity");
  });

  it("keeps the existing <=2MP Normal flow working", () => {
    const r = preflightUpscale({ sourceWidth: 1024, sourceHeight: 1024, scale: 4 });
    expect(r.ok).toBe(true);
    expect(r.upscalerId).toBe("realesrgan_normal");
    expect(r.outputLongEdge).toBe(4096);
  });
});
