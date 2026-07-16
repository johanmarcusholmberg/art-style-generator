# Side-effect ownership (durable generation path)

**Status:** B1.2 — server-owned effects live behind `generate-single`. The live
`ImageGenerator.tsx` path still owns the same effects client-side and remains
untouched until B2 flips the client switch. This document defines the
authoritative owner of each side effect on the durable path.

## Ownership matrix

| Side effect                            | Owner (durable path)                | Idempotency key                                    | Notes                                                                 |
| -------------------------------------- | ----------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| Object in `generated-images` bucket    | `persist-generation-result.ts`      | Deterministic path `${mode}-${itemId}.png` + upsert| Retry re-uploads to the same key; storage layer treats as a no-op.    |
| `generated_images` row                 | `persist-generation-result.ts`      | Unique partial index on `generation_job_item_id`   | Reuse-on-lookup; race falls back to the winning row.                  |
| `asset_cost_events` row (generation)   | `persist-generation-result.ts`      | Unique partial index on `(generation_job_item_id, event_type)` | Server emits after row insert with provider/model/route/cost/currency/mode/status. |
| `prompt_history` row / linkage         | `persist-generation-result.ts`      | Unique partial index on `generation_job_item_id`   | Preserves the `(profile_id, mode, prompt)` dedupe: reuses existing prompt row and bumps `usage_count` exactly once. |
| `generation_job_items` completion      | `generate-single/index.ts` via RPC  | `complete_generation_item(item_id, lease_token)`   | Lease-guarded — invalidated leases return `false`, no double-completion. |
| `generation_jobs` aggregate            | DB trigger `update_generation_job_aggregate` | Recomputes from item counts; preserves `cancelled` | Handles mixed terminal outcomes (any success ⇒ `completed`).          |
| `generated_image_assets` versions      | *(unchanged, client-owned)*         | —                                                  | Upscale/derivative flows continue to own their asset rows.            |
| Ratio enforcement finalize             | Client Canvas + `finalize_ratio_enforcement` RPC | `ratio_enforcement_status`             | Server marks `pending` when provider adjusts; client uploads enforced image and finalizes. |

## Idempotency guarantees

Re-entering `persistGenerationResult` at any point in the sequence produces the
same terminal state:

1. **Before storage upload** — first upload writes the deterministic key; a
   retry re-writes the same key (upsert), producing the same object.
2. **After storage upload, before image insert** — retry sees no gallery row,
   re-uploads (idempotent), inserts the gallery row.
3. **After image insert, before cost event** — retry finds the row via
   `generation_job_item_id`, skips storage + insert, inserts the missing cost
   event.
4. **After cost event, before prompt history** — retry inserts only the
   prompt-history row/link.
5. **After prompt history** — retry is a full no-op; every existence check
   returns true.

Verified by `src/lib/durable-persist-idempotent.test.ts` with an in-memory repo
that enforces the real unique-index constraints.

## Concurrency

- Workers claim items via `claim_generation_item` (atomic, lease-based). Two
  workers racing on the same item cannot both hold the lease.
- Recovery worker (`recover-stale-jobs`) only picks up items whose lease has
  expired.
- If two writers still race the persist path (e.g. lease revocation mid-flight),
  the unique partial indexes on `generation_job_item_id` guarantee at most one
  gallery row, cost event, and prompt-history linkage.

## Non-goals for the durable path (kept client-side by design)

- **Poster-ratio enforcement.** Canvas API is browser-only; the server marks
  `ratio_enforcement_status = 'pending'` and the client completes the ratio
  finalize via `finalize_ratio_enforcement`.
- **Asset-version management** (`generated_image_assets`). Upscale/derivative
  UI flows own these rows.

## Deferred to later B1.2 sub-turns

- Deterministic test provider (next turn) — enables end-to-end tests without
  paid providers.
- `itemId`-scoped multi-item variant dispatch with bounded concurrency
  (next turn).
- Durable print-replay job type (following turn) — new job type that
  re-executes with preserved provider/model/seed and records replay lineage.
- Full SQL/RLS harness (following turn).
