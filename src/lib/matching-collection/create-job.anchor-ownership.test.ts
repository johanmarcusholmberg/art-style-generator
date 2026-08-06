/**
 * Regression coverage for the `create_matching_collection_atomic` anchor
 * ownership fix ("column gi.user_id does not exist").
 *
 * Two layers:
 *   1. Static assertions on the shipped migration SQL — the function must
 *      no longer reference `gi.user_id` or declare `v_anchor_owner`, and
 *      must validate the anchor with admin check + existence/not-deleted.
 *   2. Behavioural assertions on the client boundary — a valid anchor
 *      creates a collection, a missing anchor surfaces
 *      `anchor_image_not_found`, a non-admin caller surfaces `forbidden`,
 *      and no collection/job is created on a failed call.
 */

import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createMatchingCollectionJob } from "./create-job";
import type { FrozenCollectionSettings } from "./frozen-settings";
import type { ResolvedCollectionProvider } from "./types";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function latestFunctionMigrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS_DIR, files[i]), "utf8");
    if (sql.includes("FUNCTION public.create_matching_collection_atomic")) return sql;
  }
  throw new Error("no migration declaring create_matching_collection_atomic found");
}

describe("create_matching_collection_atomic migration SQL", () => {
  const sql = latestFunctionMigrationSql();

  it("contains no reference to gi.user_id", () => {
    expect(sql).not.toMatch(/gi\.user_id/);
  });

  it("removes the unused v_anchor_owner declaration", () => {
    expect(sql).not.toMatch(/v_anchor_owner/);
  });

  it("validates the anchor via admin check and existence/not-deleted", () => {
    expect(sql).toMatch(/IF NOT public\.is_current_user_admin\(\) THEN/);
    expect(sql).toMatch(/RAISE EXCEPTION 'forbidden'/);
    expect(sql).toMatch(/gi\.id = p_anchor_image_id[\s\S]*gi\.deleted_at IS NULL/);
    expect(sql).toMatch(/RAISE EXCEPTION 'anchor_image_not_found'/);
  });

  it("preserves SECURITY DEFINER, search_path and the authenticated grant", () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path TO 'public'/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_matching_collection_atomic\([\s\S]*?\) TO authenticated/,
    );
  });
});

const frozen: FrozenCollectionSettings = {
  anchorImageId: "11111111-1111-1111-1111-111111111111",
  anchorImageUrl: "https://example.test/anchor.png",
  anchorStoragePath: "anchor/a.png",
  anchorWidthPx: 1024,
  anchorHeightPx: 1434,
  styleKey: "vintage",
  posterFormatId: "poster-50x70",
  aspectRatio: "5:7",
  backgroundStyle: "white",
  anchorProvider: "gemini",
  anchorModel: "gemini-2.5-flash-image",
  resolvedProvider: "gemini",
  resolvedModel: "gemini-2.5-flash-image",
  providerPreference: "gemini",
  artDirection: null,
  artDirectionVersion: 1,
  consistencyStrength: "balanced",
  referenceStrength: "medium",
} as unknown as FrozenCollectionSettings;

const provider: ResolvedCollectionProvider = {
  provider: "gemini",
  model: "gemini-2.5-flash-image",
  providerPreference: "gemini",
  substituted: false,
  reason: null,
  estimatedCostPerImageUsd: 0.04,
} as unknown as ResolvedCollectionProvider;

function baseInput() {
  return {
    collectionName: "Coastal",
    frozen,
    provider,
    subjects: ["A harbor in Jávea"],
    fingerprint: "a".repeat(40),
  };
}

describe("createMatchingCollectionJob anchor validation behaviour", () => {
  it("creates a collection for a valid existing anchor", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ collection_id: "c1", job_id: "j1", item_ids: ["i1"], reused: false }],
      error: null,
    });
    const invoke = vi.fn().mockResolvedValue({ data: null, error: null });

    const result = await createMatchingCollectionJob(baseInput(), { rpc, invoke } as never);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.collectionId).toBe("c1");
    expect(result.jobId).toBe("j1");
    expect(result.reused).toBe(false);
    expect(result.dispatchedItemIds).toEqual(["i1"]);
  });

  it("surfaces anchor_image_not_found for a missing anchor and leaves nothing behind", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "anchor_image_not_found" } });
    const invoke = vi.fn();

    await expect(
      createMatchingCollectionJob(baseInput(), { rpc, invoke } as never),
    ).rejects.toThrow(/anchor_image_not_found/);

    // Atomic RPC failure ⇒ no collection, no job, no dispatch.
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects a non-admin caller", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "forbidden" } });
    const invoke = vi.fn();

    await expect(
      createMatchingCollectionJob(baseInput(), { rpc, invoke } as never),
    ).rejects.toThrow(/forbidden/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
