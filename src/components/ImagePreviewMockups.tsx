import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ViewMode = "original" | "frame";

interface FrameStyle {
  id: string;
  label: string;
  border: string;
  inner: string;
  mat: string;
}

const FRAME_STYLES: FrameStyle[] = [
  { id: "gold-classic", label: "Gold Classic", border: "bg-gradient-to-br from-[hsl(42,65%,65%)] via-[hsl(42,65%,55%)] to-[hsl(42,65%,45%)]", inner: "bg-[hsl(20,20%,15%)]/20", mat: "bg-[hsl(42,50%,75%)]" },
  { id: "dark-wood", label: "Dark Wood", border: "bg-gradient-to-br from-[hsl(20,40%,25%)] via-[hsl(20,35%,20%)] to-[hsl(20,30%,15%)]", inner: "bg-[hsl(20,20%,10%)]/30", mat: "bg-[hsl(20,30%,35%)]" },
  { id: "light-oak", label: "Light Oak", border: "bg-gradient-to-br from-[hsl(35,45%,60%)] via-[hsl(35,40%,50%)] to-[hsl(35,35%,40%)]", inner: "bg-[hsl(35,20%,30%)]/20", mat: "bg-[hsl(35,35%,65%)]" },
  { id: "black-modern", label: "Black Modern", border: "bg-gradient-to-br from-[hsl(0,0%,25%)] via-[hsl(0,0%,15%)] to-[hsl(0,0%,10%)]", inner: "bg-[hsl(0,0%,5%)]/30", mat: "bg-[hsl(0,0%,20%)]" },
  { id: "white-gallery", label: "White Gallery", border: "bg-gradient-to-br from-[hsl(0,0%,95%)] via-[hsl(0,0%,90%)] to-[hsl(0,0%,85%)]", inner: "bg-[hsl(0,0%,70%)]/20", mat: "bg-[hsl(0,0%,92%)]" },
  { id: "cherry", label: "Cherry", border: "bg-gradient-to-br from-[hsl(0,35%,35%)] via-[hsl(0,30%,28%)] to-[hsl(0,25%,22%)]", inner: "bg-[hsl(0,20%,15%)]/30", mat: "bg-[hsl(0,25%,35%)]" },
];

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "frame", label: "Framed" },
];

interface ImagePreviewMockupsProps {
  imageUrl: string;
  alt: string;
}

function FramedImage({ imageUrl, alt, frame, className }: { imageUrl: string; alt: string; frame: FrameStyle; className?: string }) {
  return (
    <div className={cn("p-1.5 rounded-sm shadow-xl", frame.border, className)}>
      <div className={cn("p-0.5", frame.inner)}>
        <div className={cn("p-5", frame.mat)}>
          <img src={imageUrl} alt={alt} className="max-w-full max-h-[500px] shadow-inner block" />
        </div>
      </div>
    </div>
  );
}

export default function ImagePreviewMockups({ imageUrl, alt }: ImagePreviewMockupsProps) {
  const [mode, setMode] = useState<ViewMode>("original");
  const [frameStyle, setFrameStyle] = useState<string>(FRAME_STYLES[0].id);

  const selectedFrame = FRAME_STYLES.find((f) => f.id === frameStyle) || FRAME_STYLES[0];

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Controls row */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={mode} onValueChange={(v) => setMode(v as ViewMode)}>
          <SelectTrigger className="w-[160px] font-display text-xs h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIEW_MODES.map((m) => (
              <SelectItem key={m.id} value={m.id} className="font-display text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {mode === "frame" && (
          <Select value={frameStyle} onValueChange={setFrameStyle}>
            <SelectTrigger className="w-[160px] font-display text-xs h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FRAME_STYLES.map((f) => (
                <SelectItem key={f.id} value={f.id} className="font-display text-xs">
                  <span className="flex items-center gap-2">
                    <span className={cn("w-3 h-3 rounded-sm inline-block border border-border", f.border)} />
                    {f.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Preview area */}
      <div className={cn(
        "w-full flex items-center justify-center rounded-sm p-8 transition-colors",
        mode === "frame" ? selectedFrame.bg : ""
      )}>
        {mode === "original" && (
          <img
            src={imageUrl}
            alt={alt}
            className="max-w-full max-h-[600px] rounded-sm animate-ink-spread"
          />
        )}

        {mode === "frame" && (
          <FramedImage imageUrl={imageUrl} alt={alt} frame={selectedFrame} />
        )}
      </div>
    </div>
  );
}
