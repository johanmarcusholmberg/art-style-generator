/**
 * GenerationModeSelector — extracted standard/print-ready toggle (Part B
 * incremental). Currently a small reusable widget; ImageGenerator.tsx
 * still owns the active wiring.
 */
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface GenerationModeSelectorProps {
  mode: "standard" | "print-ready";
  onChange: (next: "standard" | "print-ready") => void;
  disabled?: boolean;
}

export default function GenerationModeSelector({
  mode,
  onChange,
  disabled,
}: GenerationModeSelectorProps) {
  const isPrint = mode === "print-ready";
  return (
    <div className="flex items-center gap-3">
      <Switch
        id="gen-mode"
        checked={isPrint}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v ? "print-ready" : "standard")}
      />
      <Label htmlFor="gen-mode" className="font-display text-xs uppercase tracking-wide">
        {isPrint ? "Print-ready" : "Standard"}
      </Label>
    </div>
  );
}
