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
      const result = await preparePrintExport({
        imageUrl: input.imageUrl,
        printFormatId: input.printFormat.id,
      });
      const filename = `${input.filenamePrefix || "print"}-${input.printFormat.id}.png`;
      downloadPrintExport(result.blob, filename);
      return { filename, result };
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
