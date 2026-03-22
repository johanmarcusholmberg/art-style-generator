import { cn } from "@/lib/utils";
import {
  type QualityTarget,
  QUALITY_LABELS,
  getResolutionForPrintSize,
  formatResolution,
} from "@/lib/print-resolution";

export interface PrintSize {
  label: string;
  dimensions: string;
  ratio: string;
}

export const PRINT_SIZES: PrintSize[] = [
  { label: "Square", dimensions: "50 × 50 cm", ratio: "1:1" },
  { label: "Classic", dimensions: "30 × 40 cm", ratio: "3:4" },
  { label: "Poster", dimensions: "50 × 70 cm", ratio: "5:7" },
  { label: "Large", dimensions: "60 × 90 cm", ratio: "2:3" },
  { label: "Panoramic", dimensions: "100 × 50 cm", ratio: "2:1" },
];

interface Props {
  selected: PrintSize;
  onChange: (size: PrintSize) => void;
  qualityTarget: QualityTarget;
  onQualityChange: (target: QualityTarget) => void;
}

const QUALITY_OPTIONS: QualityTarget[] = ["web", "print-150", "print-300"];

export default function PrintSizeSelector({ selected, onChange, qualityTarget, onQualityChange }: Props) {
  const resolution = getResolutionForPrintSize(selected.dimensions, qualityTarget);

  return (
    <div className="space-y-3">
      <div>
        <p className="font-display font-bold text-sm text-foreground mb-2">Print Format</p>
        <div className="flex flex-wrap gap-2">
          {PRINT_SIZES.map((size) => (
            <button
              key={size.ratio}
              onClick={() => onChange(size)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-sm border font-display transition-colors",
                selected.ratio === size.ratio
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
              )}
            >
              {size.label} ({size.dimensions})
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="font-display font-bold text-sm text-foreground mb-2">Output Quality</p>
        <div className="flex flex-wrap gap-2">
          {QUALITY_OPTIONS.map((qt) => (
            <button
              key={qt}
              onClick={() => onQualityChange(qt)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-sm border font-display transition-colors",
                qualityTarget === qt
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
              )}
            >
              {QUALITY_LABELS[qt]}
            </button>
          ))}
        </div>
      </div>

      {resolution && (
        <p className="text-xs text-muted-foreground font-display">
          {selected.dimensions} at {resolution.ppi} PPI → <span className="font-bold text-foreground">{formatResolution(resolution.widthPx, resolution.heightPx)}</span>
          {qualityTarget === "print-300" && (
            <span className="text-primary ml-1">· Print premium</span>
          )}
          {qualityTarget === "print-150" && (
            <span className="text-primary ml-1">· Print standard</span>
          )}
        </p>
      )}
    </div>
  );
}
