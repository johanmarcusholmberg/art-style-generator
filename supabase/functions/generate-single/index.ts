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
import {
  buildDurableResultMetadata,
  executionRouteForProvider,
} from "../_shared/durable-result-metadata.ts";
import { normalizeLegacyGenerationRequest, type GenerationRequestV2 } from "../_shared/generation-contract-v2.ts";
import { reasonToRejectDurable } from "../_shared/executable-providers.ts";

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
  // Matching-collection additions. When kind === "matching_collection",
  // anchorImageUrl is the ONE canonical reference — mapped into
  // GenerateArgs.sourceImageUrl at execution. Collection members NEVER
  // read another member's output as a reference.
  kind?: string;
  anchorImageUrl?: string | null;
  anchorImageId?: string | null;
  matchingCollectionId?: string | null;
  subject?: string | null;
  rawSubject?: string | null;
  artDirection?: unknown;
  artDirectionVersion?: number | null;
  consistencyStrength?: string | null;
}

/**
 * Normalize the reference image URL for the provider. For matching-collection
 * items the canonical reference is the anchor URL; every other flow already
 * uses `sourceImageUrl`. We always prefer the anchor when both are present so
 * a collection member cannot silently regress to a chained reference.
 */
function resolveReferenceImageUrl(req: GenerationRequestV2): string | null {
  if (req.kind === "matching_collection") return req.matching?.anchorImageUrl ?? null;
  return req.sourceImageUrl ?? req.matching?.anchorImageUrl ?? null;
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
    // Normalize whatever the row was created with into the V2 contract.
    // Older rows (pre-Turn 1) still flow through cleanly; new rows carry
    // `version: 2` and skip the coercion.
    const req: GenerationRequestV2 = normalizeLegacyGenerationRequest(claim.request_payload ?? {});

    // Enforce provider executability at the last mile. The client is
    // expected to have gated this via `checkDurableExecutability`; a
    // failure here means either a bug in the client or a job created
    // before the gate landed. Fail terminally with a clear message.
    const rejectReason = reasonToRejectDurable(req.providerPreference);
    if (rejectReason) {
      throw new ProviderError("unsupported", rejectReason);
    }

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
    const referenceUrl = resolveReferenceImageUrl(req);
    const generateArgs: GenerateArgs = {
      userPrompt: req.prompt,
      styleKey: req.styleKey,
      aspectRatio: req.aspectRatio,
      backgroundStyle: req.backgroundStyle,
      isEdit: !!referenceUrl,
      sourceImageUrl: referenceUrl ?? undefined,
      printMode: req.generationMode === "print-ready",
      posterFormatHint: req.posterFormatHint ?? undefined,
      posterFormatId: req.printFormatId ?? undefined,
      referenceStrength: req.referenceStrength as GenerateArgs["referenceStrength"],
      requestedWidth: req.requestedWidth ?? undefined,
      requestedHeight: req.requestedHeight ?? undefined,
      sizeIntent: req.sizeIntent,
      strictness: (req.strictness as GenerateArgs["strictness"]) ?? undefined,
    };

    const providerPref: GeneratorPreference = req.providerPreference;
    const outcome = await runWithResolver(providerPref, generateArgs);

    const executionRoute = executionRouteForProvider(outcome.providerId);

    // Resolve the owning profile so we can attribute prompt-history correctly.
    // Best-effort — a lookup failure downgrades to skipping history only.
    let profileId: string | null = null;
    try {
      const { data: job } = await supabase
        .from("generation_jobs")
        .select("profile_id")
        .eq("id", claim.job_id)
        .maybeSingle();
      profileId = (job as { profile_id?: string } | null)?.profile_id ?? null;
    } catch (_) { /* history skipped */ }

    // Durable, idempotent persist. Owns:
    //   - generated_images row (unique on generation_job_item_id)
    //   - asset_cost_events (unique on (generation_job_item_id, event_type))
    //   - prompt_history (unique on generation_job_item_id, dedupe on prompt)
    const persisted = await persistGenerationResult(supabase, {
      imageUrl: outcome.imageUrl,
      prompt: req.prompt,
      mode: req.mode,
      aspectRatio: req.aspectRatio,
      generationJobItemId: itemId,
      generationJobId: claim.job_id,
      profileId,
      printSize: req.printSize,
      qualityMode: req.qualityMode,
      targetPpi: req.targetPpi,
      targetWidthPx: req.targetWidthPx,
      targetHeightPx: req.targetHeightPx,
      providerLabel: req.providerLabel ?? claim.provider_label ?? null,
      actualWidthPx: outcome.width ?? null,
      actualHeightPx: outcome.height ?? null,
      generationProvider: outcome.providerId,
      generationModel: outcome.modelId,
      providerStrategy: outcome.strategy,
      fallbackUsed: outcome.fallbackUsed,
      executionRoute,
      printFormatId: req.printFormatId,
      generationMode: req.generationMode,
      provider: outcome.providerId,
      model: outcome.modelId,
      route: executionRoute,
      estimatedCost: null,
      currency: "USD",
      promptVersion: null,
      sourceImageUrl: referenceUrl ?? null,
      matchingCollectionId: req.matching?.collectionId ?? null,
      matchingSubject: req.kind === "matching_collection"
        ? (req.matching?.subject ?? req.matching?.rawSubject ?? null)
        : null,
      matchingReviewState: req.kind === "matching_collection" ? "pending" : null,
      matchingIsAnchor: false,
      costEventMetadata: {
        attempted: outcome.attempted ?? null,
        provider_adjusted: outcome.providerAdjusted ?? false,
        provider_exact_match: outcome.providerExactMatch ?? false,
      },
    });

    // Determine ratio enforcement status: if provider was adjusted vs
    // requested poster format, mark 'pending' so the client can finalize.
    // (Client-side Canvas enforcement is preserved by design for parity.)
    const ratioStatus =
      outcome.providerAdjusted && req.printFormatId ? "pending" : "not_required";

    if (heartbeat) clearInterval(heartbeat);

    const durableMetadata = buildDurableResultMetadata({
      generationProvider: outcome.providerId,
      generationModel: outcome.modelId,
      executionRoute,
      providerStrategy: outcome.strategy,
      fallbackUsed: outcome.fallbackUsed,
      attempted: outcome.attempted,
      actualWidthPx: outcome.width ?? null,
      actualHeightPx: outcome.height ?? null,
      requestedWidth: outcome.requestedWidth ?? null,
      requestedHeight: outcome.requestedHeight ?? null,
      requestedAspectRatio: outcome.requestedAspectRatio ?? null,
      providerExactMatch: outcome.providerExactMatch,
      providerAdjusted: outcome.providerAdjusted,
      printFormatId: req.printFormatId,
      printSize: req.printSize,
      qualityMode: req.qualityMode,
      targetPpi: req.targetPpi,
      targetWidthPx: req.targetWidthPx,
      targetHeightPx: req.targetHeightPx,
      aspectRatio: req.aspectRatio,
      sizeIntent: req.sizeIntent,
      requestedModelId: req.requestedModelId,
      resolvedModelId: outcome.modelId,
      qualityProfile: req.qualityProfile,
      generationStrategy: req.generationStrategy,
      sourceImageUrl: referenceUrl ?? null,
      storagePath: persisted.storagePath,
      galleryImageId: persisted.galleryImageId,
      bytes: persisted.bytes,
      attemptCount: claim.attempt_count,
    });

    const { data: completed, error: compErr } = await supabase.rpc("complete_generation_item", {
      p_item_id: itemId,
      p_lease_token: leaseToken,
      p_raw_image_url: persisted.publicUrl,
      p_enforced_image_url: ratioStatus === "not_required" ? persisted.publicUrl : null,
      p_ratio_status: ratioStatus,
      p_storage_path: persisted.storagePath,
      p_gallery_image_id: persisted.galleryImageId,
      p_result_metadata: durableMetadata,
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
