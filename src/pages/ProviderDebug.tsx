import { useEffect, useState } from "react";
import { Loader2, Play, CheckCircle2, XCircle, KeyRound, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import StyleNav from "@/components/StyleNav";
import { GENERATOR_PROVIDERS, type ResolvedProviderId } from "@/lib/generators";
import { cn } from "@/lib/utils";

interface PromptDebugResult {
  style: string;
  subject: string;
  category: string;
  gemini: { prompt: string; length: number };
  sdxl: {
    prompt: string;
    negativePrompt?: string;
    length: number;
    negativeLength: number;
    category: string;
  };
  openai?: { prompt: string; length: number; category: string };
}

const DEBUG_STYLE_KEYS = [
  "popart",
  "popart-freestyle",
  "minimalism",
  "minimalism-freestyle",
  "lineart",
  "lineart-minimal",
  "screenprint",
  "risograph",
  "brutalistposter",
  "retrocomic",
  "pulpmagazine",
  "tattooflash",
  "japanese",
  "freestyle",
  "graffiti",
  "botanical",
  "urbannoir",
  "xeroxzine",
];

interface HealthRow {
  providerId: ResolvedProviderId;
  modelId: string;
  status: "ready" | "missing-key" | "connection-failed" | "model-unavailable" | "unknown";
  message: string;
  latencyMs?: number;
  sampleImageUrl?: string;
  testedAt: string;
}

export default function ProviderDebug() {
  const { toast } = useToast();
  const [quick, setQuick] = useState<HealthRow[] | null>(null);
  const [results, setResults] = useState<Record<ResolvedProviderId, HealthRow | null>>({
    sdxl: null,
    gemini: null,
    openai: null,
  });
  const [running, setRunning] = useState<Record<ResolvedProviderId, boolean>>({
    sdxl: false,
    gemini: false,
    openai: false,
  });
  const [loadingQuick, setLoadingQuick] = useState(true);

  // Prompt comparison state
  const [promptStyle, setPromptStyle] = useState<string>("popart");
  const [promptSubject, setPromptSubject] = useState<string>(
    "A lone fisherman in a small boat at sunset",
  );
  const [promptResult, setPromptResult] = useState<PromptDebugResult | null>(null);
  const [comparingPrompt, setComparingPrompt] = useState(false);

  const comparePrompts = async () => {
    setComparingPrompt(true);
    try {
      const { data, error } = await supabase.functions.invoke("prompt-debug", {
        method: "POST",
        body: { style: promptStyle, prompt: promptSubject },
      });
      if (error) throw error;
      setPromptResult(data as PromptDebugResult);
    } catch (e: any) {
      toast({
        title: "Prompt compare failed",
        description: e.message || String(e),
        variant: "destructive",
      });
    } finally {
      setComparingPrompt(false);
    }
  };

  const fetchQuick = async () => {
    setLoadingQuick(true);
    try {
      const { data, error } = await supabase.functions.invoke("provider-health", { method: "GET" });
      if (error) throw error;
      setQuick(data?.providers || []);
    } catch (e: any) {
      toast({ title: "Health check failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setLoadingQuick(false);
    }
  };

  useEffect(() => { fetchQuick(); }, []);

  const runLiveTest = async (providerId: ResolvedProviderId) => {
    setRunning((r) => ({ ...r, [providerId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("provider-health", {
        method: "POST",
        body: { providerId },
      });
      if (error) throw error;
      const row: HealthRow | undefined = data?.providers?.[0];
      if (row) {
        setResults((r) => ({ ...r, [providerId]: row }));
        toast({
          title: row.status === "ready" ? `${providerId.toUpperCase()} test passed` : `${providerId.toUpperCase()} test failed`,
          description: row.status === "ready"
            ? `Generated in ${row.latencyMs}ms`
            : row.message,
          variant: row.status === "ready" ? "default" : "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Live test error", description: e.message || String(e), variant: "destructive" });
    } finally {
      setRunning((r) => ({ ...r, [providerId]: false }));
    }
  };

  const StatusBadge = ({ status }: { status: HealthRow["status"] }) => {
    const map: Record<HealthRow["status"], { label: string; cls: string; icon: any }> = {
      "ready": { label: "Ready", cls: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle2 },
      "missing-key": { label: "Missing key", cls: "bg-amber-500/10 text-amber-500 border-amber-500/30", icon: KeyRound },
      "connection-failed": { label: "Connection failed", cls: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
      "model-unavailable": { label: "Model unavailable", cls: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
      "unknown": { label: "Unknown", cls: "bg-muted text-muted-foreground border-border", icon: XCircle },
    };
    const m = map[status];
    const Icon = m.icon;
    return (
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[11px] font-display", m.cls)}>
        <Icon className="h-3 w-3" /> {m.label}
      </span>
    );
  };

  const providers: ResolvedProviderId[] = ["sdxl", "gemini", "openai"];

  return (
    <div className="min-h-screen bg-background paper-texture">
      <StyleNav activePath="/debug/providers" />

      <header className="pt-8 pb-6 text-center px-4">
        <p className="font-display text-primary text-xs tracking-[0.3em] uppercase mb-2">
          Debug · Provider Health
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-2">
          Generator Providers
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-sm">
          Test each generator connection and see which key/model is configured.
        </p>
      </header>

      <main className="pb-20 px-4 max-w-3xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <p className="font-display text-sm text-muted-foreground">
            Quick status (env-var presence only):
          </p>
          <Button variant="ghost" size="sm" onClick={fetchQuick} disabled={loadingQuick} className="font-display text-xs">
            {loadingQuick ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Refresh
          </Button>
        </div>

        {providers.map((id) => {
          const provider = GENERATOR_PROVIDERS[id];
          const quickRow = quick?.find((q) => q.providerId === id);
          const liveRow = results[id];
          const isRunning = running[id];
          const display = liveRow || quickRow;

          return (
            <Card key={id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-display text-lg font-bold text-foreground">{provider.displayName}</h2>
                    {display && <StatusBadge status={display.status} />}
                    {provider.fallbackPriority === 1 && (
                      <span className="text-[10px] font-display text-primary border border-primary/30 px-1.5 py-0.5 rounded-sm">
                        Auto primary
                      </span>
                    )}
                  </div>
                  <p className="font-display text-xs text-muted-foreground">{provider.description}</p>
                  <p className="font-display text-[11px] text-muted-foreground mt-1">
                    Model: <span className="text-foreground">{provider.modelId}</span> · Quality: {provider.qualityTier} · Speed: {provider.speedTier}
                  </p>
                  <p className="font-display text-[11px] text-muted-foreground">
                    Text-to-image: {provider.supportsTextToImage ? "✓" : "✗"} · Image-to-image: {provider.supportsImageToImage ? "✓" : "✗"}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runLiveTest(id)}
                  disabled={isRunning}
                  className="font-display text-xs flex-shrink-0"
                >
                  {isRunning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                  {isRunning ? "Testing…" : "Run live test"}
                </Button>
              </div>

              {display && (
                <div className="border-t border-border pt-2">
                  <p className="font-display text-[11px] text-muted-foreground">
                    {display.message}
                    {display.latencyMs ? ` · ${display.latencyMs}ms` : ""}
                  </p>
                  {liveRow?.sampleImageUrl && (
                    <div className="mt-2">
                      <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Sample</p>
                      <img
                        src={liveRow.sampleImageUrl}
                        alt={`${provider.displayName} test sample`}
                        className="h-32 w-32 object-cover rounded-sm border border-border"
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        <Card className="p-4 bg-muted/30">
          <p className="font-display text-xs font-bold text-foreground mb-1">Auto strategy</p>
          <p className="font-display text-xs text-muted-foreground leading-relaxed">
            Auto is deterministic: it always tries <span className="font-bold text-foreground">SDXL</span> first
            (premium / print-oriented). If SDXL fails for any reason it falls back to{" "}
            <span className="font-bold text-foreground">Gemini</span>. Manually-selected providers never
            silently fall back — failures surface as clear errors.
          </p>
        </Card>

        {/* ── Provider-aware prompt comparison ─────────────────────── */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold text-foreground">
              Compare prompts (Gemini vs SDXL)
            </h2>
          </div>
          <p className="font-display text-xs text-muted-foreground">
            Inspect how the same style + subject is translated for each provider.
            SDXL gets front-loaded constraints + a dedicated negative prompt;
            Gemini gets the rich descriptive prompt.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-[200px,1fr,auto] gap-2 items-start">
            <Select value={promptStyle} onValueChange={setPromptStyle}>
              <SelectTrigger className="font-display text-xs">
                <SelectValue placeholder="Style" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {DEBUG_STYLE_KEYS.map((s) => (
                  <SelectItem key={s} value={s} className="font-display text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={promptSubject}
              onChange={(e) => setPromptSubject(e.target.value)}
              placeholder="Subject prompt…"
              className="font-display text-xs min-h-[40px]"
              rows={2}
            />
            <Button
              size="sm"
              onClick={comparePrompts}
              disabled={comparingPrompt || !promptSubject.trim()}
              className="font-display text-xs"
            >
              {comparingPrompt ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Play className="h-3 w-3 mr-1" />
              )}
              Compile
            </Button>
          </div>

          {promptResult && (
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="font-display text-[11px] text-muted-foreground">
                Style: <span className="text-foreground">{promptResult.style}</span> · Category:{" "}
                <span className="text-foreground">{promptResult.category}</span>
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
                    Gemini · {promptResult.gemini.length} chars
                  </p>
                  <pre className="bg-muted/50 border border-border rounded-sm p-2 text-[10px] leading-snug whitespace-pre-wrap break-words max-h-80 overflow-y-auto font-mono text-foreground">
                    {promptResult.gemini.prompt}
                  </pre>
                </div>
                <div className="space-y-1">
                  <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
                    SDXL · {promptResult.sdxl.length} chars
                  </p>
                  <pre className="bg-muted/50 border border-border rounded-sm p-2 text-[10px] leading-snug whitespace-pre-wrap break-words max-h-80 overflow-y-auto font-mono text-foreground">
                    {promptResult.sdxl.prompt}
                  </pre>
                  {promptResult.sdxl.negativePrompt && (
                    <>
                      <p className="font-display text-[10px] uppercase tracking-wider text-destructive mt-2">
                        SDXL Negative · {promptResult.sdxl.negativeLength} chars
                      </p>
                      <pre className="bg-destructive/5 border border-destructive/30 rounded-sm p-2 text-[10px] leading-snug whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono text-foreground">
                        {promptResult.sdxl.negativePrompt}
                      </pre>
                    </>
                  )}
                </div>
                {promptResult.openai && (
                  <div className="space-y-1">
                    <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
                      OpenAI · {promptResult.openai.length} chars
                    </p>
                    <pre className="bg-muted/50 border border-border rounded-sm p-2 text-[10px] leading-snug whitespace-pre-wrap break-words max-h-80 overflow-y-auto font-mono text-foreground">
                      {promptResult.openai.prompt}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
