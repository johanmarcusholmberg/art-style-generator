# Art Style Generator — Technical & Functional Audit

Date: 2026-07-13
Repo root: `/dev-server` · Supabase project: `zlmwkixldukpwaqdsfyw`
Static-only audit (Supabase pooler is timing out; live DB queries deferred).

Verified locally: `vitest run` → 374/374 passing across 34 files (19.2 s).
CI workflow: `.github/workflows/ci.yml`. Package manager mix: **both** `bun.lockb` and `package-lock.json` are committed (see §11).

---

## A. Executive summary

**Overall health.** The frontend is well-tested (34 test files, 374 passing) and the generation/upscale/print pipelines are the strongest part of the codebase. The weak spots are (1) *sprawl* around edge functions and styles, (2) *duplicated routing tables* between frontend and backend, (3) *dead legacy code* left behind by the SUPIR/Print+ removal, (4) *lockfile duality* between npm and bun, and (5) a *publicly-reachable diagnostic page* (`/backend-info`) that exposes probe tooling to anonymous users.

**Largest risks (see §13):**
1. `/backend-info` is registered without `protect()` in `src/App.tsx:70` — anyone with the URL can run auth/REST/storage probes and read JWT payload metadata.
2. Two lockfiles (`bun.lockb` + `package-lock.json`) with a CI that runs `npm ci`. Silent drift is possible.
3. `SUPABASE_SERVICE_ROLE_KEY` is referenced from edge functions correctly, but `admin-users` and `upscale-image` handlers must be re-audited for missing auth checks (see §13).
4. `generate-image-router` edge function is not called by any client or other function (0 references) — either dead or an intended internal-only entry point, but currently a live open surface.

**Largest complexity problems:**
- Style routing is duplicated across `src/lib/style-config.ts`, `src/lib/style-catalog.ts`, `src/lib/style-routing.ts`, `src/lib/style-prompt-metadata.ts`, `src/lib/prompt-rules.ts`, `src/lib/generation-providers/_resolve-edge-fn.ts`, and mirrored in `supabase/functions/_shared/prompt-compiler.ts` + `_shared/style-meta.ts`.
- 22 style keys × (themed + freestyle) = **44 nearly-identical edge functions**. Each is a 3-line `serve(createStyleHandler("<key>"))`. This is the single largest simplification opportunity.
- Two "master routers" exist: `supabase/functions/generate-image-v2/index.ts` (used by `lovable` adapter) and `supabase/functions/generate-image-router/index.ts` (unused).

**Most likely removable code (evidence in §E).**
- `supabase/functions/generate-image-router/` — 0 client references.
- `supir` / `print_plus` remnants in `src/lib/admin-asset-cost.ts`, `src/lib/generated-image-assets.ts`, `src/lib/image-assets.ts` comments (feature removed 2025-Q4 per `supir-removal.test.ts`).
- `flux:placeholder` model in `src/lib/generation-providers/registry.ts:225`.
- 44 per-style edge functions can collapse into ~2 routers (see §F).

**Most urgent broken functionality:** none actively broken; login "Failed to fetch" seen earlier is a preview-iframe Supabase reachability issue, not a code defect (network log confirms `Failed to fetch` on the same origin/pooler).

---

## B. Architecture map

