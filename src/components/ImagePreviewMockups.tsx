import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";

type ViewMode = "original" | "frame";

interface FrameStyle {
  id: string;
  label: string;
  border: string;
  inner: string;
}

const FRAME_STYLES: FrameStyle[] = [
  { id: "gold-classic", label: "Gold Classic", border: "bg-gradient-to-br from-[hsl(42,65%,65%)] via-[hsl(42,65%,55%)] to-[hsl(42,65%,45%)]", inner: "bg-[hsl(20,20%,15%)]/20" },
  { id: "dark-wood", label: "Dark Wood", border: "bg-gradient-to-br from-[hsl(20,40%,25%)] via-[hsl(20,35%,20%)] to-[hsl(20,30%,15%)]", inner: "bg-[hsl(20,20%,10%)]/30" },
  { id: "light-oak", label: "Light Oak", border: "bg-gradient-to-br from-[hsl(35,45%,60%)] via-[hsl(35,40%,50%)] to-[hsl(35,35%,40%)]", inner: "bg-[hsl(35,20%,30%)]/20" },
  { id: "black-modern", label: "Black Modern", border: "bg-gradient-to-br from-[hsl(0,0%,25%)] via-[hsl(0,0%,15%)] to-[hsl(0,0%,10%)]", inner: "bg-[hsl(0,0%,5%)]/30" },
  { id: "white-gallery", label: "White Gallery", border: "bg-gradient-to-br from-[hsl(0,0%,95%)] via-[hsl(0,0%,90%)] to-[hsl(0,0%,85%)]", inner: "bg-[hsl(0,0%,70%)]/20" },
  { id: "cherry", label: "Cherry", border: "bg-gradient-to-br from-[hsl(0,35%,35%)] via-[hsl(0,30%,28%)] to-[hsl(0,25%,22%)]", inner: "bg-[hsl(0,20%,15%)]/30" },
];

function FramedImage({ imageUrl, alt, frame, className }: { imageUrl: string; alt: string; frame: FrameStyle; className?: string }) {
  const framePx = 10;
  const innerPx = 2;

  return (
    <div className={cn("rounded-sm shadow-xl", frame.border, className)} style={{ padding: framePx }}>
      <div className={cn(frame.inner)} style={{ padding: innerPx }}>
        <img src={imageUrl} alt={alt} className="max-w-full max-h-[600px] block" />
      </div>
    </div>
  );
}

function FramedContent({ children, frame, className }: { children: React.ReactNode; frame: FrameStyle; className?: string }) {
  const framePx = 10;
  const innerPx = 2;

  return (
    <div className={cn("rounded-sm shadow-xl", frame.border, className)} style={{ padding: framePx }}>
      <div className={cn(frame.inner)} style={{ padding: innerPx }}>
        {children}
      </div>
    </div>
  );
}

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "frame", label: "Framed" },
];

interface ImagePreviewMockupsProps {
  imageUrl: string;
  alt: string;
  compareUrl?: string;
}

export default function ImagePreviewMockups({ imageUrl, alt, compareUrl }: ImagePreviewMockupsProps) {
  const [mode, setMode] = useState<ViewMode>("original");
  const [frameStyle, setFrameStyle] = useState<string>(FRAME_STYLES[0].id);
  const edgeColor = useEdgeColor(imageUrl);

  const selectedFrame = FRAME_STYLES.find((f) => f.id === frameStyle) || FRAME_STYLES[0];
  const isCompare = !!compareUrl;

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
        {isCompare ? (
          mode === "frame" ? (
            <FramedContent frame={selectedFrame} edgeColor={edgeColor}>
              <BeforeAfterSlider beforeUrl={compareUrl} afterUrl={imageUrl} alt={alt} className="max-w-full max-h-[500px]" />
            </FramedContent>
          ) : (
            <BeforeAfterSlider beforeUrl={compareUrl} afterUrl={imageUrl} alt={alt} className="max-w-full max-h-[600px]" />
          )
        ) : mode === "original" ? (
          <img
            src={imageUrl}
            alt={alt}
            className="max-w-full max-h-[600px] rounded-sm animate-ink-spread"
          />
        ) : mode === "frame" ? (
          <FramedImage imageUrl={imageUrl} alt={alt} frame={selectedFrame} edgeColor={edgeColor} />
        ) : null}
      </div>
    </div>
  );
}
