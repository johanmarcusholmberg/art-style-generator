/**
 * GeneratedImageActions — extracted generated-image action row from
 * ImageGenerator.tsx (Phase 2 incremental).
 *
 * All business logic remains in ImageGenerator; this component is a pure
 * presentation wrapper around the action buttons, toggles, and dialogs.
 */
import { Loader2, Save, Replace, X, Trash2, Pencil, Printer, FileImage, ArrowUpCircle, LayoutPanelTop } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import DownloadButton from "@/components/generation/DownloadButton";
import EnhanceForPrintDialog from "@/components/EnhanceForPrintDialog";
import PosterComposer from "@/features/poster-composer/PosterComposer";
import type { StyleConfig } from "@/lib/style-config";
import type { PrintFormat } from "@/lib/print-formats";
import type { PrintSize } from "@/components/PrintSizeSelector";
import type { UpscaleMode } from "@/lib/upscale-modes";
import type { UpscaleRecipe } from "@/lib/upscale-recipes";
import type { PosterTemplateId, PosterTextMode } from "@/features/poster-composer/poster-types";

export interface GeneratedImageActionsProps {
  // Image state
  imageUrl: string;
  baseImageUrl: string | null;
  enhancedImageUrl: string | null;
  hasEnhanced: boolean;

  // View toggle
  viewVersion: "enhanced" | "original" | "compare";
  onChangeViewVersion: (v: "enhanced" | "original" | "compare") => void;

  // Generation / export state
  mode: string;
  generationMode: "standard" | "print-ready";
  selectedPrintFormat: PrintFormat;
  printSize: PrintSize;
  effectiveAspectRatio: string;
  styleConfig: StyleConfig;

  // Upscale state
  isUpscaling: boolean;
  canManualUpscale: boolean;
  recommendedRecipe: UpscaleRecipe | null;
  onEnhanceConfirm: (mode: UpscaleMode, recipe: UpscaleRecipe | null) => void;

  // Save / replace state
  savedToGallery: boolean;
  isEditMode: boolean;
  originalImageId: string | undefined;
  saving: boolean;
  replacing: boolean;
  exporting: boolean;
  onSaveToGallery: () => void;
  onReplaceOriginal: () => void;
  onPrintExport: () => void;

  // Inline edit
  onStartInlineEdit: () => void;

  // Remove
  onRemoveImage: () => void;

  // Poster composer state
  posterOpen: boolean;
  onPosterOpenChange: (open: boolean) => void;
  posterTemplateId: PosterTemplateId;
  posterTextMode: PosterTextMode;
  posterSafeAreaEnabled: boolean;
  composerTitle: string;
  composerSubtitle: string;
  composerDescription: string;
  composerIngredientsRaw: string;
  lastPosterSnapshot: {
    templateId: PosterTemplateId;
    textMode: PosterTextMode;
    title: string;
    subtitle: string;
    description: string;
    ingredients: string[];
  } | null;
  onRegenerate: () => void | Promise<void>;
  isRegenerating: boolean;
}

