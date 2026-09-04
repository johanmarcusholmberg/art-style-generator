# SDXL Size Presets + Multi-Upscaler Routing (revised for current architecture)

## Verified current architecture

- **Main generation is durable**: `ImageGenerator.generate()` → `useDurableGeneration.start()` → job row → `generate-single` → `_shared/generators.ts`. On claim the payload is normalized to `GenerationRequestV2`, which already carries `printFormatId`, `requestedWidth`, `requestedHeight`, `sizeIntent`, and `generate-single` forwards all of them into the SDXL runner.
- **Direct/router path still exists** for variants, comparisons and style-lab: `generation-providers/replicate.ts` → `generate-image-direct-replicate`. It derives dimensions only through `resolveAdapterSizingOverrides`.
- **Both SDXL implementations have the same telemetry bug**: `_shared/generators.ts` (~line 244–260, 337–343) and `generate-image-direct-replicate` accept an explicit `requestedWidth/Height` override (256–2048, multiple of 8), set a local `sizeSource = "override"`, then still return `sized.source` / `sized.exact` / `!sized.exact` from the discarded format-map calculation.
- **Upscale**: `EnhanceForPrintDialog` → `onConfirm` → `useUpscale` → `upscale-image-replicate` (sync Real-ESRGAN, one hardcoded version) or `upscale-image` (async Clarity via `upscale_jobs` + webhook). The dialog calls `setOpen(false)` immediately on confirm, so it is closed before the result exists. `useUpscale` swallows failures (`console.error` + `return null`), so raw provider text never reaches the UI.
- **No input-pixel preflight anywhere** — GPU-memory rejections are only discovered after Replicate answers.
- `upscale_jobs` already has `pipeline` jsonb, `replicate_prediction_id`, `error_message`. **No migration planned.**
- `calculatePrintTargetUpscale` / `planManualUpscale` already answer "what scale is needed"; they stay untouched.

## 1. SDXL size presets (5:7, 50×70 only)

New shared module `src/lib/sdxl-size-presets.ts` + Deno mirror `supabase/functions/_shared/sdxl-size-presets.ts` (parity test, same pattern as the executable-provider mirror):

- `small`: **1200 × 1680** — "Small — Normal upscale" / "Optimized for Normal Real-ESRGAN." (2.02 MP)
- `large`: **1440 × 2016** — "Large — High detail" / "Higher-detail source. Requires an upscaler that supports larger images." (2.90 MP)
- Exactness rule: `width * 7 === height * 5` and both dimensions `% 8 === 0`, asserted in tests.
- **Default: Small.**
- **Scope: SDXL + `print_50x70` only, and only when the user explicitly selects SDXL.** With provider preference `auto` the selector is hidden and today's sizing logic applies unchanged (the provider isn't decided yet, so "Large SDXL" must not appear when Auto might run Gemini/OpenAI). Any other format (A-series, 3:4, square, landscape) also ignores the preset and keeps the ratio-preserving resolver.

**Why 1440 × 2016 rather than 1600 × 2240:** both SDXL runners clamp explicit dimensions to 2048 per axis, and the pinned model (`stability-ai/sdxl`, version `39ed52f2…`) is documented at 1024 native with no verified reliability at 2240. There is no way to read the live Replicate schema from this environment, so the safety envelope stays as-is and Large uses the largest exact 5:7 preset that fits it. 2.90 MP is still ~38% over the Normal Real-ESRGAN ceiling, so it exercises the large-image route as intended.

### One shared size resolver

`resolveSdxlRequestSize({ preset, requestedWidth, requestedHeight, posterFormatId, aspectRatio, sizeIntent })` — one implementation, mirrored for Deno. Priority:

1. valid preset (explicit SDXL + `print_50x70` + passes the 5:7/multiple-of-8 check)
2. existing explicit `requestedWidth`/`requestedHeight` (current clamp rules)
3. existing `sdxlSizeForFormat` / `resolveAdapterSizingOverrides`

Returns `{ width, height, sizeSource, preset, exact, adjusted }`. Both `_shared/generators.ts` and `generate-image-direct-replicate` call this one function — neither reimplements the precedence.

### Contract + wiring

