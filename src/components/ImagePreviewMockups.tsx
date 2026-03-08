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
          <div className="relative w-full max-w-2xl flex justify-center">
            {/* Container for wires + image */}
            <div className="relative inline-flex flex-col items-center">
              {/* Two horizontal wires */}
              <div className="relative w-full" style={{ height: 32 }}>
                {/* Wire 1 (top) */}
                <div className="absolute left-0 right-0 top-[8px] h-[1px] bg-foreground/40" />
                {/* Wire 2 (bottom) */}
                <div className="absolute left-0 right-0 top-[22px] h-[1px] bg-foreground/40" />
              </div>

              {/* Image with clips overlapping the wires */}
              <div
                className="relative -mt-3"
                style={{
                  transform: "rotate(-0.8deg)",
                  filter: "drop-shadow(2px 4px 8px rgba(0,0,0,0.15))",
                }}
              >
                {/* Left clip — sits on top edge of image, straddling the wire */}
                <svg
                  className="absolute z-10"
                  style={{ top: -14, left: "18%" }}
                  width="20" height="36" viewBox="0 0 20 36"
                >
                  {/* Clip body */}
                  <rect x="3" y="0" width="14" height="24" rx="2" fill="hsl(var(--muted-foreground))" opacity="0.85" />
                  {/* Clip grip top */}
                  <rect x="5" y="2" width="10" height="8" rx="1.5" fill="hsl(var(--foreground))" opacity="0.25" />
                  {/* Spring ring */}
                  <circle cx="10" cy="13" r="2.5" fill="none" stroke="hsl(var(--foreground))" strokeWidth="1" opacity="0.3" />
                  {/* Lower jaw */}
                  <rect x="5" y="18" width="10" height="16" rx="1" fill="hsl(var(--muted-foreground))" opacity="0.7" />
                  <line x1="7" y1="22" x2="13" y2="22" stroke="hsl(var(--foreground))" strokeWidth="0.5" opacity="0.3" />
                  <line x1="7" y1="25" x2="13" y2="25" stroke="hsl(var(--foreground))" strokeWidth="0.5" opacity="0.3" />
                </svg>

                {/* Right clip */}
                <svg
                  className="absolute z-10"
                  style={{ top: -14, right: "18%" }}
                  width="20" height="36" viewBox="0 0 20 36"
                >
                  <rect x="3" y="0" width="14" height="24" rx="2" fill="hsl(var(--muted-foreground))" opacity="0.85" />
                  <rect x="5" y="2" width="10" height="8" rx="1.5" fill="hsl(var(--foreground))" opacity="0.25" />
                  <circle cx="10" cy="13" r="2.5" fill="none" stroke="hsl(var(--foreground))" strokeWidth="1" opacity="0.3" />
                  <rect x="5" y="18" width="10" height="16" rx="1" fill="hsl(var(--muted-foreground))" opacity="0.7" />
                  <line x1="7" y1="22" x2="13" y2="22" stroke="hsl(var(--foreground))" strokeWidth="0.5" opacity="0.3" />
                  <line x1="7" y1="25" x2="13" y2="25" stroke="hsl(var(--foreground))" strokeWidth="0.5" opacity="0.3" />
                </svg>

                <img
                  src={imageUrl}
                  alt={alt}
                  className="max-h-[450px] max-w-full rounded-sm border border-border/30"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
