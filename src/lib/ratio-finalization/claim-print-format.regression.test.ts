/**
 * Regression coverage for the ratio-finalization claim bug:
 * `claim_generation_ratio_finalization` referenced
 * `gi.poster_format_id`, a column that does not exist on
 * `generated_images` (the real column is `print_format_id`).
 *
 * Two layers:
 *   1. Static assertions on the shipped migration SQL.
 *   2. Behavioural assertions on the typed API boundary: a pending item
 *      whose gallery row has `print_format_id = 'print_50x70'` claims
 *      successfully and hands the finalizer a usable poster format.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claimRatioFinalization, completeRatioFinalization } from "./api";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function latestClaimMigrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS_DIR, files[i]), "utf8");
    if (sql.includes("FUNCTION public.claim_generation_ratio_finalization")) return sql;
  }
  throw new Error("no migration declaring claim_generation_ratio_finalization found");
}

describe("claim_generation_ratio_finalization migration SQL", () => {
  const sql = latestClaimMigrationSql();

  it("never reads poster_format_id from generated_images", () => {
    expect(sql).not.toMatch(/gi\.poster_format_id/);
  });

  it("reads the real print_format_id column with payload fallback", () => {
    expect(sql).toMatch(
      /coalesce\(gi\.print_format_id,\s*upd\.request_payload\s*->>\s*'posterFormatId'\)/,
    );
  });

  it("still returns the RPC field named poster_format_id (contract preserved)", () => {
    expect(sql).toMatch(/poster_format_id text/);
  });

  it("preserves signature, security model and lease logic", () => {
    expect(sql).toMatch(/p_lease_seconds integer DEFAULT 600/);
    expect(sql).toMatch(/SECURITY DEFINER SET search_path = public/);
    expect(sql).toMatch(/ratio_finalization_lease_expires_at = v_now \+ make_interval/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/RAISE EXCEPTION 'not_claimable'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'forbidden_or_missing'/);
  });

  it("only selects columns that exist on generated_images", () => {
    const forbidden = ["gi.poster_format_id", "gi.user_id", "gi.image_url"];
    for (const ref of forbidden) {
      expect(sql.includes(ref)).toBe(false);
    }
  });
});

describe("pending Gemini item with print_format_id claims successfully", () => {
  // Mirrors the live row shape: pending item, gallery row carries
  // print_format_id = 'print_50x70', storage path only (no image_url).
  const claimRow = {
    item_id: "9d98d7fd-7279-4056-8074-10ea5264662c",
    claim_token: "b3e068e6-45de-477d-860b-64c6437b6fd3",
    gallery_image_id: "90e5614d-c38d-4907-b2cf-860bd14350c1",
    source_storage_path: "urbannoir-9d98d7fd.png",
    source_image_url: null,
    source_width: null,
    source_height: null,
    poster_format_id: "print_50x70",
    target_aspect_ratio: "5:7",
    correction_policy: "pad",
    attempts: 1,
  };

  function client(overrides: Record<string, unknown> = {}) {
    return {
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "claim_generation_ratio_finalization") {
          expect(args.p_item_id).toBe(claimRow.item_id);
          return { data: [claimRow], error: null };
        }
        if (name === "complete_generation_ratio_finalization") {
          Object.assign(overrides, { completeArgs: args });
          return { data: true, error: null };
        }
        throw new Error(`unexpected rpc ${name}`);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("returns print_50x70 as the poster format", async () => {
    const r = await claimRatioFinalization(claimRow.item_id, { client: client() });
    expect(r.posterFormatId).toBe("print_50x70");
    expect(r.targetAspectRatio).toBe("5:7");
    expect(r.correctionPolicy).toBe("pad");
  });

  it("hands the finalizer a usable source instead of failing on a missing column", async () => {
    const r = await claimRatioFinalization(claimRow.item_id, { client: client() });
    expect(r.sourceStoragePath).toBe("urbannoir-9d98d7fd.png");
    expect(r.claimToken).toBe(claimRow.claim_token);
  });

  it("completion carries the final canonical master dimensions and path", async () => {
    const captured: Record<string, unknown> = {};
    const c = client(captured);
    const claim = await claimRatioFinalization(claimRow.item_id, { client: c });
    await expect(
      completeRatioFinalization(
        {
          itemId: claim.itemId,
          claimToken: claim.claimToken,
          finalStoragePath: "ratio-finalized/90e5614d/print_50x70/v1/item.png",
          finalImageUrl: "https://x/final.png",
          finalWidth: 1148,
          finalHeight: 1607,
          operation: "pad",
          metadata: { algorithmVersion: "v1" },
        },
        { client: c },
      ),
    ).resolves.toBe(true);

    const args = captured.completeArgs as Record<string, unknown>;
    // The RPC updates generated_images master_width/master_height/
    // actual_width_px/actual_height_px/storage_path/master_storage_path
    // from exactly these arguments.
    expect(args.p_final_width).toBe(1148);
    expect(args.p_final_height).toBe(1607);
    expect(args.p_final_storage_path).toBe(
      "ratio-finalized/90e5614d/print_50x70/v1/item.png",
    );
    expect(args.p_operation).toBe("pad");
  });
});
