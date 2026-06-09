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
import { Loader2, ThumbsUp, ThumbsDown, Check, Save } from "lucide-react";
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
  adapters: Array<{ id: "lovable" | "gemini" | "replicate" | "openai"; label: string }>;
  onPick: (pick: ComparisonResultPick) => void;
  onClose: () => void;
  /**
   * Optional per-result save handler. When provided, each successful card
   * shows a "Save to gallery" button independent of "Use this". Should
   * resolve on success and throw on failure.
   */
  onSaveResult?: (pick: ComparisonResultPick) => Promise<void>;
}

interface SlotDebug {
  adapter: string;
  startedAt: string;
  elapsedMs: number;
  request: unknown;
  ok: boolean;
  errorName?: string;
  errorMessage?: string;
  httpStatus?: number;
  responseBody?: unknown;
  truncated?: boolean;
}

import { sanitizeForDebug, stripUrlSecrets } from "@/lib/debug-sanitize";

const MAX_STRING_LEN = 2_000;
const MAX_BODY_BYTES = 20_000;

interface SlotState {
  loading: boolean;
  error?: string;
  response?: NormalizedGenerationResponse;
  debug?: SlotDebug;
}

export default function ProviderComparison({
  request,
  adapters,
  onPick,
  onClose,
  onSaveResult,
}: ProviderComparisonProps) {
  const { toast } = useToast();
  const [slots, setSlots] = useState<Record<string, SlotState>>(() =>
    Object.fromEntries(adapters.map((a) => [a.id, { loading: false }])),
  );
  const [running, setRunning] = useState(false);

  const runAll = async () => {
    setRunning(true);
    setSlots(Object.fromEntries(adapters.map((a) => [a.id, { loading: true }])));

    // Each comparison slot must hit ONE specific adapter so the user can
    // judge per-provider quality. We deliberately bypass the router here —
    // the router's fallback chain (e.g. sdxl → replicate → lovable) would
    // disguise a direct-provider failure as a successful result from a
    // different provider, defeating the entire point of "compare".
    const [
      { generateWithLovableAdapter },
      { generateWithGeminiAdapter },
      { generateWithReplicateAdapter },
      { generateWithOpenAIAdapter },
    ] = await Promise.all([
      import("@/lib/generation-providers/lovable"),
      import("@/lib/generation-providers/gemini"),
      import("@/lib/generation-providers/replicate"),
      import("@/lib/generation-providers/openai"),
    ]);

    await Promise.all(
      adapters.map(async (a) => {
        const baseReq = {
          prompt: request.prompt,
          styleKey: request.styleKey,
          aspectRatio: request.aspectRatio,
          backgroundStyle: request.backgroundStyle,
          printMode: request.printMode,
          referenceImageUrl: request.referenceImageUrl,
          isEdit: request.isEdit,
        };
        const adapterReq =
          a.id === "lovable"
            ? { ...baseReq, providerPreference: "sdxl" as const }
            : a.id === "gemini"
              ? { ...baseReq, providerPreference: "gemini" as const }
              : a.id === "replicate"
                ? { ...baseReq, providerPreference: "sdxl" as const }
                : { ...baseReq, providerPreference: "openai" as const };
        const startedAt = new Date().toISOString();
        const t0 = performance.now();
        try {
          let response;
          if (a.id === "lovable") {
            response = await generateWithLovableAdapter(adapterReq as any);
          } else if (a.id === "gemini") {
            response = await generateWithGeminiAdapter(adapterReq as any);
          } else if (a.id === "replicate") {
            response = await generateWithReplicateAdapter(adapterReq as any);
          } else {
            response = await generateWithOpenAIAdapter(adapterReq as any);
          }
          const elapsedMs = Math.round(performance.now() - t0);
          const debug: SlotDebug = {
            adapter: a.id,
            startedAt,
            elapsedMs,
            request: sanitizeForDebug(adapterReq),
            ok: true,
            responseBody: sanitizeForDebug({
              imageUrlPreview:
                typeof response.imageUrl === "string"
                  ? stripUrlSecrets(response.imageUrl).slice(0, 120) +
                    (response.imageUrl.length > 120 ? "…" : "")
                  : null,
              provider: response.generationProvider,
              model: response.generationModel,
              route: response.executionRoute,
              width: response.width,
              height: response.height,
              metadata: response.metadata,
            }),
          };
          setSlots((prev) => ({
            ...prev,
            [a.id]: { loading: false, response, debug },
          }));
        } catch (err: any) {
          const elapsedMs = Math.round(performance.now() - t0);
          // supabase-js FunctionsHttpError exposes the raw Response via .context
          let httpStatus: number | undefined;
          let responseBody: unknown;
          let truncated = false;
          const ctx = err?.context;
          if (ctx && typeof ctx === "object" && typeof (ctx as Response).clone === "function") {
            try {
              const resp = (ctx as Response).clone();
              httpStatus = resp.status;
              const reader = resp.body?.getReader();
              if (reader) {
                const chunks: Uint8Array[] = [];
                let total = 0;
                while (total < MAX_BODY_BYTES) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  chunks.push(value);
                  total += value.byteLength;
                }
                if (total >= MAX_BODY_BYTES) {
                  truncated = true;
                  try { await reader.cancel(); } catch { /* ignore */ }
                }
                const raw = new TextDecoder().decode(
                  chunks.reduce((acc, c) => {
                    const merged = new Uint8Array(acc.length + c.length);
                    merged.set(acc, 0);
                    merged.set(c, acc.length);
                    return merged;
                  }, new Uint8Array()),
                );
                try {
                  responseBody = JSON.parse(raw);
                } catch {
                  // Not JSON — could be HTML error page. Keep as string preview only.
                  responseBody = raw.slice(0, MAX_STRING_LEN);
                }
              }
            } catch {
              /* ignore — leave responseBody undefined */
            }
          }
          const msg =
            (responseBody && typeof responseBody === "object" &&
              typeof (responseBody as any).error === "string" &&
              (responseBody as any).error) ||
            (typeof err?.message === "string" && err.message) ||
            "Generation failed";
          const debug: SlotDebug = {
            adapter: a.id,
            startedAt,
            elapsedMs,
            request: sanitizeForDebug(adapterReq),
            ok: false,
            errorName: typeof err?.name === "string" ? err.name : undefined,
            errorMessage: typeof err?.message === "string" ? err.message : undefined,
            httpStatus,
            responseBody: sanitizeForDebug(responseBody),
            truncated,
          };
          if (import.meta.env.DEV) {
            console.error(`[ProviderComparison] ${a.id} failed`, debug);
          }
          setSlots((prev) => ({
            ...prev,
            [a.id]: { loading: false, error: String(msg).slice(0, 500), debug },
          }));
          toast({
            title: `${a.label} failed`,
            description: String(msg).slice(0, 300),
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
            onSave={
              onSaveResult
                ? (res) => onSaveResult({ imageUrl: res.imageUrl, response: res })
                : undefined
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
  onSave?: (response: NormalizedGenerationResponse) => Promise<void>;
}

function ComparisonSlot({ label, state, request, onPick, onSave }: ComparisonSlotProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {onSave && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving || saved}
                  onClick={async () => {
                    if (!res) return;
                    setSaving(true);
                    try {
                      await onSave(res);
                      setSaved(true);
                      toast({
                        title: "Saved to gallery",
                        description: `${res.generationProvider.toUpperCase()} result added.`,
                      });
                    } catch (err: any) {
                      toast({
                        title: "Save failed",
                        description: err?.message || "Could not save image",
                        variant: "destructive",
                      });
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="font-display text-[11px] h-7"
                  title="Save this result to gallery"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : saved ? (
                    <Check className="h-3 w-3 mr-1" />
                  ) : (
                    <Save className="h-3 w-3 mr-1" />
                  )}
                  {saved ? "Saved" : saving ? "Saving…" : "Save to gallery"}
                </Button>
              )}
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
        </div>
      )}
      {state.debug && <DebugLog debug={state.debug} />}
    </div>
  );
}

function DebugLog({ debug }: { debug: SlotDebug }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(!debug.ok);
  // Defensive: JSON.stringify can throw on circular refs even after sanitize.
  let json: string;
  try {
    json = JSON.stringify(debug, null, 2);
  } catch {
    json = JSON.stringify(
      { adapter: debug.adapter, ok: debug.ok, error: "[unserializable debug payload]" },
      null,
      2,
    );
  }
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      } else {
        // Fallback for non-secure contexts
        const ta = document.createElement("textarea");
        ta.value = json;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast({ title: "Debug log copied" });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the log text manually.",
        variant: "destructive",
      });
    }
  };
  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2.5 py-1 flex items-center justify-between gap-2 hover:bg-muted/40"
      >
        <span className="font-display text-[10px] uppercase tracking-wide text-muted-foreground">
          {debug.ok ? "Debug log" : "Error log"}
          {debug.httpStatus ? ` · HTTP ${debug.httpStatus}` : ""}
          {` · ${debug.elapsedMs}ms`}
          {debug.truncated ? " · truncated" : ""}
        </span>
        <span className="font-display text-[10px] text-muted-foreground">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="p-2 space-y-1.5 min-w-0">
          <pre className="text-[10px] leading-snug max-h-64 overflow-auto bg-muted/40 rounded-sm p-2 whitespace-pre-wrap break-all">
            {json}
          </pre>
          <button
            type="button"
            onClick={copy}
            className="font-display text-[10px] underline text-muted-foreground hover:text-foreground"
          >
            Copy log
          </button>
        </div>
      )}
    </div>
  );
}
