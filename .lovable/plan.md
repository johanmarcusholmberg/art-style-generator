# SDXL Size Choice + Multi-Upscaler Routing

## What exists today (verified)

- SDXL generation goes: `ImageGenerator` → `generation-providers/replicate.ts` → `generate-image-direct-replicate`. The edge function already accepts a `requestedWidth`/`requestedHeight` override, but clamps both to **max 2048** and multiples of 8. Sizes otherwise come from `provider-print-sizing.ts` / `provider-size-map.ts`.
- Upscale goes through `EnhanceForPrintDialog` → `useUpscale` → either `upscale-image-replicate` (sync Real-ESRGAN, hardcoded single model version) or `upscale-image` (async Clarity, `upscale_jobs` + webhook).
- Mode registry is `src/lib/upscale-modes.ts`; recipes/recommendation live in `upscale-recipes.ts`, `upscale-recommendation.ts`, `print-target-upscale.ts`, `manual-upscale.ts`.
- There is **no input-pixel preflight anywhere** — the "too large" case is only caught after Replicate rejects it, and is turned into a friendly string in `upscale-image-replicate`.
- `upscale_jobs` has a `pipeline` jsonb column plus `replicate_prediction_id` and `error_message` — enough for diagnostics, **no migration needed**.

## 1. Two SDXL generation sizes (exact 5:7)

New tiny module `src/lib/sdxl-generation-size.ts`:

- `small`: **1200 × 1680** — exact 5:7, 2,016,000 px, under the observed Real-ESRGAN ceiling of 2,096,704 px. Label "Small — Normal upscale", helper "Optimized for Normal Real-ESRGAN."
- `large`: **1440 × 2016** — exact 5:7, 2,903,040 px (2.90 MP). Label "Large — High detail", helper "Higher-detail source. Requires an upscaler that supports larger images."
- Validation (unit-tested for both presets): `width * 7 === height * 5`, and both dimensions multiples of 8.
- Default: **Small**.

**Why 1440 × 2016 and not 1600 × 2240:** the direct SDXL edge function clamps explicit dimensions to 2048 per axis, and the model version pinned in the function (`stability-ai/sdxl`, version `39ed52f2…`) documents 1024 as its native size with no verified guarantee at 2240. There is no read access to the Replicate schema/runtime from this environment to prove 2240 is reliable, so the clamp stays as-is and Large uses the largest exact 5:7 preset that fits it. 2.90 MP is still ~38% above the Normal Real-ESRGAN input ceiling, so it exercises the Large-image upscale route exactly as intended. If the model schema is later verified to support 2240 reliably, bumping Large to 1600 × 2240 is a one-line registry change plus the clamp raise — documented in the final report.

Wiring (explicit priority):
1. Selected Small/Large SDXL preset → sent as explicit `requestedWidth`/`requestedHeight`.
2. Any explicit requested dimensions already supplied by the caller.
3. `resolveAdapterSizingOverrides` (existing resolver) only when no preset was supplied.

`generation-providers/replicate.ts` currently derives dimensions solely through `resolveAdapterSizingOverrides`; it will be updated so a preset takes precedence and also passes a `sizePreset` tag ("small" | "large") for telemetry.

### 1a. Fix sizing telemetry in `generate-image-direct-replicate`

Today the function computes a local `sizeSource = "override"` but returns `sized.source`, and `providerExactMatch` / `providerAdjusted` reflect the discarded format-map calculation instead of the accepted override. Fix so the response is truthful:

- `sizeSource` = `sdxl_preset_small` / `sdxl_preset_large` when a preset was accepted, `override` for a non-preset explicit size, otherwise the resolver's own source.
- For the two exact presets: `providerExactMatch = true`, `providerAdjusted = false`.
- `requestedWidth` / `requestedHeight` = the dimensions actually sent to Replicate.
- Server-side revalidation of preset dimensions with the same `width * 7 === height * 5` and multiple-of-8 rules before accepting them.


## 2. Upscaler registry (one small source of truth)

New `src/lib/upscalers.ts` with a mirrored Deno copy `supabase/functions/_shared/upscalers.ts` (kept in sync by a parity test, same pattern already used for executable providers):

| id | label | route | maxInputPixels | large-image | notes |
|---|---|---|---|---|---|
| `realesrgan_normal` | Normal Real-ESRGAN | existing sync `upscale-image-replicate` | 2,096,704 | no | fast, cheap |
| `realesrgan_large` | Large-image Real-ESRGAN | same edge fn, new model branch | ~16 MP | yes | A100 deployment |
| `clarity` | Clarity | existing async `upscale-image` (`clarity_dynamic`) | ~16 MP | yes | tiled, generative |

Fields: `id, label, description, provider, model, enabled, maxInputPixels, minScale, maxScale, supportsLargeImages, tiled, async, speed, cost`. No premium/Topaz for now — the registry leaves room to add one entry later.

