import { useMemo, useState } from "react";
import { Layers, AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
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
import { getPrintFormat } from "@/lib/print-formats";

interface Props {
  sourceImageId: string;
  sourceImageUrl: string;
  sourceFormatId: string | null | undefined;
  sourceWidth: number | null | undefined;
  sourceHeight: number | null | undefined;
  trigger?: React.ReactNode;
  /** Optional persistence hook — called once per successful derivative. */
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
}

export default function FormatDerivativesDialog({
  sourceImageId,
  sourceImageUrl,
  sourceFormatId,
  sourceWidth,
  sourceHeight,
  trigger,
  onDerivativeCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

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
    try {
      for (const cand of candidates) {
        if (!selected.has(cand.formatId) || !cand.plan) continue;
        if (cand.requiresConfirmation && !acknowledged.has(cand.formatId)) {
          toast.warning(`${cand.format?.label ?? cand.formatId} needs confirmation`);
          continue;
        }
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
          toast.error(
            `${cand.format?.label ?? cand.formatId}: ${validation.errors.join(", ")}`,
          );
          continue;
        }
        const metadata = {
          sourceImageId,
          sourceFormat: cand.plan.sourceFormat,
          targetFormat: cand.plan.targetFormat,
          cropBox: cand.plan.cropBox,
          derivedFromMaster: true as const,
        };
        if (onDerivativeCreated) {
          await onDerivativeCreated({
            blob: result.blob,
            plan: cand.plan,
            sourceImageId,
            metadata,
          });
        } else {
          // Fallback: offer as download so it can be re-uploaded manually.
          const a = document.createElement("a");
          a.href = result.dataUrl;
          a.download = `derivative-${cand.formatId}-${result.width}x${result.height}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        toast.success(
          `${cand.format?.label ?? cand.formatId} ready (${result.width}×${result.height}, ~${validation.achievablePpi} PPI)`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Derivative failed");
    } finally {
      setBusy(false);
      setOpen(false);
      setSelected(new Set());
      setAcknowledged(new Set());
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
              return (
                <div
                  key={c.formatId}
                  className="rounded-md border border-border p-3 space-y-2"
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(c.formatId)}
                      disabled={busy}
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={runDerivatives}
            disabled={busy || selected.size === 0 || !canRun}
            className="font-display"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Create {selected.size || ""} derivative{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
