/**
 * Etsy export dialog.
 *
 * UI shell around the Etsy export pipeline:
 *   - choose template (default: etsy_bundle_basic)
 *   - toggle uniform white border
 *   - see included sizes + readiness vs current master
 *   - one-click bundle download (ZIP)
 *
 * Pipeline + sizing math live in `lib/etsy-export.ts` and
 * `lib/export-templates.ts` — this component is presentation only.
 */
import { useMemo, useState } from "react";
import { Loader2, Download, ShoppingBag, ImageOff, ImageIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  EXPORT_TEMPLATES,
  DEFAULT_EXPORT_TEMPLATE_ID,
  getExportTemplate,
  flattenTemplateSizes,
  type ExportTemplate,
} from "@/lib/export-templates";
import {
  buildEtsyExportBundle,
  downloadExportBundle,
  assessTemplateReadiness,
} from "@/lib/etsy-export";
import { cn } from "@/lib/utils";
import { DEFAULT_BLEED_MM, DEFAULT_SAFE_MM, computeBleedPixels } from "@/lib/bleed-config";

export interface EtsyExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Master asset URL — caller must resolve via getExportSourceAssetForImage */
  masterUrl: string | null;
  /** Optional master pixel dimensions — used for readiness assessment */
  masterWidth?: number | null;
  masterHeight?: number | null;
  /** Optional human label for the source image */
  sourceLabel?: string;
}

export default function EtsyExportDialog({
  open,
  onOpenChange,
  masterUrl,
  masterWidth,
  masterHeight,
  sourceLabel,
}: EtsyExportDialogProps) {
  const [templateId, setTemplateId] = useState<string>(DEFAULT_EXPORT_TEMPLATE_ID);
  const [withBorder, setWithBorder] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });

  const template: ExportTemplate =
    getExportTemplate(templateId) ?? EXPORT_TEMPLATES[0]!;

  const allSizes = useMemo(() => flattenTemplateSizes(template), [template]);
  const readiness = useMemo(
    () => assessTemplateReadiness(template, masterWidth, masterHeight),
    [template, masterWidth, masterHeight],
  );

  const handleExport = async () => {
    if (!masterUrl) {
      toast.error("No master asset available — please re-open the image.");
      return;
    }
    setExporting(true);
    setProgress({ done: 0, total: allSizes.length, label: "" });
    try {
      const result = await buildEtsyExportBundle({
        masterUrl,
        template,
        withBorder,
        onProgress: (done, total, current) => {
          setProgress({
            done,
            total,
            label: current ? current.label : "",
          });
        },
      });
      downloadExportBundle(result.blob, result.fileName);
      const okCount = result.rendered.length;
      const failCount = result.failed.length;
      if (failCount === 0) {
        toast.success(`Exported ${okCount} files — bundle downloaded.`);
      } else {
        toast.warning(
          `Exported ${okCount} files, ${failCount} failed. Check console for details.`,
        );
        // eslint-disable-next-line no-console
        console.warn("Etsy export failures:", result.failed);
      }
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(msg);
    } finally {
      setExporting(false);
      setProgress({ done: 0, total: 0, label: "" });
    }
  };

  const readinessTone =
    readiness.meetsAll
      ? "text-primary"
      : readiness.worstCasePpi && readiness.worstCasePpi >= 150
        ? "text-foreground"
        : "text-destructive";

  return (
    <Dialog open={open} onOpenChange={(o) => !exporting && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Export for Etsy
          </DialogTitle>
          <DialogDescription className="font-display text-xs">
            Generate a ready-to-sell ZIP bundle of print-quality files in
            multiple standard sizes.
            {sourceLabel ? <> — <span className="italic">{sourceLabel}</span></> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Template selector */}
          <div className="space-y-1.5">
            <Label className="font-display text-xs text-muted-foreground">Template</Label>
            <Select value={templateId} onValueChange={setTemplateId} disabled={exporting}>
              <SelectTrigger className="font-display">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="font-display">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="font-display text-[11px] text-muted-foreground">
              {template.description}
            </p>
          </div>

          {/* Border toggle */}
          {template.supportsBorder && (
            <div className="flex items-start justify-between rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="etsy-border" className="font-display text-sm">
                  Add white border for framing
                </Label>
                <p className="font-display text-[11px] text-muted-foreground">
                  Expands the canvas around the artwork — never crops.
                </p>
              </div>
              <Switch
                id="etsy-border"
                checked={withBorder}
                onCheckedChange={setWithBorder}
                disabled={exporting}
              />
            </div>
          )}

          {/* Readiness summary */}
          <div className="rounded-md bg-muted/40 p-3 space-y-1">
            <p className={cn("font-display text-xs font-medium", readinessTone)}>
              {readiness.meetsAll ? "✓ " : "⚠ "}
              {readiness.summary}
            </p>
            {readiness.recommendation && (
              <p className="font-display text-[11px] text-muted-foreground italic">
                {readiness.recommendation}
              </p>
            )}
            {masterWidth && masterHeight && (
              <p className="font-display text-[11px] text-muted-foreground">
                Master: {masterWidth} × {masterHeight} px
              </p>
            )}
          </div>

          {/* Bleed notice */}
          <div className="rounded-md border border-border/60 bg-background p-3 space-y-1">
            <p className="font-display text-xs">
              Every file includes a baked-in <strong>{DEFAULT_BLEED_MM} mm bleed</strong> on all sides.
            </p>
            <p className="font-display text-[11px] text-muted-foreground">
              Keep important content ≥ {DEFAULT_SAFE_MM} mm inside the trim line. Customer-visible
              mockups and previews continue to use the trim size.
            </p>
          </div>

          {/* Sizes list */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {template.ratios.map((group) => (
              <div key={group.key} className="space-y-1">
                <p className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.sizes.map((s) => {
                    const tooSmall =
                      masterWidth != null &&
                      masterHeight != null &&
                      (masterWidth < s.pixelWidth || masterHeight < s.pixelHeight);
                    const b = computeBleedPixels({
                      trimWidthPx: s.pixelWidth,
                      trimHeightPx: s.pixelHeight,
                      dpi: s.dpi,
                    });
                    return (
                      <li
                        key={s.id}
                        className="flex items-center justify-between rounded border border-border/60 bg-background px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          {tooSmall ? (
                            <ImageOff className="h-3.5 w-3.5 text-orange-500" />
                          ) : (
                            <ImageIcon className="h-3.5 w-3.5 text-primary" />
                          )}
                          <span className="font-display text-xs">{s.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-[11px] text-muted-foreground">
                            trim {s.pixelWidth}×{s.pixelHeight} → export {b.exportWidth}×{b.exportHeight} px
                          </span>
                          <Badge variant="outline" className="font-display text-[10px]">
                            {s.dpi} DPI
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>


          {/* Progress while exporting */}
          {exporting && progress.total > 0 && (
            <div className="space-y-1">
              <Progress value={(progress.done / progress.total) * 100} />
              <p className="font-display text-[11px] text-muted-foreground">
                Rendering {progress.done} / {progress.total}
                {progress.label ? ` — ${progress.label}` : ""}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={exporting}
              className="font-display"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting || !masterUrl}
              className="font-display"
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {exporting ? "Building bundle…" : "Export ZIP"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
