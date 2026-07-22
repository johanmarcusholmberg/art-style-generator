/**
 * Retry-audit tests for `generate-single-item-retry`.
 *
 * We don't spin up Deno here — we import the edge function's source as
 * text and assert the observable invariants:
 *   - Auth is required.
 *   - Ownership is checked via anon (RLS) SELECT.
 *   - Only failed items are accepted.
 *   - The update touches only retry-safe fields (never request_payload
 *     or attempt_count).
 *   - The service update's row-count is checked BEFORE dispatch, so a
 *     concurrent processing/completed transition cannot trigger a spurious
 *     `generate-single` invocation.
 *   - Exactly one retry function exists.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(
  resolve(__dirname, "../../supabase/functions/generate-single-item-retry/index.ts"),
  "utf8",
);

describe("generate-single-item-retry audit", () => {
  it("requires an Authorization: Bearer header", () => {
    expect(src).toMatch(/Bearer /);
    expect(src).toMatch(/401/);
  });

  it("checks ownership via RLS-scoped anon client (not service)", () => {
    // The RLS-safe SELECT must run through the user-scoped `supabase`
    // client, never the service client.
    expect(src).toMatch(/supabase\s*\n?\s*\.from\("generation_job_items"\)/);
  });

  it("rejects items whose status is not 'failed'", () => {
    expect(src).toMatch(/item\.status\s*!==\s*"failed"/);
    expect(src).toMatch(/409/);
  });

  it("does not mutate request_payload or attempt_count on retry", () => {
    // The update block sits between .update({ ... }) — grab just that.
    const m = src.match(/\.update\(\{[\s\S]*?\}/);
    expect(m).toBeTruthy();
    const updateBlock = m![0];
    expect(updateBlock).not.toMatch(/request_payload/);
    expect(updateBlock).not.toMatch(/attempt_count/);
    // The fields we DO touch: status, error_message, lease_token,
    // lease_expires_at, updated_at.
    for (const f of [
      "status",
      "error_message",
      "lease_token",
      "lease_expires_at",
      "updated_at",
    ]) {
      expect(updateBlock).toMatch(new RegExp(f));
    }
  });

  it("checks the update row-count before dispatching generate-single", () => {
    // Order matters: `count` guard must appear BEFORE the invoke call.
    const guardIdx = src.search(/if\s*\(!count\s*\|\|\s*count\s*===\s*0\)/);
    const invokeIdx = src.search(/functions\.invoke\("generate-single"/);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(invokeIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(invokeIdx);
  });

  it("surfaces service update errors instead of silently continuing", () => {
    expect(src).toMatch(/if\s*\(updErr\)/);
  });

  it("guards the reset with .eq('status','failed') so a processing/completed row cannot be reset", () => {
    expect(src).toMatch(/\.eq\("status",\s*"failed"\)/);
  });

  it("exactly one retry function exists in the functions dir", () => {
    const fnsDir = resolve(__dirname, "../../supabase/functions");
    const matches = readdirSync(fnsDir).filter((n) => /retry/i.test(n));
    expect(matches).toEqual(["generate-single-item-retry"]);
  });
});