```
Browser (Vite/React 18, react-router v6)
 ├─ Auth: src/contexts/AuthContext.tsx  →  supabase.auth
 ├─ Route guards: src/components/auth/RequireAuth.tsx
 ├─ Style pages (23):    src/pages/<Style>.tsx  →  <ImageGenerator />
 │                                           │
 │                                           ▼
 │  Generation client stack
 │   src/components/ImageGenerator.tsx
 │    → src/features/generation/useGenerateImage.ts
 │       → src/lib/generation-router.ts
 │          ├─ adapter: lovable   → generate-image-v2 (edge)  → Lovable AI gateway
 │          ├─ adapter: gemini    → per-style edge fn         → Lovable gateway (Gemini)
 │          ├─ adapter: replicate → generate-image-direct-replicate → Replicate API
 │          └─ adapter: openai    → generate-image-direct-openai   → OpenAI GPT Image 2
 │       → poster-ratio-enforce (Canvas) → gallery save
 │
 ├─ Upscale: src/hooks/use-upscale.ts → edge fn `upscale-image` (+ webhook `upscale-webhook`)
 ├─ Gallery: src/components/Gallery.tsx  ← generated_images, generated_image_assets
 ├─ Print export: src/lib/print-export.ts, print-target-upscale.ts
 ├─ Format derivatives (crop-only): src/lib/format-derivative*.ts + FormatDerivativesDialog
 ├─ Admin: /admin, /admin/users, /admin/assets, /admin/costs, /review, /debug/providers
 └─ Diagnostics: /backend-info (UNPROTECTED, see §13), /print-calculator, /style-lab

Supabase (project zlmwkixldukpwaqdsfyw)
 ├─ 13 tables (see §6):
 │   generated_images, generated_image_assets, generation_jobs,
 │   generation_job_items, upscale_jobs, collections, collection_images,
 │   asset_folders, asset_cost_events, prompt_history, profiles,
 │   user_roles, audit_log   (+ view: admin_user_overview)
 ├─ RPCs: has_role, is_current_user_active, is_current_user_admin,
 │        current_profile_id, cleanup_old_deleted_images
 ├─ 27 migrations (2026-03 → 2026-06)
 ├─ 59 Edge Functions (see §2)
 └─ Storage: (live query blocked — see safety block)

External providers
 ├─ Lovable AI Gateway (LOVABLE_API_KEY)
 ├─ OpenAI (OPENAI_API_KEY, gpt-image-2)
 ├─ Replicate (REPLICATE_API_TOKEN, SDXL + Real-ESRGAN)
 └─ GitHub API (GITHUB_API_KEY via connector) — new github-ci-check fn
```

**Request flow (happy path — image generation → gallery):**

1. User picks style page → `<ImageGenerator/>` (`src/components/ImageGenerator.tsx`) manages prompt, format, provider, reference image, strength.
2. Submit → `useGenerateImage.generate()` (`src/features/generation/useGenerateImage.ts`) → `generateImage()` in `src/lib/generation-router.ts`.
3. Router builds adapter chain from `GeneratorPreference` + `decideRoute()` (`src/lib/style-routing.ts`) + feedback signal (`src/hooks/use-image-feedback.ts`).
4. Adapter (`src/lib/generation-providers/{lovable,gemini,replicate,openai}.ts`) calls the appropriate edge function via `supabase.functions.invoke`.
5. Edge function compiles prompt via `supabase/functions/_shared/prompt-compiler.ts`, calls provider, returns `{imageUrl,width,height,…}`.
6. Client normalizes via `enforcePosterRatio` (`src/lib/poster-ratio-enforce.ts`) — pad (default) or crop (OpenAI).
7. Master saved to `generated_images` via `src/features/generation/useSaveGeneratedImage.ts`; version rows in `generated_image_assets` (see `src/lib/generated-image-assets.ts`).
8. Gallery (`src/components/Gallery.tsx`) shows the image; upscale (`use-upscale.ts`) writes an "upscale" version; print export uses `src/lib/print-export.ts` + `src/lib/print-target-upscale.ts`.

---

## C. Complete inventory

### C.1 Routes (41; source: `src/App.tsx:68-115`)
- Public: `/login`, `/reset-password`, `/backend-info` *(should be admin)*, `*` (NotFound).
- User (protected): `/`, `/account`, 23 style routes, `/blend`, `/compare`, `/batch`, `/style-lab`, `/print-calculator`.
- Admin (protected + admin): `/admin`, `/admin/users`, `/admin/assets`, `/admin/costs`, `/review`, `/debug/providers`, `/style-control-panel`.

**Route/style mapping mismatch:** `style-catalog` has 23 entries and matches `App.tsx` 1:1. `style-config.ts` also defines 22 style configs. But there is **no `/ukiyoe` page** — the Ukiyo-e style is served at `/` (`src/pages/Index.tsx`) which is unusual and undocumented.

### C.2 Provider registry (`src/lib/generation-providers/registry.ts`)
Models declared:
- `openai:gpt-image-2` (:123)
- `gemini:nano-banana-pro` (:149)
- `sdxl:stability-ai` (:173)
- `lovable:sdxl-gateway` (:200)
- `flux:placeholder` (:225) — **unused placeholder; remove**.

