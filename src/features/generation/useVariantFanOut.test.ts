/**
 * Tests for the variant fan-out hook.
 *
 * The router is mocked so we never hit network/provider code. Each test
 * verifies one piece of the hook's contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Hoisted mock for the generation router.
const generateImage = vi.fn();
vi.mock("@/lib/generation-router", () => ({
  generateImage: (...args: unknown[]) => generateImage(...args),
}));

import { useVariantFanOut } from "./useVariantFanOut";

const req = {
  prompt: "p",
  styleKey: "lineart",
} as const;

function makeResponse(idx: number) {
  return {
    response: {
      imageUrl: `https://example.com/${idx}.png`,
      generationProvider: "lovable",
      generationModel: "x",
      prompt: "p",
      styleKey: "lineart",
      fallbackUsed: false,
      strategy: "auto" as const,
      executionRoute: "lovable_gateway" as const,
    },
    diagnostics: { attemptedAdapters: [], fallbackTriggered: false },
  };
}

beforeEach(() => {
  generateImage.mockReset();
});

describe("useVariantFanOut", () => {
  it("fires N parallel generations and marks each tile done", async () => {
    let calls = 0;
    generateImage.mockImplementation(() => {
      const i = calls++;
      return Promise.resolve(makeResponse(i));
    });

    const { result } = renderHook(() => useVariantFanOut(4));

    await act(async () => {
      await result.current.start(req as never);
    });

    expect(generateImage).toHaveBeenCalledTimes(4);
    expect(result.current.tiles.every((t) => t.status === "done")).toBe(true);
    expect(result.current.isRunning).toBe(false);
  });

  it("isolates failures to the failing tile", async () => {
    let calls = 0;
    generateImage.mockImplementation(() => {
      const i = calls++;
      if (i === 1) return Promise.reject(new Error("rate limited"));
      return Promise.resolve(makeResponse(i));
    });

    const { result } = renderHook(() => useVariantFanOut(4));
    await act(async () => {
      await result.current.start(req as never);
    });

    expect(result.current.tiles[1].status).toBe("error");
    expect(result.current.tiles[1].error).toMatch(/rate limited/);
    const others = result.current.tiles.filter((t) => t.id !== 1);
    expect(others.every((t) => t.status === "done")).toBe(true);
  });

  it("retryOne only re-runs the requested tile", async () => {
    let calls = 0;
    generateImage.mockImplementation(() => {
      const i = calls++;
      if (i === 2) return Promise.reject(new Error("boom"));
      return Promise.resolve(makeResponse(i));
    });

    const { result } = renderHook(() => useVariantFanOut(4));
    await act(async () => {
      await result.current.start(req as never);
    });
    expect(result.current.tiles[2].status).toBe("error");

    generateImage.mockResolvedValueOnce(makeResponse(99));
    await act(async () => {
      await result.current.retryOne(2);
    });

    expect(generateImage).toHaveBeenCalledTimes(5);
    expect(result.current.tiles[2].status).toBe("done");
    expect(result.current.tiles[2].response?.imageUrl).toContain("99");
  });

  it("discardAll resets every tile to idle", async () => {
    generateImage.mockResolvedValue(makeResponse(0));
    const { result } = renderHook(() => useVariantFanOut(4));
    await act(async () => {
      await result.current.start(req as never);
    });
    expect(result.current.tiles.every((t) => t.status === "done")).toBe(true);

    act(() => result.current.discardAll());
    expect(result.current.tiles.every((t) => t.status === "idle")).toBe(true);

    // After discardAll, retryOne is a no-op (no stored request).
    await act(async () => {
      await result.current.retryOne(0);
    });
    expect(result.current.tiles[0].status).toBe("idle");
  });
});
