/**
 * generate-single — server-owned single-image (or single item within a
 * job) worker. Client creates the job via `create_generation_job` RPC,
 * then invokes this function with { itemId } to kick off dispatch.
 *
 * Contract:
 *   - Claims the item via `claim_generation_item` (atomic, lease-based).
 *   - Runs the resolved provider from `_shared/generators.ts`.
 *   - Heartbeats long provider calls.
 *   - Durably uploads the image before completion.
 *   - Calls `complete_generation_item` or `fail_generation_item` via RPC.
 *   - Never mutates generation_job_items directly — always through RPCs.
 *
 * Idempotency: repeated invocations for the same itemId are no-ops once
 * the item is terminal or already leased.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { runWithResolver, ProviderError, type GenerateArgs, type GeneratorPreference } from "../_shared/generators.ts";
import { persistGenerationResult, serviceClient } from "../_shared/persist-generation-result.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-recovery-secret",
};

const LEASE_SECONDS = 180;
const HEARTBEAT_MS = 45_000;

interface ItemPayload {
  styleKey: string;
  prompt: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  sourceImageUrl?: string | null;
  referenceStrength?: string;
  generationMode?: string;
  printFormatId?: string | null;
  posterFormatHint?: string;
  providerPreference?: GeneratorPreference;
  mode?: string;
  printSize?: string | null;
  qualityMode?: string;
  targetPpi?: number | null;
  targetWidthPx?: number | null;
  targetHeightPx?: number | null;
  providerLabel?: string | null;
  requestedWidth?: number;
  requestedHeight?: number;
  sizeIntent?: "preview" | "standard" | "print";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let itemId: string | null = null;
  let leaseToken: string | null = null;
  const supabase = serviceClient();
  let heartbeat: number | undefined;

  try {
    const body = await req.json().catch(() => null);
    itemId = body?.itemId ?? null;
    if (!itemId) return json(400, { error: "Missing itemId" });

    // Claim the item — atomic, respects existing valid leases.
    const { data: claimRows, error: claimErr } = await supabase.rpc("claim_generation_item", {
      p_item_id: itemId,
      p_lease_seconds: LEASE_SECONDS,
    });
    if (claimErr) throw new Error(`claim failed: ${claimErr.message}`);
    if (!claimRows || claimRows.length === 0) {
      // Already claimed, completed, or exhausted — not an error.
      return json(200, { status: "skipped", reason: "not_claimable" });
    }
    const claim = claimRows[0] as {
      id: string;
      lease_token: string;
      request_payload: ItemPayload;
      job_id: string;
      attempt_count: number;
      provider_label: string | null;
    };
    leaseToken = claim.lease_token;
    const payload = claim.request_payload ?? ({} as ItemPayload);

    // Heartbeat while provider runs.
    heartbeat = setInterval(async () => {
      try {
        await supabase.rpc("heartbeat_generation_item", {
          p_item_id: itemId!,
          p_lease_token: leaseToken!,
          p_lease_seconds: LEASE_SECONDS,
        });
      } catch (_) { /* transient */ }
    }, HEARTBEAT_MS) as unknown as number;

    // Run provider.
    const generateArgs: GenerateArgs = {
      userPrompt: payload.prompt,
      styleKey: payload.styleKey,
      aspectRatio: payload.aspectRatio,
      backgroundStyle: payload.backgroundStyle,
      isEdit: !!payload.sourceImageUrl,
      sourceImageUrl: payload.sourceImageUrl ?? undefined,
      printMode: payload.generationMode === "print-ready",
      posterFormatHint: payload.posterFormatHint,
      posterFormatId: payload.printFormatId ?? undefined,
      referenceStrength: payload.referenceStrength as GenerateArgs["referenceStrength"],
      requestedWidth: payload.requestedWidth,
      requestedHeight: payload.requestedHeight,
      sizeIntent: payload.sizeIntent,
    };

    const providerPref: GeneratorPreference = payload.providerPreference ?? "auto";
    const outcome = await runWithResolver(providerPref, generateArgs);

    // Durable upload BEFORE marking complete.
    const persisted = await persistGenerationResult(supabase, {
      imageUrl: outcome.imageUrl,
      prompt: payload.prompt,
      mode: payload.mode ?? payload.styleKey,
      aspectRatio: payload.aspectRatio ?? "5:7",
      printSize: payload.printSize ?? null,
      qualityMode: payload.qualityMode,
      targetPpi: payload.targetPpi,
      targetWidthPx: payload.targetWidthPx,
      targetHeightPx: payload.targetHeightPx,
      providerLabel: payload.providerLabel ?? claim.provider_label ?? null,
    });

    // Determine ratio enforcement status: if provider was adjusted vs
    // requested poster format, mark 'pending' so the client can finalize.
    const ratioStatus =
      outcome.providerAdjusted && payload.printFormatId ? "pending" : "not_required";

    if (heartbeat) clearInterval(heartbeat);

    const { data: completed, error: compErr } = await supabase.rpc("complete_generation_item", {
      p_item_id: itemId,
      p_lease_token: leaseToken,
      p_raw_image_url: persisted.publicUrl,
      p_enforced_image_url: ratioStatus === "not_required" ? persisted.publicUrl : null,
      p_ratio_status: ratioStatus,
      p_storage_path: persisted.storagePath,
      p_gallery_image_id: persisted.galleryImageId,
      p_result_metadata: {
        provider: outcome.providerId,
        model: outcome.modelId,
        fallbackUsed: outcome.fallbackUsed,
        strategy: outcome.strategy,
        attempted: outcome.attempted,
        width: outcome.width,
        height: outcome.height,
        requestedAspectRatio: outcome.requestedAspectRatio,
        providerExactMatch: outcome.providerExactMatch,
        providerAdjusted: outcome.providerAdjusted,
        bytes: persisted.bytes,
        attemptCount: claim.attempt_count,
      },
    });
    if (compErr) throw new Error(`complete rpc: ${compErr.message}`);
    if (!completed) {
      // Lease invalidated mid-flight (recovery took over). Best-effort cleanup:
      // storage row is orphaned but harmless — leave it for the housekeeper.
      return json(200, { status: "lease_lost", itemId });
    }

    return json(200, { status: "completed", itemId, galleryImageId: persisted.galleryImageId });
  } catch (err) {
    if (heartbeat) clearInterval(heartbeat);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[generate-single] itemId=${itemId} error=${msg}`);

    if (itemId && leaseToken) {
      // Attempt-count is bumped inside claim; terminal iff exhausted OR non-retryable.
      const nonRetryable =
        err instanceof ProviderError &&
        ["missing-key", "invalid-prompt", "unsupported"].includes(err.code);
      const terminal = nonRetryable;
      try {
        await supabase.rpc("fail_generation_item", {
          p_item_id: itemId,
          p_lease_token: leaseToken,
          p_error: msg.slice(0, 500),
          p_terminal: terminal,
        });
      } catch (_) { /* swallow */ }
    }
    return json(500, { error: msg });
  }
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