- Add `sdxlSizePreset: "small" | "large" | null` to `GenerationRequestV2`, its Deno mirror, and `GENERATION_REQUEST_V2_FIELDS` (additive, nullable, legacy normalization defaults to `null`) — the server must be able to tell "Small preset" from an arbitrary 1200×1680 override.
- Add the same optional field to `NormalizedGenerationRequest` (`src/lib/generation-types.ts`) and map it in the router, so the direct adapter used by variant fan-out / provider comparison / style compare does not silently lose the setting.
- `ImageGenerator` holds the preset state and puts it on both request shapes; `useDurableGeneration.start()` passes it through unchanged; `generate-single` forwards it into the SDXL runner args.

### Telemetry fix (both SDXL paths)

The response must always describe what was actually sent:

| case | width×height | sizeSource | providerExactMatch | providerAdjusted |
|---|---|---|---|---|
| small | 1200×1680 | `sdxl_preset_small` | true | false |
| large | 1440×2016 | `sdxl_preset_large` | true | false |
| explicit non-preset | as sent | `override` | recomputed from the sent dimensions vs. the target format ratio | inverse of that |
| none | resolver | resolver source | resolver | resolver |

For the override case the discarded resolver result is never reused — exactness is recalculated against the actual dimensions sent. `requestedWidth`/`requestedHeight` always echo the dimensions sent upstream.

### Replay ("Generate again" / "Reuse settings")

`generation-replay.ts` reads persisted `generated_images` columns, and that table has **no generic metadata jsonb** and no size-preset column. The durable job's `result_metadata` (jsonb) can carry `sdxlSizePreset` additively with no migration, but gallery replay does not read it. So: the preset is recorded in durable metadata, and replay from a saved artwork will **not** restore Large — it falls back to the normal resolver path with a `warnings` entry. The preset is never inferred from measured pixel dimensions. Adding a `generated_images` column is out of scope for this phase and reported as a limitation.

## 2. Two registries, distinct responsibilities

`upscale-modes.ts` is **not** replaced. It keeps workflow/storage/history semantics (`realesrgan_4x`, `print_target_300`, `clarity_dynamic`).

New `src/lib/upscalers.ts` + Deno mirror `supabase/functions/_shared/upscalers.ts` describe **execution capability only**:

| id | label | route | model | enabled | maxInputPixels | verifiedInputPixels | scale range | tiled | async |
|---|---|---|---|---|---|---|---|---|---|
| `realesrgan_normal` | Normal Real-ESRGAN | sync `upscale-image-replicate` | current pinned version | yes | 2,096,704 | — | 2–8 | no | no |
| `realesrgan_large` | Large-image Real-ESRGAN | sync `upscale-image-replicate`, new branch | `daanelson/real-esrgan-a100`, version pinned after verification | **starts disabled** | `null` (no verified hard ceiling) | `2_903_040` after a successful 1440×2016 test, else `null` | 2–8 | no | no |
| `clarity` | Clarity | async `upscale-image` (`clarity_dynamic`) | `philz1337x/clarity-upscaler` (existing hash) | yes | `null` | — | existing | yes | yes |

Every attempt carries **both** `mode` (workflow tag) and `upscalerId` (execution tag). No capability numbers are duplicated into components or edge functions.

### Single Real-ESRGAN input ceiling (conflict to resolve)

