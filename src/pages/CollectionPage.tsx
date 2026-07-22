/**
 * Collection resume page — /collection/:id
 *
 * Responsibilities:
 *   - Show the anchor + saved art direction (never re-analyzes).
 *   - Live grid of members with per-item status: queued, generating,
 *     completed, failed.
 *   - Per-item actions: Keep (accepted), Reject (archived, still stored),
 *     Regenerate (re-dispatches only that item), View, Open in gallery.
 *   - Accepted-only default view; a toggle reveals pending + rejected
 *     for review.
 *   - Add more subjects using the SAME anchor and settings (no
 *     re-analysis).
 *
 * Resume behaviour: this page is the durable surface. Every successful
 * image is already persisted with matching_collection_id + review_state
 * so refresh/navigate/close-tab is safe.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { listCollectionMembers, setMemberReviewState } from "@/lib/matching-collection/review";
import {
  createMatchingCollectionJob,
  parseSubjects,
  MAX_COLLECTION_SUBJECTS,
} from "@/lib/matching-collection/create-job";
import { resolveCollectionProvider } from "@/lib/matching-collection/provider-capability";
import { readFrozenCollectionSettings } from "@/lib/matching-collection/frozen-settings";
import { computeCollectionFingerprint } from "@/lib/matching-collection/collection-fingerprint";
import type {
  AnchorInheritedSettings,
  CollectionArtDirection,
} from "@/lib/matching-collection/types";

type CollectionRow = Record<string, unknown> & {
  id: string;
  name: string | null;
  anchor_image_id: string | null;
  anchor_style_key: string | null;
  anchor_poster_format_id: string | null;
  anchor_provider: string | null;
  anchor_model: string | null;
  resolved_provider: string | null;
  resolved_model: string | null;
  consistency_strength: string | null;
  art_direction: unknown;
  reference_strength: string | null;
};

interface MemberRow {
  id: string;
  storage_path: string | null;
  matching_subject: string | null;
  matching_review_state: string | null;
  matching_is_anchor: boolean;
  is_archived: boolean | null;
  generation_job_item_id: string | null;
}

function publicUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from("generated-images").getPublicUrl(path).data.publicUrl;
}

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const [collection, setCollection] = useState<CollectionRow | null>(null);
  const [anchorUrl, setAnchorUrl] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(true);
  const [extraSubjects, setExtraSubjects] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [{ data: col }, list] = await Promise.all([
        supabase
          .from("collections")
          .select(
            "id,name,anchor_image_id,anchor_style_key,anchor_poster_format_id,anchor_provider,anchor_model,resolved_provider,resolved_model,consistency_strength,art_direction,reference_strength",
          )
          .eq("id", id)
          .maybeSingle(),
        listCollectionMembers(id),
      ]);
      setCollection((col as CollectionRow | null) ?? null);
      setMembers(list as MemberRow[]);

      // Resolve anchor image url: prefer explicit anchor_image_id row.
      const c = col as CollectionRow | null;
      if (c?.anchor_image_id) {
        const { data: a } = await supabase
          .from("generated_images")
          .select("storage_path")
          .eq("id", c.anchor_image_id)
          .maybeSingle();
        setAnchorUrl(publicUrl((a as { storage_path: string | null } | null)?.storage_path ?? null));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live refresh while any job for this collection is still running.
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`collection-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generated_images", filter: `matching_collection_id=eq.${id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, load]);

  const visibleMembers = useMemo(
    () => (showAll ? members : members.filter((m) => m.matching_review_state === "accepted")),
    [members, showAll],
  );

  async function handleKeep(row: MemberRow) {
    try {
      await setMemberReviewState(row.id, "accepted");
      setMembers((cur) => cur.map((m) => (m.id === row.id ? { ...m, matching_review_state: "accepted", is_archived: false } : m)));
    } catch (e) {
      toast({ title: "Keep failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }
  async function handleReject(row: MemberRow) {
    try {
      await setMemberReviewState(row.id, "rejected");
      setMembers((cur) => cur.map((m) => (m.id === row.id ? { ...m, matching_review_state: "rejected", is_archived: true } : m)));
    } catch (e) {
      toast({ title: "Reject failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }
  async function handleRegenerate(row: MemberRow) {
    // Re-dispatch just that item; the durable worker is idempotent + lease-based.
    if (!row.generation_job_item_id) return;
    try {
      await supabase.functions.invoke("generate-single", { body: { itemId: row.generation_job_item_id } });
      toast({ title: "Regeneration requested" });
    } catch (e) {
      toast({ title: "Regenerate failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }

  async function handleAddMore() {
    if (!id || !collection || !anchorUrl) return;
    const parsed = parseSubjects(extraSubjects);
    if (parsed.subjects.length === 0) return;
    setAdding(true);
    try {
      const anchor: AnchorInheritedSettings = {
        styleKey: collection.anchor_style_key ?? "freestyle",
        posterFormatId: collection.anchor_poster_format_id,
        aspectRatio: "5:7",
        backgroundStyle: "white",
        provider: collection.anchor_provider,
        model: collection.anchor_model,
        referenceStrength: null,
        anchorWidthPx: null,
        anchorHeightPx: null,
      };
      const provider = resolveCollectionProvider(anchor);
      await createMatchingCollectionJob({
        collectionId: id,
        collectionName: collection.name ?? "Untitled",
        anchorImageUrl: anchorUrl,
        anchorImageId: collection.anchor_image_id,
        anchor,
        artDirection: collection.art_direction as CollectionArtDirection | null,
        consistencyStrength: (collection.consistency_strength as ConsistencyStrength | null) ?? "balanced",
        provider,
        subjects: parsed.subjects,
        idempotencyKey: `mc-${id}-add-${Date.now()}`,
      });
      setExtraSubjects("");
      toast({ title: "Queued", description: `${parsed.subjects.length} more image(s) queued.` });
      void load();
    } catch (e) {
      toast({ title: "Add failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading collection…</div>;
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
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Accepted only" : "Show all"}
          </Button>
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
                {members.length === 0 ? "Queued — images will appear as they finish." : "No accepted members yet."}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {visibleMembers.map((m) => {
                const url = publicUrl(m.storage_path);
                const state = m.matching_review_state ?? "pending";
                return (
                  <div key={m.id} className="rounded-md border border-border overflow-hidden bg-card">
                    {url ? (
                      <img src={url} alt={m.matching_subject ?? ""} className="w-full aspect-[5/7] object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full aspect-[5/7] bg-muted animate-pulse" />
                    )}
                    <div className="p-2 space-y-2">
                      <div className="text-[11px] text-foreground line-clamp-2">{m.matching_subject}</div>
                      <div className="flex items-center gap-1">
                        <Badge
                          variant={state === "accepted" ? "default" : state === "rejected" ? "destructive" : "outline"}
                          className="text-[10px]"
                        >
                          {state}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleKeep(m)} disabled={state === "accepted"}>
                          Keep
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleReject(m)} disabled={state === "rejected"}>
                          Reject
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRegenerate(m)}>
                          Regenerate
                        </Button>
                        {url && (
                          <>
                            <a href={url} target="_blank" rel="noreferrer" className="text-xs underline text-muted-foreground self-center">
                              View
                            </a>
                            <a
                              href={url}
                              download={`collection-${m.id}.png`}
                              className="text-xs underline text-muted-foreground self-center"
                              title="Download (export)"
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
          <Link to="/" className="underline">
            ← Back to generator
          </Link>
        </div>
      </div>
    </div>
  );
}
