import { describe, it, expect, vi } from "vitest";
import {
  adoptDurableCanonicalAsset,
  adoptWithBoundedRetry,
} from "./adoption";
import type { DurableCanonicalAsset } from "./repository";

function canonical(overrides: Partial<DurableCanonicalAsset> = {}): DurableCanonicalAsset {
  return {
    itemId: "it_1",
    itemStatus: "completed",
    ratioStatus: "completed",
    ratioLeaseExpiresAt: null,
    ratioError: null,
    finalizationOperation: null,
    storagePath: "gen/src.png",
    imageUrl: "https://ex/img.png",
    enforcedImageUrl: null,
    rawImageUrl: null,
    galleryImageId: "gi_1",
    masterStoragePath: "gen/master.png",
    masterWidth: 2400,
    masterHeight: 3360,
    ...overrides,
  };
}

describe("adoptDurableCanonicalAsset", () => {
  it("adopts corrected master when all fields present", async () => {
    const load = vi.fn().mockResolvedValue(canonical());
    const r = await adoptDurableCanonicalAsset("it_1", {
      load,
      resolvePublicUrl: (p) => `https://cdn/${p}`,
    });
    expect(r.status).toBe("adopted");
    if (r.status === "adopted") {
      expect(r.asset.isCorrectedMaster).toBe(true);
      expect(r.asset.storagePath).toBe("gen/master.png");
      expect(r.asset.width).toBe(2400);
      expect(r.asset.imageUrl).toBe("https://cdn/gen/master.png");
      expect(r.asset.galleryImageId).toBe("gi_1");
    }
  });

  it("reports retryable when row exists but master fields still missing", async () => {
    const load = vi.fn().mockResolvedValue(canonical({ masterWidth: null }));
    const r = await adoptDurableCanonicalAsset("it_1", { load });
    expect(r.status).toBe("incomplete");
    if (r.status === "incomplete") {
      expect(r.reason).toBe("missing-corrected-master");
      expect(r.retryable).toBe(true);
    }
  });

  it("reports not-found retryable when row missing", async () => {
    const load = vi.fn().mockResolvedValue(null);
    const r = await adoptDurableCanonicalAsset("it_1", { load });
    expect(r.status).toBe("incomplete");
    if (r.status === "incomplete") {
      expect(r.reason).toBe("not-found");
      expect(r.retryable).toBe(true);
    }
  });

  it("reports load-error when repository throws", async () => {
    const load = vi.fn().mockRejectedValue(new Error("boom"));
    const r = await adoptDurableCanonicalAsset("it_1", { load });
    expect(r.status).toBe("incomplete");
    if (r.status === "incomplete") {
      expect(r.reason).toBe("load-error");
      expect(r.retryable).toBe(true);
    }
  });

  it("rejects not-terminal item status", async () => {
    const load = vi.fn().mockResolvedValue(canonical({ itemStatus: "processing" }));
    const r = await adoptDurableCanonicalAsset("it_1", { load });
    expect(r.status).toBe("incomplete");
    if (r.status === "incomplete") {
      expect(r.reason).toBe("not-terminal");
      expect(r.retryable).toBe(false);
    }
  });

  it("not_required requires ratioMatchesFormat", async () => {
    const load = vi.fn().mockResolvedValue(
      canonical({ ratioStatus: "not_required", masterStoragePath: null }),
    );
    const r1 = await adoptDurableCanonicalAsset("it_1", { load });
    expect(r1.status).toBe("incomplete");
    if (r1.status === "incomplete") expect(r1.reason).toBe("ratio-mismatch");

    const load2 = vi.fn().mockResolvedValue(
      canonical({ ratioStatus: "not_required", masterStoragePath: null }),
    );
    const r2 = await adoptDurableCanonicalAsset("it_1", {
      load: load2,
      ratioMatchesFormat: true,
      resolvePublicUrl: (p) => `https://cdn/${p}`,
    });
    expect(r2.status).toBe("adopted");
    if (r2.status === "adopted") {
      expect(r2.asset.isCorrectedMaster).toBe(false);
      expect(r2.asset.storagePath).toBe("gen/src.png");
    }
  });

  it("pending/processing ratio → retryable not-terminal", async () => {
    for (const rat of ["pending", "processing"] as const) {
      const load = vi.fn().mockResolvedValue(canonical({ ratioStatus: rat }));
      const r = await adoptDurableCanonicalAsset("it_1", { load });
      expect(r.status).toBe("incomplete");
      if (r.status === "incomplete") {
        expect(r.reason).toBe("not-terminal");
        expect(r.retryable).toBe(true);
      }
    }
  });

  it("failed ratio → non-retryable not-terminal", async () => {
    const load = vi.fn().mockResolvedValue(canonical({ ratioStatus: "failed" }));
    const r = await adoptDurableCanonicalAsset("it_1", { load });
    expect(r.status).toBe("incomplete");
    if (r.status === "incomplete") {
      expect(r.reason).toBe("not-terminal");
      expect(r.retryable).toBe(false);
    }
  });
});

describe("adoptWithBoundedRetry", () => {
  it("stops immediately on non-retryable failure", async () => {
    const load = vi.fn().mockResolvedValue({
      ...canonical({ itemStatus: "failed" }),
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const r = await adoptWithBoundedRetry("it_1", { load, sleep, attempts: 3 });
    expect(r.status).toBe("incomplete");
    expect(load).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries transient incompleteness up to bound", async () => {
    let call = 0;
    const load = vi.fn().mockImplementation(async () => {
      call++;
      if (call < 3) return canonical({ masterWidth: null });
      return canonical();
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const r = await adoptWithBoundedRetry("it_1", {
      load,
      sleep,
      resolvePublicUrl: (p) => `https://cdn/${p}`,
      attempts: 3,
    });
    expect(r.status).toBe("adopted");
    expect(load).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("returns final retryable failure after exhausting attempts", async () => {
    const load = vi.fn().mockResolvedValue(canonical({ masterWidth: null }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const r = await adoptWithBoundedRetry("it_1", { load, sleep, attempts: 2 });
    expect(r.status).toBe("incomplete");
    expect(load).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
