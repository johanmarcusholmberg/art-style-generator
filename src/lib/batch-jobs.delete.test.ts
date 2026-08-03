/**
 * deleteJob removes ONLY job-history rows. Generated artwork lives in
 * generated_images / generated_image_assets, which have no foreign key back
 * to jobs, so deleting history must never touch gallery rows or Storage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
const removeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    storage: { from: () => ({ remove: removeMock }) },
    functions: { invoke: vi.fn() },
  },
}));

import { deleteJob } from "./batch-jobs";

const deleted: string[] = [];

function mockJob(status: string) {
  deleted.length = 0;
  fromMock.mockImplementation((table: string) => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { id: "j1", status }, error: null }) }),
    }),
    delete: () => ({
      eq: async () => {
        deleted.push(table);
        return { error: null };
      },
    }),
  }));
}

beforeEach(() => vi.clearAllMocks());

describe("deleteJob", () => {
  it("deletes only job + item rows for a completed job", async () => {
    mockJob("completed");
    await deleteJob("j1");
    expect(deleted).toEqual(["generation_job_items", "generation_jobs"]);
    expect(deleted).not.toContain("generated_images");
    expect(deleted).not.toContain("generated_image_assets");
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("refuses to delete an active job as history", async () => {
    mockJob("processing");
    await expect(deleteJob("j1")).rejects.toThrow(/still active/i);
    expect(deleted).toEqual([]);
  });

  it("reports truthfully when the job no longer exists", async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }));
    await expect(deleteJob("gone")).rejects.toThrow(/no longer exists/i);
  });
});
