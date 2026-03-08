import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ViewMode = "original" | "frame" | "clothesline";

interface FrameStyle {
  id: string;
  label: string;
  border: string;
  inner: string;
  mat: string;
}

const FRAME_STYLES: FrameStyle[] = [
  { id: "gold-classic", label: "Gold Classic", border: "bg-gradient-to-br from-[hsl(42,65%,65%)] via-[hsl(42,65%,55%)] to-[hsl(42,65%,45%)]", inner: "bg-[hsl(20,20%,15%)]/20", mat: "bg-[hsl(40,35%,93%)]" },
  { id: "dark-wood", label: "Dark Wood", border: "bg-gradient-to-br from-[hsl(20,40%,25%)] via-[hsl(20,35%,20%)] to-[hsl(20,30%,15%)]", inner: "bg-[hsl(20,20%,10%)]/30", mat: "bg-[hsl(40,20%,90%)]" },
  { id: "light-oak", label: "Light Oak", border: "bg-gradient-to-br from-[hsl(35,45%,60%)] via-[hsl(35,40%,50%)] to-[hsl(35,35%,40%)]", inner: "bg-[hsl(35,20%,30%)]/20", mat: "bg-[hsl(45,30%,95%)]" },
  { id: "black-modern", label: "Black Modern", border: "bg-gradient-to-br from-[hsl(0,0%,25%)] via-[hsl(0,0%,15%)] to-[hsl(0,0%,10%)]", inner: "bg-[hsl(0,0%,5%)]/30", mat: "bg-[hsl(0,0%,97%)]" },
  { id: "white-gallery", label: "White Gallery", border: "bg-gradient-to-br from-[hsl(0,0%,95%)] via-[hsl(0,0%,90%)] to-[hsl(0,0%,85%)]", inner: "bg-[hsl(0,0%,70%)]/20", mat: "bg-[hsl(0,0%,98%)]" },
  { id: "cherry", label: "Cherry", border: "bg-gradient-to-br from-[hsl(0,35%,35%)] via-[hsl(0,30%,28%)] to-[hsl(0,25%,22%)]", inner: "bg-[hsl(0,20%,15%)]/30", mat: "bg-[hsl(30,20%,92%)]" },
];

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "frame", label: "Framed" },
  { id: "clothesline", label: "Clothesline" },
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

/** Binder clip SVG — the kind with a black triangular body and silver wire handles */
function BinderClip({ x }: { x: number }) {
  return (
    <g transform={`translate(${x}, 0)`}>
      {/* Silver wire handles going up */}
      <path d="M 4 0 C 4 -20, 4 -28, 10 -32 Q 14 -34, 18 -32 C 24 -28, 24 -20, 24 0"
        fill="none" stroke="hsl(0,0%,60%)" strokeWidth="1.8" />
      {/* Black clip body */}
      <rect x="0" y="-2" width="28" height="16" rx="1" fill="hsl(0,0%,15%)" />
      {/* Clip grip lines */}
      <line x1="6" y1="3" x2="22" y2="3" stroke="hsl(0,0%,30%)" strokeWidth="0.7" />
      <line x1="6" y1="6" x2="22" y2="6" stroke="hsl(0,0%,30%)" strokeWidth="0.7" />
      <line x1="6" y1="9" x2="22" y2="9" stroke="hsl(0,0%,30%)" strokeWidth="0.7" />
    </g>
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
      <div className="w-full flex items-center justify-center">
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

        {mode === "clothesline" && (
          <div className="relative w-full max-w-2xl flex justify-center pt-12">
            {/* Strings going up to "ceiling" — two diagonal strings */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[320px] h-12 pointer-events-none">
              <svg width="320" height="48" viewBox="0 0 320 48" className="w-full h-full">
                {/* Left string */}
                <line x1="100" y1="48" x2="80" y2="0" stroke="hsl(var(--foreground))" strokeWidth="1" opacity="0.4" />
                {/* Right string */}
                <line x1="220" y1="48" x2="240" y2="0" stroke="hsl(var(--foreground))" strokeWidth="1" opacity="0.4" />
              </svg>
            </div>

            {/* Image with binder clips on top */}
            <div className="relative inline-block">
              {/* Binder clips SVG overlay */}
              <svg
                className="absolute z-10 pointer-events-none"
                style={{ top: -30, left: 0, width: "100%", height: 46 }}
                viewBox="0 0 300 46"
                preserveAspectRatio="xMidYMax meet"
              >
                <BinderClip x={72} />
                <BinderClip x={200} />
              </svg>

              <img
                src={imageUrl}
                alt={alt}
                className="max-h-[480px] max-w-full rounded-sm"
                style={{
                  filter: "drop-shadow(2px 6px 12px rgba(0,0,0,0.2))",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
