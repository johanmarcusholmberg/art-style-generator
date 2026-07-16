/**
 * batch-generate — orchestrates a generation_jobs run by fanning out
 * per-item work to the shared `generate-single` worker.
 *
 * The heavy lifting (provider dispatch, lease, heartbeats, durable upload,
 * complete/fail RPC) lives in `generate-single`. This function stays as a
 * thin orchestrator so batch and single-image generations share a single
 * code path and cannot diverge.
 *
 * Behavior:
 *   - Bounces on cancelled/completed jobs.
 *   - Marks the job as processing (idempotent).
 *   - Enumerates queued items and invokes generate-single with concurrency.
 *   - The aggregate trigger on generation_job_items keeps the parent job
 *     counters/status in sync — we do not double-write them here.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONCURRENCY_FAST = 5;
const CONCURRENCY_QUALITY = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobId } = await req.json();
    if (!jobId) return json(400, { error: "Missing jobId" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: job } = await supabase
      .from("generation_jobs")
      .select("id,status,speed_mode")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return json(404, { error: "Job not found" });
    if (job.status === "cancelled" || job.status === "completed") {
      return json(200, { status: job.status });
    }

    await supabase
      .from("generation_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", ["queued", "processing"]);

    const { data: items } = await supabase
      .from("generation_job_items")
      .select("id")
      .eq("job_id", jobId)
      .eq("status", "queued")
      .order("position", { ascending: true });

    if (!items || items.length === 0) {
      return json(200, { status: "no_queued_items" });
    }

    const concurrency = job.speed_mode === "fast" ? CONCURRENCY_FAST : CONCURRENCY_QUALITY;
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    let idx = 0;

    async function worker() {
      while (idx < items.length) {
        const current = items[idx++];
        // Bail early if job cancelled between items.
        const { data: j } = await supabase
          .from("generation_jobs")
          .select("status")
          .eq("id", jobId)
          .maybeSingle();
        if (j?.status === "cancelled") return;

        try {
          const { error } = await supabase.functions.invoke("generate-single", {
            body: { itemId: current.id },
          });
          if (error) throw new Error(error.message ?? String(error));
          results.push({ id: current.id, ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          results.push({ id: current.id, ok: false, error: msg });
          console.error(`[batch-generate] item=${current.id} error=${msg}`);
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));

    return json(200, { status: "dispatched", total: items.length, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("batch-generate error:", msg);
    return json(500, { error: msg });
  }
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
