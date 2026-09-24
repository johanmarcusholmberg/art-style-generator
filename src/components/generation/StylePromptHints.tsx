import { useMemo } from "react";
import { Lightbulb, AlertTriangle } from "lucide-react";
import type { StyleRules } from "@/lib/prompt-rules";
import { detectPromptConflicts, getStylePromptHints } from "@/lib/prompt-hints";

interface Props {
  rules: StyleRules | undefined | null;
  prompt: string;
  colorOverride: string;
}

export default function StylePromptHints({ rules, prompt, colorOverride }: Props) {
  const hints = useMemo(() => getStylePromptHints(rules), [rules]);
  const conflicts = useMemo(() => detectPromptConflicts(prompt, rules), [prompt, rules]);
  if (!rules) return null;

  return (
    <div className="space-y-2">
      {conflicts.length > 0 && (
        <div className="rounded-sm border border-border bg-muted/40 px-3 py-2 space-y-1">
          {conflicts.map((c) => (
            <p key={c} className="font-display text-xs text-foreground flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" /> {c}
            </p>
          ))}
        </div>
      )}
      <details className="group rounded-sm border border-border bg-card/60" open>
        <summary className="cursor-pointer select-none px-3 py-2 flex items-center gap-2 font-display text-xs font-bold text-foreground">
          <Lightbulb className="h-3.5 w-3.5 text-primary" /> Tips for this style
        </summary>
        <div className="px-3 pb-3 grid gap-2 sm:grid-cols-2 font-display text-xs text-muted-foreground">
          {hints.worksWellWith.length > 0 && (
            <div>
              <p className="font-bold text-foreground mb-0.5">Does well with</p>
              <ul className="list-disc pl-4 space-y-0.5">{hints.worksWellWith.map((h) => <li key={h}>{h}</li>)}</ul>
            </div>
          )}
          {hints.composition.length > 0 && (
            <div>
              <p className="font-bold text-foreground mb-0.5">Composition</p>
              <ul className="list-disc pl-4 space-y-0.5">{hints.composition.map((h) => <li key={h}>{h}</li>)}</ul>
            </div>
          )}
          <div>
            <p className="font-bold text-foreground mb-0.5">Colors</p>
            {colorOverride.trim() ? (
              <p>Your colors will be used: <span className="text-foreground">{colorOverride.trim()}</span></p>
            ) : (
              <p>Colors come from the style{hints.defaultPalette[0] ? ` (${hints.defaultPalette[0].toLowerCase()})` : ""}. Want others? Set them under "Colors" below.</p>
            )}
          </div>
          {hints.avoid.length > 0 && (
            <div>
              <p className="font-bold text-foreground mb-0.5">Avoid</p>
              <ul className="list-disc pl-4 space-y-0.5">{hints.avoid.map((h) => <li key={h}>{h}</li>)}</ul>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
