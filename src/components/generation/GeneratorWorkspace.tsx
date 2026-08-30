import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Presentation-only desktop workspace shell for the generator.
 *
 * Desktop (lg+): two columns — controls on the left, artwork/result on the
 * right, with the result panel sticky so the current artwork stays visible
 * while settings are adjusted.
 * Small screens: single column, controls first, then result (previous
 * vertical behaviour).
 *
 * This component contains no generation logic whatsoever.
 */
export function GeneratorWorkspace({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-6 lg:gap-8 items-start">
      {children}
    </div>
  );
}

export function WorkspaceControls({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4 min-w-0", className)} data-testid="generator-controls">
      {children}
    </div>
  );
}

export function WorkspaceResult({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="generator-result"
      className={cn(
        "relative min-h-[320px] lg:min-h-[520px] flex items-center justify-center",
        "rounded-sm border border-border bg-card paper-texture",
        "lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default GeneratorWorkspace;
