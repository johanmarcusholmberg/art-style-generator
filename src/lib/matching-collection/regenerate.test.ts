/**
 * Behavioral tests for the regenerate wrapper. We exercise the outcome
 * contract by stubbing the supabase client with a minimal shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const rpc = vi.fn();
  const invoke = vi.fn();
  return {
    supabase: {
      rpc,
      functions: { invoke },
    },
  };
});

import { regenerateCollectionMember } from "./regenerate";
import { supabase } from "@/integrations/supabase/client";

const rpcMock = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
const invokeMock = (supabase as unknown as { functions: { invoke: ReturnType<typeof vi.fn> } })
  .functions.invoke;

beforeEach(() => {
  rpcMock.mockReset();
  invokeMock.mockReset();
});

describe("regenerateCollectionMember", () => {
  it("RPC failure throws and no result is returned", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(regenerateCollectionMember("src")).rejects.toThrow("denied");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("RPC success + dispatch success → dispatchStarted=true", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { new_item_id: "n1", job_id: "j1" },
      error: null,
    });
    invokeMock.mockResolvedValueOnce({ data: {}, error: null });
    const r = await regenerateCollectionMember("src");
    expect(r).toEqual({
      newItemId: "n1",
      jobId: "j1",
      dispatchStarted: true,
      dispatchError: null,
    });
  });

  it("RPC success + dispatch failure → candidate persists, dispatchError populated", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ new_item_id: "n2", job_id: "j2" }],
      error: null,
    });
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    const r = await regenerateCollectionMember("src");
    expect(r.newItemId).toBe("n2");
    expect(r.dispatchStarted).toBe(false);
    expect(r.dispatchError).toBe("network");
  });

  it("RPC success + invoke rejection → dispatchError populated", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { new_item_id: "n3", job_id: "j3" },
      error: null,
    });
    invokeMock.mockRejectedValueOnce(new Error("boom"));
    const r = await regenerateCollectionMember("src");
    expect(r.dispatchStarted).toBe(false);
    expect(r.dispatchError).toBe("boom");
  });
});
