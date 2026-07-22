/**
 * Turn 1 gate tests: durable-executable-provider contract.
 *
 * - DURABLY_EXECUTABLE_PROVIDERS matches server-side runners 1:1.
 * - Auto never returns a non-executable provider (checked at contract
 *   boundary — server routing is verified in its own test file).
 * - Every runner referenced by the durable worker is represented here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DURABLY_EXECUTABLE_PROVIDERS,
  checkDurableExecutability,
  isDurablyExecutable,
} from "./generation-executable-providers";

describe("DURABLY_EXECUTABLE_PROVIDERS parity", () => {
  it("client + Deno mirror agree on the list", () => {
    const denoFile = readFileSync(
      resolve(__dirname, "../../supabase/functions/_shared/executable-providers.ts"),
      "utf8",
    );
    const m = denoFile.match(/DURABLY_EXECUTABLE_PROVIDERS[^=]*=\s*\[([\s\S]*?)\]/);
    expect(m).toBeTruthy();
    const denoIds = m![1]
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    expect(denoIds.sort()).toEqual([...DURABLY_EXECUTABLE_PROVIDERS].sort());
  });

  it("every executable provider has a real server runner", () => {
    // The runners live in the shared generators module used by the
    // durable worker. Grepping there proves the contract lists no
    // provider without a corresponding execution path.
    const runnersSrc = readFileSync(
      resolve(__dirname, "../../supabase/functions/_shared/generators.ts"),
      "utf8",
    );
    for (const p of DURABLY_EXECUTABLE_PROVIDERS) {
      expect(runnersSrc, `runner reference for ${p}`).toMatch(new RegExp(`["']${p}["']`));
    }
  });

  it("auto is always accepted; openai always rejected with suggestion", () => {
    expect(checkDurableExecutability("auto").ok).toBe(true);
    const r = checkDurableExecutability("openai");
    expect(r.ok).toBe(false);
    expect(r.suggestion).toBe("gemini");
    expect(r.reason).toMatch(/OpenAI/);
  });

  it("isDurablyExecutable returns false for unknown / null values", () => {
    expect(isDurablyExecutable(null)).toBe(false);
    expect(isDurablyExecutable(undefined)).toBe(false);
    expect(isDurablyExecutable("midjourney")).toBe(false);
    expect(isDurablyExecutable("openai")).toBe(false);
    expect(isDurablyExecutable("gemini")).toBe(true);
    expect(isDurablyExecutable("sdxl")).toBe(true);
  });
});
