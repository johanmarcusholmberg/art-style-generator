import { cn } from "@/lib/utils";

export interface PrintSize {
  label: string;
  dimensions: string;
  ratio: string; // e.g. "5:7"
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
}

export default function PrintSizeSelector({ selected, onChange }: Props) {
  return (
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
      <p className="text-xs text-muted-foreground mt-1.5 font-display">
        Uses a high-quality model for sharper, more detailed output. Best results for prints up to 50 cm.
      </p>
    </div>
  );
}
