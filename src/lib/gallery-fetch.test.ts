/**
 * Focused tests for fetchGalleryImages pagination (lift-the-cap work).
 *
 * Verifies that limit/offset are wired into the supabase query as a
 * `.range(from, to)` call, and that the modes filter is applied
 * server-side via `.in("mode", modes)`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const calls = {
  range: [] as Array<{ from: number; to: number }>,
  inFilter: [] as Array<{ col: string; values: string[] }>,
  order: [] as string[],
};

let rows: any[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const tableFrom = () => {
    const api: any = {
      select: vi.fn(() => api),
      order: vi.fn((col: string) => {
        calls.order.push(col);
        return api;
      }),
      range: vi.fn((from: number, to: number) => {
        calls.range.push({ from, to });
        // Make the query thenable so `await query` resolves.
        return {
          ...api,
          then: (resolve: any) => resolve({ data: rows, error: null }),
        };
      }),
      is: vi.fn(() => api),
      eq: vi.fn(() => api),
      or: vi.fn(() => api),
      in: vi.fn((col: string, values: string[]) => {
        calls.inFilter.push({ col, values });
        return api;
      }),

    };
    return api;
  };

  const storageFrom = () => ({
    getPublicUrl: (p: string) => ({ data: { publicUrl: `https://stub/${p}` } }),
  });

  return { supabase: { from: tableFrom, storage: { from: storageFrom } } };
});

import { fetchGalleryImages } from "./gallery";

beforeEach(() => {
  calls.range = [];
  calls.inFilter = [];
  calls.order = [];
  rows = [
    { id: "a", storage_path: "a.png", master_storage_path: "a.png", enhanced_storage_path: null },
    { id: "b", storage_path: "b.png", master_storage_path: "b.png", enhanced_storage_path: null },
  ];
});

describe("fetchGalleryImages · pagination", () => {
  it("defaults to limit=200, offset=0 (range 0..199) ordered by created_at", async () => {
    await fetchGalleryImages();
    expect(calls.range).toEqual([{ from: 0, to: 199 }]);
    expect(calls.order).toEqual(["created_at"]);
    expect(calls.inFilter).toEqual([]);
  });

  it("respects custom limit + offset as range(offset, offset+limit-1)", async () => {
    await fetchGalleryImages({ limit: 50, offset: 200 });
    expect(calls.range).toEqual([{ from: 200, to: 249 }]);
  });

  it("applies modes filter server-side via .in()", async () => {
    await fetchGalleryImages({ limit: 10, offset: 0, modes: ["japanese", "freestyle"] });
    expect(calls.inFilter).toEqual([
      { col: "mode", values: ["japanese", "freestyle"] },
    ]);
  });

  it("skips modes filter when empty array provided", async () => {
    await fetchGalleryImages({ modes: [] });
    expect(calls.inFilter).toEqual([]);
  });

  it("maps rows to include publicUrl + masterUrl", async () => {
    const out = await fetchGalleryImages({ limit: 2, offset: 0 });
    expect(out).toHaveLength(2);
    expect(out[0].publicUrl).toBe("https://stub/a.png");
    expect(out[0].masterUrl).toBe("https://stub/a.png");
  });
});
