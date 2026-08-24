/**
 * Offline Edge-Function deployment-surface guards.
 *
 * The style-routing guards (style-routing-consistency.test.ts) prove the
 * *logical* taxonomy is coherent. These tests prove that the logical map
 * corresponds to the *actual deployable surface* in the repository:
 *
 *   - every referenced function name has a real directory + entrypoint
 *   - every active style's configured edge fn exists and is wired to the
 *     style key its handler declares
 *   - no duplicate / orphaned per-style handlers
 *   - every statically knowable supabase.functions.invoke("name") target
 *     exists (frontend, edge-to-edge, scripts)
 *   - supabase/config.toml function blocks point at real directories
 *   - `../_shared/*` imports inside edge functions resolve to real files
 *
 * Everything is derived from the real filesystem and real config modules.
 * No duplicated master lists. Pure fs reads — no network, no Supabase.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { STYLE_MODES } from "./style-registry";
import { ALL_STYLES } from "./style-config";

const ROOT = path.resolve(__dirname, "../..");
const FUNCTIONS_DIR = path.join(ROOT, "supabase/functions");

/** Directories under supabase/functions that are NOT deployable functions. */
const NON_FUNCTION_DIRS = new Set(["_shared"]);

function listFunctionDirs(): string[] {
  return fs
    .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !NON_FUNCTION_DIRS.has(e.name))
    .map((e) => e.name)
    .sort();
}

const FUNCTION_DIRS = listFunctionDirs();
const FUNCTION_SET = new Set(FUNCTION_DIRS);

function entrypoint(fn: string): string {
  return path.join(FUNCTIONS_DIR, fn, "index.ts");
}

function readEntrypoint(fn: string): string {
  return fs.readFileSync(entrypoint(fn), "utf8");
}

/** Style key declared by a per-style handler, or null if not one. */
function handlerStyleKey(fn: string): string | null {
  const m = readEntrypoint(fn).match(/createStyleHandler\(\s*"([^"]+)"\s*\)/);
  return m ? m[1] : null;
}

/**
 * Non-per-style generation endpoints. Each takes styleKey (or a style list)
 * at runtime, or targets a provider directly, so it has no 1:1 style.
 * Derived-by-assertion: the test below proves each of these really does NOT
 * call createStyleHandler(), so the list cannot silently rot.
 */
const NON_PER_STYLE_GENERATION = [
  "generate-image-router", // unified styleKey-in-body router (Phase 2)
  "generate-image-v2", // V2 contract router used by the lovable adapter
  "generate-image-blend", // multi-style blend endpoint (/blend page)
  "generate-image-direct-openai", // provider-direct endpoint (OpenAI adapter)
  "generate-image-direct-replicate", // provider-direct endpoint (SDXL adapter)
];

// ── A. Deployable surface basics ───────────────────────────────────────

