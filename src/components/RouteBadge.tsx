/**
 * Tiny visual badge that explains where an image was generated.
 *
 * Now communicates THREE things at a glance:
 *   - which provider/model ran (SDXL, Gemini)
 *   - whether the call was DIRECT (🟢) or via the Lovable gateway (🟡)
 *   - whether a fallback rescued the request (🔁)
 *
 * Surfaces: generator card, comparison panel, gallery lightbox.
 * Stays compact so it never crowds the UI. Uses semantic tokens only.
 */

import { Cpu, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { executionRouteLabel, executionRouteKind } from "@/lib/style-routing";

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
  openai: "OpenAI",
};

const KIND_STYLES: Record<
  ReturnType<typeof executionRouteKind>,
  { dot: string; ring: string; label: string; emoji: string }
> = {
  direct: {
    dot: "bg-emerald-500",
    ring: "border-emerald-500/40 bg-emerald-500/10",
    label: "Direct",
    emoji: "🟢",
  },
  lovable: {
    dot: "bg-amber-400",
    ring: "border-amber-400/40 bg-amber-400/10",
    label: "Lovable",
    emoji: "🟡",
  },
  fallback: {
    dot: "bg-primary",
    ring: "border-primary/40 bg-primary/10",
    label: "Fallback",
    emoji: "🔁",
  },
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
  const kind = executionRouteKind(route);
  const styles = KIND_STYLES[kind];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border border-border bg-secondary/60 text-secondary-foreground",
        "font-display text-[10px] leading-tight",
        className,
      )}
      title={`Model: ${model || providerLabel} · Route: ${routeLabel}${fallback ? " (fallback)" : ""}`}
    >
      {/* Direct vs Lovable vs Fallback indicator */}
      <span
        className={cn(
          "inline-flex items-center gap-1 px-1 py-0.5 rounded-sm border",
          styles.ring,
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", styles.dot)} />
        <span className="font-bold uppercase tracking-wide">{styles.label}</span>
      </span>

      <Cpu className="h-3 w-3 text-primary" />
      <span className="font-bold">{providerLabel}</span>

      {variant === "full" && (
        <>
          <ArrowRightLeft className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-foreground/80">{routeLabel}</span>
        </>
      )}
    </div>
  );
}
