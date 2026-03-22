import { useState, useMemo } from "react";
import { Loader2, Layers, Grid3X3, Combine, Zap, Sparkles, Plus, X, AlertTriangle } from "lucide-react";
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

const MAX_IMAGES_WARN = 20;
const MAX_IMAGES_HARD = 50;

interface MatrixVariable {
  name: string;
  values: string[];
}

/**
 * Parse inline {a, b, c} syntax from prompt text into matrix variables.
 * Returns the cleaned base prompt and extracted variables.
 */
function parseInlineSyntax(prompt: string): { basePrompt: string; inlineVars: MatrixVariable[] } {
  const regex = /\{([^}]+)\}/g;
  const vars: MatrixVariable[] = [];
  let idx = 1;
  let match;

  while ((match = regex.exec(prompt)) !== null) {
    const values = match[1].split(",").map((v) => v.trim()).filter(Boolean);
    if (values.length > 0) {
      vars.push({ name: `Var${idx}`, values });
      idx++;
    }
  }

  const basePrompt = prompt.replace(regex, "{{PLACEHOLDER}}").trim();
  return { basePrompt, inlineVars: vars };
}

export default function BatchGenerator() {
  const [prompt, setPrompt] = useState("");
  const [batchSize, setBatchSize] = useState(4);
  const [hdEnhance, setHdEnhance] = useState(false);
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
  const [styleGridEnabled, setStyleGridEnabled] = useState(false);

  // Matrix
  const [matrixVars, setMatrixVars] = useState<MatrixVariable[]>([
    { name: "Lighting", values: ["sunset", "sunrise"] },
  ]);
  const [newVarName, setNewVarName] = useState("");
  const [newVarValues, setNewVarValues] = useState<Record<number, string>>({});

  const toggleStyle = (value: string) => {
    setSelectedStyles((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  };

  const selectAllStyles = () => {
    const allNonFreestyle = ALL_STYLES.filter((s) => !s.value.includes("freestyle")).map((s) => s.value);
    setSelectedStyles(allNonFreestyle);
  };

  const clearStyles = () => setSelectedStyles([]);

  const addMatrixVar = () => {
    if (!newVarName.trim()) return;
    setMatrixVars((prev) => [...prev, { name: newVarName.trim(), values: [] }]);
    setNewVarName("");
  };

  const removeMatrixVar = (idx: number) => {
    setMatrixVars((prev) => prev.filter((_, i) => i !== idx));
  };

  const addValueToVar = (varIdx: number) => {
    const val = newVarValues[varIdx]?.trim();
    if (!val) return;
    setMatrixVars((prev) =>
      prev.map((v, i) =>
        i === varIdx && !v.values.includes(val) ? { ...v, values: [...v.values, val] } : v
      )
    );
    setNewVarValues((prev) => ({ ...prev, [varIdx]: "" }));
  };

  const removeValueFromVar = (varIdx: number, valIdx: number) => {
    setMatrixVars((prev) =>
      prev.map((v, i) =>
        i === varIdx ? { ...v, values: v.values.filter((_, vi) => vi !== valIdx) } : v
      )
    );
  };

  // Calculate total images across all active modes
  const { totalImages, breakdown, hasInlineSyntax } = useMemo(() => {
    const { inlineVars } = parseInlineSyntax(prompt);
    const hasInline = inlineVars.length > 0;

    let matrixCombinations = 1;

    if (jobType === "matrix") {
      // Combine explicit UI vars + inline vars
      const allVars = [...matrixVars, ...inlineVars];
      const validVars = allVars.filter((v) => v.values.length > 0);
      matrixCombinations = validVars.reduce((acc, v) => acc * v.values.length, 1);
      if (validVars.length === 0) matrixCombinations = 1;
    }

    let styleCount = 1;
    if (jobType === "style-grid") {
      styleCount = selectedStyles.length || 1;
    }

    let batchMultiplier = batchSize;
    if (jobType === "matrix") {
      // For matrix, batch size acts as variations per combination
      batchMultiplier = batchSize;
    }

    let total: number;
    let desc: string;

    if (jobType === "batch") {
      total = batchSize;
      desc = `${batchSize} variation${batchSize > 1 ? "s" : ""} of your prompt`;
    } else if (jobType === "style-grid") {
      total = styleCount * batchSize;
      desc = `${styleCount} style${styleCount > 1 ? "s" : ""} × ${batchSize} per style`;
    } else {
      // matrix
      total = matrixCombinations * batchMultiplier;
      const comboLabel = matrixCombinations > 1 ? `${matrixCombinations} combinations` : "1 combination";
      desc = batchSize > 1
        ? `${comboLabel} × ${batchSize} variations`
        : comboLabel;
    }

    return { totalImages: total, breakdown: desc, hasInlineSyntax: hasInline };
  }, [prompt, jobType, batchSize, selectedStyles, matrixVars]);

  const isOverLimit = totalImages > MAX_IMAGES_HARD;
  const isWarning = totalImages > MAX_IMAGES_WARN && totalImages <= MAX_IMAGES_HARD;

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!prompt.trim()) errors.push("Prompt is required");
    if (jobType === "style-grid" && selectedStyles.length === 0) errors.push("Select at least one style");
    if (jobType === "matrix") {
      const validVars = matrixVars.filter((v) => v.values.length > 0);
      const { inlineVars } = parseInlineSyntax(prompt);
      if (validVars.length === 0 && inlineVars.length === 0) {
        errors.push("Add at least one matrix variable with values, or use {a, b} syntax in your prompt");
      }
    }
    if (isOverLimit) errors.push(`Maximum ${MAX_IMAGES_HARD} images per job`);
    return errors;
  }, [prompt, jobType, selectedStyles, matrixVars, isOverLimit]);

  const handleSubmit = async () => {
    if (validationErrors.length > 0 || submitting) return;
    setSubmitting(true);

    try {
      // Merge inline syntax vars with UI vars for matrix mode
      let finalMatrixVars: Record<string, string[]> | undefined;
      if (jobType === "matrix") {
        const { inlineVars } = parseInlineSyntax(prompt);
        const allVars = [...matrixVars, ...inlineVars];
        const merged: Record<string, string[]> = {};
        for (const v of allVars) {
          if (v.values.length > 0) {
            merged[v.name] = v.values;
          }
        }
        if (Object.keys(merged).length > 0) finalMatrixVars = merged;
      }

      const config: BatchJobConfig = {
        prompt: prompt.trim(),
        mode: selectedMode,
        batchSize,
        aspectRatio: printSize.ratio,
        printSize: printSize.dimensions,
        hdEnhance,
        backgroundStyle,
        speedMode,
        jobType,
        styleGridStyles: jobType === "style-grid" ? selectedStyles : undefined,
        matrixVariables: finalMatrixVars,
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

  const nonFreestyleStyles = ALL_STYLES.filter((s) => !s.value.includes("freestyle"));

  return (
    <div className="w-full max-w-4xl mx-auto px-4 space-y-6">
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

        <div className="mt-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              jobType === "matrix"
                ? "Describe what you want to generate… You can also use {red, green, golden} syntax for inline variables"
                : "Describe what you want to generate…"
            }
            className="min-h-[100px] bg-card border-border font-display text-base resize-none focus-visible:ring-primary"
          />
          {hasInlineSyntax && jobType === "matrix" && (
            <p className="font-display text-xs text-primary mt-1">
              ✓ Detected inline variables from your prompt
            </p>
          )}
        </div>

        {/* ─── Batch Mode ─── */}
        <TabsContent value="batch" className="space-y-4 mt-4">
          <div>
            <Label className="font-display text-sm text-foreground">
              Number of images: <span className="font-bold">{batchSize}</span>
            </Label>
            <Slider value={[batchSize]} onValueChange={(v) => setBatchSize(v[0])} min={1} max={20} step={1} className="mt-2" />
          </div>
          <div>
            <Label className="font-display text-sm text-foreground mb-2 block">Art Style</Label>
            <div className="flex flex-wrap gap-2">
              {nonFreestyleStyles.map((style) => (
                <button key={style.value} onClick={() => setSelectedMode(style.value)} className={cn("text-xs px-3 py-1.5 rounded-sm border font-display transition-colors", selectedMode === style.value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border hover:bg-muted")}>
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ─── Style Grid Mode ─── */}
        <TabsContent value="style-grid" className="space-y-4 mt-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-display text-sm text-foreground">Select styles ({selectedStyles.length} selected)</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAllStyles} className="font-display text-xs h-7">Select All</Button>
                <Button variant="ghost" size="sm" onClick={clearStyles} className="font-display text-xs h-7">Clear</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {nonFreestyleStyles.map((style) => (
                <button key={style.value} onClick={() => toggleStyle(style.value)} className={cn("text-xs px-3 py-1.5 rounded-sm border font-display transition-colors", selectedStyles.includes(style.value) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border hover:bg-muted")}>
                  {style.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="font-display text-sm text-foreground">Images per style: <span className="font-bold">{batchSize}</span></Label>
            <Slider value={[batchSize]} onValueChange={(v) => setBatchSize(v[0])} min={1} max={5} step={1} className="mt-2" />
          </div>
        </TabsContent>

        {/* ─── Matrix Mode ─── */}
        <TabsContent value="matrix" className="space-y-4 mt-4">
          <p className="font-display text-xs text-muted-foreground">
            Define variables and their values below, or use <code className="bg-muted px-1 rounded text-[10px]">{"{red, green, golden}"}</code> syntax directly in your prompt.
          </p>

          {matrixVars.map((v, vIdx) => (
            <div key={vIdx} className="border border-border rounded-sm p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-bold text-foreground">{v.name}</span>
                <Button variant="ghost" size="sm" onClick={() => removeMatrixVar(vIdx)} className="h-6 w-6 p-0 text-destructive"><X className="h-3 w-3" /></Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {v.values.map((val, valIdx) => (
                  <Badge key={valIdx} variant="secondary" className="font-display text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors" onClick={() => removeValueFromVar(vIdx, valIdx)}>
                    {val} ×
                  </Badge>
                ))}
                {v.values.length === 0 && (
                  <span className="font-display text-xs text-muted-foreground italic">No values yet — add some below</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add value…"
                  className="h-8 text-xs font-display"
                  value={newVarValues[vIdx] || ""}
                  onChange={(e) => setNewVarValues((prev) => ({ ...prev, [vIdx]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addValueToVar(vIdx); } }}
                />
                <Button variant="outline" size="sm" onClick={() => addValueToVar(vIdx)} className="h-8 text-xs font-display">
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
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMatrixVar(); } }}
              className="h-8 text-xs font-display"
            />
            <Button variant="outline" size="sm" onClick={addMatrixVar} className="h-8 text-xs font-display whitespace-nowrap">
              <Plus className="h-3 w-3 mr-1" /> Add Variable
            </Button>
          </div>

          <div>
            <Label className="font-display text-sm text-foreground">
              Variations per combination: <span className="font-bold">{batchSize}</span>
            </Label>
            <Slider value={[batchSize]} onValueChange={(v) => setBatchSize(v[0])} min={1} max={5} step={1} className="mt-2" />
          </div>

          <div>
            <Label className="font-display text-sm text-foreground mb-2 block">Art Style</Label>
            <div className="flex flex-wrap gap-2">
              {nonFreestyleStyles.map((style) => (
                <button key={style.value} onClick={() => setSelectedMode(style.value)} className={cn("text-xs px-3 py-1.5 rounded-sm border font-display transition-colors", selectedMode === style.value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border hover:bg-muted")}>
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <PrintSizeSelector selected={printSize} onChange={setPrintSize} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <Switch id="batch-hd" checked={hdEnhance} onCheckedChange={setHdEnhance} />
          <Label htmlFor="batch-hd" className="font-display text-sm text-muted-foreground cursor-pointer flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> HD Enhance
          </Label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="font-display text-sm text-muted-foreground">Background:</Label>
        <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
          <button onClick={() => setBackgroundStyle("white")} className={cn("font-display text-xs px-2.5 py-1 rounded-sm transition-colors", backgroundStyle === "white" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>Pure White</button>
          <button onClick={() => setBackgroundStyle("cream")} className={cn("font-display text-xs px-2.5 py-1 rounded-sm transition-colors", backgroundStyle === "cream" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>Cream Paper</button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="font-display text-sm text-muted-foreground">Speed:</Label>
        <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
          <button onClick={() => setSpeedMode("fast")} className={cn("font-display text-xs px-2.5 py-1 rounded-sm transition-colors flex items-center gap-1", speedMode === "fast" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}><Zap className="h-3 w-3" /> Fast</button>
          <button onClick={() => setSpeedMode("quality")} className={cn("font-display text-xs px-2.5 py-1 rounded-sm transition-colors flex items-center gap-1", speedMode === "quality" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}><Sparkles className="h-3 w-3" /> Quality</button>
        </div>
      </div>

      {/* ─── Summary & Submit ─── */}
      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-sm text-foreground">
              Total images: <span className={cn("font-bold", isOverLimit ? "text-destructive" : isWarning ? "text-yellow-600" : "text-primary")}>{totalImages}</span>
            </p>
            <p className="font-display text-xs text-muted-foreground">{breakdown}</p>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={validationErrors.length > 0 || submitting || totalImages === 0}
            className="font-display text-sm tracking-wider"
          >
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</>
            ) : (
              <><Layers className="mr-2 h-4 w-4" /> Generate {totalImages} Images</>
            )}
          </Button>
        </div>

        {/* Warnings */}
        {isWarning && (
          <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-sm px-3 py-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p className="font-display text-xs">Large batch — this will take a while and use significant resources.</p>
          </div>
        )}

        {isOverLimit && (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded-sm px-3 py-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p className="font-display text-xs">Maximum {MAX_IMAGES_HARD} images per job. Reduce batch size or variables.</p>
          </div>
        )}

        {validationErrors.length > 0 && !isOverLimit && (
          <div className="space-y-1">
            {validationErrors.filter((e) => !e.includes("Maximum")).map((err, i) => (
              <p key={i} className="font-display text-xs text-destructive">{err}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