### C.3 Edge functions (59; see raw list in exec output)
- **Per-style themed:** 22 (one per style)
- **Per-style freestyle:** 22
- **Special style:** `generate-image-lineart-minimal` (:1 client caller)
- **Direct providers:** `generate-image-direct-openai`, `generate-image-direct-replicate`
- **Master:** `generate-image-v2` (used by `lovable` adapter)
- **Legacy/orphan:** `generate-image-router` (0 client refs), `generate-image` (japanese default; only touched by `_resolve-edge-fn` fallback)
- **Other:** `batch-generate`, `blend`, `admin-users`, `provider-health`, `prompt-debug`, `upscale-image`, `upscale-image-replicate`, `upscale-webhook`, `github-ci-check`.

### C.4 Tables (from `src/integrations/supabase/types.ts`)
`asset_cost_events, asset_folders, audit_log, collection_images, collections, generated_image_assets, generated_images, generation_job_items, generation_jobs, profiles, prompt_history, upscale_jobs, user_roles` (+ view `admin_user_overview`).

### C.5 Env vars actually read (grep of `import.meta.env`)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, plus `DEV/PROD/MODE`. **No `VITE_LOVABLE_CONNECTOR_*` leakage.** Server-only: `LOVABLE_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS`, `GITHUB_API_KEY` (managed).

### C.6 Tests (34 files, all passing)
Strong coverage: format derivative (persistence + geometry), openai adapter, poster-master, poster-ratio-enforce, gallery, image-metadata, print-target-upscale, print-upscale-routing, provider-print-sizing, style-catalog, upscale-recipes, supir-removal guard, style-prompt-metadata, bleed-config, cost-analytics, reference-strength.
Gaps (§12): generation-router itself, use-upscale hook, useGenerateImage hook, edge functions (no Deno test infra), backend-info page, RLS behavior.

---

## D. Usage classification (highlights)

| Item | Class | Evidence |
|---|---|---|
| 44 per-style edge fns | Active but redundant | Called by `_resolve-edge-fn.ts` |
| `generate-image` (japanese) | Active fallback | `_resolve-edge-fn.ts:52` default |
| `generate-image-router` (edge) | Legacy / unused | 0 client references |
| `generate-image-v2` | Active | Called from `lovable.ts:77` |
| `generate-image-direct-openai/replicate` | Active | adapters call them |
| `upscale-image` + `upscale-webhook` | Active | `use-upscale.ts:303`, `upscale-image/index.ts:557` |
| `provider-health` | Active (badge + debug) | `GeneratorBadge.tsx:51`, `ProviderDebug.tsx:145` |
| `prompt-debug` | Active (admin only) | `ProviderDebug.tsx:111` |
| `github-ci-check` | Active (new backend-info panel) | `BackendInfo.tsx` |
| `admin-users` | Active | `/admin/users` |
| `batch-generate` | Active | Batch studio |
| `blend` | Active | `/blend` |
| `flux:placeholder` model | Dead | registry only, no adapter path |
| SUPIR/print_plus remnants | Legacy comments/labels | `admin-asset-cost.ts:22-23`, `image-assets.ts:214` |
| `EtsyExportDialog`, `EtsyMockupDialog` | Active | wired in `Gallery.tsx:1785,1805` |
| `StyleLab` route | Active but non-obvious | `/style-lab` in App.tsx |
| `ProviderComparison` | Active | Rendered in `ImageGenerator.tsx:1418` |
| `PrintCalculator` | Active | `/print-calculator` |
| `/backend-info` route | **Active but unprotected** | `App.tsx:70` — no `protect()` wrapper |

---

## E. Removal / cleanup candidates

