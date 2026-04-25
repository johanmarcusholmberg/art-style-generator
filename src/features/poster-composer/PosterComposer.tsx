/**
 * Poster Composer — interactive preview + controls.
 *
 * Renders the artwork in a non-destructive HTML preview (image + absolutely
 * positioned text band), exposes layout/template/text controls, and ships
 * the final poster through `exportPoster()` which reuses the existing
 * print-export pipeline.
 *
 * The original image file is NEVER mutated — the safe-area band is drawn
 * over it on a temporary canvas at export time.
 */

import { useMemo, useState } from "react";
import { Download, Loader2, AlertTriangle, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PRINT_FORMATS, DEFAULT_PRINT_FORMAT_ID } from "@/lib/print-formats";
import {
  exportPoster,
  downloadPrintExport,
  usePosterComposer,
  resolvePosterSurfaceBackground,
} from "./usePosterComposer";
import { POSTER_TEMPLATE_LIST, getPosterTemplate } from "./poster-templates";
import type {
  PosterTemplateId,
  PosterTextMode,
  PosterTextContent,
} from "./poster-types";

interface PosterComposerProps {
  imageUrl: string;
  /** Used as the download filename prefix. */
  filenameBase?: string;
  /** Optional default print format id. */
  printFormatId?: string;
  /** Optional starting template (e.g. picked in the generator UI). */
  initialTemplateId?: PosterTemplateId;
  /** Optional starting text mode. Defaults to "composer". */
  initialTextMode?: PosterTextMode;
  /** Optional starting text content (e.g. typed in the generator UI). */
  initialText?: PosterTextContent;
  /**
   * Optional regenerate callback — when provided, a "Regenerate image"
   * button is shown in the composer. The composer keeps all text + layout
   * state; only the imageUrl prop is expected to change after the
   * callback resolves.
   */
  onRegenerate?: () => Promise<void> | void;
  /** External "currently regenerating" flag from the parent. */
  isRegenerating?: boolean;
}

