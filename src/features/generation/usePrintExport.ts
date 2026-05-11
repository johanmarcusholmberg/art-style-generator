/**
 * usePrintExport — incremental Part B extraction.
 *
 * Thin wrapper around `preparePrintExport` + `downloadPrintExport` so a
 * future GenerationPanel can compose it without re-implementing logic.
 */
import { useCallback, useState } from "react";
import { preparePrintExport, downloadPrintExport } from "@/lib/print-export";
import type { PrintFormat } from "@/lib/print-formats";

export interface PrintExportInput {
  imageUrl: string;
  printFormat: PrintFormat;
  filenamePrefix?: string;
}

export function usePrintExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportPrint = useCallback(async (input: PrintExportInput) => {
    setIsExporting(true);
    setError(null);
    try {
      const blob = await preparePrintExport(input.imageUrl, input.printFormat);
      const filename = `${input.filenamePrefix || "print"}-${input.printFormat.id}.png`;
      await downloadPrintExport(blob, filename);
      return { filename, blob };
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
