#!/usr/bin/env node
/**
 * One-time canonical metadata backfill runner.
 *
 * Pages through every gallery row via the admin-only `backfill-image-metadata`
 * edge function, repairing print_format_id, canonical aspect_ratio, and
 * measured pixel dimensions on both `generated_images` and the canonical
 * (original, v0) image asset. Safe to re-run — canonical rows are no-ops.
 *
 * Usage (dry run by default):
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/backfill-image-metadata.mjs
 *   ... node scripts/backfill-image-metadata.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
  } catch {
    /* no .env */
  }
  return undefined;
}

const url = env("VITE_SUPABASE_URL");
const anon = env("VITE_SUPABASE_PUBLISHABLE_KEY") || env("VITE_SUPABASE_ANON_KEY");
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const apply = process.argv.includes("--apply");

if (!url || !anon) throw new Error("Missing VITE_SUPABASE_URL / publishable key");
if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD");

const supabase = createClient(url, anon, { auth: { persistSession: false } });
const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
if (authErr) throw new Error(`sign-in failed: ${authErr.message}`);

const totals = {
  scanned: 0,
  already_canonical: 0,
  measured: 0,
  images_updated: 0,
  assets_updated: 0,
  unresolved: [],
  errors: [],
};

let cursor = null;
let page = 0;
for (;;) {
  const { data, error } = await supabase.functions.invoke("backfill-image-metadata", {
    body: { dry_run: !apply, limit: 100, cursor },
  });
  if (error) throw new Error(`invoke failed: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  if (page === 0 && data.preflight) {
    console.log("preflight:");
    for (const c of data.preflight.checks) {
      console.log(`  ${c.ok ? "ok " : "FAIL"} ${c.label}${c.error ? ` — ${c.error}` : ""}`);
    }
  }
  page++;
  totals.scanned += data.scanned;
  totals.already_canonical += data.already_canonical;
  totals.measured += data.measured;
  totals.images_updated += data.images_updated;
  totals.assets_updated += data.assets_updated;
  totals.unresolved.push(...data.unresolved);
  totals.errors.push(...data.errors);
  console.log(
    `page ${page}: scanned=${data.scanned} updated=${data.images_updated} assets=${data.assets_updated} measured=${data.measured}`,
  );
  if (!data.has_more || !data.next_cursor) break;
  cursor = data.next_cursor;
}


console.log(`\n${apply ? "APPLIED" : "DRY RUN"} — summary:`);
console.log(JSON.stringify(totals, null, 2));
if (!apply) console.log("\nRe-run with --apply to write changes.");
