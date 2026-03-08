import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRINT_SIZES, type PrintSize } from "@/components/PrintSizeSelector";

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

function useEdgeColor(imageUrl: string): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const w = canvas.width;
        const h = canvas.height;
        let r = 0, g = 0, b = 0, count = 0;
        const step = Math.max(1, Math.floor(Math.max(w, h) / 40));

        for (let x = 0; x < w; x += step) {
          for (const y of [0, h - 1]) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            r += d[0]; g += d[1]; b += d[2]; count++;
          }
        }
        for (let y = 0; y < h; y += step) {
          for (const x of [0, w - 1]) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            r += d[0]; g += d[1]; b += d[2]; count++;
          }
        }

        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          setColor(`rgb(${r},${g},${b})`);
        }
      } catch {
        setColor(null);
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  return color;
}

/** Parse ratio string like "5:7" into [5, 7] */
function parseRatio(ratio: string): [number, number] {
  const parts = ratio.split(":").map(Number);
  return [parts[0] || 1, parts[1] || 1];
}

interface FramedImageProps {
  imageUrl: string;
  alt: string;
  frame: FrameStyle;
  edgeColor: string | null;
  printSize: PrintSize;
  className?: string;
}

function FramedImage({ imageUrl, alt, frame, edgeColor, printSize, className }: FramedImageProps) {
  const [rw, rh] = parseRatio(printSize.ratio);

  // Use a fixed display height and compute width from the print ratio
  const maxDisplayH = 500;
  const maxDisplayW = 600;

  // Compute display dimensions preserving the print ratio
  let displayW = maxDisplayH * (rw / rh);
  let displayH = maxDisplayH;
  if (displayW > maxDisplayW) {
    displayW = maxDisplayW;
    displayH = maxDisplayW * (rh / rw);
  }

  // Frame thickness proportional to shorter display side
  const shortSide = Math.min(displayW, displayH);
  const framePx = Math.max(4, Math.round(shortSide * 0.025));
  const innerPx = Math.max(1, Math.round(shortSide * 0.006));
  const matPx = Math.max(8, Math.round(shortSide * 0.06));

  const matStyle: React.CSSProperties = {
    padding: matPx,
    ...(edgeColor ? { backgroundColor: edgeColor } : {}),
  };
  const matClass = edgeColor ? "" : "bg-muted";

  return (
    <div className={cn("rounded-sm shadow-xl inline-block", frame.border, className)} style={{ padding: framePx }}>
      <div className={cn(frame.inner)} style={{ padding: innerPx }}>
        <div className={cn(matClass)} style={matStyle}>
          <img
            src={imageUrl}
            alt={alt}
            className="block shadow-inner"
            style={{ width: displayW, height: displayH, objectFit: "cover" }}
          />
        </div>
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
  initialPrintSize?: PrintSize;
}

export default function ImagePreviewMockups({ imageUrl, alt, initialPrintSize }: ImagePreviewMockupsProps) {
  const [mode, setMode] = useState<ViewMode>("original");
  const [frameStyle, setFrameStyle] = useState<string>(FRAME_STYLES[0].id);
  const [printSize, setPrintSize] = useState<PrintSize>(initialPrintSize || PRINT_SIZES[2]);
  const edgeColor = useEdgeColor(imageUrl);

  const selectedFrame = FRAME_STYLES.find((f) => f.id === frameStyle) || FRAME_STYLES[0];

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Controls row */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={mode} onValueChange={(v) => setMode(v as ViewMode)}>
          <SelectTrigger className="w-[140px] font-display text-xs h-9">
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
          <>
            <Select value={frameStyle} onValueChange={setFrameStyle}>
              <SelectTrigger className="w-[150px] font-display text-xs h-9">
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

            <Select value={printSize.ratio} onValueChange={(v) => {
              const found = PRINT_SIZES.find((s) => s.ratio === v);
              if (found) setPrintSize(found);
            }}>
              <SelectTrigger className="w-[170px] font-display text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINT_SIZES.map((s) => (
                  <SelectItem key={s.ratio} value={s.ratio} className="font-display text-xs">
                    {s.label} ({s.dimensions})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
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
          <FramedImage imageUrl={imageUrl} alt={alt} frame={selectedFrame} edgeColor={edgeColor} printSize={printSize} />
        )}
      </div>
    </div>
  );
}
