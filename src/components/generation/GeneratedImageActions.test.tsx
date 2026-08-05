/**
 * Turn 4B closure — the generated-result action row must expose exactly two
 * production actions (Download master, Export for print), and no generic
 * bleed download.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GeneratedImageActions from "./GeneratedImageActions";
import type { CanonicalActionSource } from "@/lib/asset-integrity/source-resolver";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } },
}));

const canonical: CanonicalActionSource = {
  ok: true,
  kind: "canonical_master",
  url: "https://p.supabase.co/storage/v1/object/public/generated-images/u/a.png",
  bucket: "generated-images",
  path: "u/a.png",
  width: 6000,
  height: 8400,
  label: "Print master",
  reason: null,
  warnings: [],
};

function renderRow(source: CanonicalActionSource | null) {
  return render(
    <GeneratedImageActions
      imageUrl="blob:http://x/1"
      baseImageUrl={null}
      enhancedImageUrl={null}
      hasEnhanced={false}
      viewVersion="enhanced"
      onChangeViewVersion={() => {}}
      mode="poster"
      generationMode="print-ready"
      selectedPrintFormat={{ id: "50x70", label: "50×70 cm" } as never}
      printSize={{ dimensions: "50x70" } as never}
      effectiveAspectRatio="5:7"
      styleConfig={{ downloadPrefix: "art" } as never}
      isUpscaling={false}
      canManualUpscale={false}
      recommendedRecipe={null}
      onEnhanceConfirm={() => {}}
      savedToGallery={false}
      isEditMode={false}
      originalImageId={undefined}
      saving={false}
      replacing={false}
      exporting={false}
      canonicalSource={source}
      canonicalLoading={false}
      downloadingMaster={false}
      onDownloadMaster={() => {}}
      onSaveToGallery={() => {}}
      onReplaceOriginal={() => {}}
      onPrintExport={() => {}}
      onStartInlineEdit={() => {}}
      onRemoveImage={() => {}}
    />,
  );
}

describe("GeneratedImageActions production actions", () => {
  it("renders only Download master and Export for print", () => {
    renderRow(canonical);
    expect(screen.getByRole("button", { name: /download master/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export for print/i })).toBeInTheDocument();
    // no generic bleed download / export-format picker in this row
    expect(screen.queryByLabelText(/export format/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^download \(/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /master \(exact\)/i })).toBeNull();
  });

  it("keeps both production actions unavailable until a canonical source exists", () => {
    renderRow(null);
    expect(screen.getByRole("button", { name: /download master/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /export for print/i })).toBeDisabled();
  });

  it("enables both actions once the persisted canonical master resolves", () => {
    renderRow(canonical);
    expect(screen.getByRole("button", { name: /download master/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /export for print/i })).toBeEnabled();
  });
});

describe("no generic bleed download remains", () => {
  it("does not import downloadWithBleed or DownloadButton", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync("src/components/generation/GeneratedImageActions.tsx", "utf8"),
    );
    expect(src).not.toMatch(/downloadWithBleed/);
    expect(src).not.toMatch(/DownloadButton/);
  });
});