export default function GeneratedImageActions(props: GeneratedImageActionsProps) {
  const {
    imageUrl,
    baseImageUrl,
    enhancedImageUrl,
    hasEnhanced,
    viewVersion,
    onChangeViewVersion,
    mode,
    generationMode,
    selectedPrintFormat,
    printSize,
    effectiveAspectRatio,
    styleConfig,
    isUpscaling,
    canManualUpscale,
    recommendedRecipe,
    onEnhanceConfirm,
    savedToGallery,
    isEditMode,
    originalImageId,
    saving,
    replacing,
    exporting,
    onSaveToGallery,
    onReplaceOriginal,
    onPrintExport,
    onStartInlineEdit,
    onRemoveImage,
    posterOpen,
    onPosterOpenChange,
    posterTemplateId,
    posterTextMode,
    posterSafeAreaEnabled,
    composerTitle,
    composerSubtitle,
    composerDescription,
    composerIngredientsRaw,
    lastPosterSnapshot,
    onRegenerate,
    isRegenerating,
  } = props;

  const ingredientsList = composerIngredientsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const hasComposerText =
    !!composerTitle.trim() ||
    !!composerSubtitle.trim() ||
    !!composerDescription.trim() ||
    ingredientsList.length > 0;

  return (
    <div className="flex flex-wrap gap-2 items-center justify-center">
      {hasEnhanced && (
        <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
          {(["enhanced", "original", "compare"] as const).map((v) => (
            <Button
              key={v}
              variant={viewVersion === v ? "default" : "ghost"}
              size="sm"
              onClick={() => onChangeViewVersion(v)}
              className="font-display text-xs h-7 px-2"
            >
              {v === "enhanced" ? "Enhanced" : v === "original" ? "Original" : "Compare"}
            </Button>
          ))}
        </div>
      )}
      <DownloadButton
        url={viewVersion === "original" && hasEnhanced ? baseImageUrl! : imageUrl}
        filename={`${styleConfig.downloadPrefix}-${mode}-${effectiveAspectRatio.replace(":", "x")}-${Date.now()}.png`}
        versionLabel={hasEnhanced ? (viewVersion === "original" ? "Original" : "Enhanced") : undefined}
        sizeLabel={generationMode === "print-ready" ? selectedPrintFormat.label : printSize.dimensions}
      />

      {generationMode === "print-ready" && (
        <Button
          variant="outline"
          size="sm"
          onClick={onPrintExport}
          disabled={exporting}
          className="font-display text-xs tracking-wider border-primary/30 text-primary hover:bg-primary/10"
        >
          {exporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…
            </>
          ) : (
            <>
              <FileImage className="mr-2 h-4 w-4" /> Export Print ({selectedPrintFormat.label})
            </>
          )}
        </Button>
      )}

      {canManualUpscale && (
        <EnhanceForPrintDialog
          hasEnhanced={!!hasEnhanced}
          posterFormatId={selectedPrintFormat.id}
          alreadyUpscaled={!!hasEnhanced}
          recommendedRecipe={recommendedRecipe}
          disabled={isUpscaling}
          onConfirm={(m, recipe) => onEnhanceConfirm(m, recipe ?? null)}
          trigger={
            <Button
              variant="outline"
              size="sm"
              disabled={isUpscaling}
              className={
                hasEnhanced
                  ? "font-display text-xs tracking-wider border-border"
                  : "font-display text-xs tracking-wider border-primary/40 text-primary hover:bg-primary/10"
              }
            >
              {isUpscaling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="mr-2 h-4 w-4" />
              )}
              {hasEnhanced ? "Re-enhance" : "Enhance for print"}
            </Button>
          }
        />
      )}

      {!savedToGallery && isEditMode && originalImageId && (
        <Button
          variant="outline"
          size="sm"
          onClick={onReplaceOriginal}
          disabled={replacing || saving}
          className="font-display text-xs tracking-wider"
        >
          {replacing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Replacing…
            </>
          ) : (
            <>
              <Replace className="mr-2 h-4 w-4" /> Replace Original
            </>
          )}
        </Button>
      )}

      {!savedToGallery && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveToGallery}
          disabled={saving || replacing}
          className="font-display text-xs tracking-wider"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" /> {isEditMode ? "Save as New" : "Save to Gallery"}
            </>
          )}
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={onStartInlineEdit}
        className="font-display text-xs tracking-wider"
      >
        <Pencil className="mr-2 h-4 w-4" /> Edit Image
      </Button>

      {/* Create Poster — opens an additive composer dialog. */}
      <Dialog open={posterOpen} onOpenChange={onPosterOpenChange}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="font-display text-xs tracking-wider border-primary/40 text-primary hover:bg-primary/10"
          >
            <LayoutPanelTop className="mr-2 h-4 w-4" /> Create Poster
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Poster Composer</DialogTitle>
          </DialogHeader>
          <PosterComposer
            imageUrl={
              hasEnhanced && enhancedImageUrl
                ? enhancedImageUrl
                : imageUrl ?? ""
            }
            filenameBase={`${styleConfig.downloadPrefix}-${mode}`}
            printFormatId={selectedPrintFormat.id}
            initialTemplateId={lastPosterSnapshot?.templateId ?? posterTemplateId}
            initialTextMode={lastPosterSnapshot?.textMode ?? posterTextMode}
            initialText={
              lastPosterSnapshot
                ? {
                    title: lastPosterSnapshot.title || undefined,
                    subtitle: lastPosterSnapshot.subtitle || undefined,
                    description: lastPosterSnapshot.description || undefined,
                    ingredients:
                      lastPosterSnapshot.ingredients.length > 0
                        ? lastPosterSnapshot.ingredients
                        : undefined,
                  }
                : {
                    title: composerTitle || undefined,
                    subtitle: composerSubtitle || undefined,
                    description: composerDescription || undefined,
                  }
            }
            onRegenerate={onRegenerate}
            isRegenerating={isRegenerating}
          />
        </DialogContent>
      </Dialog>

      {savedToGallery && (
        <span className="text-xs text-primary flex items-center gap-1 font-display">
          ✓ Saved to gallery
        </span>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="font-display text-xs tracking-wider text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Remove
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Remove generated image?</AlertDialogTitle>
            <AlertDialogDescription className="font-display">
              This will discard the generated image. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-display">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="font-display bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onRemoveImage}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
