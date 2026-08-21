/**
 * Offline style-routing consistency guards.
 *
 * These tests prove that the several places which repeat the art-style
 * taxonomy stay synchronized:
 *
 *   - src/lib/style-catalog.ts                  (presentation, authoritative for visibility)
 *   - src/lib/style-config.ts                   (authoritative for styleKey + edge fn names)
 *   - src/lib/style-registry.ts                 (derived merge of the two above)
 *   - src/lib/generation-providers/_resolve-edge-fn.ts (derived dispatch table)
 *   - src/lib/prompt-rules.ts  STYLE_RULES       (frontend style rule map)
 *   - supabase/functions/_shared/prompt-compiler.ts STYLE_RULES (backend rule map,
 *     also the allow-list used by generate-image-router)
 *   - per-style edge functions under supabase/functions (generate-image-...)
 *
 * Everything is read from the real sources; no duplicated key list lives here.
 * All checks are pure filesystem + module reads — no network, no Supabase.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { STYLE_MODES, STYLE_CONFIG_BY_ROUTE } from "./style-registry";
import { STYLE_CATALOG } from "./style-catalog";
import { STYLE_RULES } from "./prompt-rules";
import { resolveEdgeFnForStyle } from "@/lib/generation-providers/_resolve-edge-fn";

const FUNCTIONS_DIR = path.resolve(__dirname, "../../supabase/functions");

/**
 * Intentional exceptions — documented, never silently ignored.
 *
 * `/blend` is a catalog entry with no per-style generation config: it is
 * served by the standalone `generate-image-blend` function which takes a
 * list of styles rather than a single styleKey.
 */
const CATALOG_ROUTES_WITHOUT_GENERATION_CONFIG = ["/blend"];

/**
 * Edge functions under supabase/functions that begin with `generate-image`
 * but are NOT per-style handlers (they take styleKey at runtime, or serve
 * another purpose entirely).
 */
const NON_PER_STYLE_GENERATE_FUNCTIONS = [
  "generate-image-router",
  "generate-image-v2",
  "generate-image-blend",
  "generate-image-direct-openai",
  "generate-image-direct-replicate",
];

/** Parse the top-level keys of the backend STYLE_RULES object literal. */
function backendStyleRuleKeys(): string[] {
  const src = fs.readFileSync(
    path.join(FUNCTIONS_DIR, "_shared/prompt-compiler.ts"),
    "utf8",
  );
  const start = src.indexOf("export const STYLE_RULES");
  expect(start, "STYLE_RULES not found in prompt-compiler.ts").toBeGreaterThan(-1);
  const open = src.indexOf("{", start);
  let depth = 0;
  const keys: string[] = [];
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth === 1 && (ch === "\n" || i === open)) {
      const line = src.slice(i + 1, src.indexOf("\n", i + 1));
      const m = /^\s{2}(?:"([^"]+)"|'([^']+)'|([A-Za-z_][\w-]*))\s*:\s*\{/.exec(line);
      if (m) keys.push(m[1] ?? m[2] ?? m[3]);
    }
  }
  return keys;
}

/** styleKey each per-style edge function is wired to, read from its source. */
function perStyleEdgeFunctions(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dir of fs.readdirSync(FUNCTIONS_DIR)) {
    if (!dir.startsWith("generate-image")) continue;
    if (NON_PER_STYLE_GENERATE_FUNCTIONS.includes(dir)) continue;
    const file = path.join(FUNCTIONS_DIR, dir, "index.ts");
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    const m = /createStyleHandler\(\s*["']([^"']+)["']\s*\)/.exec(src);
    expect(m, `${dir} does not call createStyleHandler with a literal styleKey`).toBeTruthy();
    out[dir] = m![1];
  }
  return out;
}

const BACKEND_RULE_KEYS = backendStyleRuleKeys();
const EDGE_FNS = perStyleEdgeFunctions();
const ACTIVE_MODES = STYLE_MODES.filter((m) => m.parentVisibility !== "hidden");

describe("style-routing consistency — registry integrity", () => {
  it("has no duplicate mode values", () => {
    const modes = STYLE_MODES.map((m) => m.mode);
    expect(modes.length).toBe(new Set(modes).size);
  });

  it("has no duplicate style keys or routes", () => {
    const keys = Object.values(STYLE_CONFIG_BY_ROUTE).map((c) => c.styleKey);
    expect(keys.length).toBe(new Set(keys).size);
    const routes = Object.keys(STYLE_CONFIG_BY_ROUTE);
    expect(routes.length).toBe(new Set(routes).size);
  });

  it("every catalog route (except documented exceptions) has a generation config", () => {
    const missing = STYLE_CATALOG.map((s) => s.route)
      .filter((r) => !STYLE_CONFIG_BY_ROUTE[r])
      .filter((r) => !CATALOG_ROUTES_WITHOUT_GENERATION_CONFIG.includes(r));
    expect(missing).toEqual([]);
  });

  it("every registry route exists in the catalog", () => {
    const catalogRoutes = new Set(STYLE_CATALOG.map((s) => s.route));
    const orphans = Object.keys(STYLE_CONFIG_BY_ROUTE).filter((r) => !catalogRoutes.has(r));
    expect(orphans).toEqual([]);
  });
});

