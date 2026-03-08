import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  alt: string;
  className?: string;
}

export default function BeforeAfterSlider({ beforeUrl, afterUrl, alt, className }: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("relative select-none cursor-col-resize overflow-hidden rounded-sm", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: "none" }}
    >
      {/* After image (full) */}
      <img src={afterUrl} alt={`${alt} (enhanced)`} className="w-full block" draggable={false} />

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <img
          src={beforeUrl}
          alt={`${alt} (original)`}
          className="w-full block"
          style={{ width: containerRef.current ? `${containerRef.current.offsetWidth}px` : "100%" }}
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-background shadow-md z-10"
        style={{ left: `${position}%`, transform: "translateX(-50%)" }}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background border-2 border-primary flex items-center justify-center shadow-lg">
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-primary">
            <path d="M5 3L2 8L5 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 3L14 8L11 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-sm bg-background/80 backdrop-blur-sm z-10">
        <span className="font-display text-[10px] text-muted-foreground uppercase tracking-wider">Before</span>
      </div>
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-sm bg-background/80 backdrop-blur-sm z-10">
        <span className="font-display text-[10px] text-primary uppercase tracking-wider font-bold">Enhanced</span>
      </div>
    </div>
  );
}
