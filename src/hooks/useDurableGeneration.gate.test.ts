/**
 * Turn 1 gate — durable dispatch:
 *   1. OpenAI is rejected BEFORE the idempotency key is written to
 *      localStorage AND BEFORE `create_generation_job` is called AND
 *      BEFORE a Supabase function is invoked.
 *   2. A subsequent Gemini call is not blocked by any stale state left
 *      over from the rejected OpenAI attempt.
 *
 * These tests target the pure boundary logic. The `useDurableGeneration`
 * hook wraps a small set of Supabase calls — we mock the client so the
 * test never touches a live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const rpc = vi.fn();
const invoke = vi.fn();
const channel = vi.fn().mockReturnValue({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn(),
});
const removeChannel = vi.fn();
const from = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      order: vi.fn().mockResolvedValue({ data: [] }),
    }),
  }),
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    channel: (...a: unknown[]) => channel(...a),
    removeChannel: (...a: unknown[]) => removeChannel(...a),
    from: (...a: unknown[]) => from(...a),
  },
}));

import { useDurableGeneration } from "./useDurableGeneration";
import { pendingIdemKey, currentJobKey } from "@/lib/durable-generation-core";

const STYLE = "test-style";

beforeEach(() => {
  window.localStorage.clear();
  rpc.mockReset();
  invoke.mockReset();
});

describe("useDurableGeneration executability gate", () => {
  it("OpenAI is rejected BEFORE idempotency key write, RPC, and function invoke", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    invoke.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useDurableGeneration({ styleKey: STYLE }));

    await expect(
      act(async () => {
        await result.current.start({
          prompt: "x",
          aspectRatio: "5:7",
          backgroundStyle: "white",
          generationMode: "standard",
          providerPreference: "openai",
        });
      }),
    ).rejects.toThrow(/OpenAI/);

    expect(rpc).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(pendingIdemKey(STYLE))).toBeNull();
    expect(window.localStorage.getItem(currentJobKey(STYLE))).toBeNull();
  });

  it("a valid Gemini call immediately after rejected OpenAI is not blocked by stale state", async () => {
    const { result } = renderHook(() => useDurableGeneration({ styleKey: STYLE }));

    // First: rejected OpenAI.
    await expect(
      act(async () => {
        await result.current.start({
          prompt: "x",
          aspectRatio: "5:7",
          backgroundStyle: "white",
          generationMode: "standard",
          providerPreference: "openai",
        });
      }),
    ).rejects.toThrow();

    // Now: Gemini should succeed.
    rpc.mockResolvedValueOnce({
      data: [{ job_id: "job-1", item_ids: ["item-1"] }],
      error: null,
    });
    invoke.mockResolvedValueOnce({ data: {}, error: null });

    await act(async () => {
      await result.current.start({
        prompt: "x",
        aspectRatio: "5:7",
        backgroundStyle: "white",
        generationMode: "standard",
        providerPreference: "gemini",
      });
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("create_generation_job");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("generate-single");
    expect(window.localStorage.getItem(currentJobKey(STYLE))).toBe("job-1");
  });

});
