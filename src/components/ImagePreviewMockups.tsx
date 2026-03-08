import { useState } from "react";
import { Frame, Paperclip, Image as ImageIcon, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MockupMode = "original" | "frame" | "wall" | "clippers";

const MODES: { id: MockupMode; label: string; icon: React.ReactNode }[] = [
  { id: "original", label: "Original", icon: <Maximize className="h-4 w-4" /> },
  { id: "frame", label: "Framed", icon: <Frame className="h-4 w-4" /> },
  { id: "wall", label: "On Wall", icon: <ImageIcon className="h-4 w-4" /> },
  { id: "clippers", label: "Clippers", icon: <Paperclip className="h-4 w-4" /> },
];

interface ImagePreviewMockupsProps {
  imageUrl: string;
  alt: string;
}

export default function ImagePreviewMockups({ imageUrl, alt }: ImagePreviewMockupsProps) {
  const [mode, setMode] = useState<MockupMode>("original");

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Mode selector */}
      <div className="flex gap-1 bg-secondary rounded-sm p-1">
        {MODES.map((m) => (
          <Button
            key={m.id}
            variant={mode === m.id ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode(m.id)}
            className="font-display text-xs gap-1.5 h-8"
          >
            {m.icon}
            {m.label}
          </Button>
        ))}
      </div>

      {/* Preview area */}
      <div className="w-full flex items-center justify-center">
        {mode === "original" && (
          <img
            src={imageUrl}
            alt={alt}
            className="max-w-full max-h-[600px] rounded-sm animate-ink-spread"
          />
        )}

        {mode === "frame" && (
          <div className="p-1 bg-gradient-to-br from-gold/80 via-gold to-gold/60 rounded-sm shadow-xl">
            <div className="p-0.5 bg-foreground/20">
              <div className="p-4 bg-cream">
                <img
                  src={imageUrl}
                  alt={alt}
                  className="max-w-full max-h-[500px] shadow-inner"
                />
              </div>
            </div>
          </div>
        )}

        {mode === "wall" && (
          <div className="relative w-full max-w-2xl">
            {/* Wall background */}
            <div className="w-full aspect-[16/10] bg-gradient-to-b from-secondary via-muted to-secondary rounded-sm flex items-center justify-center relative overflow-hidden">
              {/* Subtle wall texture */}
              <div className="absolute inset-0 opacity-30" style={{
                backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 40px, hsl(var(--border)) 40px, hsl(var(--border)) 41px), repeating-linear-gradient(0deg, transparent, transparent 40px, hsl(var(--border)) 40px, hsl(var(--border)) 41px)"
              }} />
              {/* Shadow behind frame */}
              <div className="relative" style={{ filter: "drop-shadow(4px 6px 12px rgba(0,0,0,0.3))" }}>
                <div className="p-1 bg-gradient-to-br from-gold/80 via-gold to-gold/60">
                  <div className="p-0.5 bg-foreground/20">
                    <img
                      src={imageUrl}
                      alt={alt}
                      className="max-h-[350px] max-w-[90%]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "clippers" && (
          <div className="relative w-full max-w-2xl">
            {/* String/wire */}
            <div className="w-full flex items-start justify-center pt-2">
              <div className="relative w-full max-w-lg">
                {/* Wire */}
                <div className="absolute top-3 left-0 right-0 h-px bg-foreground/40" />
                {/* Clipper left */}
                <div className="absolute top-0 left-[20%] w-5 h-7 flex flex-col items-center z-10">
                  <div className="w-3 h-2 bg-muted-foreground rounded-t-sm border border-foreground/30" />
                  <div className="w-1 h-5 bg-muted-foreground/60" />
                </div>
                {/* Clipper right */}
                <div className="absolute top-0 right-[20%] w-5 h-7 flex flex-col items-center z-10">
                  <div className="w-3 h-2 bg-muted-foreground rounded-t-sm border border-foreground/30" />
                  <div className="w-1 h-5 bg-muted-foreground/60" />
                </div>
                {/* Image hanging */}
                <div className="pt-8 flex justify-center">
                  <div className="relative" style={{ transform: "rotate(-1deg)", filter: "drop-shadow(2px 4px 8px rgba(0,0,0,0.2))" }}>
                    <img
                      src={imageUrl}
                      alt={alt}
                      className="max-h-[450px] max-w-full rounded-sm border-2 border-card"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
