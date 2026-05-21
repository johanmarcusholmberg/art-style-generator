/**
 * Smoke tests for gallery replacement safety (Phase 5 audit fixes).
 *
 * The replaceInGallery contract that must NEVER regress:
 *  1. Upload new base (+ optional enhanced) BEFORE touching originals.
 *  2. Update the DB row to point at the new paths.
 *  3. Only AFTER a successful DB update, remove the old storage objects.
 *  4. If the DB update fails, remove the JUST-UPLOADED replacement files
 *     and leave the original asset untouched.
 *
 * These tests mock the supabase client to verify call ordering and
 * cleanup behaviour without touching real storage.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the supabase client used by gallery.ts ─────────────────────
type RemoveCall = { bucket: string; paths: string[] };
type UploadCall = { bucket: string; path: string };

const calls = {
  uploads: [] as UploadCall[],
  removes: [] as RemoveCall[],
  updates: [] as Record<string, unknown>[],
  selects: 0,
};

let uploadShouldFail = false;
let updateShouldFail = false;
let existingRow: {
  storage_path?: string | null;
  enhanced_storage_path?: string | null;
  master_storage_path?: string | null;
} = {};

vi.mock("@/integrations/supabase/client", () => {
  const storageFrom = (bucket: string) => ({
    upload: vi.fn(async (path: string) => {
      calls.uploads.push({ bucket, path });
      return uploadShouldFail
        ? { error: new Error("upload failed") }
        : { error: null };
    }),
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://stub.local/${bucket}/${path}` },
    }),
    remove: vi.fn(async (paths: string[]) => {
      calls.removes.push({ bucket, paths });
      return { error: null };
    }),
  });

  const tableFrom = () => {
    const api = {
      select: vi.fn(() => api),
      eq: vi.fn(() => api),
      single: vi.fn(async () => {
        calls.selects += 1;
        return { data: existingRow, error: null };
      }),
      insert: vi.fn(async () => ({ error: null })),
      update: vi.fn((payload: Record<string, unknown>) => {
        calls.updates.push(payload);
        return {
          eq: vi.fn(async () =>
            updateShouldFail ? { error: new Error("db failed") } : { error: null },
          ),
        };
      }),
    };
    return api;
  };

  return {
    supabase: {
      storage: { from: storageFrom },
      from: tableFrom,
    },
  };
});

// loadImageDimensions is called by the dimension-fallback path; stub it
// so the test runs deterministically without a real Image.
vi.mock("@/lib/image-metadata", () => ({
  loadImageDimensions: vi.fn(async () => ({ width: 800, height: 1200 })),
  classifyPrintReadiness: () => "ok" as const,
}));

import { replaceInGallery } from "./gallery";

const tinyPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const baseOpts = {
  imageUrl: tinyPngDataUrl,
  prompt: "p",
  mode: "test",
  aspectRatio: "2:3",
  printSize: "50x70",
  originalId: "img-1",
  originalStoragePath: "test-OLD.png",
};

beforeEach(() => {
  calls.uploads = [];
  calls.removes = [];
  calls.updates = [];
  calls.selects = 0;
  uploadShouldFail = false;
  updateShouldFail = false;
  existingRow = {
    storage_path: "test-OLD.png",
    enhanced_storage_path: "test-enh-OLD.png",
    master_storage_path: "test-enh-OLD.png",
  };
});

describe("gallery · replaceInGallery safety", () => {
  it("happy path: uploads new, updates DB, then removes ALL old paths", async () => {
    await replaceInGallery(baseOpts);

    // 1 upload (no enhanced provided).
    expect(calls.uploads).toHaveLength(1);
    const newPath = calls.uploads[0].path;

    // DB update happened exactly once and points at the new path.
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].storage_path).toBe(newPath);
    expect(calls.updates[0].master_storage_path).toBe(newPath);

    // Cleanup removed the old paths but NOT the new one.
    expect(calls.removes).toHaveLength(1);
    const removed = calls.removes[0].paths;
    expect(removed).toEqual(expect.arrayContaining(["test-OLD.png", "test-enh-OLD.png"]));
    expect(removed).not.toContain(newPath);
  });

  it("fills missing actual dimensions via best-effort probe", async () => {
    await replaceInGallery(baseOpts); // no actualWidthPx/Height supplied
    expect(calls.updates[0].actual_width_px).toBe(800);
    expect(calls.updates[0].actual_height_px).toBe(1200);
  });

  it("does NOT overwrite caller-supplied actual dimensions", async () => {
    await replaceInGallery({ ...baseOpts, actualWidthPx: 4096, actualHeightPx: 6144 });
    expect(calls.updates[0].actual_width_px).toBe(4096);
    expect(calls.updates[0].actual_height_px).toBe(6144);
  });

  it("rolls back uploads when the DB update fails (no orphans, original kept)", async () => {
    updateShouldFail = true;

    await expect(replaceInGallery(baseOpts)).rejects.toThrow(/db failed/);

    // Newly uploaded file was cleaned up.
    expect(calls.uploads).toHaveLength(1);
    const newPath = calls.uploads[0].path;
    expect(calls.removes).toHaveLength(1);
    expect(calls.removes[0].paths).toContain(newPath);
    // Original storage was NEVER touched.
    expect(calls.removes[0].paths).not.toContain("test-OLD.png");
    expect(calls.removes[0].paths).not.toContain("test-enh-OLD.png");
  });

  it("fails fast on upload error WITHOUT updating the DB or removing originals", async () => {
    uploadShouldFail = true;
    await expect(replaceInGallery(baseOpts)).rejects.toThrow(/upload failed/);
    expect(calls.updates).toHaveLength(0);
    expect(calls.removes).toHaveLength(0);
  });
});
