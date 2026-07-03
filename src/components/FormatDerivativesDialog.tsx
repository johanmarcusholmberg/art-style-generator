import { useMemo, useState } from "react";
import {
  Layers,
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  executeFormatDerivative,
  isSupportedDerivativeFormat,
  listCandidateTargets,
  planFormatDerivative,
  validateDerivativeResult,
  type FormatDerivativePlan,
} from "@/lib/format-derivative";
import {
  persistFormatDerivative,
  type DerivativeSupabaseLike,
  type PersistDerivativeResult,
} from "@/lib/format-derivative-persistence";
import { supabase } from "@/integrations/supabase/client";
import { getPrintFormat } from "@/lib/print-formats";

type PerCandidateState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; insertedId: string; publicUrl: string }
  | {
      status: "failed";
      error: string;
      fallback: { blob: Blob; filename: string };
    };

interface Props {
  sourceImageId: string;
  sourceImageUrl: string;
  sourceFormatId: string | null | undefined;
  sourceWidth: number | null | undefined;
  sourceHeight: number | null | undefined;
  trigger?: React.ReactNode;
  /**
   * Optional persistence hook. When provided it fully overrides the
   * built-in Supabase persistence path — useful for tests or admin
   * flows that want to save elsewhere.
   */
  onDerivativeCreated?: (result: {
    blob: Blob;
    plan: FormatDerivativePlan;
    sourceImageId: string;
    metadata: {
      sourceImageId: string;
      sourceFormat: string;
      targetFormat: string;
      cropBox: FormatDerivativePlan["cropBox"];
      derivedFromMaster: true;
    };
  }) => Promise<void> | void;
  /** Called after ALL selected derivatives finish (success or fail). */
  onFinished?: (results: {
    saved: number;
    failed: number;
  }) => void;
  /** Injectable Supabase client for tests. */
  supabaseClient?: DerivativeSupabaseLike;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function FormatDerivativesDialog({
  sourceImageId,
  sourceImageUrl,
  sourceFormatId,
  sourceWidth,
  sourceHeight,
  trigger,
  onDerivativeCreated,
  onFinished,
  supabaseClient,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [states, setStates] = useState<Record<string, PerCandidateState>>({});

  const canRun =
    !!sourceFormatId &&
    isSupportedDerivativeFormat(sourceFormatId) &&
    !!sourceWidth &&
    !!sourceHeight;

  const candidates = useMemo(() => {
    if (!canRun) return [];
    return listCandidateTargets(sourceFormatId!).map((c) => {
      const plan = planFormatDerivative({
        sourceFormatId: sourceFormatId!,
        targetFormatId: c.formatId,
        sourceWidth: sourceWidth!,
        sourceHeight: sourceHeight!,
      });
      return { ...c, plan, format: getPrintFormat(c.formatId) };
    });
  }, [canRun, sourceFormatId, sourceWidth, sourceHeight]);

  const setState = (formatId: string, next: PerCandidateState) =>
    setStates((prev) => ({ ...prev, [formatId]: next }));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runDerivatives = async () => {
    if (!canRun) return;
    setBusy(true);
    let saved = 0;
    let failed = 0;
    try {
      for (const cand of candidates) {
        if (!selected.has(cand.formatId) || !cand.plan) continue;
        if (cand.requiresConfirmation && !acknowledged.has(cand.formatId)) {
          toast.warning(`${cand.format?.label ?? cand.formatId} needs confirmation`);
          continue;
        }
        setState(cand.formatId, { status: "saving" });
        try {
          const result = await executeFormatDerivative({
            sourceImageUrl,
            plan: cand.plan,
          });
          const validation = validateDerivativeResult({
            targetFormatId: cand.formatId,
            producedWidth: result.width,
            producedHeight: result.height,
            usedPadding: false,
          });
          if (!validation.ok) {
            failed += 1;
            setState(cand.formatId, {
              status: "failed",
              error: validation.errors.join(", "),
              fallback: {
                blob: result.blob,
                filename: `derivative-${cand.formatId}-${result.width}x${result.height}.png`,
              },
            });
            toast.error(
              `${cand.format?.label ?? cand.formatId}: ${validation.errors.join(", ")}`,
            );
            continue;
          }

          if (onDerivativeCreated) {
            // Custom persistence overrides the default.
            const metadata = {
              sourceImageId,
              sourceFormat: cand.plan.sourceFormat,
              targetFormat: cand.plan.targetFormat,
              cropBox: cand.plan.cropBox,
              derivedFromMaster: true as const,
            };
            await onDerivativeCreated({
              blob: result.blob,
              plan: cand.plan,
              sourceImageId,
              metadata,
            });
            saved += 1;
            setState(cand.formatId, {
              status: "saved",
              insertedId: "external",
              publicUrl: "",
            });
            toast.success(
              `${cand.format?.label ?? cand.formatId} saved (${result.width}×${result.height}, ~${validation.achievablePpi} PPI)`,
            );
            continue;
          }

          const persist: PersistDerivativeResult =
            await persistFormatDerivative(
              {
                sourceImageId,
                plan: cand.plan,
                blob: result.blob,
              },
              { supabase: supabaseClient ?? (supabase as unknown as DerivativeSupabaseLike) },
            );

          if (persist.persisted) {
            saved += 1;
            setState(cand.formatId, {
              status: "saved",
              insertedId: persist.insertedId,
              publicUrl: persist.publicUrl,
            });
            toast.success(
              `${cand.format?.label ?? cand.formatId} saved (${result.width}×${result.height}, ~${validation.achievablePpi} PPI)`,
            );
          } else {
            const fail = persist as Extract<PersistDerivativeResult, { persisted: false }>;
            failed += 1;
            setState(cand.formatId, {
              status: "failed",
              error: `${fail.stage} failed: ${fail.error.message}`,
              fallback: fail.fallbackDownload,
            });
            toast.error(
              `${cand.format?.label ?? cand.formatId}: ${fail.stage} failed — download available`,
            );
          }
        } catch (err) {
          failed += 1;
          setState(cand.formatId, {
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
            fallback: {
              blob: new Blob(),
              filename: `derivative-${cand.formatId}.png`,
            },
          });
        }
      }
    } finally {
      setBusy(false);
      onFinished?.({ saved, failed });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="font-display text-xs">
            <Layers className="mr-2 h-4 w-4" />
            Create format derivatives
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Create format derivatives</DialogTitle>
          <DialogDescription>
            Crop-and-resize this master into other supported poster formats. No AI
            regeneration — pixel-exact and never padded.
          </DialogDescription>
        </DialogHeader>

        {!canRun ? (
          <p className="text-sm text-muted-foreground">
            This image is missing a print format or pixel dimensions and cannot be
            used as a derivative source.
          </p>
        ) : (
          <div className="space-y-3">
            {candidates.map((c) => {
              const plan = c.plan;
              if (!plan) return null;
              const checked = selected.has(c.formatId);
              const needsAck = c.requiresConfirmation;
              const st = states[c.formatId] ?? { status: "idle" as const };
              return (
                <div
                  key={c.formatId}
                  data-testid={`derivative-card-${c.formatId}`}
                  data-state={st.status}
                  className="rounded-md border border-border p-3 space-y-2"
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(c.formatId)}
                      disabled={busy || st.status === "saving"}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-sm">
                          {c.format?.label ?? c.formatId}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {plan.outputWidth}×{plan.outputHeight}
                        </Badge>
                        {c.preferredSource ? (
                          <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">
                            Preferred pairing
                          </Badge>
                        ) : null}
                        {plan.sameRatio ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Same ratio (resize)
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            Crop {plan.cropBox.width}×{plan.cropBox.height} @ (
                            {plan.cropBox.x},{plan.cropBox.y})
                          </Badge>
                        )}
                        {st.status === "saving" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Saving…
                          </Badge>
                        ) : null}
                        {st.status === "saved" ? (
                          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Saved
                          </Badge>
                        ) : null}
                        {st.status === "failed" ? (
                          <Badge className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">
                            <XCircle className="mr-1 h-3 w-3" /> Save failed
                          </Badge>
                        ) : null}
                      </div>

                      {plan.warnings.includes("a-series-to-50x70-vertical-crop") ? (
                        <div className="mt-2 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p>
                              50×70 is wider than A-series. This derivative must
                              trim the top and bottom of the image — heads or
                              feet may be cut off.
                            </p>
                            <label className="flex items-center gap-2 mt-1">
                              <Checkbox
                                checked={acknowledged.has(c.formatId)}
                                onCheckedChange={(v) =>
                                  setAcknowledged((prev) => {
                                    const n = new Set(prev);
                                    v ? n.add(c.formatId) : n.delete(c.formatId);
                                    return n;
                                  })
                                }
                                disabled={busy}
                              />
                              <span>I understand and want to proceed</span>
                            </label>
                          </div>
                        </div>
                      ) : plan.warnings.includes("target-larger-than-source") ? (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Target is larger than source — will be upsized without AI.
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          Safe crop-only derivation.
                        </div>
                      )}
                      {needsAck && !acknowledged.has(c.formatId) && checked ? (
                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                          Confirmation required before this derivative will run.
                        </p>
                      ) : null}

                      {st.status === "failed" ? (
                        <div className="mt-2 space-y-2">
                          <p className="text-[11px] text-destructive">
                            {st.error}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="font-display text-xs"
                            onClick={() =>
                              triggerDownload(st.fallback.blob, st.fallback.filename)
                            }
                          >
                            <Download className="mr-2 h-3.5 w-3.5" />
                            Download fallback PNG
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Close
          </Button>
          <Button
            onClick={runDerivatives}
            disabled={busy || selected.size === 0 || !canRun}
            className="font-display"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Layers className="mr-2 h-4 w-4" />
            )}
            Create {selected.size || ""} derivative{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
