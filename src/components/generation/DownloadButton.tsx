/**
 * DownloadButton — every download in the app routes through
 * `downloadWithBleed`, so the global 3 mm bleed is always applied,
 * even when no print format is associated with the image.
 *
 * Users can pick PNG / JPEG / PDF; the choice is persisted in
 * localStorage and applies to every subsequent export across the app.
 */
import { useState, useEffect } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadWithBleed } from "@/lib/raw-download";
import {
  type ExportFormat,
  EXPORT_FORMATS,
  EXPORT_FORMAT_META,
  getStoredExportFormat,
  setStoredExportFormat,
} from "@/lib/export-formats";

export interface DownloadButtonProps {
  url: string;
  filename: string;
  /** Optional version suffix shown in parens — e.g. "Original" or "Enhanced". */
  versionLabel?: string;
  /** Size label shown after the version, e.g. "A3" or "30x40 cm". */
  sizeLabel: string;
  /** Optional known print format id — when set, uses format trim dims. */
  printFormatId?: string | null;
  /** Optional DPI hint when no print format is known. */
  dpi?: number;
}

export default function DownloadButton({
  url,
  filename,
  versionLabel,
  sizeLabel,
  printFormatId,
  dpi,
}: DownloadButtonProps) {
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ExportFormat>(() => getStoredExportFormat());

  // Re-sync if another surface changed the stored format while mounted.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "lovable.exportFormat.v1") setFormat(getStoredExportFormat());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleFormatChange = (v: string) => {
    const next = v as ExportFormat;
    setFormat(next);
    setStoredExportFormat(next);
  };

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadWithBleed(url, { filename, printFormatId, dpi, exportFormat: format });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <Select value={format} onValueChange={handleFormatChange} disabled={busy}>
        <SelectTrigger
          aria-label="Export format"
          className="h-8 w-[88px] font-display text-[11px] uppercase tracking-wider"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EXPORT_FORMATS.map((f) => (
            <SelectItem key={f} value={f} className="font-display text-xs">
              {EXPORT_FORMAT_META[f].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={busy}
        className="font-display text-xs tracking-wider"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        Download{versionLabel ? ` (${versionLabel})` : ""} ({sizeLabel})
      </Button>
    </div>
  );
}
