/**
 * Integration tests for the atomic-RPC-based Matching Collection creation.
 *
 * Every test injects a fake `rpc` and `invoke` so the boundary contract
 * is exercised without a live Supabase instance.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createMatchingCollectionJob,
  fingerprintToJobIdempotencyKey,
} from "./create-job";
import { freezeCollectionSettings } from "./frozen-settings";
import type { ResolvedCollectionProvider } from "./types";

function frozen(overrides: Partial<Parameters<typeof freezeCollectionSettings>[0]> = {}) {
  return freezeCollectionSettings({
    anchorImageId: "img-1",
    anchorImageUrl: "https://example.com/a.png",
    anchorStoragePath: "u/a.png",
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
    ...overrides,
  });
}

const PROVIDER: ResolvedCollectionProvider = {
  providerPreference: "gemini",
  provider: "gemini",
  model: "gemini-2.5-flash-image",
  substituted: false,
  reason: null,
  estimatedCostPerImageUsd: 0.02,
};

const OPENAI_PROVIDER: ResolvedCollectionProvider = {
  providerPreference: "openai",
  provider: "openai",
  model: "gpt-image-2",
  substituted: false,
  reason: null,
  estimatedCostPerImageUsd: 0.04,
};

function okRpc(result: {
  collection_id?: string;
  job_id?: string;
  item_ids?: string[];
  reused?: boolean;
}) {
  return vi.fn().mockResolvedValue({
    data: [
      {
        collection_id: result.collection_id ?? "col-1",
        job_id: result.job_id ?? "job-1",
        item_ids: result.item_ids ?? ["it-1", "it-2"],
        reused: !!result.reused,
      },
    ],
    error: null,
  });
}

describe("createMatchingCollectionJob — atomic RPC", () => {
  it("calls the atomic RPC exactly once with fingerprint-driven idempotency", async () => {
    const rpc = okRpc({});
    const invoke = vi.fn().mockResolvedValue({});
    await createMatchingCollectionJob(
      {
        collectionName: "Coast",
        frozen: frozen(),
        provider: PROVIDER,
        subjects: ["A", "B"],
        fingerprint: "abc123def456",
      },
      { rpc: rpc as never, invoke: invoke as never },
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("create_matching_collection_atomic");
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_fingerprint).toBe("abc123def456");
    expect(args.p_job_idempotency_key).toBe(fingerprintToJobIdempotencyKey("abc123def456"));
    expect(args.p_anchor_aspect_ratio).toBe("5:7");
    expect(args.p_anchor_background_style).toBe("white");
    expect(args.p_anchor_poster_format_id).toBe("5x7");
    expect(args.p_resolved_provider).toBe("gemini");
    expect(args.p_resolved_model).toBe("gemini-2.5-flash-image");
  });

  it("passes items whose matchingCollectionId is a placeholder (RPC injects the real id)", async () => {
    const rpc = okRpc({});
    const invoke = vi.fn().mockResolvedValue({});
    await createMatchingCollectionJob(
      {
        collectionName: "X",
        frozen: frozen(),
        provider: PROVIDER,
        subjects: ["A"],
        fingerprint: "fp1",
      },
      { rpc: rpc as never, invoke: invoke as never },
    );
    const args = rpc.mock.calls[0][1] as { p_items: unknown[] };
    const [first] = args.p_items as Array<{ matchingCollectionId: string; kind: string; anchorImageUrl: string }>;
    expect(first.kind).toBe("matching_collection");
    expect(first.matchingCollectionId).toBe("");
    expect(first.anchorImageUrl).toBe("https://example.com/a.png");
  });

  it("dispatches every returned item exactly once when reused=false", async () => {
    const rpc = okRpc({ item_ids: ["it-a", "it-b", "it-c"], reused: false });
    const invoke = vi.fn().mockResolvedValue({});
    const result = await createMatchingCollectionJob(
      {
        collectionName: "X",
        frozen: frozen(),
        provider: PROVIDER,
        subjects: ["A", "B", "C"],
        fingerprint: "fp2",
      },
      { rpc: rpc as never, invoke: invoke as never },
    );
    expect(result.reused).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(result.dispatchedItemIds).toEqual(["it-a", "it-b", "it-c"]);
  });

  it("when reused=true, only dispatches items still in status='queued'", async () => {
    const rpc = okRpc({ item_ids: ["it-a", "it-b", "it-c"], reused: true });
    const invoke = vi.fn().mockResolvedValue({});
    const result = await createMatchingCollectionJob(
      {
        collectionName: "X",
        frozen: frozen(),
        provider: PROVIDER,
        subjects: ["A", "B", "C"],
        fingerprint: "fp3",
      },
      {
        rpc: rpc as never,
        invoke: invoke as never,
        fetchItemStatuses: async () => [
          { id: "it-a", status: "completed" },
          { id: "it-b", status: "queued" },
          { id: "it-c", status: "processing" },
        ],
      },
    );
    expect(result.reused).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.dispatchedItemIds).toEqual(["it-b"]);
  });

  it("rejects OpenAI durable submissions BEFORE calling the RPC", async () => {
    const rpc = vi.fn();
    const invoke = vi.fn();
    await expect(
      createMatchingCollectionJob(
        {
          collectionName: "X",
          frozen: frozen({ providerPreference: "openai", resolvedProvider: "openai", resolvedModel: "gpt-image-2" }),
          provider: OPENAI_PROVIDER,
          subjects: ["A"],
          fingerprint: "fp4",
        },
        { rpc: rpc as never, invoke: invoke as never },
      ),
    ).rejects.toThrow(/OpenAI/i);
    expect(rpc).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("isolates per-item invoke failures — job still reports created", async () => {
    const rpc = okRpc({ item_ids: ["ok-1", "bad", "ok-2"], reused: false });
    const invoke = vi.fn(async (_fn: string, opts: { body: { itemId: string } }) => {
      if (opts.body.itemId === "bad") throw new Error("network");
      return {};
    });
    const result = await createMatchingCollectionJob(
      {
        collectionName: "X",
        frozen: frozen(),
        provider: PROVIDER,
        subjects: ["A", "B", "C"],
        fingerprint: "fp5",
      },
      { rpc: rpc as never, invoke: invoke as never },
    );
    expect(result.itemIds).toEqual(["ok-1", "bad", "ok-2"]);
    expect(result.dispatchedItemIds).toEqual(["ok-1", "ok-2"]);
    expect(result.dispatchFailures.map((f) => f.itemId)).toEqual(["bad"]);
  });

  it("preserves frozen size/format/background across the RPC call", async () => {
    const rpc = okRpc({});
    const invoke = vi.fn().mockResolvedValue({});
    await createMatchingCollectionJob(
      {
        collectionName: "A3 test",
        frozen: frozen({ posterFormatId: "a3", aspectRatio: "297:420", backgroundStyle: "cream" }),
        provider: PROVIDER,
        subjects: ["A"],
        fingerprint: "fp6",
      },
      { rpc: rpc as never, invoke: invoke as never },
    );
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_anchor_poster_format_id).toBe("a3");
    expect(args.p_anchor_aspect_ratio).toBe("297:420");
    expect(args.p_anchor_background_style).toBe("cream");
  });

  it("throws when the RPC returns an error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "invalid_item_count: expected 1..20, got 0" } });
    const invoke = vi.fn();
    await expect(
      createMatchingCollectionJob(
        {
          collectionName: "X",
          frozen: frozen(),
          provider: PROVIDER,
          subjects: [],
          fingerprint: "fp7",
        },
        { rpc: rpc as never, invoke: invoke as never },
      ),
    ).rejects.toThrow(/invalid_item_count/);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("createRegeneratedItem — data-layer lineage", () => {
  it("writes regenerated_from_item_id and does not mutate the source request", async () => {
    const { createRegeneratedItem } = await import("./regeneration-repo");
    const original = {
      version: 2,
      styleKey: "mediterranean-heritage",
      prompt: "orig",
      subject: "seville tiles",
      sourceImageUrl: "https://example.com/anchor.png",
      sourceImageId: "anchor-1",
      aspectRatio: "5:7",
      backgroundStyle: "white",
      providerPreference: "gemini",
      generationMode: "standard",
      strictness: "loose",
      qualityProfile: "default",
      strategy: "standard",
      sizeIntent: "screen",
      referenceStrength: "balanced",
    } as unknown as import("@/lib/generation-contract-v2").GenerationRequestV2;
    const snapshot = JSON.parse(JSON.stringify(original));

    const insert = vi.fn().mockResolvedValue({ id: "new-item-1" });
    const result = await createRegeneratedItem(
      {
        sourceItemId: "old-item-1",
        sourceJobId: "job-1",
        sourcePosition: 3,
        sourcePromptVariant: "orig",
        originalRequest: original,
        completedOutputUrl: "https://cdn/output.png",
        completedOutputId: "out-1",
      },
      { insert },
    );

    expect(original).toEqual(snapshot);
    expect(result.newItemId).toBe("new-item-1");
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.regenerated_from_item_id).toBe("old-item-1");
    expect(row.job_id).toBe("job-1");
    expect(row.status).toBe("queued");
    expect(row.gallery_image_id).toBeUndefined();
    expect(row.result_metadata).toBeUndefined();
    expect(row.lease_token).toBeUndefined();
  });

  it("refuses to use the completed member's output as the new reference", async () => {
    const { createRegeneratedItem } = await import("./regeneration-repo");
    const original = {
      version: 2,
      styleKey: "x",
      prompt: "p",
      subject: "s",
      sourceImageUrl: "https://cdn/output.png",
      sourceImageId: null,
      aspectRatio: "5:7",
      backgroundStyle: "white",
      providerPreference: "gemini",
      generationMode: "standard",
      strictness: "loose",
      qualityProfile: "default",
      strategy: "standard",
      sizeIntent: "screen",
      referenceStrength: "balanced",
    } as unknown as import("@/lib/generation-contract-v2").GenerationRequestV2;
    const insert = vi.fn();
    await expect(
      createRegeneratedItem(
        {
          sourceItemId: "old",
          sourceJobId: "j",
          sourcePosition: 0,
          sourcePromptVariant: "p",
          originalRequest: original,
          completedOutputUrl: "https://cdn/output.png",
        },
        { insert },
      ),
    ).rejects.toThrow(/reference/i);
    expect(insert).not.toHaveBeenCalled();
  });
});
