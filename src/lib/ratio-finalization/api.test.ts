import { describe, expect, it } from "vitest";
import {
  claimRatioFinalization,
  completeRatioFinalization,
  failRatioFinalization,
  retryRatioFinalization,
  RatioFinalizationApiError,
} from "./api";

// Minimal shim that satisfies the tiny surface `api.ts` uses.
function makeClient(behavior: {
  claim?: () => { data: unknown; error: { message: string } | null };
  complete?: () => { data: unknown; error: { message: string } | null };
  fail?: () => { data: unknown; error: { message: string } | null };
  retry?: () => { data: unknown; error: { message: string } | null };
}) {
  return {
    rpc: async (name: string) => {
      switch (name) {
        case "claim_generation_ratio_finalization":
          return behavior.claim?.() ?? { data: null, error: null };
        case "complete_generation_ratio_finalization":
          return behavior.complete?.() ?? { data: true, error: null };
        case "fail_generation_ratio_finalization":
          return behavior.fail?.() ?? { data: true, error: null };
        case "retry_generation_ratio_finalization":
          return behavior.retry?.() ?? { data: true, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const goodClaim = {
  item_id: "itm-1", claim_token: "tok-1", gallery_image_id: "gal-1",
  source_storage_path: "generated/gal-1.png", source_image_url: "https://x/gal-1.png",
  source_width: 1094, source_height: 1606,
  poster_format_id: "print_50x70", target_aspect_ratio: "5:7",
  correction_policy: "pad", attempts: 1,
};

describe("claimRatioFinalization", () => {
  it("validates and normalizes a good response", async () => {
    const c = makeClient({ claim: () => ({ data: [goodClaim], error: null }) });
    const r = await claimRatioFinalization("itm-1", { client: c });
    expect(r.itemId).toBe("itm-1");
    expect(r.correctionPolicy).toBe("pad");
    expect(r.sourceStoragePath).toBe("generated/gal-1.png");
  });

  it("classifies not_claimable rpc error", async () => {
    const c = makeClient({ claim: () => ({ data: null, error: { message: "ERROR: not_claimable" } }) });
    await expect(claimRatioFinalization("itm-1", { client: c }))
      .rejects.toMatchObject({ code: "not_claimable" });
  });

  it("classifies forbidden_or_missing", async () => {
    const c = makeClient({ claim: () => ({ data: null, error: { message: "ERROR: forbidden_or_missing" } }) });
    await expect(claimRatioFinalization("itm-1", { client: c }))
      .rejects.toMatchObject({ code: "forbidden_or_missing" });
  });

  it("rejects response missing both source path AND url", async () => {
    const c = makeClient({
      claim: () => ({
        data: [{ ...goodClaim, source_storage_path: null, source_image_url: null }],
        error: null,
      }),
    });
    await expect(claimRatioFinalization("itm-1", { client: c }))
      .rejects.toMatchObject({ code: "no_usable_source" });
  });

  it("accepts response with only URL fallback", async () => {
    const c = makeClient({
      claim: () => ({
        data: [{ ...goodClaim, source_storage_path: null }],
        error: null,
      }),
    });
    const r = await claimRatioFinalization("itm-1", { client: c });
    expect(r.sourceStoragePath).toBeNull();
    expect(r.sourceImageUrl).toBe("https://x/gal-1.png");
  });

  it("tolerates nullable stored dimensions", async () => {
    const c = makeClient({
      claim: () => ({
        data: [{ ...goodClaim, source_width: null, source_height: null }],
        error: null,
      }),
    });
    const r = await claimRatioFinalization("itm-1", { client: c });
    expect(r.sourceWidth).toBeNull();
    expect(r.sourceHeight).toBeNull();
  });

  it("throws unknown_rpc_error on empty result", async () => {
    const c = makeClient({ claim: () => ({ data: [], error: null }) });
    await expect(claimRatioFinalization("itm-1", { client: c }))
      .rejects.toMatchObject({ code: "not_claimable" });
  });
});

describe("completeRatioFinalization", () => {
  const base = {
    itemId: "itm-1", claimToken: "tok-1",
    finalStoragePath: "ratio-finalized/gal-1/print_50x70/v1/itm-1.png",
    finalImageUrl: "https://x/ratio.png",
    finalWidth: 1148, finalHeight: 1607, operation: "pad" as const,
    metadata: { algorithmVersion: "v1" },
  };
  it("returns true on success", async () => {
    const c = makeClient({ complete: () => ({ data: true, error: null }) });
    await expect(completeRatioFinalization(base, { client: c })).resolves.toBe(true);
  });
  it("classifies invalid_claim (wrong/expired token)", async () => {
    const c = makeClient({ complete: () => ({ data: null, error: { message: "ERROR: invalid_claim" } }) });
    await expect(completeRatioFinalization(base, { client: c }))
      .rejects.toMatchObject({ code: "invalid_claim" });
  });
  it("classifies idempotent_replay_conflict", async () => {
    const c = makeClient({ complete: () => ({ data: null, error: { message: "ERROR: idempotent_replay_conflict" } }) });
    await expect(completeRatioFinalization(base, { client: c }))
      .rejects.toMatchObject({ code: "idempotent_replay_conflict" });
  });
  it("throws on unexpected non-true response", async () => {
    const c = makeClient({ complete: () => ({ data: false, error: null }) });
    await expect(completeRatioFinalization(base, { client: c }))
      .rejects.toMatchObject({ code: "unknown_rpc_error" });
  });
});

describe("failRatioFinalization + retryRatioFinalization", () => {
  it("failRatio returns boolean", async () => {
    const c = makeClient({ fail: () => ({ data: true, error: null }) });
    await expect(failRatioFinalization(
      { itemId: "itm-1", claimToken: "tok-1", error: "boom" }, { client: c })).resolves.toBe(true);
  });
  it("retryRatio returns boolean", async () => {
    const c = makeClient({ retry: () => ({ data: true, error: null }) });
    await expect(retryRatioFinalization("itm-1", { client: c })).resolves.toBe(true);
  });
  it("unexpected DB error surfaces as unknown_rpc_error, not silently swallowed", async () => {
    const c = makeClient({ retry: () => ({ data: null, error: { message: "database is on fire" } }) });
    await expect(retryRatioFinalization("itm-1", { client: c }))
      .rejects.toMatchObject({ code: "unknown_rpc_error" });
  });
});

describe("RatioFinalizationApiError distinguishes categories", () => {
  it("preserves cause payload", () => {
    const err = new RatioFinalizationApiError("invalid_claim", "invalid_claim", { message: "x" });
    expect(err.code).toBe("invalid_claim");
    expect(err.cause).toEqual({ message: "x" });
  });
});
