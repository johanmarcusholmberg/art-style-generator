/**
 * Provider Comparison panel.
 *
 * Generates the SAME prompt + style on multiple providers in parallel
 * and lets the user pick which result becomes the active image in the
 * generator. Used purely for evaluation — the picked image then flows
 * through the regular save / upscale / export pipeline unchanged.
 *
 * Design: deliberately lightweight. Each result card shows the route
 * badge (model + execution route) so it's obvious where it came from.
 */

import { useState } from "react";
import { Loader2, ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import RouteBadge from "@/components/RouteBadge";
import { useImageFeedback } from "@/hooks/use-image-feedback";
import type { NormalizedGenerationResponse } from "@/lib/generation-types";

interface CompareRequest {
  prompt: string;
  styleKey: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  printMode?: boolean;
  referenceImageUrl?: string;
  isEdit?: boolean;
}

export interface ComparisonResultPick {
  imageUrl: string;
  response: NormalizedGenerationResponse;
}

interface ProviderComparisonProps {
  request: CompareRequest;
  /** Adapters to race against each other. */
  adapters: Array<{ id: "lovable" | "gemini" | "replicate"; label: string }>;
  onPick: (pick: ComparisonResultPick) => void;
  onClose: () => void;
}

interface SlotState {
  loading: boolean;
  error?: string;
  response?: NormalizedGenerationResponse;
}

export default function ProviderComparison({
  request,
  adapters,
  onPick,
  onClose,
}: ProviderComparisonProps) {
  const { toast } = useToast();
  const [slots, setSlots] = useState<Record<string, SlotState>>(() =>
    Object.fromEntries(adapters.map((a) => [a.id, { loading: false }])),
  );
  const [running, setRunning] = useState(false);

  const runAll = async () => {
    setRunning(true);
    setSlots(Object.fromEntries(adapters.map((a) => [a.id, { loading: true }])));

    const { generateImage } = await import("@/lib/generation-router");

    await Promise.all(
      adapters.map(async (a) => {
        try {
          // Each comparison slot must hit ONE specific path so the user can
          // judge per-provider quality. Map adapter id → the right call:
          //   - "lovable"   → call Lovable adapter directly (the gateway path)
          //   - "replicate" → router with pref "sdxl" (now → direct Replicate)
          //   - "gemini"    → router with pref "gemini" (direct Gemini)
          let response;
          if (a.id === "lovable") {
            const { generateWithLovableAdapter } = await import(
              "@/lib/generation-providers/lovable",
            );
            response = await generateWithLovableAdapter({
              prompt: request.prompt,
              styleKey: request.styleKey,
              aspectRatio: request.aspectRatio,
              backgroundStyle: request.backgroundStyle,
              printMode: request.printMode,
              providerPreference: "sdxl",
              referenceImageUrl: request.referenceImageUrl,
              isEdit: request.isEdit,
            });
          } else {
            const pref = a.id === "gemini" ? "gemini" : "sdxl";
            const out = await generateImage({
              prompt: request.prompt,
              styleKey: request.styleKey,
              aspectRatio: request.aspectRatio,
              backgroundStyle: request.backgroundStyle,
              printMode: request.printMode,
              providerPreference: pref,
              referenceImageUrl: request.referenceImageUrl,
              isEdit: request.isEdit,
            });
            response = out.response;
          }
          setSlots((prev) => ({ ...prev, [a.id]: { loading: false, response } }));
        } catch (err: any) {
          const msg = err?.message || "Generation failed";
          setSlots((prev) => ({
            ...prev,
            [a.id]: { loading: false, error: msg },
          }));
          toast({
            title: `${a.label} failed`,
            description: msg,
            variant: "destructive",
          });
        }
      }),
    );

    setRunning(false);
  };

  const anyImage = Object.values(slots).some((s) => s.response);

  return (
    <div className="rounded-sm border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-sm font-bold text-foreground">
            Compare providers
          </p>
          <p className="font-display text-[11px] text-muted-foreground leading-snug">
            Same prompt, run on each provider in parallel. Pick the result you
            like best to continue.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="font-display text-xs h-7"
        >
          Close
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={runAll}
          disabled={running}
          size="sm"
          className="font-display text-xs"
        >
          {running ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Generating both…
            </>
          ) : anyImage ? (
            "Re-run comparison"
          ) : (
            "Run comparison"
          )}
        </Button>
        <span className="font-display text-[10px] text-muted-foreground">
          Style: <span className="text-foreground">{request.styleKey}</span>
          {" · "}
          Ratio: <span className="text-foreground">{request.aspectRatio || "1:1"}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {adapters.map((a) => (
          <ComparisonSlot
            key={a.id}
            label={a.label}
            state={slots[a.id]}
            onPick={(res) =>
              onPick({ imageUrl: res.imageUrl, response: res })
            }
            request={request}
          />
        ))}
      </div>
    </div>
  );
}

interface ComparisonSlotProps {
  label: string;
  state: SlotState;
  request: CompareRequest;
  onPick: (response: NormalizedGenerationResponse) => void;
}

function ComparisonSlot({ label, state, request, onPick }: ComparisonSlotProps) {
  const res = state.response;
  const { rating, setFeedback } = useImageFeedback({
    prompt: request.prompt,
    styleKey: request.styleKey,
    provider: res?.generationProvider,
    route: res?.executionRoute,
  });

  return (
    <div className="rounded-sm border border-border bg-card overflow-hidden flex flex-col">
      <div className="px-2.5 py-1.5 border-b border-border flex items-center justify-between gap-2">
        <span className="font-display text-xs font-bold text-foreground">
          {label}
        </span>
        {res && (
          <RouteBadge
            provider={res.generationProvider}
            model={res.generationModel}
            route={res.executionRoute}
            fallback={res.fallbackUsed}
            variant="compact"
          />
        )}
      </div>

      <div className="relative aspect-square bg-muted flex items-center justify-center">
        {state.loading && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-display text-[10px]">Generating…</span>
          </div>
        )}
        {!state.loading && state.error && (
          <p className="font-display text-[11px] text-destructive px-3 text-center">
            {state.error}
          </p>
        )}
        {!state.loading && res && (
          <img
            src={res.imageUrl}
            alt={`${label} result`}
            className="w-full h-full object-contain"
          />
        )}
        {!state.loading && !state.error && !res && (
          <span className="font-display text-[10px] text-muted-foreground">
            Not generated yet
          </span>
        )}
      </div>

      {res && (
        <div className="p-2 space-y-1.5">
          <p className="font-display text-[10px] text-muted-foreground">
            Model: <span className="text-foreground">{res.generationModel}</span>
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFeedback("up")}
                className={cn(
                  "p-1 rounded-sm border transition-colors",
                  rating === "up"
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
                title="Mark as good"
              >
                <ThumbsUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setFeedback("down")}
                className={cn(
                  "p-1 rounded-sm border transition-colors",
                  rating === "down"
                    ? "bg-destructive/15 border-destructive/40 text-destructive"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
                title="Mark as bad"
              >
                <ThumbsDown className="h-3 w-3" />
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => onPick(res)}
              className="font-display text-[11px] h-7"
            >
              <Check className="h-3 w-3 mr-1" />
              Use this
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
