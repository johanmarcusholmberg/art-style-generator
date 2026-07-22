import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createReloadCoordinator } from "./reload-coordinator";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("createReloadCoordinator", () => {
  it("coalesces rapid requests into one load", async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const c = createReloadCoordinator({ load, delayMs: 50 });
    c.request(); c.request(); c.request();
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("schedules exactly one trailing load when a request arrives during a load", async () => {
    const d = deferred();
    const load = vi.fn().mockImplementation(() => d.promise);
    const c = createReloadCoordinator({ load, delayMs: 10 });
    c.request();
    await vi.advanceTimersByTimeAsync(15);
    expect(load).toHaveBeenCalledTimes(1);
    c.request(); c.request(); c.request();
    await vi.advanceTimersByTimeAsync(15);
    expect(load).toHaveBeenCalledTimes(1); // still running
    d.resolve();
    await Promise.resolve(); await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("dispose cancels a pending timer", async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const c = createReloadCoordinator({ load, delayMs: 20 });
    c.request();
    c.dispose();
    await vi.advanceTimersByTimeAsync(50);
    expect(load).not.toHaveBeenCalled();
  });

  it("recovers after an error and still runs future loads", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);
    const c = createReloadCoordinator({ load, delayMs: 5 });
    c.request();
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    c.request();
    await vi.advanceTimersByTimeAsync(10);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
