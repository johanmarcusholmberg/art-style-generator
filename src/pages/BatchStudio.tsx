import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, ListChecks } from "lucide-react";
import StyleNav from "@/components/StyleNav";
import BatchGenerator from "@/components/BatchGenerator";
import JobsManager from "@/components/JobsManager";

const BatchStudio = () => {
  const [activeTab, setActiveTab] = useState("generate");

  return (
    <div className="min-h-screen bg-background paper-texture">
      <StyleNav activePath="/batch" />

      <header className="pt-10 pb-12 text-center px-4">
        <p className="font-display text-primary text-sm tracking-[0.3em] uppercase mb-3">
          ⚡ Batch Studio
        </p>
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-tight mb-4">
          Batch<br />
          <span className="text-primary">Image Generator</span>
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
          Generate multiple images at once with batch mode, style grids, and prompt matrices.
          Images generate in the background and save to your gallery automatically.
        </p>
        <div className="mt-6 w-24 h-px bg-border mx-auto" />
      </header>

      <main className="pb-20 px-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-4xl mx-auto">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="generate" className="font-display text-sm gap-1">
              <Layers className="h-4 w-4" /> Generate
            </TabsTrigger>
            <TabsTrigger value="jobs" className="font-display text-sm gap-1">
              <ListChecks className="h-4 w-4" /> Jobs
            </TabsTrigger>
          </TabsList>
          <TabsContent value="generate">
            <BatchGenerator />
          </TabsContent>
          <TabsContent value="jobs">
            <JobsManager />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="pb-8 text-center">
        <p className="text-muted-foreground text-xs font-display tracking-widest">
          ⚡ Batch Studio
        </p>
      </footer>
    </div>
  );
};

export default BatchStudio;
