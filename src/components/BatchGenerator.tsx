import { useState } from "react";
import { Loader2, Layers, Grid3X3, Combine, Zap, Sparkles, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import PrintSizeSelector, { PRINT_SIZES, type PrintSize } from "@/components/PrintSizeSelector";
import { createBatchJob, ALL_STYLES, type BatchJobConfig } from "@/lib/batch-jobs";
import { cn } from "@/lib/utils";

interface MatrixVariable {
  name: string;
  values: string[];
}

export default function BatchGenerator() {
  const [prompt, setPrompt] = useState("");
  const [batchSize, setBatchSize] = useState(4);
  const [hdEnhance, setHdEnhance] = useState(false);
  const [whiteFrame, setWhiteFrame] = useState(false);
  const [backgroundStyle, setBackgroundStyle] = useState<"white" | "cream">("white");
  const [speedMode, setSpeedMode] = useState<"fast" | "quality">("fast");
  const [printSize, setPrintSize] = useState<PrintSize>(PRINT_SIZES[2]);
  const [selectedMode, setSelectedMode] = useState("japanese");
  const [jobType, setJobType] = useState<"batch" | "style-grid" | "matrix">("batch");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Style grid
  const [selectedStyles, setSelectedStyles] = useState<string[]>([
    "japanese", "popart", "lineart", "minimalism", "graffiti", "botanical",
  ]);

  // Matrix
  const [matrixVars, setMatrixVars] = useState<MatrixVariable[]>([
    { name: "Lighting", values: ["sunset", "sunrise"] },
  ]);
  const [newVarName, setNewVarName] = useState("");
  const [newVarValue, setNewVarValue] = useState("");

  const toggleStyle = (value: string) => {
    setSelectedStyles((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  };

  const addMatrixVar = () => {
    if (!newVarName.trim()) return;
    setMatrixVars((prev) => [...prev, { name: newVarName.trim(), values: [] }]);
    setNewVarName("");
  };

  const removeMatrixVar = (idx: number) => {
    setMatrixVars((prev) => prev.filter((_, i) => i !== idx));
  };

  const addValueToVar = (varIdx: number) => {
    if (!newVarValue.trim()) return;
    setMatrixVars((prev) =>
      prev.map((v, i) =>
        i === varIdx ? { ...v, values: [...v.values, newVarValue.trim()] } : v
      )
    );
    setNewVarValue("");
  };

  const removeValueFromVar = (varIdx: number, valIdx: number) => {
    setMatrixVars((prev) =>
      prev.map((v, i) =>
        i === varIdx ? { ...v, values: v.values.filter((_, vi) => vi !== valIdx) } : v
      )
    );
  };

  // Calculate total images
  const totalImages = (() => {
    if (jobType === "style-grid") return selectedStyles.length * batchSize;
    if (jobType === "matrix") {
      const combos = matrixVars.reduce((acc, v) => acc * Math.max(v.values.length, 1), 1);
      return combos;
    }
    return batchSize;
  })();

  const handleSubmit = async () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);

    try {
      const config: BatchJobConfig = {
        prompt: prompt.trim(),
        mode: selectedMode,
        batchSize,
        aspectRatio: printSize.ratio,
        printSize: printSize.dimensions,
        hdEnhance,
        whiteFrame,
        backgroundStyle,
        speedMode,
        jobType,
        styleGridStyles: jobType === "style-grid" ? selectedStyles : undefined,
        matrixVariables:
          jobType === "matrix"
            ? matrixVars.reduce(
                (acc, v) => {
                  if (v.values.length > 0) acc[v.name] = v.values;
                  return acc;
                },
                {} as Record<string, string[]>
              )
            : undefined,
      };

      await createBatchJob(config);

      toast({
        title: "Batch job started",
        description: `Generating ${totalImages} images in the background. Check the Jobs tab for progress.`,
      });

      setPrompt("");
    } catch (err: any) {
      toast({
        title: "Failed to start batch job",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 space-y-6">
      {/* Job type selector */}
      <Tabs value={jobType} onValueChange={(v) => setJobType(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="batch" className="font-display text-xs gap-1">
            <Layers className="h-3.5 w-3.5" /> Batch
          </TabsTrigger>
          <TabsTrigger value="style-grid" className="font-display text-xs gap-1">
            <Grid3X3 className="h-3.5 w-3.5" /> Style Grid
          </TabsTrigger>
          <TabsTrigger value="matrix" className="font-display text-xs gap-1">
            <Combine className="h-3.5 w-3.5" /> Prompt Matrix
          </TabsTrigger>
        </TabsList>

        {/* Prompt */}
        <div className="mt-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want to generate…"
            className="min-h-[100px] bg-card border-border font-display text-base resize-none focus-visible:ring-primary"
          />
        </div>

        {/* Batch-specific: count slider */}
        <TabsContent value="batch" className="space-y-4 mt-4">
          <div>
            <Label className="font-display text-sm text-foreground">
              Number of images: <span className="font-bold">{batchSize}</span>
            </Label>
            <Slider
              value={[batchSize]}
              onValueChange={(v) => setBatchSize(v[0])}
              min={1}
              max={20}
              step={1}
              className="mt-2"
            />
          </div>

          {/* Mode selector for batch */}
          <div>
            <Label className="font-display text-sm text-foreground mb-2 block">Art Style</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_STYLES.filter((s) => !s.value.includes("freestyle")).map((style) => (
                <button
                  key={style.value}
                  onClick={() => setSelectedMode(style.value)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-sm border font-display transition-colors",
                    selectedMode === style.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
                  )}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Style Grid: select styles */}
        <TabsContent value="style-grid" className="space-y-4 mt-4">
          <div>
            <Label className="font-display text-sm text-foreground mb-2 block">
              Select styles to generate across ({selectedStyles.length} selected)
            </Label>
            <div className="flex flex-wrap gap-2">
              {ALL_STYLES.filter((s) => !s.value.includes("freestyle")).map((style) => (
                <button
                  key={style.value}
                  onClick={() => toggleStyle(style.value)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-sm border font-display transition-colors",
                    selectedStyles.includes(style.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
                  )}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="font-display text-sm text-foreground">
              Images per style: <span className="font-bold">{batchSize}</span>
            </Label>
            <Slider
              value={[batchSize]}
              onValueChange={(v) => setBatchSize(v[0])}
              min={1}
              max={5}
              step={1}
              className="mt-2"
            />
          </div>
        </TabsContent>

        {/* Prompt Matrix */}
        <TabsContent value="matrix" className="space-y-4 mt-4">
          <p className="font-display text-xs text-muted-foreground">
            Define variables and their values. The system generates all combinations automatically.
          </p>

          {matrixVars.map((v, vIdx) => (
            <div key={vIdx} className="border border-border rounded-sm p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-bold text-foreground">{v.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMatrixVar(vIdx)}
                  className="h-6 w-6 p-0 text-destructive"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {v.values.map((val, valIdx) => (
                  <Badge
                    key={valIdx}
                    variant="secondary"
                    className="font-display text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    onClick={() => removeValueFromVar(vIdx, valIdx)}
                  >
                    {val} ×
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add value…"
                  className="h-8 text-xs font-display"
                  value={vIdx === matrixVars.length - 1 ? newVarValue : ""}
                  onChange={(e) => setNewVarValue(e.target.value)}
                  onFocus={() => {
                    /* track which var is focused if needed */
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addValueToVar(vIdx);
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addValueToVar(vIdx)}
                  className="h-8 text-xs font-display"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <Input
              placeholder="Variable name (e.g. Lighting, Color)…"
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMatrixVar();
                }
              }}
              className="h-8 text-xs font-display"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addMatrixVar}
              className="h-8 text-xs font-display"
            >
              <Plus className="h-3 w-3 mr-1" /> Add Variable
            </Button>
          </div>

          {/* Mode selector for matrix */}
          <div>
            <Label className="font-display text-sm text-foreground mb-2 block">Art Style</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_STYLES.filter((s) => !s.value.includes("freestyle")).map((style) => (
                <button
                  key={style.value}
                  onClick={() => setSelectedMode(style.value)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-sm border font-display transition-colors",
                    selectedMode === style.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
                  )}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Shared settings */}
      <PrintSizeSelector selected={printSize} onChange={setPrintSize} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <Switch id="batch-hd" checked={hdEnhance} onCheckedChange={setHdEnhance} />
          <Label htmlFor="batch-hd" className="font-display text-sm text-muted-foreground cursor-pointer flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> HD Enhance
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="batch-frame" checked={whiteFrame} onCheckedChange={setWhiteFrame} />
          <Label htmlFor="batch-frame" className="font-display text-sm text-muted-foreground cursor-pointer">
            White Frame
          </Label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="font-display text-sm text-muted-foreground">Background:</Label>
        <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
          <button
            onClick={() => setBackgroundStyle("white")}
            className={cn(
              "font-display text-xs px-2.5 py-1 rounded-sm transition-colors",
              backgroundStyle === "white"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Pure White
          </button>
          <button
            onClick={() => setBackgroundStyle("cream")}
            className={cn(
              "font-display text-xs px-2.5 py-1 rounded-sm transition-colors",
              backgroundStyle === "cream"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Cream Paper
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="font-display text-sm text-muted-foreground">Speed:</Label>
        <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
          <button
            onClick={() => setSpeedMode("fast")}
            className={cn(
              "font-display text-xs px-2.5 py-1 rounded-sm transition-colors flex items-center gap-1",
              speedMode === "fast"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="h-3 w-3" /> Fast
          </button>
          <button
            onClick={() => setSpeedMode("quality")}
            className={cn(
              "font-display text-xs px-2.5 py-1 rounded-sm transition-colors flex items-center gap-1",
              speedMode === "quality"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="h-3 w-3" /> Quality
          </button>
        </div>
      </div>

      {/* Summary & generate */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="font-display text-sm text-foreground">
            Total images: <span className="font-bold text-primary">{totalImages}</span>
          </p>
          <p className="font-display text-xs text-muted-foreground">
            {jobType === "batch"
              ? `${batchSize} variations of your prompt`
              : jobType === "style-grid"
                ? `${selectedStyles.length} styles × ${batchSize} per style`
                : `${totalImages} prompt combinations`}
          </p>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || submitting || totalImages === 0}
          className="font-display text-sm tracking-wider"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…
            </>
          ) : (
            <>
              <Layers className="mr-2 h-4 w-4" /> Generate {totalImages} Images
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
