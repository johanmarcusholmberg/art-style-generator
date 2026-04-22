/**
 * Tiny visual badge that explains where an image was generated.
 *
 * Surfaces:
 *   - generator card (post-generation)
 *   - comparison view
 *   - gallery lightbox
 *
 * Stays compact so it never crowds the UI. Uses semantic tokens only.
 */

import { Cpu, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { executionRouteLabel } from "@/lib/style-routing";

interface RouteBadgeProps {
  /** Internal provider id from the response: "sdxl" | "gemini" */
  provider?: string | null;
  /** Specific model id, e.g. "stability-ai/sdxl" */
  model?: string | null;
  /** Execution route from the router */
  route?: string | null;
  /** True if the response was produced via Auto fallback */
  fallback?: boolean;
  className?: string;
  /** "compact" hides the model line; "full" shows model + route */
  variant?: "compact" | "full";
}

const PROVIDER_LABELS: Record<string, string> = {
  sdxl: "SDXL",
  gemini: "Gemini",
};

export default function RouteBadge({
  provider,
  model,
  route,
  fallback,
  className,
  variant = "full",
}: RouteBadgeProps) {
  if (!provider && !route) return null;

  const providerLabel = provider ? PROVIDER_LABELS[provider] ?? provider : "—";
  const routeLabel = executionRouteLabel(route);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border border-border bg-secondary/60 text-secondary-foreground",
        "font-display text-[10px] leading-tight",
        className,
      )}
      title={`Model: ${model || providerLabel} · Route: ${routeLabel}${fallback ? " (fallback)" : ""}`}
    >
      <Cpu className="h-3 w-3 text-primary" />
      <span className="font-bold">{providerLabel}</span>
      {variant === "full" && (
        <>
          <ArrowRightLeft className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-foreground/80">{routeLabel}</span>
        </>
      )}
      {fallback && (
        <span className="ml-0.5 px-1 rounded-sm bg-primary/15 text-primary font-bold">
          fallback
        </span>
      )}
    </div>
  );
}