| # | Candidate | Type | Location | Evidence | Risk | Verification | Recommendation |
|---|---|---|---|---|---|---|---|
| 1 | `supabase/functions/generate-image-router/` | Edge fn | supabase/functions/generate-image-router | 0 client refs; only self-references in log strings | Low | Grep repo + check Supabase invocation logs for 30d | Delete after log check |
| 2 | `flux:placeholder` | Model entry | src/lib/generation-providers/registry.ts:225 | No adapter dispatches to `flux`; no `getModelById("flux:...")` callers | Very low | Grep `flux:` | Delete |
| 3 | `supir` cost mapping | Data | src/lib/admin-asset-cost.ts:22 | Removed 2025-Q4 per `supir-removal.test.ts`; kept only for historical cost display | Low | Check whether historical rows use it; if none, drop | Drop if DB has no `enhancement_type='supir'` rows |
| 4 | `print_plus` cost mapping | Data | src/lib/admin-asset-cost.ts:23 | Same as above | Low | Same | Same |
| 5 | Type param `\"supir\"` | Type | src/lib/generated-image-assets.ts:152 | Historical param; no active caller passes `\"supir\"` | Low | Grep `method: "supir"` callers | Narrow union to `realesrgan\|tile` |
| 6 | `refineFailed` field | Type | src/lib/image-assets.ts:214 | Comment: "True if SUPIR / refine stage failed mid-flight" | Low | Grep reads/writes | Remove field after DB confirms no rows populate it |
| 7 | 44 per-style edge fns | Edge fns | supabase/functions/generate-image-<style>{,-freestyle} | Each file: `serve(createStyleHandler("<key>"))` — 3 lines | Medium | Ensure single router handles style dispatch via body param | Consolidate into `generate-image-v2` (already exists) or a new `generate-image-style` router; keep style-slug aliases for URL stability |
| 8 | Duplicate style tables | Config | style-catalog.ts + style-config.ts + style-routing.ts + style-prompt-metadata.ts + prompt-rules.ts + _resolve-edge-fn.ts | 6 files carry overlapping style keys | Medium | Add central `styles/registry.ts` | Consolidate — see §F |
| 9 | `bun.lockb` OR `package-lock.json` | Lockfile | repo root | CI uses `npm ci`; bun lockfile is dead weight and drift risk | Low | Pick npm (matches CI) | Delete `bun.lockb` and `bun.lock` |
| 10 | `generate-image` (japanese default) | Edge fn | supabase/functions/generate-image | Only reached via `_resolve-edge-fn` fallback for unknown styles; overlaps `generate-image-router` intent | Low | Log-check for style keys reaching fallback | Fold into router post-consolidation |
| 11 | `StyleControlPanel` admin page | Page | src/pages/StyleControlPanel.tsx | Only admin route `/style-control-panel`; verify actually opened | Low | Ask user | Verify usage before removal |

---

## F. Simplification plan

**F.1 Immediate low-risk cleanup**
- Delete `generate-image-router` edge fn (§E-1). Verify no cron/trigger references first (Supabase Studio: Cron, Webhooks).
- Remove `flux:placeholder` model (§E-2).
- Drop `bun.lockb` + `bun.lock` (§E-9). Ensure `.gitignore` covers `bun.lockb`.
- Delete SUPIR/print_plus dead branches (§E-3–6) once DB confirms no legacy rows depend on them.

**F.2 Medium-risk consolidation**
- **Style registry (highest ROI).** Create `src/lib/styles/registry.ts` (or reuse `style-config.ts`) as the single source and derive `style-catalog`, `_resolve-edge-fn`, `style-routing`, `style-prompt-metadata`, `prompt-rules`, and the shared edge `style-meta.ts` from it. Backed by parity tests already existing in `style-catalog.test.ts` and `style-prompt-metadata.test.ts`.
- **Edge-fn consolidation.** Replace the 44 per-style functions with one `generate-image-style` fn that takes `styleKey` in the body. Keep the URL slug map only in the router, using existing `_shared/prompt-compiler.ts`. Expected savings: ~140 tiny files removed.

**F.3 Backend & DB cleanup (requires live DB — deferred)**
- Confirm `asset_cost_events.provider ∈ {'openai','gemini','sdxl','lovable'}`; drop any historical `supir`/`print_plus` rows or migrate to `tile_4x`.
- Confirm no orphan rows in `generated_image_assets` after `generated_images` deletion; make FK `ON DELETE CASCADE` if not already.
- Storage bucket audit (blocked; see safety block).

