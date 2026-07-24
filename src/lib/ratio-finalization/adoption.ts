/**
 * Canonical-adoption helper for the durable single-image path.
 *
 * `adoptDurableCanonicalAsset(itemId)` loads DB truth for a durable
 * generation item, validates that the terminal ratio state has a
 * matching persisted asset identity, and returns the fields the
 * generator UI must adopt before it may clear the durable pointer.
 *
 * The caller (ImageGenerator) is responsible for actually writing the
 * returned identity into React state — this module stays UI-free so it
 * can be unit-tested against a mocked repository.
 *
 * Design notes (Sub-turn C2.b):
 *   - Success is returned ONLY when the canonical row provides the
 *     complete corrected-master identity (path + URL + positive w/h)
 *     for `completed`, or the verified persisted source identity for
 *     `not_required`. A queue outcome alone is never treated as truth.
 *   - Transient incompleteness (row exists but master fields are still
 *     being written) is reported as `retryable` so the caller can
 *     re-attempt with a small bounded delay instead of clearing state.
 *   - Failure to load or a non-terminal ratio status is returned as
 *     `retryable: false` with a specific reason so the UI can surface a
 *     "Reload result" action without regenerating.
 */
import {
  loadDurableCanonicalAsset,
  type DurableCanonicalAsset,
} from "./repository";

export interface CanonicalAdoption {
  itemId: string;
  ratioStatus: "completed" | "not_required";
  imageUrl: string;
  storagePath: string;
  width: number;
  height: number;
  galleryImageId: string | null;
  /**
   * True when the adopted identity is the persisted corrected master
   * (post-finalization). False for `not_required` where the persisted
   * source doubles as the anchor.
   */
  isCorrectedMaster: boolean;
}

export type CanonicalAdoptionFailureReason =
  | "not-found"
  | "not-terminal"
  | "missing-corrected-master"
  | "missing-source"
  | "ratio-mismatch"
  | "load-error";

export type CanonicalAdoptionResult =
  | { status: "adopted"; asset: CanonicalAdoption }
  | {
      status: "incomplete";
      reason: CanonicalAdoptionFailureReason;
      /** Caller should retry after a short delay. */
      retryable: boolean;
      message: string;
    };

export interface AdoptDurableCanonicalAssetOptions {
  /** DI seam for tests. Defaults to real Supabase-backed loader. */
  load?: (itemId: string) => Promise<DurableCanonicalAsset | null>;
  /** DI seam for tests. Defaults to public URL from the loader. */
  resolvePublicUrl?: (storagePath: string) => string | null;
  /** Optional caller-supplied confirmation that persisted source matches format. */
  ratioMatchesFormat?: boolean;
}

function positive(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

export async function adoptDurableCanonicalAsset(
  itemId: string,
  opts: AdoptDurableCanonicalAssetOptions = {},
): Promise<CanonicalAdoptionResult> {
  let canonical: DurableCanonicalAsset | null = null;
  try {
    canonical = await (opts.load ?? loadDurableCanonicalAsset)(itemId);
  } catch (err) {
    return {
      status: "incomplete",
      reason: "load-error",
      retryable: true,
      message: err instanceof Error ? err.message : "Failed to load canonical asset",
    };
  }
  if (!canonical) {
    return {
      status: "incomplete",
      reason: "not-found",
      retryable: true,
      message: "Canonical row not yet visible",
    };
  }
  if (canonical.itemStatus !== "completed") {
    return {
      status: "incomplete",
      reason: "not-terminal",
      retryable: false,
      message: `Item status is ${canonical.itemStatus}, not completed`,
    };
  }

  const rat = canonical.ratioStatus;
  if (rat === "completed") {
    const path = canonical.masterStoragePath ?? null;
    const w = positive(canonical.masterWidth);
    const h = positive(canonical.masterHeight);
    if (!path || !w || !h) {
      return {
        status: "incomplete",
        reason: "missing-corrected-master",
        retryable: true,
        message: "Corrected master not yet persisted",
      };
    }
    const url =
      (opts.resolvePublicUrl ? opts.resolvePublicUrl(path) : null) ??
      canonical.enforcedImageUrl ??
      canonical.imageUrl ??
      canonical.rawImageUrl;
    if (!url) {
      return {
        status: "incomplete",
        reason: "missing-corrected-master",
        retryable: true,
        message: "Corrected master URL not resolvable",
      };
    }
    return {
      status: "adopted",
      asset: {
        itemId: canonical.itemId,
        ratioStatus: "completed",
        imageUrl: url,
        storagePath: path,
        width: w,
        height: h,
        galleryImageId: canonical.galleryImageId,
        isCorrectedMaster: true,
      },
    };
  }
  if (rat === "not_required") {
    const path = canonical.storagePath ?? null;
    const w = positive(canonical.masterWidth);
    const h = positive(canonical.masterHeight);
    if (!path || !w || !h) {
      return {
        status: "incomplete",
        reason: "missing-source",
        retryable: true,
        message: "Persisted source not yet available",
      };
    }
    if (opts.ratioMatchesFormat !== true) {
      return {
        status: "incomplete",
        reason: "ratio-mismatch",
        retryable: false,
        message: "Persisted source ratio not verified against format",
      };
    }
    const url =
      (opts.resolvePublicUrl ? opts.resolvePublicUrl(path) : null) ??
      canonical.enforcedImageUrl ??
      canonical.imageUrl ??
      canonical.rawImageUrl;
    if (!url) {
      return {
        status: "incomplete",
        reason: "missing-source",
        retryable: true,
        message: "Persisted source URL not resolvable",
      };
    }
    return {
      status: "adopted",
      asset: {
        itemId: canonical.itemId,
        ratioStatus: "not_required",
        imageUrl: url,
        storagePath: path,
        width: w,
        height: h,
        galleryImageId: canonical.galleryImageId,
        isCorrectedMaster: false,
      },
    };
  }
  return {
    status: "incomplete",
    reason: "not-terminal",
    retryable: rat === "pending" || rat === "processing",
    message: `Ratio status is ${rat ?? "unknown"}`,
  };
}

/**
 * Convenience wrapper: retry adoption a bounded number of times when
 * the canonical row is temporarily incomplete. Never re-runs
 * finalization — only re-reads DB truth.
 */
export async function adoptWithBoundedRetry(
  itemId: string,
  opts: AdoptDurableCanonicalAssetOptions & {
    attempts?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<CanonicalAdoptionResult> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const delay = Math.max(0, opts.delayMs ?? 400);
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let last: CanonicalAdoptionResult | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await adoptDurableCanonicalAsset(itemId, opts);
    if (last.status === "adopted") return last;
    if (!last.retryable) return last;
    if (i < attempts - 1) await sleep(delay);
  }
  return (
    last ?? {
      status: "incomplete",
      reason: "load-error",
      retryable: true,
      message: "No attempts made",
    }
  );
}
