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

1. valid preset (SDXL + `print_50x70` + passes the 5:7/multiple-of-8 check)
2. existing explicit `requestedWidth`/`requestedHeight` (current clamp rules)
3. existing `sdxlSizeForFormat` / `resolveAdapterSizingOverrides`

Returns `{ width, height, sizeSource, preset, exact, adjusted }`. No file re-implements the precedence.

### Contract + wiring

- Add `sdxlSizePreset: "small" | "large" | null` to `GenerationRequestV2` and its Deno mirror (additive, nullable, backward compatible; legacy normalization defaults to `null`).
- `ImageGenerator` holds the preset state and puts it on the V2 request; `useDurableGeneration.start()` passes it through unchanged.
- `generate-single` forwards it into the SDXL runner args; `_shared/generators.ts` calls the shared resolver.
- `generation-providers/replicate.ts` calls the same resolver and sends the resulting dimensions plus the preset tag; `generate-image-direct-replicate` re-validates server-side.

### Telemetry fix (both SDXL paths)

The response must always describe what was actually sent:

| preset | width×height | sizeSource | providerExactMatch | providerAdjusted |
|---|---|---|---|---|
| small | 1200×1680 | `sdxl_preset_small` | true | false |
| large | 1440×2016 | `sdxl_preset_large` | true | false |
| explicit non-preset | as sent | `override` | from resolver | from resolver |
| none | resolver | resolver source | resolver | resolver |

`requestedWidth`/`requestedHeight` always echo the dimensions sent upstream.

## 2. Two registries, distinct responsibilities

`upscale-modes.ts` is **not** replaced. It keeps workflow/storage/history semantics (`realesrgan_4x`, `print_target_300`, `clarity_dynamic`).

New `src/lib/upscalers.ts` + Deno mirror `supabase/functions/_shared/upscalers.ts` describe **execution capability only**:

| id | label | route | model | enabled | maxInputPixels | scale range | tiled | async |
|---|---|---|---|---|---|---|---|---|
| `realesrgan_normal` | Normal Real-ESRGAN | sync `upscale-image-replicate` | current pinned version | yes | 2,096,704 | 2–8 | no | no |
| `realesrgan_large` | Large-image Real-ESRGAN | sync `upscale-image-replicate`, new branch | `daanelson/real-esrgan-a100`, version pinned after verification | **starts disabled** | `null` (unknown until verified) | 2–8 | no | no |
| `clarity` | Clarity | async `upscale-image` (`clarity_dynamic`) | `philz1337x/clarity-upscaler` (existing hash) | yes | `null` | existing | yes | yes |

Every attempt carries **both** `mode` (workflow tag) and `upscalerId` (execution tag). No capability numbers are duplicated into components or edge functions.

### Large-image model verification (implementation step 1)

Before enabling `realesrgan_large`: read the live model + version from the Replicate API using the existing `REPLICATE_API_TOKEN` from a temporary edge-function-side check, confirm input field names and scale range, pin the tested version hash, and run one 1440×2016 @2× prediction. Only then set `enabled: true` and record a verified `maxInputPixels`. If verification fails, it stays disabled, Clarity stays manual-only, and Auto reports **unavailable** rather than routing to Clarity. The outcome is documented in the final report.

## 3. Preflight on actual pixels

New pure `src/lib/upscale-preflight.ts` + minimal Deno mirror:

```
preflightUpscale({ sourceWidth, sourceHeight, upscalerId, scale })
  -> { sourcePixels, sourceMP, projectedWidth, projectedHeight, projectedMP,
       eligible, reason, limitPixels | null }
```

- `maxInputPixels: null` means "unknown" — an unknown limit does not fabricate eligibility; a disabled upscaler is never eligible.
- Flow:
  1. **Dialog (advisory)** — previews eligibility from the known source dimensions so options can be greyed out before confirm.
  2. **`useUpscale` (authoritative, frontend)** — runs preflight **after** `preparePosterMaster()`, on the corrected master's real dimensions, and throws before any Supabase invoke if ineligible.
  3. **Backend** — `upscale-image-replicate` and `upscale-image` re-probe the actual bytes and revalidate, returning 400 with the reason instead of calling Replicate.
- The generation preset is never used as eligibility truth.
- Scale still comes from `calculatePrintTargetUpscale` / `planManualUpscale`; preflight only answers "can this upscaler accept this actual source at that scale". No duplicated scale math, no blind 4×/8×.
- No silent downscaling, no silent model substitution.

## 4. Auto routing

`chooseAutoUpscaler(sourcePixels)`:
1. Normal eligible → `realesrgan_normal`
2. else Large enabled **and** eligible → `realesrgan_large`
3. else → **Auto unavailable** (with reason)

Clarity is never chosen automatically. A manual choice is either executed as chosen or blocked — never substituted.

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
- Edited: `src/lib/generation-contract-v2.ts` and its Deno mirror, `src/components/ImageGenerator.tsx` (+ small preset selector), `src/hooks/useDurableGeneration.ts`, `supabase/functions/generate-single/index.ts`, `supabase/functions/_shared/generators.ts`, `src/lib/generation-providers/replicate.ts`, `supabase/functions/generate-image-direct-replicate/index.ts`, `src/hooks/use-upscale.ts`, `src/components/EnhanceForPrintDialog.tsx`, `supabase/functions/upscale-image-replicate/index.ts`, `supabase/functions/upscale-image/index.ts`.

## Tests (all mocked, no paid provider calls)

- Preset geometry: `w*7 === h*5`, multiples of 8, exact pixel values.
- Durable path carries `sdxlSizePreset` end-to-end into the SDXL runner args.
- Direct/router path carries the preset and resulting dimensions.
- Preset scope: applied for SDXL + `print_50x70`; ignored for other formats and other providers.
- Precedence: preset > explicit dims > resolver.
- Truthful telemetry on **both** SDXL implementations (source/exact/adjusted/requested dims for preset, explicit and resolver cases).
- Normal eligibility: 1200×1680 eligible; 1440×2016 rejected; boundary and boundary+1.
- Auto: Normal / Large / unavailable; Clarity never auto-selected.
- Preflight uses corrected-master dimensions, not the preset or pre-correction dims.
- Manual choice never substitutes; ineligible manual choice blocked in hook and server helper.
- A100 payload shape (image, scale, pinned version) with a mocked fetch.
- Failure path: raw + friendly error, prediction id preserved, original asset untouched.
- Registry/mirror parity (presets, upscalers, preflight).

## Remaining assumptions needing live verification

1. `daanelson/real-esrgan-a100` input schema, pinned version, real input ceiling, and a 1440×2016 @2× run — until verified it ships disabled.
2. Whether the pinned `stability-ai/sdxl` version reliably supports 1600×2240; unverified, so the 2048 clamp and 1440×2016 Large stand.

## Not included

No migration, no new secrets (reuses `REPLICATE_API_TOKEN`), no Topaz/premium, no roles/quotas/observability service, no ratio-aware preset expansion beyond 50×70, no unrelated refactors.

## Manual smoke test after merge

Generate one Large (1440×2016) SDXL image at 50×70, open Enhance: Normal shows Unavailable with the MP explanation, Auto shows the model it will use (or Unavailable if the A100 route failed verification); run it at 2× and confirm a 2880×4032 enhanced master is saved with the original intact, then force a failure and confirm the dialog stays open with Copy diagnostic.
