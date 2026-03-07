import ImageGenerator from "@/components/ImageGenerator";

const Index = () => {
  return (
    <div className="min-h-screen bg-background paper-texture">
      {/* Header */}
      <header className="pt-16 pb-12 text-center px-4">
        <p className="font-display text-gold text-sm tracking-[0.3em] uppercase mb-3">
          浮世絵 · Ukiyo-e
        </p>
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-tight mb-4">
          Floating World<br />
          <span className="text-primary">Image Generator</span>
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
          Describe a scene and watch it come to life in the timeless style 
          of traditional Japanese woodblock prints.
        </p>
        <div className="mt-6 w-24 h-px bg-border mx-auto" />
      </header>

      {/* Generator */}
      <main className="pb-20">
        <ImageGenerator />
      </main>

      {/* Footer */}
      <footer className="pb-8 text-center">
        <p className="text-muted-foreground text-xs font-display tracking-widest">
          墨 · Sumi Ink Studio
        </p>
      </footer>
    </div>
  );
};

export default Index;
