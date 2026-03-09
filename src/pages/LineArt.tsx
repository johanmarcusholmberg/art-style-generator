import { useState, useCallback, useRef } from "react";
import ImageGenerator from "@/components/ImageGenerator";
import Gallery from "@/components/Gallery";
import type { EditRequest } from "@/components/Gallery";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getCachedImage, deleteCachedImage } from "@/lib/image-cache";
import { LINEART_STYLE } from "@/lib/style-config";
import StyleNav from "@/components/StyleNav";

const styleConfig = LINEART_STYLE;

const LineArt = () => {
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState(styleConfig.themedModeValue);
  const [editState, setEditState] = useState<EditRequest | null>(null);
  const [pendingEdit, setPendingEdit] = useState<EditRequest | null>(null);
  const [hasUnsavedImage, setHasUnsavedImage] = useState(false);
  const generatorRef = useRef<HTMLDivElement>(null);

  const refreshGallery = useCallback(() => setGalleryRefreshKey((k) => k + 1), []);

  const clearCurrentGeneration = useCallback(async () => {
    const modes = [styleConfig.themedModeValue, styleConfig.freestyleModeValue, ...(styleConfig.tertiaryModeValue ? [styleConfig.tertiaryModeValue] : [])];
    await Promise.all(
      modes.flatMap((m) => [
        deleteCachedImage(`img-${styleConfig.styleKey}-${m}`),
        deleteCachedImage(`img-base-${styleConfig.styleKey}-${m}`),
      ])
    );
    modes.forEach((m) => sessionStorage.removeItem(`gen-state-${styleConfig.styleKey}-${m}`));
  }, []);

  const applyEdit = useCallback(
    async (req: EditRequest) => {
      await clearCurrentGeneration();
      setActiveTab(req.mode);
      setEditState(req);
      setTimeout(() => generatorRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    [clearCurrentGeneration]
  );

  const handleExitEdit = useCallback(async () => {
    await clearCurrentGeneration();
    setEditState(null);
  }, [clearCurrentGeneration]);

  const handleEditImage = useCallback(async (req: EditRequest) => {
    const modes = [styleConfig.themedModeValue, styleConfig.freestyleModeValue, ...(styleConfig.tertiaryModeValue ? [styleConfig.tertiaryModeValue] : [])];
    const images = await Promise.all(modes.map((m) => getCachedImage(`img-${styleConfig.styleKey}-${m}`)));
    const states = modes.map((m) => {
      try { const r = sessionStorage.getItem(`gen-state-${styleConfig.styleKey}-${m}`); return r ? JSON.parse(r) : null; } catch { return null; }
    });
    const hasUnsaved = images.some((img, i) => img && !states[i]?.savedToGallery);
    setHasUnsavedImage(hasUnsaved);
    setPendingEdit(req);
  }, []);

  const editKey = editState ? `${editState.mode}-${editState.prompt}-${editState.originalId}` : "default";

  return (
    <div className="min-h-screen bg-lineart-bg">
      {/* Navigation */}
      <StyleNav activePath="/lineart" />

      {/* Header */}
      <header className="pt-10 pb-12 text-center px-4">
        <p className="font-display text-lineart-accent text-sm tracking-[0.3em] uppercase mb-3">
          Fine Line Art · Pen & Ink
        </p>
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-lineart-fg leading-tight mb-4">
          Fine Line Art<br />
          <span className="text-lineart-accent">Image Generator</span>
        </h1>
        <p className="text-lineart-muted max-w-lg mx-auto text-sm leading-relaxed">
          Describe a scene and watch it come to life in elegant pen-and-ink
          line work — delicate hatching, precise details, timeless beauty.
        </p>
        <div className="mt-6 w-24 h-px bg-lineart-border mx-auto" />
      </header>

      {/* Generator */}
      <main className="pb-12 px-4" ref={generatorRef}>
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v);
            setEditState(null);
          }}
          className="w-full max-w-4xl mx-auto"
        >
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value={styleConfig.themedModeValue} className="font-display text-sm">
              {styleConfig.themedTabLabel}
            </TabsTrigger>
            <TabsTrigger value={styleConfig.tertiaryModeValue!} className="font-display text-sm">
              {styleConfig.tertiaryTabLabel}
            </TabsTrigger>
            <TabsTrigger value={styleConfig.freestyleModeValue} className="font-display text-sm">
              {styleConfig.freestyleTabLabel}
            </TabsTrigger>
          </TabsList>
          <TabsContent value={styleConfig.themedModeValue}>
            <ImageGenerator
              key={activeTab === styleConfig.themedModeValue ? editKey : "t"}
              mode={styleConfig.themedModeValue}
              styleConfig={styleConfig}
              onImageSaved={refreshGallery}
              onExitEdit={editState?.mode === styleConfig.themedModeValue ? handleExitEdit : undefined}
              initialPrompt={editState?.mode === styleConfig.themedModeValue ? editState.prompt : undefined}
              initialImageUrl={editState?.mode === styleConfig.themedModeValue ? editState.imageUrl : undefined}
              originalImageId={editState?.mode === styleConfig.themedModeValue ? editState.originalId : undefined}
              originalStoragePath={editState?.mode === styleConfig.themedModeValue ? editState.originalStoragePath : undefined}
            />
          </TabsContent>
          <TabsContent value={styleConfig.tertiaryModeValue!}>
            <ImageGenerator
              key={activeTab === styleConfig.tertiaryModeValue ? editKey : "m"}
              mode={styleConfig.tertiaryModeValue!}
              styleConfig={styleConfig}
              onImageSaved={refreshGallery}
              onExitEdit={editState?.mode === styleConfig.tertiaryModeValue ? handleExitEdit : undefined}
              initialPrompt={editState?.mode === styleConfig.tertiaryModeValue ? editState.prompt : undefined}
              initialImageUrl={editState?.mode === styleConfig.tertiaryModeValue ? editState.imageUrl : undefined}
              originalImageId={editState?.mode === styleConfig.tertiaryModeValue ? editState.originalId : undefined}
              originalStoragePath={editState?.mode === styleConfig.tertiaryModeValue ? editState.originalStoragePath : undefined}
            />
          </TabsContent>
          <TabsContent value={styleConfig.freestyleModeValue}>
            <ImageGenerator
              key={activeTab === styleConfig.freestyleModeValue ? editKey : "f"}
              mode={styleConfig.freestyleModeValue}
              styleConfig={styleConfig}
              onImageSaved={refreshGallery}
              onExitEdit={editState?.mode === styleConfig.freestyleModeValue ? handleExitEdit : undefined}
              initialPrompt={editState?.mode === styleConfig.freestyleModeValue ? editState.prompt : undefined}
              initialImageUrl={editState?.mode === styleConfig.freestyleModeValue ? editState.imageUrl : undefined}
              originalImageId={editState?.mode === styleConfig.freestyleModeValue ? editState.originalId : undefined}
              originalStoragePath={editState?.mode === styleConfig.freestyleModeValue ? editState.originalStoragePath : undefined}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Gallery */}
      <section className="pb-20 px-4">
        <div className="w-full max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 bg-lineart-border" />
            <h2 className="font-display text-lg font-bold text-lineart-fg">Gallery</h2>
            <div className="h-px flex-1 bg-lineart-border" />
          </div>
          <Gallery
            refreshKey={galleryRefreshKey}
            onEditImage={handleEditImage}
            styleConfig={styleConfig}
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="pb-8 text-center">
        <p className="text-lineart-muted text-xs font-display tracking-widest">
          ✒ Ink & Line Studio
        </p>
      </footer>

      {/* Confirm edit dialog */}
      <AlertDialog open={!!pendingEdit} onOpenChange={() => setPendingEdit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              {hasUnsavedImage ? "You have an unsaved image" : "Edit this image?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasUnsavedImage
                ? "Your current generated image hasn't been saved to the gallery yet. Loading a new image for editing will discard it. Do you want to continue?"
                : "This will load the selected image into the editor. You can then modify it with a new prompt and choose to replace the original or save as a new image."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingEdit) applyEdit(pendingEdit);
                setPendingEdit(null);
              }}
            >
              {hasUnsavedImage ? "Discard & Edit" : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LineArt;