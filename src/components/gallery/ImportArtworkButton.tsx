/**
 * ImportArtworkButton — upload finished, poster-ready artwork directly
 * into the gallery (separate from the generator's source-image upload).
 *
 * - Accepts PNG / JPG / WebP up to 150 MB.
 * - Stores files in the existing public `generated-images` bucket under
 *   `manual-imports/{timestamp}-{safeFileName}`.
 * - Inserts a `generated_images` row tagged with provider="manual_upload".
 * - Best-effort cost event (`event_type="manual_import"`).
 *
 * Staged progress: Supabase JS storage upload does not surface byte-level
 * progress, so we show coarse stages (Validating → Uploading → Reading
 * dimensions → Saving → Done) and an indeterminate progress bar. If
 * dimension reading fails after a successful upload, we still create the
 * gallery row with aspect_ratio="unknown" and null sizes.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { loadImageDimensions, classifyPrintReadiness } from "@/lib/image-metadata";
import { recordAssetCostEvent } from "@/lib/cost-events";

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 150 * 1024 * 1024; // 150 MB
const BUCKET = "generated-images";

type Stage =
  | "idle"
  | "validating"
  | "uploading"
  | "reading-dims"
  | "saving"
  | "done";

const STAGE_LABEL: Record<Exclude<Stage, "idle">, string> = {
  validating: "Validating file…",
  uploading: "Uploading artwork…",
  "reading-dims": "Reading dimensions…",
  saving: "Saving to gallery…",
  done: "Done",
};

const STAGE_PCT: Record<Exclude<Stage, "idle">, number> = {
  validating: 10,
  uploading: 45,
  "reading-dims": 70,
  saving: 90,
  done: 100,
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
function aspectRatioFromDims(w: number, h: number): string {
  if (!w || !h) return "unknown";
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  if (rw > 50 || rh > 50) return `${w}:${h}`;
  return `${rw}:${rh}`;
}

interface Props {
  onImported?: () => void;
}

export default function ImportArtworkButton({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const { toast } = useToast();

  const busy = stage !== "idle" && stage !== "done";

  const pick = () => {
    if (busy) return;
    inputRef.current?.click();
  };

  const fail = (title: string, description: string) => {
    toast({ title, description, variant: "destructive" });
    setStage("idle");
  };

  const handleFile = async (file: File) => {
    // 1. Validation
    setStage("validating");
    if (!ALLOWED.includes(file.type)) {
      fail(
        "Unsupported file type",
        `“${file.name}” is ${file.type || "an unrecognised type"}. Please upload a PNG, JPG, or WebP image.`,
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      fail(
        "File too large",
        `Maximum size is 150 MB. “${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
      );
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const path = `manual-imports/${Date.now()}-${safeName}`;

    // 2. Upload
    setStage("uploading");
    let publicUrl: string;
    try {
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      publicUrl = pub.publicUrl;
    } catch (err) {
      console.error("[ImportArtwork] upload failed:", err);
      const msg = err instanceof Error ? err.message : "The file could not be uploaded.";
      fail("Upload failed", `${msg} Please check your connection and try again.`);
      return;
    }

    // 3. Dimensions (best-effort — don't abort import if this fails)
    setStage("reading-dims");
    let width: number | null = null;
    let height: number | null = null;
    let dimsFailed = false;
    try {
      const dims = await loadImageDimensions(publicUrl);
      width = dims.width;
      height = dims.height;
    } catch (e) {
      console.warn("[ImportArtwork] dimension probe failed:", e);
      dimsFailed = true;
    }

    const aspect = width && height ? aspectRatioFromDims(width, height) : "unknown";
    const readiness = classifyPrintReadiness(width, height, null);

    // 4. DB insert
    setStage("saving");
    let insertedId: string | null = null;
    try {
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
      insertedId = (inserted as { id: string } | null)?.id ?? null;
    } catch (err) {
      console.error("[ImportArtwork] db insert failed:", err);
      const msg = err instanceof Error ? err.message : "Could not save the gallery record.";
      // The file is uploaded but orphaned. Surface that clearly.
      fail(
        "Saving to gallery failed",
        `${msg} The file was uploaded but no gallery entry was created. Please try again.`,
      );
      return;
    }

    // 5. Best-effort cost event (never blocks)
    if (insertedId) {
      void recordAssetCostEvent({
        imageId: insertedId,
        eventType: "manual_import",
        provider: "manual_upload",
        estimatedCost: null,
        status: "succeeded",
        metadata: { fileName: file.name, sizeBytes: file.size },
      });
    }

    setStage("done");
    if (dimsFailed) {
      toast({
        title: "Imported without dimensions",
        description:
          "Artwork added to your gallery, but its dimensions couldn't be read. Print readiness will show as Unknown.",
      });
    } else {
      toast({
        title: "Artwork imported",
        description: `${file.name} added to your gallery.`,
      });
    }
    onImported?.();

    // Reset shortly so the bar/“Done” flashes before disappearing.
    setTimeout(() => setStage("idle"), 800);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (f) void handleFile(f);
  };

  const activeStage = stage !== "idle" ? stage : null;

  return (
    <div className="flex items-center gap-2">
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
        disabled={busy}
        aria-busy={busy}
        className="font-display text-xs h-8"
        title="Upload a finished poster-ready image (PNG / JPG / WebP, up to 150 MB)"
      >
        {busy ? (
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

      {activeStage && (
        <div className="flex items-center gap-2 min-w-[180px]">
          <Progress value={STAGE_PCT[activeStage]} className="h-1.5 w-28" />
          <span className="font-display text-[11px] text-muted-foreground whitespace-nowrap">
            {STAGE_LABEL[activeStage]}
          </span>
        </div>
      )}
    </div>
  );
}
