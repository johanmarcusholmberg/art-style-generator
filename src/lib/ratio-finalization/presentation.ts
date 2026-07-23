/**
 * Pure presentation + enqueue-eligibility helpers for the durable
 * generation path. No React, no Supabase — safe to unit test.
 *
 * `deriveDurableResultPresentation` turns a durable item snapshot into a
 * discrete phase the UI can render without duplicating status logic.
 *
 * `shouldEnqueueRatioFinalization` centralises the rule for when the
 * client may claim a ratio-finalization slot for an item.
 */

export type DurableResultPhase =
  | "idle"
  | "generating"
  | "generation_failed"
  | "format_processing"
  | "format_failed"
  | "format_ready_corrected"
  | "format_ready_not_required"
  | "format_unverified";

export interface DurableItemSnapshot {
  status: string | null;
  ratioStatus: string | null;
  errorMessage?: string | null;
  imageUrl?: string | null;
  enforcedImageUrl?: string | null;
  rawImageUrl?: string | null;
  storagePath?: string | null;
  correctedMasterStoragePath?: string | null;
  correctedMasterWidth?: number | null;
  correctedMasterHeight?: number | null;
  /** For not_required: caller has confirmed persisted source matches format. */
  ratioMatchesFormat?: boolean;
}

export interface DurableResultPresentation {
  phase: DurableResultPhase;
  imageUrl: string | null;
  storagePath: string | null;
  width: number | null;
  height: number | null;
  errorMessage: string | null;
  canRetryFormat: boolean;
  canRetryGeneration: boolean;
  showFinalizingSpinner: boolean;
  hasReadyImage: boolean;
}

function positive(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

export function deriveDurableResultPresentation(
  snap: DurableItemSnapshot | null | undefined,
): DurableResultPresentation {
  const base: DurableResultPresentation = {
    phase: "idle",
    imageUrl: null,
    storagePath: null,
    width: null,
    height: null,
    errorMessage: null,
    canRetryFormat: false,
    canRetryGeneration: false,
    showFinalizingSpinner: false,
    hasReadyImage: false,
  };
  if (!snap) return base;

  const status = snap.status;
  const rat = snap.ratioStatus;
  const err = snap.errorMessage ?? null;

  if (status === "queued" || status === "dispatching" || status === "processing") {
    return { ...base, phase: "generating" };
  }
  if (status === "failed") {
    return { ...base, phase: "generation_failed", errorMessage: err, canRetryGeneration: true };
  }
  if (status !== "completed") return base;

  // Completed generation. Now branch on ratio state.
  if (rat === "processing" || rat === "pending") {
    return { ...base, phase: "format_processing", showFinalizingSpinner: true };
  }
  if (rat === "failed") {
    return { ...base, phase: "format_failed", errorMessage: err, canRetryFormat: true };
  }
  if (rat === "completed") {
    const path = snap.correctedMasterStoragePath ?? null;
    const w = positive(snap.correctedMasterWidth ?? null);
    const h = positive(snap.correctedMasterHeight ?? null);
    if (!path || !w || !h) {
      return { ...base, phase: "format_unverified", imageUrl: snap.enforcedImageUrl ?? snap.imageUrl ?? snap.rawImageUrl ?? null };
    }
    return {
      ...base,
      phase: "format_ready_corrected",
      imageUrl: snap.enforcedImageUrl ?? snap.imageUrl ?? snap.rawImageUrl ?? null,
      storagePath: path,
      width: w,
      height: h,
      hasReadyImage: true,
    };
  }
  if (rat === "not_required") {
    const path = snap.storagePath ?? null;
    const url = snap.imageUrl ?? snap.rawImageUrl ?? null;
    if (path && snap.ratioMatchesFormat === true) {
      return {
        ...base,
        phase: "format_ready_not_required",
        imageUrl: url,
        storagePath: path,
        hasReadyImage: true,
      };
    }
    return { ...base, phase: "format_unverified", imageUrl: url, storagePath: path };
  }
  // Unknown ratio status on a completed item — treat as unverified.
  return {
    ...base,
    phase: "format_unverified",
    imageUrl: snap.enforcedImageUrl ?? snap.imageUrl ?? snap.rawImageUrl ?? null,
  };
}

/**
 * When may the client enqueue this item for ratio finalization?
 *
 *   - Item must be `completed`.
 *   - `pending` → always eligible.
 *   - `processing` → only when the lease is missing or expired.
 *   - `failed` / `completed` / `not_required` / unknown → never (retry
 *     path handles `failed` explicitly via retry RPC).
 */
export function shouldEnqueueRatioFinalization(input: {
  itemStatus: string | null | undefined;
  ratioStatus: string | null | undefined;
  leaseExpiresAt: string | null | undefined;
  now: number;
}): boolean {
  if (input.itemStatus !== "completed") return false;
  const s = input.ratioStatus;
  if (s === "pending") return true;
  if (s === "processing") {
    const raw = input.leaseExpiresAt;
    if (!raw) return true;
    const t = Date.parse(raw);
    if (!Number.isFinite(t)) return true;
    return t < input.now;
  }
  return false;
}
