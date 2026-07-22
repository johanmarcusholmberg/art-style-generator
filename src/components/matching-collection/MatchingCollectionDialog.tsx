/**
 * MatchingCollectionDialog — the ONE shared setup dialog used by every
 * entry point (generator result, gallery lightbox, Style Lab).
 *
 * Flow:
 *   1. Show the anchor + inherited settings the moment it opens.
 *   2. Kick off anchor analysis in the background (non-blocking).
 *   3. Resolve the reference-capable provider; if the anchor's provider
 *      doesn't support image-to-image, show the substitution reason.
 *   4. On confirm, insert a `collections` row, then call
 *      `createMatchingCollectionJob`, then navigate to /collection/:id.
 *
 * The dialog NEVER redraws unrelated generator UI, NEVER re-injects
 * canonical style rules, and NEVER auto-upscales drafts.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  MAX_COLLECTION_SUBJECTS,
  createMatchingCollectionJob,
  parseSubjects,
} from "@/lib/matching-collection/create-job";
import { analyzeAnchorImage } from "@/lib/matching-collection/anchor-analysis";
import { resolveCollectionProvider } from "@/lib/matching-collection/provider-capability";
import { freezeCollectionSettings } from "@/lib/matching-collection/frozen-settings";
import { computeCollectionFingerprint } from "@/lib/matching-collection/collection-fingerprint";
import { consistencyToReferenceStrength } from "@/lib/matching-collection/consistency-strength";
import type {
  AnchorInheritedSettings,
  CollectionArtDirection,
  ConsistencyStrength,
} from "@/lib/matching-collection/types";

export interface MatchingCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorImageUrl: string;
  anchorImageId: string | null;
  anchor: AnchorInheritedSettings;
  /** Pre-computed art direction (e.g. from `/collection/:id` resume). */
  initialArtDirection?: CollectionArtDirection | null;
}

const CONSISTENCY_OPTIONS: { value: ConsistencyStrength; label: string; hint: string }[] = [
  { value: "loose", label: "Loose", hint: "General mood and palette; more composition variation." },
  { value: "balanced", label: "Balanced", hint: "Clearly coordinated; each subject adapts naturally." },
  { value: "strict", label: "Strict", hint: "Match palette, texture, framing, lighting, composition." },
];

