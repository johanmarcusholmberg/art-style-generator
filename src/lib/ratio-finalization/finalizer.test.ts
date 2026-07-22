import { describe, expect, it, vi } from "vitest";
import { finalizePendingRatioItem } from "./finalizer";
import { RatioFinalizationApiError, type ClaimedRatioFinalizationItem } from "./api";
import type { RatioFinalizationPlan } from "./planner";
import type { RendererImageSource } from "./renderer";

const fakeBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

function baseClaim(over: Partial<ClaimedRatioFinalizationItem> = {}): ClaimedRatioFinalizationItem {
  return {
    itemId: "itm-1",
    claimToken: "tok-1",
    galleryImageId: "gal-1",
    sourceStoragePath: "generated/gal-1.png",
    sourceImageUrl: "https://x/gal-1.png",
    sourceWidth: 1094,
    sourceHeight: 1606,
    posterFormatId: "print_50x70",
    targetAspectRatio: "5:7",
    correctionPolicy: "pad",
    attempts: 1,
    ...over,
  };
}

function stubClient() {
  return {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const fakeSource: RendererImageSource = {} as unknown as RendererImageSource;

function decodeAt(w: number, h: number) {
  const release = vi.fn();
  return {
    decode: vi.fn().mockResolvedValue({ source: fakeSource, width: w, height: h, release }),
    release,
  };
}

describe("finalizePendingRatioItem — success paths", () => {
  it("PAD: renders, uploads to deterministic path, completes", async () => {
    const claim = vi.fn().mockResolvedValue(baseClaim());
    const dec = decodeAt(1094, 1606);
    const render = vi.fn().mockResolvedValue({
      blob: fakeBlob, width: 1148, height: 1606, mimeType: "image/png",
    });
    const uploadBlob = vi.fn().mockResolvedValue({ publicUrl: "https://cdn/final.png" });
    const complete = vi.fn().mockResolvedValue(true);
    const fail = vi.fn().mockResolvedValue(true);
    const download = vi.fn().mockResolvedValue(fakeBlob);

    const result = await finalizePendingRatioItem("itm-1", {
      client: stubClient(),
      claim, complete, fail,
      downloadSource: download, decodeImage: dec.decode, render, uploadBlob,
      readItemState: vi.fn(),
    });

    expect(result).toMatchObject({ status: "completed", operation: "pad", itemId: "itm-1" });
    expect(uploadBlob).toHaveBeenCalledTimes(1);
    const uploadedPath = uploadBlob.mock.calls[0][2] as string;
    expect(uploadedPath.startsWith("ratio-finalized/gal-1/print_50x70/v1/")).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toMatchObject({
      operation: "pad",
      finalWidth: 1148,
      finalHeight: 1606,
      finalStoragePath: uploadedPath,
    });
    expect(dec.release).toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });

  it("NONE: reuses source storage path, no upload, completes with operation='none'", async () => {
    const claim = vi.fn().mockResolvedValue(baseClaim({
      sourceStoragePath: "generated/gal-1.png",
      // Already matches 5:7
    }));
    const dec = decodeAt(1000, 1400);
    const render = vi.fn();
    const uploadBlob = vi.fn();
    const complete = vi.fn().mockResolvedValue(true);
    const fail = vi.fn();

    const result = await finalizePendingRatioItem("itm-1", {
      client: stubClient(),
      claim, complete, fail,
      downloadSource: vi.fn().mockResolvedValue(fakeBlob),
      decodeImage: dec.decode,
      render, uploadBlob,
      readItemState: vi.fn(),
    });

    expect(result).toMatchObject({ status: "not_required" });
    expect(render).not.toHaveBeenCalled();
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toMatchObject({ operation: "none" });
  });

  it("CROP: uses crop policy from claim", async () => {
    const claim = vi.fn().mockResolvedValue(baseClaim({ correctionPolicy: "crop" }));
    const dec = decodeAt(1600, 1000);
    const render = vi.fn().mockResolvedValue({
      blob: fakeBlob, width: 714, height: 1000, mimeType: "image/png",
    });
    const uploadBlob = vi.fn().mockResolvedValue({ publicUrl: "https://cdn/final.png" });
    const complete = vi.fn().mockResolvedValue(true);

    const r = await finalizePendingRatioItem("itm-1", {
      client: stubClient(),
      claim, complete,
      downloadSource: vi.fn().mockResolvedValue(fakeBlob),
      decodeImage: dec.decode,
      render, uploadBlob,
      readItemState: vi.fn(),
    });
    expect(r.status).toBe("completed");
    if (r.status === "completed") expect(r.operation).toBe("crop");
  });
});

describe("finalizePendingRatioItem — claim & error paths", () => {
  it("not_claimable → status='skipped', no side effects", async () => {
    const claim = vi.fn().mockRejectedValue(
      new RatioFinalizationApiError("not_claimable", "not_claimable"),
    );
    const fail = vi.fn();
    const r = await finalizePendingRatioItem("itm-1", {
      client: stubClient(), claim, fail,
      downloadSource: vi.fn(), decodeImage: vi.fn(), render: vi.fn(), uploadBlob: vi.fn(),
      complete: vi.fn(), readItemState: vi.fn(),
    });
    expect(r).toEqual({ status: "skipped", itemId: "itm-1", reason: "not_claimable" });
    expect(fail).not.toHaveBeenCalled();
  });

  it("forbidden_or_missing → status='failed', fail not reported (no claim token)", async () => {
    const claim = vi.fn().mockRejectedValue(
      new RatioFinalizationApiError("forbidden_or_missing", "forbidden_or_missing"),
    );
    const fail = vi.fn();
    const r = await finalizePendingRatioItem("itm-1", {
      client: stubClient(), claim, fail,
      downloadSource: vi.fn(), decodeImage: vi.fn(), render: vi.fn(), uploadBlob: vi.fn(),
      complete: vi.fn(), readItemState: vi.fn(),
    });
    expect(r.status).toBe("failed");
    expect(fail).not.toHaveBeenCalled();
  });

  it("render error after claim → failReport called with same claim token", async () => {
    const claim = vi.fn().mockResolvedValue(baseClaim());
    const dec = decodeAt(1094, 1606);
    const render = vi.fn().mockRejectedValue(new Error("canvas_boom"));
    const fail = vi.fn().mockResolvedValue(true);
    const complete = vi.fn();

    const r = await finalizePendingRatioItem("itm-1", {
      client: stubClient(), claim, complete, fail,
      downloadSource: vi.fn().mockResolvedValue(fakeBlob),
      decodeImage: dec.decode,
      render, uploadBlob: vi.fn(),
      readItemState: vi.fn(),
    });
    expect(r.status).toBe("failed");
    expect(fail).toHaveBeenCalledWith(
      { itemId: "itm-1", claimToken: "tok-1", error: expect.stringContaining("canvas_boom") },
      { client: expect.anything() },
    );
    expect(dec.release).toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("failReport error does not swallow original processing error", async () => {
    const claim = vi.fn().mockResolvedValue(baseClaim());
    const dec = decodeAt(1094, 1606);
    const fail = vi.fn().mockRejectedValue(new Error("fail_reporting_broken"));
    const r = await finalizePendingRatioItem("itm-1", {
      client: stubClient(), claim, fail,
      downloadSource: vi.fn().mockResolvedValue(fakeBlob),
      decodeImage: dec.decode,
      render: vi.fn().mockRejectedValue(new Error("original_error")),
      uploadBlob: vi.fn(),
      complete: vi.fn(),
      readItemState: vi.fn(),
    });
    expect(r.status).toBe("failed");
    if (r.status === "failed") expect(r.error).toContain("original_error");
  });
});

describe("finalizePendingRatioItem — complete verification", () => {
  const goodClaim = () => baseClaim();
  const goodDec = () => decodeAt(1094, 1606);
  const goodRender = () => vi.fn().mockResolvedValue({ blob: fakeBlob, width: 1148, height: 1606, mimeType: "image/png" });
  const goodUpload = () => vi.fn().mockResolvedValue({ publicUrl: "https://cdn/final.png" });

  it("transport-uncertain complete → verified via readItemState → success", async () => {
    const claim = vi.fn().mockResolvedValue(goodClaim());
    const dec = goodDec();
    const complete = vi.fn()
      .mockRejectedValueOnce(new RatioFinalizationApiError("unknown_rpc_error", "network"))
      .mockRejectedValueOnce(new RatioFinalizationApiError("unknown_rpc_error", "network"));
    const readItemState = vi.fn().mockImplementation(async (_c, _id) => ({
      status: "completed",
      storagePath: "ratio-finalized/gal-1/print_50x70/v1/itm-1.png",
      operation: "pad",
      width: 1148, height: 1606,
    }));
    const uploadBlob = goodUpload();
    const fail = vi.fn();

    const r = await finalizePendingRatioItem("itm-1", {
      client: stubClient(), claim, complete, fail,
      downloadSource: vi.fn().mockResolvedValue(fakeBlob),
      decodeImage: dec.decode,
      render: goodRender(), uploadBlob,
      readItemState,
    });
    expect(r.status).toBe("completed");
    expect(complete).toHaveBeenCalledTimes(2); // one retry
    expect(readItemState).toHaveBeenCalledTimes(1);
    expect(fail).not.toHaveBeenCalled();
  });

  it("invalid_claim (authoritative) → NO retry, immediate failure", async () => {
    const claim = vi.fn().mockResolvedValue(goodClaim());
    const dec = goodDec();
    const complete = vi.fn().mockRejectedValue(
      new RatioFinalizationApiError("invalid_claim", "invalid_claim"),
    );
    const readItemState = vi.fn();
    const fail = vi.fn().mockResolvedValue(true);

    const r = await finalizePendingRatioItem("itm-1", {
      client: stubClient(), claim, complete, fail,
      downloadSource: vi.fn().mockResolvedValue(fakeBlob),
      decodeImage: dec.decode,
      render: goodRender(), uploadBlob: goodUpload(),
      readItemState,
    });
    expect(r.status).toBe("failed");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(readItemState).not.toHaveBeenCalled();
  });

  it("uncertain complete + state doesn't match → surfaces the transport error", async () => {
    const claim = vi.fn().mockResolvedValue(goodClaim());
    const dec = goodDec();
    const complete = vi.fn().mockRejectedValue(
      new RatioFinalizationApiError("unknown_rpc_error", "boom"),
    );
    const readItemState = vi.fn().mockResolvedValue({
      status: "processing", storagePath: null, operation: null, width: null, height: null,
    });
    const fail = vi.fn().mockResolvedValue(true);

    const r = await finalizePendingRatioItem("itm-1", {
      client: stubClient(), claim, complete, fail,
      downloadSource: vi.fn().mockResolvedValue(fakeBlob),
      decodeImage: dec.decode,
      render: goodRender(), uploadBlob: goodUpload(),
      readItemState,
    });
    expect(r.status).toBe("failed");
    expect(fail).toHaveBeenCalled();
  });
});

describe("finalizePendingRatioItem — download fallback", () => {
  it("uses storage path when present (default downloader is bypassed by DI here)", async () => {
    const claim = vi.fn().mockResolvedValue(baseClaim({ sourceStoragePath: "generated/gal-1.png", sourceImageUrl: null }));
    const dec = decodeAt(1000, 1400);
    const download = vi.fn().mockResolvedValue(fakeBlob);
    const r = await finalizePendingRatioItem("itm-1", {
      client: stubClient(), claim,
      downloadSource: download, decodeImage: dec.decode,
      render: vi.fn(), uploadBlob: vi.fn(),
      complete: vi.fn().mockResolvedValue(true),
      fail: vi.fn(), readItemState: vi.fn(),
    });
    expect(r.status).toBe("not_required");
    expect(download).toHaveBeenCalled();
  });
});
