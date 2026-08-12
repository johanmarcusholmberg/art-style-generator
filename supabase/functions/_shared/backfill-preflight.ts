/**
 * Preflight for the canonical metadata backfill.
 *
 * Before any planning or writing happens, we verify:
 *   - database connectivity (a trivial read against `generated_images`)
 *   - read access to `generated_image_assets`
 *   - storage access to the `generated-images` bucket
 *   - write permission (only when the run will actually write)
 *
 * The check runner is injected so the logic is pure and testable.
 */

export type PreflightCheckId =
  | "db_connectivity"
  | "read_generated_images"
  | "read_generated_image_assets"
  | "storage_generated_images"
  | "write_generated_images";

export interface PreflightCheck {
  id: PreflightCheckId;
  label: string;
  ok: boolean;
  required: boolean;
  error?: string;
}

export interface PreflightReport {
  ok: boolean;
  dry_run: boolean;
  checks: PreflightCheck[];
  failed: PreflightCheckId[];
}

export function summarizePreflight(checks: PreflightCheck[], dryRun: boolean): PreflightReport {
  const failed = checks.filter((c) => c.required && !c.ok).map((c) => c.id);
  return { ok: failed.length === 0, dry_run: dryRun, checks, failed };
}

export function describePreflightFailure(report: PreflightReport): string {
  const problems = report.checks
    .filter((c) => c.required && !c.ok)
    .map((c) => `${c.label}: ${c.error ?? "failed"}`);
  return `Preflight failed — ${problems.join("; ")}`;
}

type MinimalClient = {
  from: (table: string) => {
    select: (cols: string, opts?: unknown) => {
      limit: (n: number) => Promise<{ error: { message: string } | null }>;
    };
  };
  storage: {
    from: (bucket: string) => {
      list: (
        prefix?: string,
        opts?: { limit?: number },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  rpc?: unknown;
};

async function attempt(fn: () => Promise<{ error: { message: string } | null }>) {
  try {
    const { error } = await fn();
    return { ok: !error, error: error?.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Runs the live preflight against Supabase. `canWrite` should be true only for
 * apply runs; we probe write permission with a no-op update guarded by an
 * impossible filter so nothing is mutated.
 */
export async function runBackfillPreflight(
  client: MinimalClient,
  opts: { dryRun: boolean },
): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];

  const dbRead = await attempt(() =>
    client.from("generated_images").select("id").limit(1),
  );
  checks.push({
    id: "db_connectivity",
    label: "Database reachable",
    required: true,
    ok: dbRead.ok,
    error: dbRead.error,
  });
  checks.push({
    id: "read_generated_images",
    label: "Read access to generated_images",
    required: true,
    ok: dbRead.ok,
    error: dbRead.error,
  });

  const assetRead = await attempt(() =>
    client.from("generated_image_assets").select("id").limit(1),
  );
  checks.push({
    id: "read_generated_image_assets",
    label: "Read access to generated_image_assets",
    required: true,
    ok: assetRead.ok,
    error: assetRead.error,
  });

  const storage = await attempt(() =>
    client.storage.from("generated-images").list(undefined, { limit: 1 }),
  );
  checks.push({
    id: "storage_generated_images",
    label: "Storage access to generated-images bucket",
    required: true,
    ok: storage.ok,
    error: storage.error,
  });

  if (!opts.dryRun) {
    const c = client as unknown as {
      from: (t: string) => {
        update: (p: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const write = await attempt(() =>
      // Impossible filter: permission is evaluated, no row is touched.
      c.from("generated_images").update({ aspect_ratio: null }).eq(
        "id",
        "00000000-0000-0000-0000-000000000000",
      ),
    );
    checks.push({
      id: "write_generated_images",
      label: "Write access to generated_images",
      required: true,
      ok: write.ok,
      error: write.error,
    });
  }

  return summarizePreflight(checks, opts.dryRun);
}
