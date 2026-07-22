/**
 * Collection resume page — /collection/:id
 *
 * Turn 2c.1:
 *   - Uses `createReloadCoordinator` to debounce realtime bursts from
 *     `generation_job_items` + `generated_images` into a single load
 *     while preventing overlapping fetches.
 *   - Subscription dependencies use a stable sorted job-id signature so
 *     the channel is not recreated on identity-only array changes.
 *   - Regenerate reports dispatch outcome; if dispatch fails, the
 *     queued candidate persists and the user can hit Start.
 *   - Genuinely queued items expose a Start action; failed items still
 *     use `generate-single-item-retry`.
 *   - Rejected candidates expose Restore (→ pending), never Reject.
 *   - Card shows a small ratio-finalization label (Preparing/Finalizing/
 *     Failed/Ready) and never claims print readiness while ratio state
 *     is pending, processing, failed, or unknown.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  reviewPrimaryAction,
  setMemberReviewState,
} from "@/lib/matching-collection/review";
import {
  fetchCollectionMembers,
  fetchCollectionJobIds,
  memberDisplayStatus,
  type CollectionMemberView,
} from "@/lib/matching-collection/members-query";
import { regenerateCollectionMember } from "@/lib/matching-collection/regenerate";
import { startQueuedItem, canStartCandidate } from "@/lib/matching-collection/start-item";
import { assessRatioReadiness } from "@/lib/matching-collection/ratio-readiness";
import { createReloadCoordinator } from "@/lib/reload-coordinator";
import {
  createMatchingCollectionJob,
  parseSubjects,
  MAX_COLLECTION_SUBJECTS,
} from "@/lib/matching-collection/create-job";
import { resolveCollectionProvider } from "@/lib/matching-collection/provider-capability";
import { readFrozenCollectionSettings } from "@/lib/matching-collection/frozen-settings";
import { computeCollectionFingerprint } from "@/lib/matching-collection/collection-fingerprint";
import type { AnchorInheritedSettings } from "@/lib/matching-collection/types";

type CollectionRow = Record<string, unknown> & {
  id: string;
  name: string | null;
  anchor_image_id: string | null;
  anchor_style_key: string | null;
  anchor_provider: string | null;
  anchor_model: string | null;
  resolved_provider: string | null;
  resolved_model: string | null;
  consistency_strength: string | null;
};

function publicUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from("generated-images").getPublicUrl(path).data.publicUrl;
}

type ViewFilter = "all" | "accepted" | "pending" | "rejected" | "failed";

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const [collection, setCollection] = useState<CollectionRow | null>(null);
  const [anchorUrl, setAnchorUrl] = useState<string | null>(null);
  const [members, setMembers] = useState<CollectionMemberView[]>([]);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [extraSubjects, setExtraSubjects] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [{ data: col }, list, jobs] = await Promise.all([
        supabase.from("collections").select("*").eq("id", id).maybeSingle(),
        fetchCollectionMembers(id),
        fetchCollectionJobIds(id),
      ]);
      setCollection((col as CollectionRow | null) ?? null);
      setMembers(list);
      setJobIds((prev) => {
        const next = jobs.slice().sort();
        // Preserve reference identity when the sorted signature matches so
        // the subscription effect below does not resubscribe unnecessarily.
        if (prev.length === next.length && prev.every((v, i) => v === next[i])) {
          return prev;
        }
        return next;
      });

      const c = col as CollectionRow | null;
      let url: string | null = null;
      if (c?.anchor_image_id) {
        const { data: a } = await supabase
          .from("generated_images")
          .select("storage_path")
          .eq("id", c.anchor_image_id)
          .maybeSingle();
        url = publicUrl((a as { storage_path: string | null } | null)?.storage_path ?? null);
      }
      if (!url && typeof c?.anchor_storage_path === "string") {
        url = publicUrl(c.anchor_storage_path as string);
      }
      if (!url && typeof c?.anchor_image_url === "string") {
        url = c.anchor_image_url as string;
      }
      setAnchorUrl(url);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Debounced reload coordinator — bursts of realtime events on either
  // table collapse into a single load, with exactly one trailing load
  // when new events arrive during an in-flight fetch.
  const coordinatorRef = useRef<ReturnType<typeof createReloadCoordinator> | null>(null);
  useEffect(() => {
    const c = createReloadCoordinator({
      load: () => loadRef.current(),
      delayMs: 120,
    });
    coordinatorRef.current = c;
    // Kick off the first load through the coordinator so it participates
    // in overlap protection with any early realtime events.
    c.request();
    return () => {
      c.dispose();
      coordinatorRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Load once id resolves.
    if (id) coordinatorRef.current?.request();
  }, [id]);

  // Live refresh from BOTH tables. Sorted-signature dependency prevents
  // channel churn when the same jobs come back in a different order.
  const jobIdsSig = useMemo(() => jobIds.join(","), [jobIds]);
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`collection-${id}`);
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "generated_images", filter: `matching_collection_id=eq.${id}` },
      () => coordinatorRef.current?.request(),
    );
    for (const jobId of jobIdsSig ? jobIdsSig.split(",") : []) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generation_job_items", filter: `job_id=eq.${jobId}` },
        () => coordinatorRef.current?.request(),
      );
    }
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, jobIdsSig]);

  const visibleMembers = useMemo(() => {
    switch (filter) {
      case "accepted":
        return members.filter((m) => m.reviewState === "accepted");
      case "pending":
        return members.filter(
          (m) => m.itemStatus === "completed" && (m.reviewState ?? "pending") === "pending",
        );
      case "rejected":
        return members.filter((m) => m.reviewState === "rejected");
      case "failed":
        return members.filter((m) => m.itemStatus === "failed");
      case "all":
      default:
        return members;
    }
  }, [members, filter]);

  const counts = useMemo(() => {
    let queued = 0, running = 0, done = 0, failed = 0, accepted = 0;
    for (const m of members) {
      if (m.itemStatus === "queued") queued++;
      else if (m.itemStatus === "processing" || m.itemStatus === "dispatching") running++;
      else if (m.itemStatus === "failed") failed++;
      else if (m.itemStatus === "completed") done++;
      if (m.reviewState === "accepted") accepted++;
    }
    return { queued, running, done, failed, accepted, total: members.length };
  }, [members]);

  async function handlePrimaryReview(m: CollectionMemberView) {
    if (!m.generatedImageId) return;
    const action = reviewPrimaryAction(m.reviewState);
    try {
      await setMemberReviewState(m.generatedImageId, action.target);
      coordinatorRef.current?.request();
    } catch (e) {
      toast({
        title: `${action.label} failed`,
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  }
  async function handleReject(m: CollectionMemberView) {
    if (!m.generatedImageId) return;
    try {
      await setMemberReviewState(m.generatedImageId, "rejected");
      coordinatorRef.current?.request();
    } catch (e) {
      toast({ title: "Reject failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }
  async function handleRegenerate(m: CollectionMemberView) {
    if (m.itemStatus !== "completed") return;
    setBusyItemId(m.itemId);
    try {
      const r = await regenerateCollectionMember(m.itemId);
      if (r.dispatchStarted) {
        toast({ title: "Regeneration queued", description: `New candidate queued (item ${r.newItemId.slice(0, 8)}…).` });
      } else {
        toast({
          title: "Candidate created, but generation did not start. Use Start.",
          description: r.dispatchError ?? undefined,
          variant: "destructive",
        });
      }
      coordinatorRef.current?.request();
    } catch (e) {
      toast({ title: "Regenerate failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusyItemId(null);
    }
  }
  async function handleStart(m: CollectionMemberView) {
    if (!canStartCandidate({ itemId: m.itemId, itemStatus: m.itemStatus })) return;
    setBusyItemId(m.itemId);
    try {
      await startQueuedItem(
        { itemId: m.itemId, itemStatus: m.itemStatus },
        async (itemId) => {
          const r = await supabase.functions.invoke("generate-single", { body: { itemId } });
          return { error: r.error ? { message: r.error.message } : null };
        },
      );
      toast({ title: "Generation started" });
      coordinatorRef.current?.request();
    } catch (e) {
      toast({ title: "Start failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusyItemId(null);
    }
  }
  async function handleRetry(m: CollectionMemberView) {
    if (m.itemStatus !== "failed") return;
    setBusyItemId(m.itemId);
    try {
      const { error } = await supabase.functions.invoke("generate-single-item-retry", {
        body: { itemId: m.itemId },
      });
      if (error) throw new Error(error.message);
      toast({ title: "Retry requested" });
      coordinatorRef.current?.request();
    } catch (e) {
      toast({ title: "Retry failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleAddMore() {
    if (!id || !collection) return;
    const parsed = parseSubjects(extraSubjects);
    if (parsed.subjects.length === 0) return;
    setAdding(true);
    try {
      const { settings: frozen, usedFallbacks } = readFrozenCollectionSettings(collection);
      if (usedFallbacks.length > 0) {
        console.info("[CollectionPage] add-more using legacy fallbacks:", usedFallbacks);
      }
      const anchorLike: AnchorInheritedSettings = {
        styleKey: frozen.styleKey || "freestyle",
        posterFormatId: frozen.posterFormatId,
        aspectRatio: frozen.aspectRatio,
        backgroundStyle: frozen.backgroundStyle,
        provider: frozen.anchorProvider,
        model: frozen.anchorModel,
        referenceStrength: frozen.referenceStrength,
        anchorWidthPx: frozen.anchorWidthPx,
        anchorHeightPx: frozen.anchorHeightPx,
      };
      const provider = frozen.resolvedProvider && frozen.resolvedModel
        ? {
            providerPreference: frozen.providerPreference,
            provider: frozen.resolvedProvider,
            model: frozen.resolvedModel,
            substituted: false,
            reason: null,
            estimatedCostPerImageUsd: null,
          }
        : resolveCollectionProvider(anchorLike);

      const fingerprint = await computeCollectionFingerprint({
        scope: id,
        subjects: parsed.subjects,
        anchor: {
          imageId: frozen.anchorImageId,
          imageUrl: frozen.anchorImageUrl,
          widthPx: frozen.anchorWidthPx,
          heightPx: frozen.anchorHeightPx,
        },
        artDirectionVersion: frozen.artDirectionVersion,
        consistencyStrength: frozen.consistencyStrength,
        posterFormatId: frozen.posterFormatId,
        aspectRatio: frozen.aspectRatio,
        backgroundStyle: frozen.backgroundStyle,
        resolvedProvider: provider.provider,
        resolvedModel: provider.model,
      });

      const result = await createMatchingCollectionJob({
        collectionName: collection.name ?? "Untitled",
        frozen,
        provider,
        subjects: parsed.subjects,
        fingerprint,
      });
      setExtraSubjects("");
      toast({
        title: result.reused ? "Already queued" : "Queued",
        description: `${parsed.subjects.length} more image(s) queued.`,
      });
      coordinatorRef.current?.request();
    } catch (e) {
      toast({ title: "Add failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  if (loading && !collection) return <div className="p-6 text-sm text-muted-foreground">Loading collection…</div>;
  if (!collection) return <div className="p-6 text-sm text-muted-foreground">Collection not found.</div>;

  return (
    <div className="min-h-screen bg-background paper-texture">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-3xl text-primary">{collection.name ?? "Untitled collection"}</h1>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-1">
              <span>Style: {collection.anchor_style_key ?? "—"}</span>
              <span>Consistency: {collection.consistency_strength ?? "balanced"}</span>
              <span>
                Provider: {collection.resolved_provider ?? collection.anchor_provider ?? "—"} ·{" "}
                {collection.resolved_model ?? collection.anchor_model ?? "—"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-2">
              <span>Total: {counts.total}</span>
              {counts.queued > 0 && <span>Queued: {counts.queued}</span>}
              {counts.running > 0 && <span>Generating: {counts.running}</span>}
              <span>Completed: {counts.done}</span>
              {counts.failed > 0 && <span className="text-destructive">Failed: {counts.failed}</span>}
              <span>Accepted: {counts.accepted}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "accepted", "rejected", "failed"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Anchor</div>
            {anchorUrl ? (
              <img src={anchorUrl} alt="Anchor" className="w-full rounded-md border border-border" />
            ) : (
              <div className="aspect-[5/7] w-full rounded-md border border-dashed border-border" />
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Members</div>
            {visibleMembers.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {members.length === 0 ? "Queued — images will appear as they finish." : "No members match this filter."}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {visibleMembers.map((m) => {
                const url = publicUrl(m.storagePath) ?? m.imageUrl;
                const label = memberDisplayStatus(m);
                const isQueued = m.itemStatus === "queued";
                const isRunning = isQueued || m.itemStatus === "dispatching" || m.itemStatus === "processing";
                const isFailed = m.itemStatus === "failed";
                const isCompleted = m.itemStatus === "completed";
                const isRejected = m.reviewState === "rejected";
                const primary = reviewPrimaryAction(m.reviewState);
                const ratio = assessRatioReadiness(m.ratioFinalizationStatus);
                const showRatioBadge =
                  isCompleted &&
                  (ratio.reason === "pending" ||
                    ratio.reason === "processing" ||
                    ratio.reason === "failed" ||
                    ratio.reason === "completed");
                const badgeVariant =
                  m.reviewState === "accepted" ? "default"
                  : isFailed || isRejected ? "destructive"
                  : "outline";
                return (
                  <div key={m.itemId} className="rounded-md border border-border overflow-hidden bg-card">
                    {url && isCompleted ? (
                      <img src={url} alt={m.subject} className="w-full aspect-[5/7] object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full aspect-[5/7] bg-muted flex items-center justify-center text-[11px] text-muted-foreground">
                        {isRunning ? <span className="animate-pulse">Generating…</span> : label}
                      </div>
                    )}
                    <div className="p-2 space-y-2">
                      <div className="text-[11px] text-foreground line-clamp-2">{m.subject}</div>
                      {m.regeneratedFromItemId && (
                        <div className="text-[10px] text-muted-foreground">
                          Regenerated candidate
                        </div>
                      )}
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge variant={badgeVariant} className="text-[10px]">{label}</Badge>
                        {m.attemptCount > 1 && (
                          <Badge variant="outline" className="text-[10px]">tries: {m.attemptCount}</Badge>
                        )}
                        {showRatioBadge && (
                          <Badge
                            variant={ratio.tone === "danger" ? "destructive" : "outline"}
                            className="text-[10px]"
                            title={
                              ratio.isPrintReady
                                ? "Ratio validated for selected poster format."
                                : "Print readiness withheld until poster-format finalization completes."
                            }
                          >
                            {ratio.label}
                          </Badge>
                        )}
                      </div>
                      {isFailed && m.errorMessage && (
                        <div className="text-[10px] text-destructive line-clamp-3">{m.errorMessage}</div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {isCompleted && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePrimaryReview(m)}
                              disabled={
                                !m.generatedImageId ||
                                (primary.label === "Keep" && m.reviewState === "accepted")
                              }
                            >
                              {primary.label}
                            </Button>
                            {!isRejected && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReject(m)}
                                disabled={!m.generatedImageId}
                              >
                                Reject
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRegenerate(m)}
                              disabled={busyItemId === m.itemId}
                            >
                              {busyItemId === m.itemId ? "…" : "Regenerate"}
                            </Button>
                          </>
                        )}
                        {isQueued && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStart(m)}
                            disabled={busyItemId === m.itemId}
                            title="Dispatch this queued candidate to the worker now"
                          >
                            {busyItemId === m.itemId ? "…" : "Start"}
                          </Button>
                        )}
                        {isFailed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetry(m)}
                            disabled={busyItemId === m.itemId}
                          >
                            {busyItemId === m.itemId ? "…" : "Retry"}
                          </Button>
                        )}
                        {url && isCompleted && (
                          <>
                            <a href={url} target="_blank" rel="noreferrer" className="text-xs underline text-muted-foreground self-center">
                              View
                            </a>
                            <a
                              href={url}
                              download={`collection-${m.itemId}.png`}
                              className="text-xs underline text-muted-foreground self-center"
                            >
                              Export
                            </a>
                            <Link
                              to="/"
                              className="text-xs underline text-primary self-center"
                              title="Open in gallery to Enhance for print"
                            >
                              Enhance in gallery
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-t border-border pt-4 space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Add more subjects (max {MAX_COLLECTION_SUBJECTS} per batch)
          </div>
          <Textarea
            value={extraSubjects}
            onChange={(e) => setExtraSubjects(e.target.value)}
            rows={3}
            placeholder={"Another subject per line"}
            disabled={adding || !anchorUrl}
          />
          <Button onClick={handleAddMore} disabled={adding || !anchorUrl || parseSubjects(extraSubjects).subjects.length === 0}>
            {adding ? "Adding…" : "Generate more"}
          </Button>
        </section>

        <div className="text-xs text-muted-foreground">
          <Link to="/" className="underline">← Back to generator</Link>
        </div>
      </div>
    </div>
  );
}
