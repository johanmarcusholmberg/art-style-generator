/**
 * Pure, dependency-injected state machine for the durable persist path.
 *
 * The Deno function `supabase/functions/_shared/persist-generation-result.ts`
 * mirrors this logic 1:1 against a real Supabase client. Vitest exercises the
 * state machine here through an in-memory repo to prove idempotency:
 *
 *   Retry entering at any point in the sequence must produce exactly one
 *   gallery row, one storage object, one cost event, and one prompt-history
 *   linkage per `generation_job_item_id`.
 *
 * Ownership boundary (B1.2): after B2 flips the client switch, all of these
 * side effects are owned by the server via this state machine, keyed by
 * `generation_job_item_id`. See `docs/side-effect-ownership.md`.
 */

export interface ExistingImageRow {
  id: string;
  storage_path: string;
}

export interface CostEventInput {
  event_type: string;
  provider: string | null;
  model: string | null;
  mode: string | null;
  estimated_cost: number | null;
  currency: string;
  status: "succeeded" | "failed" | "pending";
  metadata: Record<string, unknown>;
}

export interface PromptHistoryInput {
  profile_id: string;
  prompt: string;
  mode: string;
  provider: string | null;
  model: string | null;
  source_image_id: string | null;
  generation_job_id: string | null;
}

export interface ImageInsertInput {
  storage_path: string;
  generation_job_item_id: string;
  generation_job_id: string | null;
  // full parity payload passed through opaquely
  columns: Record<string, unknown>;
}

export interface DurableRepo {
  findImageByJobItemId(itemId: string): Promise<ExistingImageRow | null>;
  uploadStorageIdempotent(path: string, bytes: Uint8Array): Promise<void>;
  insertImage(input: ImageInsertInput): Promise<{ id: string }>;
  publicUrl(path: string): string;

  hasCostEventForItem(itemId: string, eventType: string): Promise<boolean>;
  insertCostEvent(
    itemId: string,
    galleryImageId: string,
    input: CostEventInput,
  ): Promise<void>;

  hasPromptHistoryForItem(itemId: string): Promise<boolean>;
  findPromptHistoryByDedupe(
    profileId: string,
    mode: string,
    prompt: string,
  ): Promise<{ id: string; usage_count: number } | null>;
  linkExistingPromptHistoryToItem(
    historyId: string,
    itemId: string,
    patch: Partial<PromptHistoryInput>,
  ): Promise<void>;
  insertPromptHistory(
    itemId: string,
    input: PromptHistoryInput,
  ): Promise<{ id: string }>;
}

export interface DurablePersistArgs {
  generationJobItemId: string;
  generationJobId: string | null;
  desiredStoragePath: string; // deterministic, e.g. `${mode}-${itemId}.png`
  bytes: Uint8Array;
  imageColumns: Record<string, unknown>; // full generated_images row payload
  costEvent: CostEventInput | null; // null = don't record (e.g. failed run)
  promptHistory: PromptHistoryInput | null; // null = skip (e.g. no profile)
}

export interface DurablePersistResult {
  galleryImageId: string;
  storagePath: string;
  publicUrl: string;
  reusedExistingRow: boolean;
  costEventInserted: boolean;
  promptHistoryInserted: boolean;
  promptHistoryLinked: boolean;
}

/**
 * Idempotent persist. Safe to re-enter at ANY point — the sequence checks
 * for existing state before every side effect.
 *
 * Order:
 *   1. Lookup gallery row by generation_job_item_id.
 *   2. Upload storage (upsert = true, deterministic path → idempotent).
 *   3. Insert gallery row if missing.
 *   4. Insert cost event unless one already exists for (item, event_type).
 *   5. Insert or link prompt-history unless one already exists for the item.
 */
export async function persistDurableGenerationResult(
  repo: DurableRepo,
  args: DurablePersistArgs,
): Promise<DurablePersistResult> {
  // 1. Reuse existing row if this worker (or a prior attempt) already got here.
  const existing = await repo.findImageByJobItemId(args.generationJobItemId);
  let storagePath = existing?.storage_path ?? args.desiredStoragePath;
  let galleryImageId = existing?.id ?? null;
  const reusedExistingRow = !!existing;

  // 2. Upload storage. Deterministic path + upsert makes this a no-op on retry.
  //    We always call this — the driver guarantees upsert semantics.
  if (!existing) {
    await repo.uploadStorageIdempotent(storagePath, args.bytes);
  }

  // 3. Insert gallery row if we don't have one yet.
  if (!galleryImageId) {
    const inserted = await repo.insertImage({
      storage_path: storagePath,
      generation_job_item_id: args.generationJobItemId,
      generation_job_id: args.generationJobId,
      columns: args.imageColumns,
    });
    galleryImageId = inserted.id;
  }

  // 4. Cost event — idempotent via unique index (job_item_id, event_type).
  let costEventInserted = false;
  if (args.costEvent) {
    const already = await repo.hasCostEventForItem(
      args.generationJobItemId,
      args.costEvent.event_type,
    );
    if (!already) {
      await repo.insertCostEvent(
        args.generationJobItemId,
        galleryImageId,
        args.costEvent,
      );
      costEventInserted = true;
    }
  }

  // 5. Prompt history — unique index on generation_job_item_id.
  //    Preserves (profile_id, mode, prompt) dedupe: if that combo already
  //    exists we link the item to that row (bumping usage_count exactly once)
  //    instead of trying to insert a duplicate.
  let promptHistoryInserted = false;
  let promptHistoryLinked = false;
  if (args.promptHistory) {
    const already = await repo.hasPromptHistoryForItem(args.generationJobItemId);
    if (!already) {
      const dedupe = await repo.findPromptHistoryByDedupe(
        args.promptHistory.profile_id,
        args.promptHistory.mode,
        args.promptHistory.prompt,
      );
      if (dedupe) {
        await repo.linkExistingPromptHistoryToItem(
          dedupe.id,
          args.generationJobItemId,
          {
            provider: args.promptHistory.provider,
            model: args.promptHistory.model,
            source_image_id: args.promptHistory.source_image_id,
            generation_job_id: args.promptHistory.generation_job_id,
          },
        );
        promptHistoryLinked = true;
      } else {
        await repo.insertPromptHistory(
          args.generationJobItemId,
          args.promptHistory,
        );
        promptHistoryInserted = true;
      }
    }
  }

  return {
    galleryImageId,
    storagePath,
    publicUrl: repo.publicUrl(storagePath),
    reusedExistingRow,
    costEventInserted,
    promptHistoryInserted,
    promptHistoryLinked,
  };
}

/**
 * Deterministic storage filename derived from the item id. Retries within a
 * single item MUST produce the same path so `upsert:true` is a real no-op.
 */
export function deterministicStoragePath(
  mode: string,
  generationJobItemId: string,
): string {
  const safeMode = (mode || "gen").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "gen";
  return `${safeMode}-${generationJobItemId}.png`;
}
