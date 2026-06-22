/**
 * /print-calculator — PPI & tiling calculator.
 *
 * Lets the user enter a source pixel size (or pick from common generation
 * sizes), choose a print format and target PPI, and see:
 *   - Required pixels at the target PPI
 *   - Effective PPI for each enabled upscale preset
 *   - Whether each preset reaches the target
 *   - Approx tile count for tiled presets
 *   - A recommended preset (cheapest that fits, or strongest if none fit)
 *
 * Pure presentation — no provider calls.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PRINT_FORMATS,
  getPrintFormat,
  DEFAULT_PRINT_FORMAT_ID,
} from "@/lib/print-formats";
import {
  recommendUpscale,
  ppiTier,
  type UpscaleEstimate,
} from "@/lib/upscale-recommendation";
import { UPSCALE_COST_LABEL } from "@/lib/upscale-modes";

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: "Gemini 1024 × 1024", w: 1024, h: 1024 },
  { label: "Print HD 1600 × 2240", w: 1600, h: 2240 },
  { label: "Print HD 2048 × 2048", w: 2048, h: 2048 },
  { label: "Print HD 1536 × 2048", w: 1536, h: 2048 },
  { label: "Custom", w: 0, h: 0 },
];

function tierBadgeClass(tier: ReturnType<typeof ppiTier>): string {
  if (tier === "preferred") return "bg-primary/15 text-primary border-primary/30";
  if (tier === "fallback") return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

function tierLabel(tier: ReturnType<typeof ppiTier>): string {
  if (tier === "preferred") return "300 PPI — full quality";
  if (tier === "fallback") return "150 PPI — standard";
  return "Below 150 PPI";
}

export default function PrintCalculator() {
  const [presetIdx, setPresetIdx] = useState(1);
  const [width, setWidth] = useState(1600);
  const [height, setHeight] = useState(2240);
  const [formatId, setFormatId] = useState(DEFAULT_PRINT_FORMAT_ID);
  const [targetPpi, setTargetPpi] = useState<number>(300);

  const format = getPrintFormat(formatId) ?? PRINT_FORMATS[0];

  const result = useMemo(
    () => recommendUpscale(width || 1, height || 1, format, targetPpi),
    [width, height, format, targetPpi],
  );

  const onPreset = (idx: string) => {
    const i = Number(idx);
    setPresetIdx(i);
    const p = PRESETS[i];
    if (p && p.w && p.h) {
      setWidth(p.w);
      setHeight(p.h);
    }
  };

  const rec = result.recommended;

  return (
    <div className="min-h-screen bg-background paper-texture text-foreground">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" aria-label="Back home">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="font-display text-2xl text-primary">PPI & Tiling Calculator</h1>
        </div>

        <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
          Enter your source pixel size and target print dimensions to see the
          effective PPI for every upscale preset, and get the recommended one
          for the quality you need.
        </p>

        {/* Inputs */}
        <div className="grid gap-4 rounded-lg border border-border/60 bg-card/40 p-4 md:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs">Source preset</Label>
            <Select value={String(presetIdx)} onValueChange={onPreset}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p, i) => (
                  <SelectItem key={i} value={String(i)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Print format</Label>
            <Select value={formatId} onValueChange={setFormatId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRINT_FORMATS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Source width (px)</Label>
              <Input
                type="number" min={1} value={width}
                onChange={(e) => { setPresetIdx(PRESETS.length - 1); setWidth(Number(e.target.value) || 0); }}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Source height (px)</Label>
              <Input
                type="number" min={1} value={height}
                onChange={(e) => { setPresetIdx(PRESETS.length - 1); setHeight(Number(e.target.value) || 0); }}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Target PPI</Label>
            <Select value={String(targetPpi)} onValueChange={(v) => setTargetPpi(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="300">300 PPI — Full print quality</SelectItem>
                <SelectItem value="200">200 PPI — High</SelectItem>
                <SelectItem value="150">150 PPI — Standard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Recommendation */}
        <div className="mt-6 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Recommended</span>
            {result.reachesTarget ? (
              <Badge className="bg-primary/20 text-primary border-primary/40">
                <Check className="mr-1 h-3 w-3" />
                Reaches {targetPpi} PPI
              </Badge>
            ) : (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Below {targetPpi} PPI
              </Badge>
            )}
          </div>
          <div className="text-base text-foreground">{rec.config.label}</div>
          <div className="mt-1 text-sm text-muted-foreground">{result.rationale}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Target at {targetPpi} PPI: {result.targetWidthPx} × {result.targetHeightPx} px
          </div>
        </div>

        {/* Breakdown */}
        <div className="mt-6 overflow-hidden rounded-lg border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preset</TableHead>
                <TableHead>Output</TableHead>
                <TableHead>Effective PPI</TableHead>
                <TableHead>Tiles</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Reaches target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.options.map((o: UpscaleEstimate) => {
                const isRec = o.mode === rec.mode;
                return (
                  <TableRow key={o.mode} className={isRec ? "bg-primary/5" : ""}>
                    <TableCell>
                      <div className="font-medium">{o.config.shortLabel}</div>
                      <div className="text-xs text-muted-foreground">{o.config.intendedUse}</div>
                      {o.willDownshift && (
                        <div className="mt-1 text-[11px] text-orange-400">
                          ↓ Downshifts to 4× (8× exceeds cap)
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {o.outputWidth} × {o.outputHeight}
                      <div className="text-xs text-muted-foreground">{o.effectiveScale}× scale</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={tierBadgeClass(o.ppiTier)}>
                        {o.ppi} PPI
                      </Badge>
                      <div className="mt-1 text-[11px] text-muted-foreground">{tierLabel(o.ppiTier)}</div>
                    </TableCell>
                    <TableCell className="text-sm">{o.estimatedTiles ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{o.config.estimatedTime}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {UPSCALE_COST_LABEL[o.config.estimatedCost]}
                    </TableCell>
                    <TableCell>
                      {o.meetsTarget ? (
                        <Check className="h-4 w-4 text-primary" aria-label="Reaches target" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Effective PPI is the smaller of width/height PPI at the chosen format.
          Tile counts are approximate (~1024 px tiles) and shown for reference
          only. Repeated upscales may soften detail or introduce artifacts —
          prefer the strongest single pass that reaches your target.
        </p>
      </div>
    </div>
  );
}
