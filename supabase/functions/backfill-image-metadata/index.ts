/**
 * One-time canonical metadata backfill.
 *
 * Repairs legacy `generated_images` rows (and their canonical/original
 * `generated_image_assets` version) so every row carries:
 *   - real pixel dimensions measured from the persisted master bytes
 *   - a print_format_id (inferred from those pixels when missing)
 *   - the canonical aspect_ratio derived from print_format_id
 *
 * Admin-only. Runs in pages so it can be invoked repeatedly until
 * `has_more` is false; it is fully idempotent (a canonical row is a no-op).
 *
 * POST { dry_run?: boolean, limit?: number, cursor?: string }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decodeImageDimensions } from "../_shared/image-dimensions.ts";
import {
  planRowBackfill,
  planIsNoop,
  type BackfillRow,
} from "../_shared/metadata-backfill-plan.ts";
import {
  runBackfillPreflight,
  describePreflightFailure,
} from "../_shared/backfill-preflight.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_LIMIT = 200;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("id, status")
    .eq("auth_user_id", userRes.user.id)
    .maybeSingle();
  if (!profile || profile.status !== "active") return json({ error: "Not authorized" }, 403);
  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return json({ error: "Admin role required" }, 403);

  let body: { dry_run?: boolean; limit?: number; cursor?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }
  const dryRun = body.dry_run !== false; // default: dry run
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), MAX_LIMIT);

  let query = admin
    .from("generated_images")
    .select(
      "id, actual_width_px, actual_height_px, print_format_id, aspect_ratio, storage_path, master_storage_path, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (body.cursor) query = query.gt("created_at", body.cursor);

  const { data: rows, error: rowsErr } = await query;
  if (rowsErr) return json({ error: `scan failed: ${rowsErr.message}` }, 500);

  const summary = {
    dry_run: dryRun,
    scanned: 0,
    already_canonical: 0,
    measured: 0,
    images_updated: 0,
    assets_updated: 0,
    unresolved: [] as { id: string; reason: string }[],
    errors: [] as { id: string; error: string }[],
    next_cursor: null as string | null,
    has_more: (rows?.length ?? 0) === limit,
  };

  for (const raw of rows ?? []) {
    const row = raw as BackfillRow & { created_at: string };
    summary.scanned++;
    summary.next_cursor = row.created_at;

    try {
      const { data: asset } = await admin
        .from("generated_image_assets")
        .select("id, width_px, height_px, storage_path")
        .eq("generated_image_id", row.id)
        .eq("asset_type", "original")
        .eq("version_index", 0)
        .is("deleted_at", null)
        .maybeSingle();

      let plan = planRowBackfill(row, asset ?? null, null);

      if (plan.needsMeasurement && plan.measureStoragePath) {
        const { data: file, error: dlErr } = await admin.storage
          .from("generated-images")
          .download(plan.measureStoragePath);
        if (dlErr || !file) throw new Error(`download failed: ${dlErr?.message ?? "no file"}`);
        const decoded = decodeImageDimensions(new Uint8Array(await file.arrayBuffer()));
        if (!decoded) throw new Error("undecodable_image_bytes");
        summary.measured++;
        plan = planRowBackfill(row, asset ?? null, {
          width: decoded.width,
          height: decoded.height,
        });
      }

      if (plan.unresolved) {
        summary.unresolved.push({ id: row.id, reason: plan.unresolved });
      }
      if (planIsNoop(plan)) {
        summary.already_canonical++;
        continue;
      }

      if (!dryRun) {
        if (Object.keys(plan.imagePatch).length > 0) {
          const { error } = await admin
            .from("generated_images")
            .update(plan.imagePatch)
            .eq("id", row.id);
          if (error) throw new Error(`image update: ${error.message}`);
        }
        if (asset && Object.keys(plan.assetPatch).length > 0) {
          const { error } = await admin
            .from("generated_image_assets")
            .update(plan.assetPatch)
            .eq("id", asset.id);
          if (error) throw new Error(`asset update: ${error.message}`);
        }
      }
      if (Object.keys(plan.imagePatch).length > 0) summary.images_updated++;
      if (asset && Object.keys(plan.assetPatch).length > 0) summary.assets_updated++;
    } catch (e) {
      summary.errors.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json(summary);
});
