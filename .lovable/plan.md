# Variant Fan-Out (Pick-Best)

Generate 4 variants from the same prompt + style in parallel, present them in a 2×2 picker, and let you keep the winner(s). Reuses existing generation routing — no provider, prompt, or upscale behavior changes.

## Why
Single-shot generation is hit-or-miss for poster quality. Running 4 variants at once raises the chance one survives 300 PPI export without adding manual re-roll churn.

## UX

- New "Generate 4 variants" toggle in the generator panel (off by default).
- When on, clicking Generate fires 4 concurrent calls through the existing router with the same inputs (prompt, style, aspect, background, print mode, format).
- Live 2×2 grid below the prompt:
  - Each tile shows a skeleton → image as it arrives.
  - Per-tile badges: provider, route, effective PPI (for the current print format), cost.
  - Per-tile actions: **Keep** (saves to gallery via existing save path), **Discard** (removes from local state), **Open** (lightbox).
- "Keep all" and "Discard all" buttons above the grid.
- Failures show inline error + "Retry this tile" (only that one re-runs).
- Variants are NOT auto-saved. Only kept tiles persist (mirrors existing single-image behavior so we don't bloat the gallery).

## Scope guards
- Single-image flow remains the default and is untouched.
- No changes to `generation-router`, edge functions, or provider adapters.
- No new prompt-history rows for discarded tiles; only kept ones save (and thereby record history via existing path).
- No upscale auto-trigger; user upscales kept tiles manually like today.
- Hard cap: 4 variants, no user-configurable count (keeps cost predictable).

## Files

**New**
- `src/features/generation/useVariantFanOut.ts` — hook owning the 4-slot state array `{ id, status, result?, error? }`, kicks off 4 parallel `generateImage` calls, exposes `start`, `retryOne`, `discard`, `discardAll`.
- `src/features/generation/VariantGrid.tsx` — 2×2 responsive grid (stacks on mobile) rendering tiles with badges and actions. Reuses `GeneratorBadge`, `RouteBadge`, `PrintQualityIndicator`.
- `src/features/generation/useVariantFanOut.test.ts` — unit tests for the hook (mocked router): 4 parallel starts, partial failure handling, retryOne isolation, discard semantics.

**Edited**
- `src/components/ImageGenerator.tsx` — add the toggle, branch to `VariantGrid` when on, wire save-on-keep through existing `useSaveGeneratedImage`.

## Tests
- Hook tests above (4 cases).
- Run full vitest suite; target: previous 94 passing + 4 new = 98.

## Out of scope
- Variant diffing/comparison overlay.
- Server-side batching (the existing client-side parallel calls are enough at N=4).
- Cost cap UI / spend guard (existing cost dashboard already surfaces this).
- Auto-pick by quality heuristic.

## Limitations
- 4 concurrent provider calls = ~4× cost per generate click when toggled on. The toggle's helper text will say so.
- If the provider rate-limits, some tiles will fail; user retries them individually.
- Effective PPI badge requires a chosen print format; without one, tiles show resolution only.
