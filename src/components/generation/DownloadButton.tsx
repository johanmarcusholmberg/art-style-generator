/**
 * DownloadButton — small, low-risk extraction of the generator's
 * "Download" action button (Phase 2, Part 4).
 *
 * Visual + behavior parity is preserved exactly — same classes, same
 * label format. The parent (ImageGenerator) still decides which URL to
 * download and which suffix label ("Original" / "Enhanced") to show.
 */
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DownloadButtonProps {
  url: string;
  filename: string;
  /** Optional version suffix shown in parens — e.g. "Original" or "Enhanced". */
  versionLabel?: string;
  /** Size label shown after the version, e.g. "A3" or "30x40 cm". */
  sizeLabel: string;
}

const downloadImage = async (dataUrl: string, filename: string) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function DownloadButton({
  url,
  filename,
  versionLabel,
  sizeLabel,
}: DownloadButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => downloadImage(url, filename)}
      className="font-display text-xs tracking-wider"
    >
      <Download className="mr-2 h-4 w-4" />
      Download{versionLabel ? ` (${versionLabel})` : ""} ({sizeLabel})
    </Button>
  );
}