**F.4 Provider/router simplification**
- Move feedback deprioritization out of `generation-router.ts` into a `chooseAdapters(policy)` pure fn, unit-test it.
- Collapse `generate-image-direct-replicate` and `lovable_sdxl` cost paths — both hit Replicate.

**F.5 Long-term**
- Single "format registry" for poster formats (currently spread across `src/lib/print-formats.ts`, `print-presets.ts`, `openai-gpt-image-2-sizes.ts`, `provider-print-sizing.ts`).

---

## G. Prioritized action plan

**Phase 1 — Critical (do first).**
- P1-A: Protect `/backend-info` behind `protect(..., true)` in `src/App.tsx:70` OR require role check inside the page. Risk: low. Rollback: revert one line.
- P1-B: Verify `admin-users` and `upscale-image` edge fns enforce JWT + role (in-code check per Lovable's `verify_jwt=false` default). Risk: low. Tests: add auth-fail test.
- P1-C: Confirm `.env` cannot be blanked in publish — do not touch, already documented.

**Phase 2 — Safe cleanup.** §F.1 items.

**Phase 3 — Consolidation.** §F.2 items (style registry + edge fn collapse). Requires parity tests to be extended.

**Phase 4 — Backend cleanup.** §F.3 items (needs live DB — currently blocked by pooler timeouts).

**Phase 5 — Test strengthening.** Add tests for `generation-router` (adapter chain construction), `use-upscale` (source selection + repeat upscale), `useGenerateImage` (ratio-enforce integration), BackendInfo guard.

**Phase 6 — Optional.** Debug-panel gating in production, bundle-split style pages (React.lazy on the 23 style routes), single format registry (§F.5).

---

## 2. Providers, models, adapters (deep dive)

**Adapters:** `lovable`, `gemini`, `replicate`, `openai` (`src/lib/generation-router.ts:36-41`).
**AdapterId → Feedback bucket:** `gemini→gemini`, `openai→openai`, else `sdxl` (`generation-router.ts:53`).
**Preference resolution:** `GeneratorPreference` (`src/lib/generators.ts`) drives chain construction; Auto uses `decideRoute` + feedback deprioritization; Manual selections do NOT fall back (documented header).

**Routing matrix (Auto):** style → family → primary adapter (see `decideRoute` in `src/lib/style-routing.ts`). All Auto chains terminate in `lovable` (safety net). Manual selection is single-adapter.

**Direct Replicate constraint:** text-to-image only; `replicate.ts:25` throws on image edits — users get a clear error, no silent fallback.

**OpenAI edits:** Uses `/v1/images/edits` when `sourceImageUrl` present; reference-strength → prompt directive (edge fn `generate-image-direct-openai`). Metadata: `apiRoute`, `sizeSource`, `referenceStrength` — good telemetry.

**Cost tracking:** `asset_cost_events` writes are the source of truth; adapter metadata includes `estimatedCost` where known. Verify no double-count on Auto fallback.

---

## 4. Style master table (summary; row-per-style expansion available on request)

22 canonical styles in `style-config.ts`. 23 rows in `style-catalog.ts` (extra: `/blend` is a tool, not a style).
Route mismatch (needs decision): Ukiyo-e's canonical route is `/` (Index) — every other style has a dedicated route. Consider `/ukiyoe` alias for parity.

**Missing coverage:**
- `lineart-minimal` is a *variant style key* (subset of lineart) — only lives in `prompt-rules.ts` + `style-config.ts:200` + a dedicated edge fn. It has no dedicated catalog row (intentional). Ensure this stays out of removable-code lists.
- `-freestyle` variants: every style has one; auto-derived by `_resolve-edge-fn.ts:47`.

**Recommended upscale recipes** (`src/lib/upscale-recipes.ts`): 7 explicit recipes; falls back to `realesrgan_4x` for unknown keys. Style-specific overrides exist for the three new styles (Art Nouveau, Mid-Century Modern → `realesrgan_4x`; Loose Watercolor → `painterly_soft`).

---

## 6. Supabase inventory (static)

Confirmed from `src/integrations/supabase/types.ts` (13 tables + 1 view + 5 RPCs). RLS behavior not verifiable while pooler is down.

**Notable columns to verify live:**
- `generated_image_assets.crop_box` (jsonb) — used by format derivatives (`format-derivative-persistence.ts`).
- `generated_images.source_image_id` — verify FK integrity for format derivatives.
- `asset_cost_events.provider` values in production (see §F.3).
- `user_roles` PK matches `has_role` function definition.

**Confirmed from repo:**
- `has_role` SECURITY DEFINER pattern is correct.
- Public grants: not visible from static view — needs `information_schema.role_table_grants` check on live DB.

---

## 7. Upscale / print

- `use-upscale.ts` correctly separates "Original master" vs "Current enhanced" as sources, with a 12000px safety cap.
- `print-target-upscale.ts` covers decimal scaling with real dimensions.
- Format derivative flow is crop-only (`format-derivative.ts`), enforced by tests.
- SUPIR/Print+ removal is guarded by `supir-removal.test.ts` — good.

**Verify (needs live DB):** the *actual pixel dimensions* stored on `generated_images.width/height` match Canvas-corrected output, not provider raw output (regression risk after `enforcePosterRatio`).

---

## 8. Formats (needs centralization)

Format definitions live in: `print-formats.ts`, `print-presets.ts`, `openai-gpt-image-2-sizes.ts`, `provider-print-sizing.ts`, `provider-size-map.ts`, `ratio-normalization.ts`, and the OpenAI edge fn. **Recommendation:** single `formats/registry.ts` — see §F.5.

---

## 11. Dependencies & tooling

- Two lockfiles committed: `bun.lockb` + `package-lock.json`. CI runs `npm ci`. Drop bun lockfile.
- No unused runtime deps detected by grep sample (all top-level deps have imports).
- `test` command: `vitest run` — passes locally in ~19 s.
- Build not run (per platform rule — auto-run).

---

## 12. Test & CI

- 34 test files, 374 tests, all green.
- CI: `.github/workflows/ci.yml` (verified reachable; `npm ci` sync fixed in commit `e8becbb`).
- Gaps listed in Phase 5 above.

---

## 13. Security findings (no secrets printed)

| Sev | Finding | Location | Fix |
|-----|---------|----------|-----|
| **High** | `/backend-info` is unprotected — anonymous users can run REST/auth/storage probes and hit `github-ci-check` | `src/App.tsx:70` | Wrap in `protect(<BackendInfo/>, true)` |
| Medium | `github-ci-check` edge fn — verify it requires a valid session before invoking the connector; the panel is only reached from `/backend-info` today, but the fn is public | `supabase/functions/github-ci-check/index.ts` | Add JWT + admin check |
| Medium | `provider-health` and `prompt-debug` fns — public invoke by design for badges; ensure no secrets echoed in error paths | edge fns | Grep for leaks; already sanitized in `debug-sanitize.ts` for client code, verify server side |
| Low | Client env exposes only `VITE_SUPABASE_*` (all public) — clean | `.env` | none |
| Low | Historical SUPIR remnants may expose stale enhancement type labels in cost UI | `admin-asset-cost.ts:22-23` | Drop after DB check |

No service-role key in client code (`grep -rn "service_role" src/` empty for real usages).

---

## 14. Performance / cost (spot checks)

- Auto adapter chain can produce a *fallback double-charge* when a paid provider (OpenAI/Replicate) partially succeeds then the client sees a non-2xx wrapper. Confirm edge fns short-circuit before billing on failed uploads.
- Retry logic: gallery fetch has `x-retry-count: 3` (see network log). Any 4th retry? Confirm `use-batch-jobs.ts` bounds.
- `AdminAssets` already paginated to 20 (recent change). Good.

---

## 15. Simplification opportunities — top 3

1. **Style registry consolidation** (§F.2) — eliminates 6-way drift.
2. **Edge fn collapse** (§F.2) — removes ~44 near-empty files.
3. **Single format registry** (§F.5) — removes ratio-math duplication.

---

## Safety block (deferred until user approval)

Supabase pooler was returning `Connection terminated due to connection timeout` at audit time — every conclusion needing live rows (marked *needs live DB* above) is deferred. Nothing was modified, deleted, migrated, or deployed. No secrets echoed. No packages upgraded.

**Awaiting explicit instruction before Phase 1 changes.**
