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

/**
 * Sticky offset accounts for the app header (`StyleNav`, h-14 = 56px) plus
 * 16px breathing room, so the artwork never hides underneath it.
 */
export function WorkspaceResult({
  children,
  className,
  align = "center",
}: {
  children: ReactNode;
  className?: string;
  /** Populated results scroll from the top; loading/empty states centre. */
  align?: "center" | "top";
}) {
  return (
    <div
      data-testid="generator-result"
      data-align={align}
      className={cn(
        "relative min-h-[320px] lg:min-h-[520px] flex justify-center",
        align === "top" ? "items-start overflow-y-auto" : "items-center",
        "rounded-sm border border-border bg-card paper-texture",
        "lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Full-width workspace band below the two primary columns. Used for visual
 * comparison surfaces (provider comparison, variant fan-out) that need the
 * whole `max-w-7xl` width to be useful on desktop.
 */
export function WorkspaceWideResult({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="generator-wide-result"
      className={cn("min-w-0 lg:col-span-2 empty:hidden", className)}
    >
      {children}
    </div>
  );
}

export default GeneratorWorkspace;
