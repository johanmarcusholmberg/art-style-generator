/**
 * usePrintExport — incremental Part B extraction.
 *
 * Thin wrapper around `preparePrintExport` + `downloadPrintExport` so a
 * future GenerationPanel can compose it without re-implementing logic.
 *
 * Honours the user's persisted export-format choice (PNG / JPEG / PDF)
 * so a single download flow works across the whole app.
 */
import { useCallback, useState } from "react";
import { preparePrintExport, downloadPrintExport } from "@/lib/print-export";
import {
  type ExportFormat,
  EXPORT_FORMAT_META,
  getStoredExportFormat,
} from "@/lib/export-formats";
import type { PrintFormat } from "@/lib/print-formats";

export interface PrintExportInput {
  imageUrl: string;
  printFormat: PrintFormat;
  filenamePrefix?: string;
  /** Override the persisted export format. */
  format?: ExportFormat;
}

export function usePrintExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportPrint = useCallback(async (input: PrintExportInput) => {
    setIsExporting(true);
    setError(null);
    try {
      const fmt = input.format ?? getStoredExportFormat();
      const meta = EXPORT_FORMAT_META[fmt];
      const result = await preparePrintExport({
        imageUrl: input.imageUrl,
        printFormatId: input.printFormat.id,
        exportFormat: fmt,
      });
      const baseName = `${input.filenamePrefix || "print"}-${input.printFormat.id}`;
      const filename = `${baseName}.${meta.extension}`;
      downloadPrintExport(result.blob, filename, fmt);
      return { filename, result, format: fmt };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Print export failed";
      setError(msg);
      throw e;
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportPrint, isExporting, error };
}