describe("edge function surface — directories and entrypoints", () => {
  it("finds a non-trivial set of function directories", () => {
    expect(FUNCTION_DIRS.length).toBeGreaterThan(20);
  });

  it("every function directory has an index.ts entrypoint", () => {
    const missing = FUNCTION_DIRS.filter((fn) => !fs.existsSync(entrypoint(fn)));
    expect(missing).toEqual([]);
  });

  it("every entrypoint serves a handler", () => {
    const notServing = FUNCTION_DIRS.filter((fn) => !/serve\s*\(/.test(readEntrypoint(fn)));
    expect(notServing).toEqual([]);
  });
});

// ── B. Style config → real function ────────────────────────────────────

describe("edge function surface — style config resolves to real functions", () => {
  const configured = new Set<string>();
  for (const s of ALL_STYLES) {
    configured.add(s.themedEdgeFn);
    configured.add(s.freestyleEdgeFn);
    if (s.tertiaryEdgeFn) configured.add(s.tertiaryEdgeFn);
  }

  it("every configured edge fn exists as a directory with an entrypoint", () => {
    const bad = [...configured].filter(
      (fn) => !FUNCTION_SET.has(fn) || !fs.existsSync(entrypoint(fn)),
    );
    expect(bad).toEqual([]);
  });

  it("every configured edge fn is a per-style handler", () => {
    const notHandlers = [...configured].filter((fn) => handlerStyleKey(fn) === null);
    expect(notHandlers).toEqual([]);
  });

  it("themed handler style key matches the style's own key (modulo the legacy japanese alias)", () => {
    const mismatches: string[] = [];
    for (const s of ALL_STYLES) {
      const key = handlerStyleKey(s.themedEdgeFn);
      // `ukiyoe` predates the per-style naming convention: its themed
      // function is the original `generate-image`, whose compiler rule key
      // is still "japanese".
      const expected = s.styleKey === "ukiyoe" ? "japanese" : s.styleKey;
      if (key !== expected) mismatches.push(`${s.styleKey}: ${s.themedEdgeFn} -> ${key}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("freestyle handler style key is the themed key plus the -freestyle suffix", () => {
    const mismatches: string[] = [];
    for (const s of ALL_STYLES) {
      const themed = handlerStyleKey(s.themedEdgeFn);
      const free = handlerStyleKey(s.freestyleEdgeFn);
      const expected = themed === "japanese" ? "freestyle" : `${themed}-freestyle`;
      if (free !== expected) mismatches.push(`${s.styleKey}: ${s.freestyleEdgeFn} -> ${free}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("every registry mode's edge fn exists", () => {
    const bad = STYLE_MODES.map((m) => m.edgeFn).filter((fn) => !FUNCTION_SET.has(fn));
    expect(bad).toEqual([]);
  });
});

// ── C. Per-style handlers: no duplicates, no orphans ───────────────────

describe("edge function surface — per-style handler wiring", () => {
  const perStyle = FUNCTION_DIRS.filter((fn) => handlerStyleKey(fn) !== null);

  it("non-per-style generation endpoints really are not style handlers", () => {
    const wrong = NON_PER_STYLE_GENERATION.filter(
      (fn) => !FUNCTION_SET.has(fn) || handlerStyleKey(fn) !== null,
    );
    expect(wrong).toEqual([]);
  });

  it("no two directories claim the same style key", () => {
    const byKey = new Map<string, string[]>();
    for (const fn of perStyle) {
      const key = handlerStyleKey(fn)!;
      byKey.set(key, [...(byKey.get(key) ?? []), fn]);
    }
    const dupes = [...byKey.entries()].filter(([, fns]) => fns.length > 1);
    expect(dupes).toEqual([]);
  });

  it("no orphaned per-style handler exists outside the style configuration", () => {
    const configured = new Set<string>();
    for (const s of ALL_STYLES) {
      configured.add(s.themedEdgeFn);
      configured.add(s.freestyleEdgeFn);
      if (s.tertiaryEdgeFn) configured.add(s.tertiaryEdgeFn);
    }
    const orphans = perStyle.filter((fn) => !configured.has(fn));
    expect(orphans).toEqual([]);
  });

  it("every per-style directory is named generate-image*", () => {
    expect(perStyle.filter((fn) => !fn.startsWith("generate-image"))).toEqual([]);
  });
});

// ── D. Static invocation references ────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("edge function surface — static functions.invoke targets exist", () => {
  const files = [
    ...walk(path.join(ROOT, "src")),
    ...walk(FUNCTIONS_DIR),
    ...walk(path.join(ROOT, "scripts")),
  ];

  const refs: { file: string; name: string }[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/functions\s*\.invoke\(\s*"([^"]+)"/g)) {
      refs.push({ file: path.relative(ROOT, f), name: m[1] });
    }
  }

  it("finds invocation references to audit", () => {
    expect(refs.length).toBeGreaterThan(5);
  });

  it("every literal invoke target resolves to a real function with an entrypoint", () => {
    const dangling = refs
      .filter((r) => !FUNCTION_SET.has(r.name) || !fs.existsSync(entrypoint(r.name)))
      .map((r) => `${r.file} -> ${r.name}`);
    expect(dangling).toEqual([]);
  });
});

// ── E. Supabase configuration ──────────────────────────────────────────

describe("edge function surface — supabase/config.toml", () => {
  const toml = fs.readFileSync(path.join(ROOT, "supabase/config.toml"), "utf8");

  it("declares exactly one project_id", () => {
    expect(toml.match(/^project_id\s*=/gm)?.length).toBe(1);
  });

  it("every [functions.<name>] block names a real function directory", () => {
    const named = [...toml.matchAll(/^\[functions\.([A-Za-z0-9_-]+)\]/gm)].map((m) => m[1]);
    const bad = named.filter((n) => !FUNCTION_SET.has(n));
    expect(bad).toEqual([]);
  });

  it("functions without a config block are allowed (platform defaults apply)", () => {
    const named = new Set(
      [...toml.matchAll(/^\[functions\.([A-Za-z0-9_-]+)\]/gm)].map((m) => m[1]),
    );
    // Documented invariant: the vast majority of functions deploy with
    // platform defaults; only overrides appear in config.toml.
    expect(FUNCTION_DIRS.filter((f) => !named.has(f)).length).toBeGreaterThan(0);
  });
});

// ── F. Shared imports resolve ──────────────────────────────────────────

describe("edge function surface — shared imports resolve", () => {
  it("every ../_shared/* import inside a function points at a real file", () => {
    const dangling: string[] = [];
    for (const fn of FUNCTION_DIRS) {
      for (const f of walk(path.join(FUNCTIONS_DIR, fn))) {
        const src = fs.readFileSync(f, "utf8");
        for (const m of src.matchAll(/from\s+"(\.\.\/)+_shared\/([A-Za-z0-9_.-]+)"/g)) {
          const target = path.join(FUNCTIONS_DIR, "_shared", m[2]);
          if (!fs.existsSync(target)) dangling.push(`${path.relative(ROOT, f)} -> ${m[2]}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it("prompt-compiler exports createStyleHandler used by the per-style handlers", () => {
    const compiler = fs.readFileSync(
      path.join(FUNCTIONS_DIR, "_shared/prompt-compiler.ts"),
      "utf8",
    );
    expect(compiler).toMatch(/export\s+(async\s+)?function\s+createStyleHandler|export\s+const\s+createStyleHandler/);
  });
});