export default function PosterComposer({
  imageUrl,
  filenameBase = "poster",
  printFormatId = DEFAULT_PRINT_FORMAT_ID,
  initialTemplateId,
  initialTextMode,
  initialText,
  onRegenerate,
  isRegenerating = false,
}: PosterComposerProps) {
  const { toast } = useToast();
  const {
    state,
    setTemplate,
    setTextMode,
    setText,
    setLayout,
  } = usePosterComposer({
    imageUrl,
    printFormatId,
    templateId: initialTemplateId,
    textMode: initialTextMode,
    initialText,
  });

  const [exporting, setExporting] = useState(false);
  const [overlayInGenerated, setOverlayInGenerated] = useState(false);

  const tpl = useMemo(() => getPosterTemplate(state.templateId), [state.templateId]);

  const hasAnyText = !!(
    state.text.title ||
    state.text.subtitle ||
    state.text.description ||
    (state.text.ingredients && state.text.ingredients.length > 0)
  );

  // Guardrail 1 — Both modes producing text simultaneously.
  const duplicateRisk =
    state.textMode === "generated" &&
    state.layout.safeAreaEnabled &&
    overlayInGenerated &&
    hasAnyText;

  // Guardrail 2 — Composer mode but safe area disabled and text entered:
  //               text would overlap the artwork.
  const overlapRisk =
    state.textMode === "composer" && !state.layout.safeAreaEnabled && hasAnyText;

  // Guardrail 3 — Generated mode: composer overlay text is hidden by
  //               default, so let the user know their text fields drive
  //               the prompt, not an overlay.
  const generatedNotice =
    state.textMode === "generated" && hasAnyText && !overlayInGenerated;

  // STRICT render rule — text overlay is ONLY drawn for composer mode.
  // Generated mode never paints overlay text in the preview, even if the
  // user opts into the "also overlay text on export" toggle (we keep that
  // for the export step only, to avoid double-rendering surprises here).
  const showPreviewOverlay =
    state.textMode === "composer" && state.layout.safeAreaEnabled;

  // Single source of truth for the poster surface colour. Used for the
  // outer frame, the safe-area band, and the export canvas so they always
  // look identical.
  const posterSurfaceBackground = resolvePosterSurfaceBackground(state);

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportPoster(state, {
        renderOverlay:
          state.textMode === "composer"
            ? state.layout.safeAreaEnabled
            : overlayInGenerated && state.layout.safeAreaEnabled,
      });
      const filename = `${filenameBase}-${state.templateId}-${Date.now()}.png`;
      downloadPrintExport(result.blob, filename);
      toast({
        title: "Poster exported",
        description: `${result.width} × ${result.height} px · ${result.tier === "preferred" ? "300 PPI" : result.tier === "fallback" ? "150 PPI" : "Source res"}`,
      });
    } catch (e) {
      toast({
        title: "Poster export failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  // Preview height ratios — drives the in-browser DOM preview only.
  // The export pipeline does its own pixel-accurate render.
  const safeRatio = state.layout.safeAreaEnabled
    ? state.layout.safeAreaHeightRatio
    : 0;
  const safeAreaCss: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    height: `${safeRatio * 100}%`,
    background: posterSurfaceBackground,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "6%",
    color: tpl.typography.titleColor,
    fontFamily: tpl.typography.bodyFontFamily,
    textAlign: tpl.typography.align,
    pointerEvents: "none",
    [state.layout.safeAreaPosition === "bottom"
      ? "borderTop"
      : "borderBottom"]: showPreviewOverlay ? "none" : "1px dashed hsl(var(--border))",
    [state.layout.safeAreaPosition === "bottom" ? "bottom" : "top"]: 0,
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6">
      {/* ── Preview ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <div
          className="border border-border rounded-md p-4 flex items-center justify-center"
          style={{ background: posterSurfaceBackground }}
        >
          <div
            className="relative shadow-lg"
            style={{
              background: posterSurfaceBackground,
              // Mimic 5:7 aspect ratio of the default poster format.
              aspectRatio: "5 / 7",
              width: "100%",
              maxWidth: 420,
            }}
          >
            <img
              src={imageUrl}
              alt="Poster artwork"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {state.layout.safeAreaEnabled && (
              <div style={safeAreaCss}>
                {showPreviewOverlay && state.text.title && (
                  <div
                    style={{
                      fontFamily: tpl.typography.titleFontFamily,
                      fontWeight: 700,
                      fontSize: `clamp(14px, ${tpl.typography.titleSize / 12}vw, ${tpl.typography.titleSize}px)`,
                      letterSpacing: tpl.typography.titleLetterSpacing,
                      textTransform: tpl.typography.titleUppercase ? "uppercase" : "none",
                      color: tpl.typography.titleColor,
                      lineHeight: 1.1,
                    }}
                  >
                    {state.text.title}
                  </div>
                )}
                {showPreviewOverlay && state.text.subtitle && (
                  <div
                    style={{
                      marginTop: "4%",
                      fontSize: `clamp(10px, ${tpl.typography.subtitleSize / 18}vw, ${tpl.typography.subtitleSize}px)`,
                      color: tpl.typography.bodyColor,
                    }}
                  >
                    {state.text.subtitle}
                  </div>
                )}
                {showPreviewOverlay && state.text.description && (
                  <div
                    style={{
                      marginTop: "3%",
                      fontSize: `clamp(9px, ${tpl.typography.bodySize / 22}vw, ${tpl.typography.bodySize}px)`,
                      color: tpl.typography.bodyColor,
                      lineHeight: 1.4,
                    }}
                  >
                    {state.text.description}
                  </div>
                )}
                {showPreviewOverlay &&
                  state.text.ingredients &&
                  state.text.ingredients.length > 0 && (
                    <div
                      style={{
                        marginTop: "auto",
                        paddingTop: "3%",
                        fontSize: `clamp(9px, ${tpl.typography.bodySize / 22}vw, ${tpl.typography.bodySize}px)`,
                        color: tpl.typography.bodyColor,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {state.text.ingredients.join("  ·  ")}
                    </div>
                  )}
                {!showPreviewOverlay && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#666",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      textAlign: "center",
                      width: "100%",
                    }}
                  >
                    Safe text area
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="font-display text-[11px] text-muted-foreground text-center">
          Live preview · Final export renders at the print format's full
          resolution (300 PPI when source allows).
        </p>
      </div>

      {/* ── Controls ────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Template selector */}
        <div className="space-y-1.5">
          <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
            Template
          </Label>
          <Select
            value={state.templateId}
            onValueChange={(v) => setTemplate(v as PosterTemplateId)}
          >
            <SelectTrigger className="font-display text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSTER_TEMPLATE_LIST.map((t) => (
                <SelectItem key={t.id} value={t.id} className="font-display text-xs">
                  <div className="flex flex-col">
                    <span>{t.name}</span>
                    <span className="text-[10px] text-muted-foreground">{t.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Text mode */}
        <div className="space-y-1.5">
          <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
            Text handling
          </Label>
          <div className="border border-border rounded-md p-2 space-y-1.5">
            <TextModeRow
              active={state.textMode === "composer"}
              label="Render text in Poster Composer"
              hint="Recommended for Etsy / print. Text is added on export, not generated inside the image."
              onSelect={() => setTextMode("composer")}
            />
            <TextModeRow
              active={state.textMode === "generated"}
              label="Generate text inside image"
              hint="Sends the title/subtitle to the image generator so it becomes part of the artwork."
              onSelect={() => setTextMode("generated")}
            />
          </div>
          {state.textMode === "generated" && (
            <div className="flex items-center justify-between border border-border rounded-md px-2 py-1.5">
              <div>
                <p className="font-display text-[11px] text-foreground">
                  Also overlay text on export
                </p>
                <p className="font-display text-[10px] text-muted-foreground">
                  Off by default to avoid duplicate text.
                </p>
              </div>
              <Switch
                checked={overlayInGenerated}
                onCheckedChange={setOverlayInGenerated}
              />
            </div>
          )}
          {duplicateRisk && (
            <div className="flex items-start gap-1.5 text-[10px] font-display border rounded-sm px-1.5 py-1 bg-amber-500/10 border-amber-500/30 text-amber-600">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>
                Both modes are active — this will likely produce duplicate text on the final poster.
              </span>
            </div>
          )}
          {generatedNotice && (
            <div className="flex items-start gap-1.5 text-[10px] font-display border rounded-sm px-1.5 py-1 bg-muted/50 border-border text-muted-foreground">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>
                Text will be generated inside the image. Overlay text will not be applied.
              </span>
            </div>
          )}
          {overlapRisk && (
            <div className="flex items-start gap-1.5 text-[10px] font-display border rounded-sm px-1.5 py-1 bg-amber-500/10 border-amber-500/30 text-amber-600">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>
                Text may overlap the image. Consider enabling Safe text area below.
              </span>
            </div>
          )}
        </div>

        {/* Safe area */}
        <div className="space-y-1.5 border border-border rounded-md p-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-display text-xs">Safe text area</Label>
              <p className="font-display text-[10px] text-muted-foreground">
                For poster layout — reserves a clean band for typography.
              </p>
            </div>
            <Switch
              checked={state.layout.safeAreaEnabled}
              onCheckedChange={(v) => setLayout({ safeAreaEnabled: v })}
            />
          </div>
          {state.layout.safeAreaEnabled && (
            <div className="space-y-2 pt-1">
              <div className="space-y-1">
                <Label className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
                  Position
                </Label>
                <Select
                  value={state.layout.safeAreaPosition}
                  onValueChange={(v) =>
                    setLayout({ safeAreaPosition: v as "top" | "bottom" })
                  }
                >
                  <SelectTrigger className="font-display text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom" className="font-display text-xs">Bottom</SelectItem>
                    <SelectItem value="top" className="font-display text-xs">Top</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
                    Band height
                  </Label>
                  <span className="font-display text-[10px] text-foreground">
                    {Math.round(state.layout.safeAreaHeightRatio * 100)}%
                  </span>
                </div>
                <Slider
                  value={[state.layout.safeAreaHeightRatio * 100]}
                  min={10}
                  max={45}
                  step={1}
                  onValueChange={([v]) =>
                    setLayout({ safeAreaHeightRatio: v / 100 })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
                  Poster background
                </Label>
                <Input
                  type="color"
                  value={posterSurfaceBackground}
                  onChange={(e) => setLayout({ backgroundColor: e.target.value })}
                  className="h-8 w-full p-1"
                />
                <p className="font-display text-[10px] text-muted-foreground">
                  Applied to the full poster surface — frame, margins, and safe area.
                </p>
              </div>
              {state.layout.safeAreaEnabled && !hasAnyText && (
                <div className="flex items-start gap-1.5 text-[10px] font-display border rounded-sm px-1.5 py-1 bg-muted/50 border-border text-muted-foreground">
                  <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>
                    Safe text area is enabled, but no poster text is entered. It will not affect generation until text is added.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Text inputs */}
        <div className="space-y-2">
          <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
            Text content
          </Label>
          <Input
            placeholder="Title"
            value={state.text.title ?? ""}
            onChange={(e) => setText({ title: e.target.value })}
            className="font-display text-xs"
          />
          <Input
            placeholder="Subtitle"
            value={state.text.subtitle ?? ""}
            onChange={(e) => setText({ subtitle: e.target.value })}
            className="font-display text-xs"
          />
          <Textarea
            placeholder="Description"
            value={state.text.description ?? ""}
            onChange={(e) => setText({ description: e.target.value })}
            className="font-display text-xs min-h-[64px]"
            rows={2}
          />
          <Textarea
            placeholder="Ingredients (one per line)"
            value={(state.text.ingredients ?? []).join("\n")}
            onChange={(e) =>
              setText({
                ingredients: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            className="font-display text-xs min-h-[60px]"
            rows={3}
          />
        </div>

        {/* Print format */}
        <div className="space-y-1.5">
          <Label className="font-display text-xs uppercase tracking-wider text-muted-foreground">
            Print format
          </Label>
          <div className="font-display text-[11px] text-muted-foreground border border-border rounded-md px-2 py-1.5">
            {PRINT_FORMATS[0].label} · 300 PPI target
          </div>
        </div>

        {/* Export */}
        <Button
          onClick={handleExport}
          disabled={exporting || !imageUrl || isRegenerating}
          className="w-full font-display text-xs"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export Print (PNG · 300 PPI)
        </Button>
        {onRegenerate && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onRegenerate()}
            disabled={isRegenerating || exporting}
            className="w-full font-display text-xs"
            title="Generate a new image with the same prompt — text and layout are kept."
          >
            {isRegenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Regenerate image (keep text)
          </Button>
        )}
        <div className="flex items-start gap-1.5 text-[10px] font-display text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            Export reuses the existing print pipeline — original image stays untouched.
          </span>
        </div>
      </div>
    </div>
  );
}

interface TextModeRowProps {
  active: boolean;
  label: string;
  hint: string;
  onSelect: () => void;
}

function TextModeRow({ active, label, hint, onSelect }: TextModeRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-sm border transition-colors",
        active
          ? "border-primary/50 bg-primary/5"
          : "border-border hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-1 h-3 w-3 rounded-full border flex-shrink-0",
          active ? "border-primary bg-primary" : "border-muted-foreground",
        )}
      />
      <span className="flex-1">
        <span className="font-display text-[11px] text-foreground block">{label}</span>
        <span className="font-display text-[10px] text-muted-foreground block">{hint}</span>
      </span>
    </button>
  );
}
