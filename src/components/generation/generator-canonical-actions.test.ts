/**
 * Turn 4B closure — the generator's production actions must be driven by
 * persisted canonical truth (loadCanonicalActionSource), never by the React
 * preview URL, and must be re-resolved after enhancement/replacement.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = readFileSync("src/components/ImageGenerator.tsx", "utf8");

describe("generator canonical action wiring", () => {
  it("resolves production sources through loadCanonicalActionSource", () => {
    expect(src).toMatch(/loadCanonicalActionSource\(persistedImageId, "download_master"\)/);
  });

  it("no longer resolves production sources from the session preview URL", () => {
    expect(src).not.toMatch(/resolveSessionActionSource/);
  });

  it("print export uses the canonical source only", () => {
    expect(src).toMatch(/const exportSource = canonicalSource\.url;/);
    expect(src).toMatch(/if \(!canonicalSource\?\.ok \|\| !canonicalSource\.url\)/);
  });

  it("clears the canonical source while persistence or finalization is pending", () => {
    expect(src).toMatch(
      /if \(!persistedImageId \|\| formatPending \|\| isUpscaling \|\| saving \|\| replacing\) \{\s*setCanonicalSource\(null\);/,
    );
  });

  it("reloads the canonical source after enhancement and replacement", () => {
    expect(src).toMatch(
      /\[persistedImageId, formatPending, isUpscaling, saving, replacing, enhancedImageUrl\]/,
    );
  });

  it("downloads the exact persisted master bytes", () => {
    expect(src).toMatch(/downloadCanonicalMaster\(\s*canonicalSource,/);
  });
});
