/**
 * Semantic parity — the browser and Deno normalizers agree not just on
 * FIELD names but on VALUES for the same input.
 *
 * The Deno mirror lives at
 * `supabase/functions/_shared/generation-contract-v2.ts` and cannot be
 * imported directly (Deno-only imports). We instead load it as text,
 * strip Deno-only syntax, and evaluate it in the Node VM to obtain a
 * runtime handle to `normalizeLegacyGenerationRequest`. This is the
 * only way to prove semantic equivalence without maintaining a second
 * TypeScript project.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import {
  GENERATION_REQUEST_VERSION,
  normalizeLegacyGenerationRequest as clientNormalize,
} from "./generation-contract-v2";

function loadDenoNormalizer(): (input: unknown) => Record<string, unknown> {
  const src = readFileSync(
    resolve(__dirname, "../../supabase/functions/_shared/generation-contract-v2.ts"),
    "utf8",
  );
  // Strip type-only pieces and transpile TS → JS for Node evaluation.
  const compiled = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      isolatedModules: true,
    },
  }).outputText;
  const sandbox: { exports: Record<string, unknown>; module: { exports: Record<string, unknown> } } = {
    exports: {},
    module: { exports: {} },
  };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);
  vm.runInContext(compiled, sandbox);
  const fn = (sandbox.module.exports.normalizeLegacyGenerationRequest ??
    sandbox.exports.normalizeLegacyGenerationRequest) as (i: unknown) => Record<string, unknown>;
  if (typeof fn !== "function") throw new Error("Deno normalizer not exported");
  return fn;
}

const denoNormalize = loadDenoNormalizer();

/** Shared input vectors exercising each enum boundary and legacy alias. */
const VECTORS: Array<{ name: string; input: unknown }> = [
  { name: "empty", input: {} },
  { name: "null", input: null },
  { name: "unknown provider preference", input: { providerPreference: "midjourney" } },
  { name: "openai preference kept for gating", input: { providerPreference: "openai" } },
  { name: "gemini preference kept", input: { providerPreference: "gemini" } },
  { name: "invalid kind falls back to single", input: { kind: "totally-unknown" } },
  { name: "invalid backgroundStyle → white", input: { backgroundStyle: "purple" } },
  { name: "cream background preserved", input: { backgroundStyle: "cream" } },
  { name: "invalid generationMode → standard", input: { generationMode: "ultra" } },
  { name: "print-ready generationMode preserved", input: { generationMode: "print-ready" } },
  { name: "empty prompt normalizes to empty string", input: { prompt: "" } },
  { name: "numeric NaN targetPpi becomes null", input: { targetPpi: NaN } },
  { name: "invalid strictness → null", input: { strictness: "wild" } },
  { name: "invalid referenceStrength → null", input: { referenceStrength: "extreme" } },
  { name: "invalid consistency → null", input: { kind: "matching_collection", consistencyStrength: "wild", anchorImageUrl: "https://x/a" } },
  { name: "unknown extra fields ignored", input: { prompt: "x", futureField: 1, another: "y" } },
  {
    name: "matching_collection hydration",
    input: {
      kind: "matching_collection",
      anchorImageUrl: "https://x/a.png",
      anchorImageId: "img-1",
      matchingCollectionId: "col-1",
      subject: "Fern",
      rawSubject: "a fern",
      consistencyStrength: "strict",
    },
  },
  {
    name: "print-ready with dimensions",
    input: {
      generationMode: "print-ready",
      targetPpi: 300,
      targetWidthPx: 5906,
      targetHeightPx: 8268,
      qualityMode: "quality",
    },
  },
];

describe("browser ↔ Deno semantic parity", () => {
  it("both runtimes stamp the same contract version", () => {
    // The Deno file exports GENERATION_REQUEST_VERSION as a top-level const.
    const denoFile = readFileSync(
      resolve(__dirname, "../../supabase/functions/_shared/generation-contract-v2.ts"),
      "utf8",
    );
    const m = denoFile.match(/GENERATION_REQUEST_VERSION\s*=\s*(\d+)/);
    expect(m).toBeTruthy();
    expect(parseInt(m![1], 10)).toBe(GENERATION_REQUEST_VERSION);
  });

  for (const v of VECTORS) {
    it(`vector: ${v.name}`, () => {
      const client = clientNormalize(v.input);
      const deno = denoNormalize(v.input);
      // Field lists must match exactly.
      expect(Object.keys(client).sort()).toEqual(Object.keys(deno).sort());
      // And every value must be deep-equal.
      expect(client).toEqual(deno);
    });
  }
});
