/**
 * generate-single-item-retry — authenticated user-triggered retry.
 *
 * Requires the caller to own the job. Resets a failed item back to queued
 * (only if failed) and re-invokes `generate-single`.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json(401, { error: "Unauthorized" });

    const { itemId } = await req.json();
    if (!itemId) return json(400, { error: "Missing itemId" });

    // Ownership check via RLS-safe SELECT.
    const { data: item, error: selErr } = await supabase
      .from("generation_job_items")
      .select("id,status")
      .eq("id", itemId)
      .maybeSingle();
    if (selErr || !item) return json(404, { error: "Item not found or forbidden" });
    if (item.status !== "failed") return json(409, { error: `Item is ${item.status}, cannot retry` });

    // Reset failed → queued, clear lease, keep attempt_count so exhaustion still applies.
    // Guard against races: only the row that is STILL 'failed' is affected. We
    // ask for the count back so we can refuse to dispatch when nothing was
    // updated (e.g. a concurrent state change moved it to 'processing').
    const { error: updErr, count } = await service
      .from("generation_job_items")
      .update({
        status: "queued",
        error_message: null,
        lease_token: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      }, { count: "exact" })
      .eq("id", itemId)
      .eq("status", "failed");

    if (updErr) return json(500, { error: `Requeue failed: ${updErr.message}` });
    if (!count || count === 0) {
      return json(409, { error: "Item is no longer failed; not dispatched." });
    }

    // Fire generate-single (fire-and-forget — realtime updates the UI).
    service.functions.invoke("generate-single", { body: { itemId } }).catch(() => {});

    return json(200, { status: "requeued", itemId });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