**Large-image model:** `daanelson/real-esrgan-a100` — same Real-ESRGAN fork as the current model but deployed on an A100 80 GB, so the GPU-memory rejection does not apply; identical `image` + `scale`/`face_enhance` inputs, so the existing call code is reused. It will be called via Replicate's model endpoint `POST /v1/models/daanelson/real-esrgan-a100/predictions` (latest version, no hardcoded hash to go stale). Its real input schema and large-image behaviour get confirmed against the live API during implementation before the branch is finalised; if it does not behave, the fallback is Clarity and the registry entry is marked disabled with the finding reported.

Existing mode ids (`realesrgan_4x`, `clarity_dynamic`, `print_target_300`) stay as the routing/storage tags so history and cost views keep working; the registry maps id → mode.

## 3. Preflight + hard blocking

New pure `src/lib/upscale-preflight.ts` (mirrored minimal copy on the server):

```
preflightUpscale({ width, height, upscalerId, scale }) ->
  { sourcePixels, sourceMP, projectedWidth, projectedHeight, projectedMP,
    eligible, reason }
```

- Eligibility always uses **actual source pixel dimensions**, never the generation-size choice.
- Frontend: ineligible upscalers render disabled with the explanation ("This source is 2.90 MP. Normal Real-ESRGAN supports approximately 2 MP in the current configuration."), and `useUpscale` throws before invoking Supabase if a caller passes an ineligible combination.
- Backend: `upscale-image-replicate` and `upscale-image` run the same check (source dimensions probed from the image bytes as they already do for output) and return 400 with the reason instead of calling Replicate.
- No silent downscaling and no silent model substitution on a manual choice.

## 4. Auto routing (deterministic)

`chooseAutoUpscaler(sourcePixels)`:
- fits Normal → `realesrgan_normal`
- otherwise → `realesrgan_large`
- Clarity is never chosen automatically.

The dialog shows "Will use: …" for Auto.

## 5. Enhance dialog UI

Inside the existing `EnhanceForPrintDialog` (no new dialog):

- **Upscaler** list: Auto (with resolved model), Normal Real-ESRGAN, Large-image Real-ESRGAN, Clarity — each with one-line description and an Available/Unavailable state.
- Compact readout: `Source 1440 × 2016 · 2.90 MP` / `Selected …` / `Scale 2×` / `Output 2880 × 4032 · 11.61 MP`.
- Scale defaults to the smallest factor that reaches the print target (reusing `calculatePrintTargetUpscale`), not a blind 4×/8×.
- Model IDs and raw payload details move under the existing collapsible **Technical details**.
- Failure state becomes actionable: friendly reason, source MP, the limit, recommended and alternative upscalers, plus a **Copy diagnostic** button.

## 6. Diagnostics

- One diagnostic record per attempt: upscale id, timestamp, upscaler, provider, model, source w/h/px/MP, requested scale, projected w/h/MP, preflight result + reason, Replicate prediction id, provider status, `rawProviderError`, `friendlyError`, elapsed ms, whether Auto routed, final status.
- Stored in the existing `upscale_jobs.pipeline` jsonb for async runs and returned in the response body for sync runs; also `console.log`ged as one structured line per attempt in both edge functions.
- Raw provider text is always preserved alongside the friendly message.
- `Copy diagnostic` builds the compact text block and passes it through the existing `src/lib/debug-sanitize.ts` helper (keys, auth headers, signed URLs).
- Original/base assets are untouched on failure — the existing enhanced-master write only happens on success; no change to that behaviour.

## 7. Tests (all mocked, no paid calls)

- 5:7 exactness (`w*7 === h*5`, both multiples of 8) and exact pixel values for both presets; adapter body carries the selected `requestedWidth/Height`, the preset wins over `resolveAdapterSizingOverrides`, and no other custom size leaks through.
- Sizing telemetry: preset runs report `sizeSource = sdxl_preset_small|sdxl_preset_large`, `providerExactMatch = true`, `providerAdjusted = false`, and echo the dimensions actually sent.
- Normal eligibility: 1200×1680 eligible; 1440×2016 not; exact boundary and boundary+1; ineligible request blocked before provider call (frontend and server helper).
- Auto routing for both cases; Clarity never auto-selected.
- Large-image payload: correct image, scale, model endpoint.
- Failure path: mocked Replicate failure preserves raw error, produces friendly error, keeps prediction id, leaves the original asset untouched.
- Projected-dimension math.
- Frontend/backend registry parity.

## Not included

No migration, no new secrets (reuses `REPLICATE_API_TOKEN`), no Topaz/premium, no roles/quotas/observability service, no unrelated refactors.

## Manual smoke test after merge

Generate one Large (1440×2016) SDXL image, open Enhance: Normal must show Unavailable with the MP explanation, Auto must show "Will use: Large-image Real-ESRGAN"; run it at 2× and confirm a 2880×4032 enhanced master is saved with the original intact.