describe("style-routing consistency — frontend ↔ backend rule maps", () => {
  it("frontend and backend STYLE_RULES expose the identical key set", () => {
    const front = Object.keys(STYLE_RULES).sort();
    const back = [...BACKEND_RULE_KEYS].sort();
    expect(back).toEqual(front);
  });

  it("backend STYLE_RULES contains no unknown/misspelled keys", () => {
    const known = new Set(STYLE_MODES.map((m) => m.mode));
    const unknown = BACKEND_RULE_KEYS.filter((k) => !known.has(k));
    expect(unknown).toEqual([]);
  });

  it("every active mode has a backend rule entry (router allow-list)", () => {
    const back = new Set(BACKEND_RULE_KEYS);
    const missing = ACTIVE_MODES.map((m) => m.mode).filter((m) => !back.has(m));
    expect(missing).toEqual([]);
  });

  it("every active mode has a frontend rule entry", () => {
    const missing = ACTIVE_MODES.map((m) => m.mode).filter((m) => !(m in STYLE_RULES));
    expect(missing).toEqual([]);
  });
});

describe("style-routing consistency — per-style edge functions", () => {
  it("every registered mode's edge function exists on disk", () => {
    const missing = STYLE_MODES.filter((m) => !(m.edgeFn in EDGE_FNS)).map(
      (m) => `${m.mode} → ${m.edgeFn}`,
    );
    expect(missing).toEqual([]);
  });

  it("every per-style edge function is wired to the styleKey the registry expects", () => {
    const byEdgeFn = new Map(STYLE_MODES.map((m) => [m.edgeFn, m.mode]));
    const mismatches: string[] = [];
    for (const [dir, styleKey] of Object.entries(EDGE_FNS)) {
      const expected = byEdgeFn.get(dir);
      if (expected && expected !== styleKey) {
        mismatches.push(`${dir}: handler=${styleKey} registry=${expected}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("no per-style edge function is orphaned from the registry", () => {
    const registered = new Set(STYLE_MODES.map((m) => m.edgeFn));
    const orphans = Object.keys(EDGE_FNS).filter((d) => !registered.has(d));
    expect(orphans).toEqual([]);
  });

  it("every per-style handler styleKey exists in the backend rule map", () => {
    const back = new Set(BACKEND_RULE_KEYS);
    const unknown = Object.entries(EDGE_FNS)
      .filter(([, key]) => !back.has(key))
      .map(([dir, key]) => `${dir} → ${key}`);
    expect(unknown).toEqual([]);
  });
});

describe("style-routing consistency — unified router parity", () => {
  it("generate-image-router validates styleKey against the shared STYLE_RULES map", () => {
    const src = fs.readFileSync(
      path.join(FUNCTIONS_DIR, "generate-image-router/index.ts"),
      "utf8",
    );
    expect(src).toContain("STYLE_RULES");
    expect(src).toMatch(/STYLE_RULES\[styleKey\]/);
  });

  it("the router therefore accepts every active mode the per-style functions serve", () => {
    // Router acceptance == membership in backend STYLE_RULES, already asserted
    // above for active modes; this test pins the equivalence explicitly so a
    // future router-side allow-list change breaks loudly.
    const routerAccepts = new Set(BACKEND_RULE_KEYS);
    for (const mode of ACTIVE_MODES) {
      expect(routerAccepts.has(mode.mode), `router rejects ${mode.mode}`).toBe(true);
    }
  });
});

describe("style-routing consistency — resolveEdgeFnForStyle normalization", () => {
  it("themed style keys resolve to their registry edge function", () => {
    for (const cfg of Object.values(STYLE_CONFIG_BY_ROUTE)) {
      expect(resolveEdgeFnForStyle(cfg.styleKey), cfg.styleKey).toBe(cfg.themedEdgeFn);
    }
  });

  it("`<styleKey>-freestyle` variants resolve to the freestyle edge function", () => {
    for (const cfg of Object.values(STYLE_CONFIG_BY_ROUTE)) {
      // Ukiyo-e keeps legacy mode values ("japanese"/"freestyle"); its
      // styleKey-suffixed form is still expected to normalize correctly.
      expect(
        resolveEdgeFnForStyle(`${cfg.styleKey}-freestyle`),
        `${cfg.styleKey}-freestyle`,
      ).toBe(cfg.freestyleEdgeFn);
    }
  });

  it("no style silently falls back to the ukiyo-e handler", () => {
    const wrong = Object.values(STYLE_CONFIG_BY_ROUTE)
      .filter((c) => c.styleKey !== "ukiyoe")
      .filter((c) => resolveEdgeFnForStyle(c.styleKey) === "generate-image")
      .map((c) => c.styleKey);
    expect(wrong).toEqual([]);
  });

  it("the tertiary lineart-minimal mode keeps its dedicated handler", () => {
    expect(resolveEdgeFnForStyle("lineart-minimal")).toBe("generate-image-lineart-minimal");
  });
});

describe("style-routing consistency — hidden/legacy handling is explicit", () => {
  it("hidden catalog styles are excluded from active mode lists but still routable", () => {
    const hidden = STYLE_MODES.filter((m) => m.parentVisibility === "hidden");
    for (const m of hidden) {
      expect(ACTIVE_MODES).not.toContain(m);
      // Hidden ≠ broken: they must still have a real handler + rules.
      expect(EDGE_FNS[m.edgeFn], `hidden mode ${m.mode} lost its handler`).toBeDefined();
      expect(BACKEND_RULE_KEYS).toContain(m.mode);
    }
  });

  it("documented exceptions are the only catalog entries without routing", () => {
    expect(CATALOG_ROUTES_WITHOUT_GENERATION_CONFIG).toEqual(["/blend"]);
    for (const route of CATALOG_ROUTES_WITHOUT_GENERATION_CONFIG) {
      expect(STYLE_CATALOG.some((s) => s.route === route)).toBe(true);
      expect(STYLE_CONFIG_BY_ROUTE[route]).toBeUndefined();
    }
  });
});
