/**
 * PromptInput — extracted prompt UI scaffold (Part B incremental).
 *
 * This is a small, focused component that future iterations of the
 * ImageGenerator split can adopt. ImageGenerator.tsx still owns the full
 * UI for now; this file is intentionally minimal to avoid behavior drift.
 */
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export interface PromptInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export default function PromptInput({
  value,
  onChange,
  placeholder = "Describe your image…",
  disabled,
  label = "Prompt",
  id = "prompt-input",
}: PromptInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="font-display text-xs uppercase tracking-wide">
        {label}
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
      />
    </div>
  );
}
