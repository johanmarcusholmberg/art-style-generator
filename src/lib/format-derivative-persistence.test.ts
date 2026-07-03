import { describe, it, expect, vi } from "vitest";
import {
  persistFormatDerivative,
  buildDerivativeStoragePath,
  buildDerivativeInsertRow,
  DERIVATIVE_BUCKET,
  type DerivativeSupabaseLike,
} from "./format-derivative-persistence";
import { planFormatDerivative } from "./format-derivative";

const plan = planFormatDerivative({
  sourceFormatId: "print_50x70",
  targetFormatId: "print_a3",
  sourceWidth: 1600,
  sourceHeight: 2240,
})!;

const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });

function makeSupabaseStub(overrides?: {
  uploadError?: { message: string } | null;
  uploadThrow?: Error;
  insertError?: { message: string } | null;
  insertRowId?: string | null;
  publicUrl?: string;
}) {
  const uploadCalls: Array<{
    bucket: string;
    path: string;
    blob: Blob;
    opts?: { contentType?: string; upsert?: boolean };
  }> = [];
  const publicUrlCalls: Array<{ bucket: string; path: string }> = [];
  const insertCalls: Array<{ table: string; row: Record<string, unknown> }> = [];

  const supabase: DerivativeSupabaseLike = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path, b, opts) => {
          uploadCalls.push({ bucket, path, blob: b, opts });
          if (overrides?.uploadThrow) throw overrides.uploadThrow;
          return { error: overrides?.uploadError ?? null };
        },
        getPublicUrl: (path) => {
          publicUrlCalls.push({ bucket, path });
          return {
            data: {
              publicUrl:
                overrides?.publicUrl ??
                `https://stub.local/${bucket}/${path}`,
            },
          };
        },
      }),
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        insertCalls.push({ table, row });
        return {
          select: () => ({
            single: async () => ({
              data: overrides?.insertRowId
                ? { id: overrides.insertRowId }
                : overrides?.insertError
                  ? null
                  : { id: "new-row-id" },
              error: overrides?.insertError ?? null,
            }),
          }),
        };
      },
    }),
  };

  return { supabase, uploadCalls, publicUrlCalls, insertCalls };
}

describe("buildDerivativeStoragePath", () => {
  it("encodes source id, target format, and timestamp", () => {
    const p = buildDerivativeStoragePath({
      sourceImageId: "src-1",
      targetFormat: "print_a3",
      now: 123,
    });
    expect(p).toBe("derivative-print_a3-src-1-123.png");
  });
});

describe("buildDerivativeInsertRow", () => {
  it("populates required lineage metadata", () => {
    const row = buildDerivativeInsertRow({
      sourceImageId: "src-1",
      plan,
      storagePath: "derivative-print_a3-src-1-1.png",
      publicUrl: "https://stub.local/derivative.png",
    });
    expect(row.source_image_id).toBe("src-1");
    expect(row.source_format).toBe("print_50x70");
    expect(row.target_format).toBe("print_a3");
    expect(row.crop_box).toEqual(plan.cropBox);
    expect(row.derived_from_master).toBe(true);
    // Exact target dimensions saved
    expect(row.actual_width_px).toBe(plan.outputWidth);
    expect(row.actual_height_px).toBe(plan.outputHeight);
    expect(row.master_width).toBe(plan.outputWidth);
    expect(row.master_height).toBe(plan.outputHeight);
    // Target poster format saved
    expect(row.print_format_id).toBe("print_a3");
    // Never padding
    expect(row.crop_mode).toBe("crop");
    expect(row.padding_mode).toBe("none");
    // Route marker so downstream analytics can distinguish this flow
    expect(row.execution_route).toBe("format_derivative_crop");
  });
});

