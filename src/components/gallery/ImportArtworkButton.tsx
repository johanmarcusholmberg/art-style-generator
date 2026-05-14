/**
 * ImportArtworkButton — upload finished, poster-ready artwork directly
 * into the gallery (separate from the generator's source-image upload).
 *
 * - Accepts PNG / JPG / WebP up to 150 MB.
 * - Stores files in the existing public `generated-images` bucket under
 *   `manual-imports/{timestamp}-{safeFileName}`.
 * - Inserts a `generated_images` row tagged with provider="manual_upload"
 *   so the rest of the gallery (lightbox, badges, download, delete,
 *   collections) keeps working unchanged.
 * - Best-effort cost event (event_type="manual_import").
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { loadImageDimensions, classifyPrintReadiness } from "@/lib/image-metadata";
import { recordAssetCostEvent } from "@/lib/cost-events";

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 150 * 1024 * 1024; // 150 MB
const BUCKET = "generated-images";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
function aspectRatioFromDims(w: number, h: number): string {
  if (!w || !h) return "unknown";
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  // Keep ratios sane (avoid huge numerators)
  if (rw > 50 || rh > 50) return `${w}:${h}`;
  return `${rw}:${rh}`;
}

interface Props {
  onImported?: () => void;
}

export default function ImportArtworkButton({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const pick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    if (!ALLOWED.includes(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Please upload a PNG, JPG, or WebP image.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        title: "File too large",
        description: `Maximum size is 150 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const path = `manual-imports/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      // Detect dimensions (best-effort)
      let width: number | null = null;
      let height: number | null = null;
      try {
        const dims = await loadImageDimensions(publicUrl);
        width = dims.width;
        height = dims.height;
      } catch (e) {
        console.warn("[ImportArtwork] dimension probe failed:", e);
      }

      const aspect = width && height ? aspectRatioFromDims(width, height) : "unknown";
      const readiness = classifyPrintReadiness(width, height, null);

      const { data: inserted, error: dbErr } = await supabase
        .from("generated_images")
        .insert({
          prompt: `Manual import: ${file.name}`,
          mode: "manual-import",
          aspect_ratio: aspect,
          print_size: null,
          storage_path: path,
          master_storage_path: path,
          asset_role: "enhanced_master",
          provider: "manual_upload",
          model: null,
          route: "manual_import",
          estimated_cost: null,
          currency: "USD",
          prompt_version: "manual",
          master_image_url: publicUrl,
          master_width: width,
          master_height: height,
          actual_width_px: width,
          actual_height_px: height,
          print_readiness: readiness,
          source_image_url: null,
          source_storage_path: null,
          source_file_name: null,
        } as never)
        .select("id")
        .single();
      if (dbErr) throw dbErr;

      // Best-effort cost event
      if (inserted?.id) {
        void recordAssetCostEvent({
          imageId: (inserted as { id: string }).id,
          eventType: "manual_import",
          provider: "manual_upload",
          estimatedCost: null,
          status: "succeeded",
          metadata: { fileName: file.name, sizeBytes: file.size },
        });
      }

      toast({
        title: "Artwork imported",
        description: `${file.name} added to your gallery.`,
      });
      onImported?.();
    } catch (err) {
      console.error("[ImportArtwork] failed:", err);
      const msg = err instanceof Error ? err.message : "Could not import artwork.";
      toast({ title: "Import failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onInputChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={pick}
        disabled={uploading}
        className="font-display text-xs h-8"
        title="Upload a finished poster-ready image (PNG / JPG / WebP, up to 150 MB)"
      >
        {uploading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Importing…
          </>
        ) : (
          <>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Import artwork
          </>
        )}
      </Button>
    </>
  );
}
