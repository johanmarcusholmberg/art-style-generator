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
import { PROVIDER_MODEL_REGISTRY } from "@/lib/generation-providers/registry";

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
    // Every fan-out call must run at preview intent — never print —
    // even when the caller passes `sizeIntent: "print"`.
    for (const call of generateImage.mock.calls) {
      expect(call[0].sizeIntent).toBe("preview");
    }
  });

  it("forces sizeIntent='preview' even when the caller asks for print", async () => {
    generateImage.mockResolvedValue(makeResponse(0));
    const { result } = renderHook(() => useVariantFanOut(2));
    await act(async () => {
      await result.current.start({ ...req, sizeIntent: "print" } as never);
    });
    for (const call of generateImage.mock.calls) {
      expect(call[0].sizeIntent).toBe("preview");
    }
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

  describe("keepAtPrintResolution", () => {
    it("returns the existing preview asset when no deterministic replay is available", async () => {
      generateImage.mockImplementation((r: any) => {
        // Echo the requested modelId so the hook can read it.
        const baseIdx = generateImage.mock.calls.length - 1;
        return Promise.resolve({
          ...makeResponse(baseIdx),
          response: {
            ...makeResponse(baseIdx).response,
            requestedModelId: r?.modelId,
            resolvedModelId: r?.modelId,
          },
        });
      });

      const { result } = renderHook(() => useVariantFanOut(2));
      await act(async () => {
        await result.current.start({
          ...req,
          modelId: "openai:gpt-image-2",
        } as never);
      });

      const initialCalls = generateImage.mock.calls.length;
      let outcome: any;
      await act(async () => {
        outcome = await result.current.keepAtPrintResolution(0);
      });

      expect(outcome.regenerated).toBe(false);
      expect(outcome.reason).toBe("no-replay-support");
      // No extra generation call was made — we did NOT silently replace
      // the user's chosen variant with a regenerated image.
      expect(generateImage).toHaveBeenCalledTimes(initialCalls);
      expect(outcome.response.imageUrl).toBe(result.current.tiles[0].response?.imageUrl);
    });

    it("re-runs at sizeIntent='print' when the model supports deterministic seed replay", async () => {
      // Opt the model in just for this test.
      const entry = PROVIDER_MODEL_REGISTRY.find((m) => m.id === "openai:gpt-image-2")!;
      entry.supportsDeterministicSeedReplay = true;
      try {
        generateImage.mockImplementation((r: any) =>
          Promise.resolve({
            ...makeResponse(0),
            response: {
              ...makeResponse(0).response,
              imageUrl: r?.sizeIntent === "print" ? "print.png" : "preview.png",
              requestedModelId: r?.modelId,
              resolvedModelId: r?.modelId,
            },
          }),
        );

        const { result } = renderHook(() => useVariantFanOut(1));
        await act(async () => {
          await result.current.start({
            ...req,
            modelId: "openai:gpt-image-2",
          } as never);
        });

        let outcome: any;
        await act(async () => {
          outcome = await result.current.keepAtPrintResolution(0);
        });

        expect(outcome.regenerated).toBe(true);
        expect(outcome.response.imageUrl).toBe("print.png");
        // The replay call passed sizeIntent: "print".
        const lastCall = generateImage.mock.calls.at(-1)?.[0];
        expect(lastCall?.sizeIntent).toBe("print");
      } finally {
        entry.supportsDeterministicSeedReplay = false;
      }
    });
  });
});