describe("persistFormatDerivative — success path", () => {
  it("uploads the PNG blob to the generated-images bucket with correct path", async () => {
    const stub = makeSupabaseStub();
    const res = await persistFormatDerivative(
      { sourceImageId: "src-1", plan, blob },
      { supabase: stub.supabase, now: () => 42 },
    );
    expect(res.persisted).toBe(true);
    expect(stub.uploadCalls).toHaveLength(1);
    const call = stub.uploadCalls[0];
    expect(call.bucket).toBe(DERIVATIVE_BUCKET);
    expect(call.path).toBe("derivative-print_a3-src-1-42.png");
    expect(call.blob).toBe(blob);
    expect(call.opts?.contentType).toBe("image/png");
  });

  it("inserts a generated_images row with full lineage metadata", async () => {
    const stub = makeSupabaseStub({ insertRowId: "derived-42" });
    const res = await persistFormatDerivative(
      { sourceImageId: "src-1", plan, blob },
      { supabase: stub.supabase, now: () => 42 },
    );
    expect(res.persisted).toBe(true);
    if (!res.persisted) return;
    expect(res.insertedId).toBe("derived-42");
    expect(res.metadata).toEqual({
      sourceImageId: "src-1",
      sourceFormat: "print_50x70",
      targetFormat: "print_a3",
      cropBox: plan.cropBox,
      derivedFromMaster: true,
      outputWidth: plan.outputWidth,
      outputHeight: plan.outputHeight,
    });

    expect(stub.insertCalls).toHaveLength(1);
    const { table, row } = stub.insertCalls[0];
    expect(table).toBe("generated_images");
    expect(row.source_image_id).toBe("src-1");
    expect(row.source_format).toBe("print_50x70");
    expect(row.target_format).toBe("print_a3");
    expect(row.crop_box).toEqual(plan.cropBox);
    expect(row.derived_from_master).toBe(true);
    expect(row.actual_width_px).toBe(plan.outputWidth);
    expect(row.actual_height_px).toBe(plan.outputHeight);
    expect(row.print_format_id).toBe("print_a3");
  });

  it("never calls any AI/generator endpoint (no fetch usage)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as never)
      .mockImplementation(() => {
        throw new Error("no network calls allowed in derivative flow");
      });
    const stub = makeSupabaseStub();
    const res = await persistFormatDerivative(
      { sourceImageId: "src-1", plan, blob },
      { supabase: stub.supabase, now: () => 1 },
    );
    expect(res.persisted).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("persistFormatDerivative — failure paths trigger fallback download", () => {
  it("upload error surfaces fallback download blob (no insert attempted)", async () => {
    const stub = makeSupabaseStub({
      uploadError: { message: "storage exploded" },
    });
    const res = await persistFormatDerivative(
      { sourceImageId: "src-1", plan, blob },
      { supabase: stub.supabase, now: () => 1 },
    );
    expect(res.persisted).toBe(false);
    if (res.persisted === true) return;
    expect(res.stage).toBe("upload");
    expect(res.error.message).toMatch(/storage exploded/);
    expect(res.fallbackDownload.blob).toBe(blob);
    expect(res.fallbackDownload.filename).toBe(
      `derivative-print_a3-${plan.outputWidth}x${plan.outputHeight}.png`,
    );
    expect(stub.insertCalls).toHaveLength(0);
  });

  it("upload throw is caught and returns fallback", async () => {
    const stub = makeSupabaseStub({ uploadThrow: new Error("network dead") });
    const res = await persistFormatDerivative(
      { sourceImageId: "src-1", plan, blob },
      { supabase: stub.supabase, now: () => 1 },
    );
    expect(res.persisted).toBe(false);
    if (res.persisted === true) return;
    expect(res.stage).toBe("upload");
    expect(res.error.message).toMatch(/network dead/);
    expect(res.fallbackDownload.blob).toBe(blob);
  });

  it("insert error still yields fallback download", async () => {
    const stub = makeSupabaseStub({
      insertError: { message: "db timeout" },
    });
    const res = await persistFormatDerivative(
      { sourceImageId: "src-1", plan, blob },
      { supabase: stub.supabase, now: () => 1 },
    );
    expect(res.persisted).toBe(false);
    if (res.persisted === true) return;
    expect(res.stage).toBe("insert");
    expect(res.error.message).toMatch(/db timeout/);
    expect(res.fallbackDownload.blob).toBe(blob);
  });
});
