/**
 * Tests for the backfill preflight: connectivity + permission gating.
 */
import { describe, it, expect } from "vitest";
import {
  summarizePreflight,
  describePreflightFailure,
  runBackfillPreflight,
  type PreflightCheck,
} from "../../supabase/functions/_shared/backfill-preflight";

function client(overrides: {
  tableErrors?: Record<string, string>;
  storageError?: string;
  writeError?: string;
}) {
  const calls: string[] = [];
  const err = (m?: string) => (m ? { message: m } : null);
  return {
    calls,
    client: {
      from(table: string) {
        calls.push(`from:${table}`);
        return {
          select: () => ({
            limit: async () => ({ error: err(overrides.tableErrors?.[table]) }),
          }),
          update: () => ({
            eq: async () => {
              calls.push("write");
              return { error: err(overrides.writeError) };
            },
          }),
        };
      },
      storage: {
        from(bucket: string) {
          calls.push(`storage:${bucket}`);
          return { list: async () => ({ error: err(overrides.storageError) }) };
        },
      },
    } as never,
  };
}

describe("summarizePreflight", () => {
  it("passes when all required checks pass", () => {
    const checks: PreflightCheck[] = [
      { id: "db_connectivity", label: "db", ok: true, required: true },
    ];
    expect(summarizePreflight(checks, true).ok).toBe(true);
  });

  it("ignores optional failures but reports required ones", () => {
    const checks: PreflightCheck[] = [
      { id: "db_connectivity", label: "db", ok: true, required: true },
      { id: "storage_generated_images", label: "storage", ok: false, required: false },
      { id: "write_generated_images", label: "write", ok: false, required: true, error: "denied" },
    ];
    const report = summarizePreflight(checks, false);
    expect(report.ok).toBe(false);
    expect(report.failed).toEqual(["write_generated_images"]);
    expect(describePreflightFailure(report)).toContain("denied");
  });
});

describe("runBackfillPreflight", () => {
  it("checks db, assets and storage on a dry run and skips the write probe", async () => {
    const { client: c, calls } = client({});
    const report = await runBackfillPreflight(c, { dryRun: true });
    expect(report.ok).toBe(true);
    expect(calls).toContain("from:generated_images");
    expect(calls).toContain("from:generated_image_assets");
    expect(calls).toContain("storage:generated-images");
    expect(calls).not.toContain("write");
    expect(report.checks.some((x) => x.id === "write_generated_images")).toBe(false);
  });

  it("probes write permission on apply runs", async () => {
    const { client: c, calls } = client({});
    const report = await runBackfillPreflight(c, { dryRun: false });
    expect(calls).toContain("write");
    expect(report.ok).toBe(true);
  });

  it("fails when the database is unreachable", async () => {
    const { client: c } = client({ tableErrors: { generated_images: "connection refused" } });
    const report = await runBackfillPreflight(c, { dryRun: true });
    expect(report.ok).toBe(false);
    expect(report.failed).toContain("db_connectivity");
  });

  it("fails when storage access is denied", async () => {
    const { client: c } = client({ storageError: "permission denied" });
    const report = await runBackfillPreflight(c, { dryRun: true });
    expect(report.ok).toBe(false);
    expect(report.failed).toEqual(["storage_generated_images"]);
  });

  it("fails an apply run when writes are denied", async () => {
    const { client: c } = client({ writeError: "permission denied for table" });
    const report = await runBackfillPreflight(c, { dryRun: false });
    expect(report.ok).toBe(false);
    expect(report.failed).toContain("write_generated_images");
  });

  it("treats thrown errors as failed checks", async () => {
    const throwing = {
      from: () => ({
        select: () => ({
          limit: async () => {
            throw new Error("boom");
          },
        }),
      }),
      storage: { from: () => ({ list: async () => ({ error: null }) }) },
    } as never;
    const report = await runBackfillPreflight(throwing, { dryRun: true });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "db_connectivity")?.error).toBe("boom");
  });
});
