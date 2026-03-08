import { useState, useCallback, useRef } from "react";
import ImageGenerator from "@/components/ImageGenerator";
import FreestyleImageGenerator from "@/components/FreestyleImageGenerator";
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

const Index = () => {
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState("japanese");
  const [editState, setEditState] = useState<EditRequest | null>(null);
  const [pendingEdit, setPendingEdit] = useState<EditRequest | null>(null);
  const generatorRef = useRef<HTMLDivElement>(null);

  const refreshGallery = useCallback(() => setGalleryRefreshKey((k) => k + 1), []);

  const applyEdit = useCallback((req: EditRequest) => {
    setActiveTab(req.mode);
    setEditState(req);
    setTimeout(() => generatorRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const handleEditImage = useCallback((req: EditRequest) => {
    // Always confirm before loading gallery image for editing
    setPendingEdit(req);
  }, []);

  // Key to force remount generators when edit state changes
  const editKey = editState ? `${editState.mode}-${editState.prompt}` : "default";

  return (
    <div className="min-h-screen bg-background paper-texture">
      {/* Header */}
      <header className="pt-16 pb-12 text-center px-4">
        <p className="font-display text-gold text-sm tracking-[0.3em] uppercase mb-3">
          浮世絵 · Ukiyo-e
        </p>
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-tight mb-4">
          Japanese World<br />
          <span className="text-primary">Image Generator</span>
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
          Describe a scene and watch it come to life in the timeless style
          of traditional Japanese woodblock prints.
        </p>
        <div className="mt-6 w-24 h-px bg-border mx-auto" />
      </header>

      {/* Generator */}
      <main className="pb-12 px-4" ref={generatorRef}>
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setEditState(null); }} className="w-full max-w-4xl mx-auto">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="japanese" className="font-display text-sm">
              🏯 Japanese Scenes
            </TabsTrigger>
            <TabsTrigger value="freestyle" className="font-display text-sm">
              🎨 Freestyle
            </TabsTrigger>
          </TabsList>
          <TabsContent value="japanese">
            <ImageGenerator
              key={activeTab === "japanese" ? editKey : "jp"}
              onImageSaved={refreshGallery}
              initialPrompt={editState?.mode === "japanese" ? editState.prompt : undefined}
              initialImageUrl={editState?.mode === "japanese" ? editState.imageUrl : undefined}
            />
          </TabsContent>
          <TabsContent value="freestyle">
            <FreestyleImageGenerator
              key={activeTab === "freestyle" ? editKey : "fs"}
              onImageSaved={refreshGallery}
              initialPrompt={editState?.mode === "freestyle" ? editState.prompt : undefined}
              initialImageUrl={editState?.mode === "freestyle" ? editState.imageUrl : undefined}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Gallery */}
      <section className="pb-20 px-4">
        <div className="w-full max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 bg-border" />
            <h2 className="font-display text-lg font-bold text-foreground">Gallery</h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Gallery refreshKey={galleryRefreshKey} onEditImage={handleEditImage} />
        </div>
      </section>

      {/* Footer */}
      <footer className="pb-8 text-center">
        <p className="text-muted-foreground text-xs font-display tracking-widest">
          墨 · Sumi Ink Studio
        </p>
      </footer>

      {/* Confirm replacing active image */}
      <AlertDialog open={!!pendingEdit} onOpenChange={() => setPendingEdit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Replace current image?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an unsaved generated image. Loading a gallery image for editing will replace it. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingEdit) applyEdit(pendingEdit);
              setPendingEdit(null);
            }}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
