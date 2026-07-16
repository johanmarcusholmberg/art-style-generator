/**
 * recover-stale-jobs — cron-invoked recovery worker.
 *
 * Auth: validates a dedicated Vault-backed shared secret via
 * `x-recovery-secret` header. Never uses anon or service-role from
 * the caller. Do NOT wire the anon key into cron SQL for this
 * endpoint — the pg_net cron job must send this secret.
 *
 * Behavior:
 *   1. Marks items whose attempt_count is exhausted as terminal.
 *   2. Finds recoverable items (queued or with expired lease, under
 *      the retry cap).
 *   3. For each, invokes generate-single(itemId).
 *
 * The claim RPC itself is atomic and respects unexpired leases, so
 * concurrent invocations cannot double-process a healthy item.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-recovery-secret",
};

const MAX_ITEMS_PER_RUN = 20;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Read the shared secret from Vault via a SECURITY DEFINER RPC.
  // No env var, no anon/service key embedded in cron SQL — cron simply
  // reads the same Vault entry and passes it via x-recovery-secret.
  const { data: expected, error: secretErr } = await supabase.rpc("get_recovery_job_secret");
  if (secretErr || !expected) {
    console.error("[recover-stale-jobs] failed to load vault secret", secretErr);
    return json(500, { error: "Recovery secret unavailable" });
  }
  const provided = req.headers.get("x-recovery-secret");
  if (!provided || provided !== expected) return json(401, { error: "Unauthorized" });


  try {
    // 1) Expire retry-exhausted items to terminal state.
    const { data: expired } = await supabase.rpc("expire_exhausted_items");

    // 2) Find recoverable items via SECURITY DEFINER RPC.
    const { data: recoverable, error: findErr } = await supabase.rpc("find_recoverable_items", {
      p_max: MAX_ITEMS_PER_RUN,
    });
    if (findErr) throw new Error(findErr.message);

    const items = (recoverable ?? []) as Array<{ id: string }>;

    // 3) Kick off generate-single per item (best-effort, in parallel).
    const invocations = items.map((it) =>
      supabase.functions.invoke("generate-single", { body: { itemId: it.id } })
        .then(() => ({ id: it.id, ok: true }))
        .catch((e) => ({ id: it.id, ok: false, error: String(e) })),
    );
    const results = await Promise.all(invocations);

    return json(200, {
      expired: expired ?? 0,
      recovered: results.length,
      results,
    });
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