`src/lib/generated-image-assets.ts` currently defines `MAX_REALESRGAN_INPUT_PIXELS = 2_000_000` and `estimateUpscaleOutput()` blocks Real-ESRGAN above it. The Small preset is 2,016,000 px, so the old helper would reject exactly the source the new registry calls eligible. Resolution: **delete the duplicated constant** and have `estimateUpscaleOutput()` read `UPSCALERS.realesrgan_normal.maxInputPixels`. One ceiling, one place. (If the observed 2,096,704 figure can't be re-confirmed during implementation, the registry value is set to whatever is confirmed and Small is re-checked against it before shipping — the presets and the ceiling must agree.)

### Large-image model verification (implementation step 1)

Before enabling `realesrgan_large`: read the live model + version from the Replicate API using the existing `REPLICATE_API_TOKEN`, confirm input field names and scale range, pin the tested version hash, and run one 1440×2016 @2× prediction. This verification is a throwaway script/manual call — **no committed diagnostic endpoint** is added. The run must also confirm the wall-clock runtime is comfortably inside the synchronous edge-function budget; if it isn't, `realesrgan_large.enabled` stays `false` rather than being forced into an unsafe sync path or triggering a new async architecture in this phase. A successful run proves only "supports at least 2,903,040 input pixels", so `maxInputPixels` stays `null` and the evidence is recorded as `verifiedInputPixels: 2_903_040`. `enabled: true` only after that run succeeds. If Lovable cannot safely perform the live verification, it stays disabled, Clarity stays manual-only, and Auto reports **unavailable** rather than routing to Clarity. The outcome is stated in the final report.

## 3. Preflight on actual pixels

New pure `src/lib/upscale-preflight.ts` + minimal Deno mirror:

```
preflightUpscale({ sourceWidth, sourceHeight, upscalerId, scale })
  -> { sourcePixels, sourceMP, projectedWidth, projectedHeight, projectedMP,
       eligible, reason, limitPixels | null }
```

- **Capability-state semantics**: `enabled: false` always means unavailable. `maxInputPixels: null` means *no verified hard ceiling* — pixel count alone must not approve or block; the upscaler stays selectable and the provider's own known constraints apply instead (for Clarity: the existing projected-output / long-side safety checks and tiling). Only a numeric `maxInputPixels` produces a pixel-count rejection. `verifiedInputPixels` is a *tested envelope*, not a ceiling: a null `maxInputPixels` never implies that an arbitrarily larger input is safe.
- Flow:
  1. **Dialog (advisory)** — previews eligibility from the known source dimensions so options can be greyed out before confirm.
  2. **`useUpscale` (authoritative, frontend)** — runs preflight **after** `preparePosterMaster()`, on the corrected master's real dimensions, and throws before any Supabase invoke if ineligible.
  3. **Backend** — `upscale-image-replicate` and `upscale-image` re-probe the actual bytes and revalidate, returning 400 with the reason instead of calling Replicate.
- The generation preset is never used as eligibility truth.
- Scale still comes from `calculatePrintTargetUpscale` / `planManualUpscale`; preflight only answers "can this upscaler accept this actual source at that scale". No duplicated scale math, no blind 4×/8×.
- **Scope of "no silent downscaling/substitution"**: it applies to the new Normal / Large / Clarity selection flow only. The legacy tiled `tile_8x` route keeps its existing pre-downscale/downshift behavior unchanged unless a change is strictly required for compatibility.

## 4. Auto routing

`chooseAutoUpscaler(sourcePixels)` — evaluated on the **actual corrected source**:
1. Normal eligible → `realesrgan_normal`
2. else Large enabled **and** the source is within its verified envelope (`sourcePixels <= verifiedInputPixels`, or `<= maxInputPixels` once a real hard maximum is established) → `realesrgan_large`
3. else → **Auto unavailable** (with reason)

A source above the verified envelope makes Auto unavailable; Auto never assumes an unbounded input just because `maxInputPixels` is `null`. Clarity is never chosen automatically. A manual choice is either executed as chosen or blocked — never substituted.

## 5. Enhance dialog lifecycle

Small contract change so the dialog survives the attempt:

- `onConfirm` returns the caller's promise (or the caller reports back through a passed-in status), and the dialog stops calling `setOpen(false)` on confirm. It moves through **Idle → Running → Success → Failure** and only auto-closes on success (or manual dismiss).
- Provider logic stays entirely in `useUpscale`; the dialog renders state.
- Upscaler list: Auto (showing the model it resolved to, or "Unavailable"), Normal Real-ESRGAN, Large-image Real-ESRGAN, Clarity — one-line description each, plus Available/Unavailable with the reason ("This source is 2.90 MP. Normal Real-ESRGAN supports approximately 2 MP in the current configuration.").
- Compact readout: `Source 1440 × 2016 · 2.90 MP` / `Selected …` / `Scale 2×` / `Output 2880 × 4032 · 11.61 MP`.
- Failure panel: friendly error, source dims/MP, the model's known limit, selected upscaler, recommended alternative(s), **Technical details** (existing collapsible) and **Copy diagnostic**.

## 6. Typed diagnostics and structured errors

New `UpscaleAttemptDiagnostic` type shared by hook, dialog and edge functions:

`attemptId, startedAt, elapsedMs, mode, upscalerId, autoRouted, provider, model, versionId, sourceWidth/Height/Pixels/MP, requestedScale, projectedWidth/Height/MP, preflightEligible, preflightReason, replicatePredictionId, providerStatus, rawProviderError, friendlyError, finalStatus`.

- `useUpscale` stops collapsing failures into `null`/string: it returns/throws a typed `UpscaleAttemptError` carrying the diagnostic so raw provider text, prediction id and routing survive to the UI.
- Sync route returns the diagnostic in the response body; async route writes it into `upscale_jobs.pipeline`. Both log one structured line per attempt.
- `Copy diagnostic` renders the compact text block through the existing `src/lib/debug-sanitize.ts` (keys, auth headers, signed URLs).
- Original/base asset is untouched on failure — the enhanced-master write still only happens on success.

## Files likely to change

- New: `src/lib/sdxl-size-presets.ts`, `supabase/functions/_shared/sdxl-size-presets.ts`, `src/lib/upscalers.ts`, `supabase/functions/_shared/upscalers.ts`, `src/lib/upscale-preflight.ts`, `supabase/functions/_shared/upscale-preflight.ts`, `src/lib/upscale-diagnostics.ts` (+ tests).
- Edited: `src/lib/generation-contract-v2.ts` and its Deno mirror, `src/lib/generation-types.ts`, `src/lib/generation-router.ts`, `src/components/ImageGenerator.tsx` (+ small preset selector), `src/hooks/useDurableGeneration.ts`, `supabase/functions/generate-single/index.ts`, `supabase/functions/_shared/generators.ts`, `src/lib/generation-providers/replicate.ts`, `supabase/functions/generate-image-direct-replicate/index.ts`, `src/lib/generated-image-assets.ts` (remove duplicated cap), `src/hooks/use-upscale.ts`, `src/components/EnhanceForPrintDialog.tsx`, `supabase/functions/upscale-image-replicate/index.ts`, `supabase/functions/upscale-image/index.ts`, `src/lib/generation-replay.ts` (warning only).

## Tests (all mocked, no paid provider calls)

- Preset geometry: `w*7 === h*5`, multiples of 8, exact pixel values.
- Durable path carries `sdxlSizePreset` end-to-end into the SDXL runner args.
- Direct/router path (`NormalizedGenerationRequest` → adapter) carries the preset and resulting dimensions.
- Preset scope: applied for explicit SDXL + `print_50x70`; ignored for Auto preference, other providers and other formats.
- Precedence: preset > explicit dims > resolver, from the one shared resolver.
- Truthful telemetry on **both** SDXL implementations, including recomputed exact/adjusted for the explicit-override case.
- Small preset (2,016,000 px) is eligible for Normal against the single shared ceiling — regression test for the removed `MAX_REALESRGAN_INPUT_PIXELS`; `estimateUpscaleOutput()` and the registry agree.
- Normal eligibility: 1200×1680 eligible; 1440×2016 rejected; boundary and boundary+1.
- Auto: Normal / Large / unavailable; Clarity never auto-selected.
- `maxInputPixels: null` does not block Clarity; `enabled: false` always blocks.
- Preflight uses corrected-master dimensions, not the preset or pre-correction dims.
- Manual choice never substitutes; ineligible manual choice blocked in hook and server helper; legacy `tile_8x` behavior unchanged.
- A100 payload shape (image, scale, pinned version) with a mocked fetch.
- Failure path: raw + friendly error, prediction id preserved, original asset untouched.
- Registry/mirror parity (presets, upscalers, preflight, contract field list).

## Remaining assumptions needing live verification

1. `daanelson/real-esrgan-a100` input schema, pinned version, and a 1440×2016 @2× run — until verified it ships disabled; its true upper input ceiling stays unknown (`maxInputPixels: null`) even after a successful run.
2. Whether the pinned `stability-ai/sdxl` version reliably supports 1600×2240; unverified, so the 2048 clamp and 1440×2016 Large stand.
3. The exact Normal Real-ESRGAN ceiling (2,096,704 observed) — re-confirmed during implementation and set as the single registry value.
4. Saved-artwork replay cannot restore the preset without a new `generated_images` column; reported as a limitation rather than migrated in this phase.

## Not included

No migration, no new secrets (reuses `REPLICATE_API_TOKEN`), no Topaz/premium, no roles/quotas/observability service, no ratio-aware preset expansion beyond 50×70, no unrelated refactors.

## Manual smoke test after merge

Generate one Large (1440×2016) SDXL image at 50×70, open Enhance: Normal shows Unavailable with the MP explanation, Auto shows the model it will use (or Unavailable if the A100 route failed verification); run it at 2× and confirm a 2880×4032 enhanced master is saved with the original intact, then force a failure and confirm the dialog stays open with Copy diagnostic.