export function MatchingCollectionDialog(props: MatchingCollectionDialogProps) {
  const { open, onOpenChange, anchorImageUrl, anchorImageId, anchor, initialArtDirection } = props;
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [subjectsRaw, setSubjectsRaw] = useState("");
  const [consistency, setConsistency] = useState<ConsistencyStrength>("balanced");
  const [analyzing, setAnalyzing] = useState(false);
  const [artDirection, setArtDirection] = useState<CollectionArtDirection | null>(
    initialArtDirection ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  const resolvedProvider = useMemo(() => resolveCollectionProvider(anchor), [anchor]);

  const parsed = useMemo(() => parseSubjects(subjectsRaw), [subjectsRaw]);
  const estimatedTotal =
    resolvedProvider.estimatedCostPerImageUsd != null
      ? resolvedProvider.estimatedCostPerImageUsd * parsed.subjects.length
      : null;

  useEffect(() => {
    if (!open) return;
    if (initialArtDirection || artDirection) return;
    setAnalyzing(true);
    void analyzeAnchorImage(anchorImageUrl)
      .then((r) => setArtDirection(r.artDirection))
      .finally(() => setAnalyzing(false));
  }, [open, anchorImageUrl, initialArtDirection, artDirection]);

  const canConfirm =
    !submitting &&
    !analyzing &&
    name.trim().length > 0 &&
    parsed.subjects.length > 0;

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      const frozen = freezeCollectionSettings({
        anchorImageId,
        anchorImageUrl,
        anchorStoragePath: null,
        anchorWidthPx: anchor.anchorWidthPx,
        anchorHeightPx: anchor.anchorHeightPx,
        styleKey: anchor.styleKey,
        posterFormatId: anchor.posterFormatId,
        aspectRatio: anchor.aspectRatio,
        backgroundStyle: anchor.backgroundStyle,
        anchorProvider: anchor.provider,
        anchorModel: anchor.model,
        resolvedProvider: resolvedProvider.provider,
        resolvedModel: resolvedProvider.model,
        providerPreference: resolvedProvider.providerPreference,
        referenceStrength:
          anchor.referenceStrength ?? consistencyToReferenceStrength(consistency),
        artDirection,
        consistencyStrength: consistency,
      });

      const fingerprint = await computeCollectionFingerprint({
        scope: "create",
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
        resolvedProvider: frozen.resolvedProvider ?? resolvedProvider.provider,
        resolvedModel: frozen.resolvedModel ?? resolvedProvider.model,
      });

      const result = await createMatchingCollectionJob({
        collectionName: name.trim(),
        frozen,
        provider: resolvedProvider,
        subjects: parsed.subjects,
        fingerprint,
      });

      toast({
        title: result.reused ? "Existing collection reused" : "Collection started",
        description: `${parsed.subjects.length} image(s) queued.`,
      });
      onOpenChange(false);
      navigate(`/collection/${result.collectionId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Could not start collection", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create matching collection</DialogTitle>
          <DialogDescription>
            Every new poster is generated from this anchor image with the same visual identity.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <div className="space-y-2">
            <img
              src={anchorImageUrl}
              alt="Anchor"
              className="w-full rounded-md border border-border object-cover"
              loading="lazy"
            />
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              <div>Style: <span className="text-foreground">{anchor.styleKey}</span></div>
              {anchor.posterFormatId && <div>Format: {anchor.posterFormatId}</div>}
              <div>Ratio: {anchor.aspectRatio}</div>
              <div>Background: {anchor.backgroundStyle}</div>
              <div>
                Anchor model:{" "}
                <span className="text-foreground">
                  {anchor.provider ?? "?"} / {anchor.model ?? "?"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mc-name">Collection name</Label>
              <Input
                id="mc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spanish Coastal Architecture"
                maxLength={120}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mc-subjects">
                Subjects (one per line, max {MAX_COLLECTION_SUBJECTS})
              </Label>
              <Textarea
                id="mc-subjects"
                value={subjectsRaw}
                onChange={(e) => setSubjectsRaw(e.target.value)}
                rows={6}
                placeholder={"A fishing harbor in Jávea\nA tiled entrance in Seville\nAn olive grove in Mallorca"}
                disabled={submitting}
              />
              <div className="text-[11px] text-muted-foreground flex gap-3">
                <span>{parsed.subjects.length} accepted</span>
                {parsed.truncated && <span className="text-amber-500">truncated at {MAX_COLLECTION_SUBJECTS}</span>}
                {parsed.ignoredBlankLines > 0 && <span>{parsed.ignoredBlankLines} blank ignored</span>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Consistency strength</Label>
              <div className="flex flex-wrap gap-2">
                {CONSISTENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setConsistency(opt.value)}
                    disabled={submitting}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition " +
                      (consistency === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {CONSISTENCY_OPTIONS.find((o) => o.value === consistency)?.hint}
              </p>
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span className="text-foreground">
                  {resolvedProvider.provider} · {resolvedProvider.model}
                </span>
              </div>
              {resolvedProvider.substituted && (
                <div className="text-amber-500">
                  <Badge variant="outline" className="mr-1">substituted</Badge>
                  {resolvedProvider.reason}
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Images</span>
                <span>{parsed.subjects.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. total cost</span>
                <span>
                  {estimatedTotal != null ? `$${estimatedTotal.toFixed(2)}` : "—"}
                </span>
              </div>
              {analyzing && <div className="text-muted-foreground">Analyzing anchor…</div>}
              {!analyzing && artDirection && (
                <div className="text-muted-foreground">Art direction captured.</div>
              )}
              {!analyzing && !artDirection && (
                <div className="text-muted-foreground">Continuing without analysis.</div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {submitting ? "Starting…" : `Generate ${parsed.subjects.length || ""} poster${parsed.subjects.length === 1 ? "" : "s"}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MatchingCollectionDialog;
