/**
 * Turn 4B — the ONE shared source contract for Download and Print Export.
 *
 * Every customer-facing "Download" / "Export" / "ZIP" action in the app must
 * resolve its bytes through this module. It answers a single question:
 *
 *     "Which persisted object do I read, and am I allowed to read it?"
 *
 * Frozen rules (inherited from Turn 3A / Turn 4A, re-enforced here):
 *   - `/storage/v1/render/image/...` is display-only. It is NEVER an action
 *     source — downloading it would hand the user a resized WebP.
 *   - `blob:` / `data:` / provider-temporary URLs are not persisted and can
 *     only be used for the in-session generator preview, never for a
 *     "download master" action.
 *   - Signed URLs expire; they are acceptable as a *transport* for an
 *     already-identified object, but never as identity.
 *   - Exports always start from the canonical master, never from a preview
 *     or a web derivative.
 *
 * The pure function `resolveActionSourceFromRow` works on any row-ish object
 * (gallery row, admin row, generated image) and needs no network. The async
 * `loadCanonicalActionSource` re-reads persisted truth through the Turn 4A
 * asset graph when a component must not trust its own local state.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  normalizeStorageObjectReference,
  type StorageObjectReference,
} from "./storage-reference";
import { loadAssetGraph } from "./graph-loader";
import { resolveAssetIdentity } from "./resolver";
import type { AssetImageLike } from "@/lib/image-assets";

export type ActionSourceKind =
  /** Canonical master (ratio-corrected / upscaled / original master). */
  | "canonical_master"
  /** Original generator output — used for explicit "Original" actions. */
  | "original"
  /** Not persisted yet: in-session generator output only. */
  | "session_preview"
  /** Nothing usable. */
  | "unavailable";

export type ActionIntent = "download_master" | "download_original" | "print_export";

export interface CanonicalActionSource {
  /** True when the action may proceed. */
  ok: boolean;
  kind: ActionSourceKind;
  /** Exact-bytes URL. Never a render/image transformation URL. */
  url: string | null;
  bucket: string | null;
  /** Bucket-relative object path, when the source is persisted. */
  path: string | null;
  width: number | null;
  height: number | null;
  /** User-facing label — must match what the button promises. */
  label: string;
  /** Why the source was rejected (null when ok). */
  reason: string | null;
  warnings: string[];
}

const BUCKET = "generated-images";

export function publicUrlFor(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function unavailable(reason: string): CanonicalActionSource {
  return {
    ok: false,
    kind: "unavailable",
    url: null,
    bucket: null,
    path: null,
    width: null,
    height: null,
    label: "Unavailable",
    reason,
    warnings: [],
  };
}

/**
 * Reject any value that must never back a download / export action.
 * Returns the normalized reference when the value is usable.
 */
export function classifyActionCandidate(
  value: string | null | undefined,
  bucket = BUCKET,
): { ref: StorageObjectReference; usable: boolean; reason: string | null } {
  const ref = normalizeStorageObjectReference(value, bucket);
  if (ref.isDisplayTransformation) {
    return { ref, usable: false, reason: "display-only transformation URL" };
  }
  if (ref.isLocal) {
    return { ref, usable: false, reason: "unsaved in-session image" };
  }
  if (ref.kind === "malformed" || ref.kind === "empty") {
    return { ref, usable: false, reason: "missing or malformed source reference" };
  }
  if (ref.kind === "external") {
    return { ref, usable: false, reason: "external provider URL is not a persisted asset" };
  }
  return { ref, usable: true, reason: null };
}

export interface ResolveActionSourceOptions {
  intent: ActionIntent;
  /** Injected so the resolver stays testable without Supabase. */
  urlBuilder?: (bucket: string, path: string) => string;
}

/**
 * Pure resolution from a persisted row.
 *
 * `download_master` / `print_export` → canonical master
 * `download_original`                → base/original asset
 */
export function resolveActionSourceFromRow(
  row: AssetImageLike | null | undefined,
  opts: ResolveActionSourceOptions,
): CanonicalActionSource {
  if (!row) return unavailable("No image selected");
  const build = opts.urlBuilder ?? publicUrlFor;
  const warnings: string[] = [];

  const wantOriginal = opts.intent === "download_original";

  const pathCandidates = wantOriginal
    ? [row.original_storage_path, row.storage_path]
    : [row.master_storage_path, row.enhanced_storage_path, row.storage_path, row.original_storage_path];

  for (const p of pathCandidates) {
    const { ref, usable } = classifyActionCandidate(p);
    if (usable && ref.path) {
      const isMaster = !wantOriginal && (p === row.master_storage_path || p === row.enhanced_storage_path);
      if (!wantOriginal && !isMaster) {
        warnings.push("No enhanced master stored — using the original generated image.");
      }
      return {
        ok: true,
        kind: wantOriginal ? "original" : isMaster ? "canonical_master" : "original",
        url: build(ref.bucket ?? BUCKET, ref.path),
        bucket: ref.bucket ?? BUCKET,
        path: ref.path,
        width: isMaster
          ? row.enhanced_width_px ?? row.actual_width_px ?? null
          : row.base_width_px ?? row.actual_width_px ?? null,
        height: isMaster
          ? row.enhanced_height_px ?? row.actual_height_px ?? null
          : row.base_height_px ?? row.actual_height_px ?? null,
        label: wantOriginal ? "Original" : isMaster ? "Print master" : "Original",
        reason: null,
        warnings,
      };
    }
  }

  // No storage path — fall back to a persisted URL column, but only when it
  // is a real storage object (never a render/blob/external URL).
  const urlCandidates = wantOriginal
    ? [row.publicUrl]
    : [row.masterUrl, row.enhancedUrl, row.publicUrl];

  for (const u of urlCandidates) {
    const { ref, usable } = classifyActionCandidate(u);
    if (usable && ref.path) {
      return {
        ok: true,
        kind: wantOriginal ? "original" : "canonical_master",
        url: build(ref.bucket ?? BUCKET, ref.path),
        bucket: ref.bucket ?? BUCKET,
        path: ref.path,
        width: row.actual_width_px ?? null,
        height: row.actual_height_px ?? null,
        label: wantOriginal ? "Original" : "Print master",
        reason: null,
        warnings,
      };
    }
  }

  return unavailable(
    "No persisted master is available for this image — save or re-generate it first.",
  );
}

/**
 * Resolve an in-session generator image.
 *
 * Turn 4B closure: an unsaved image (`blob:` / `data:`) or a provider-temporary
 * URL is NEVER an action source — not for an exact master download and not for
 * a print export. The user must wait for durable persistence and poster-format
 * finalization before either action becomes available.
 */
export function resolveSessionActionSource(
  imageUrl: string | null | undefined,
  intent: ActionIntent,
): CanonicalActionSource {
  const { ref, usable, reason } = classifyActionCandidate(imageUrl);
  if (usable && ref.path) {
    return {
      ok: true,
      kind: intent === "download_original" ? "original" : "canonical_master",
      url: publicUrlFor(ref.bucket ?? BUCKET, ref.path),
      bucket: ref.bucket ?? BUCKET,
      path: ref.path,
      width: null,
      height: null,
      label: intent === "download_original" ? "Original" : "Print master",
      reason: null,
      warnings: [],
    };
  }
  if (ref.isLocal || ref.kind === "external") {
    return unavailable(
      "This image is not saved yet — wait for it to be stored and format-finalized before downloading or exporting.",
    );
  }
  return unavailable(reason ?? "No usable source image");
}


/**
 * Authoritative, network-backed resolution. Rebuilds the Turn 4A asset graph
 * so component state can never smuggle in a stale or display-only source.
 */
export async function loadCanonicalActionSource(
  rootImageId: string,
  intent: ActionIntent = "download_master",
): Promise<CanonicalActionSource> {
  const graph = await loadAssetGraph(rootImageId);
  const identity = resolveAssetIdentity({ graph, publicUrlFor });

  if (!identity.canonicalPath || !identity.canonicalMasterUrl) {
    return unavailable(
      identity.errors[0]?.message ?? "No canonical master is persisted for this image.",
    );
  }
  const canonical = graph.assets.find((a) => a.id === identity.canonicalMasterAssetId) ?? null;
  const warnings = identity.warnings.map((w) => w.message ?? w.code);
  if (!identity.lineageValid) {
    warnings.push("Asset lineage has unresolved issues — verify the file before selling it.");
  }

  return {
    ok: true,
    kind: intent === "download_original" ? "original" : "canonical_master",
    url: identity.canonicalMasterUrl,
    bucket: identity.canonicalBucket,
    path: identity.canonicalPath,
    width: canonical?.width ?? null,
    height: canonical?.height ?? null,
    label: intent === "download_original" ? "Original" : "Print master",
    reason: null,
    warnings,
  };
}

/** Short, user-facing description of what an action will produce. */
export function describeActionSource(src: CanonicalActionSource): string {
  if (!src.ok) return src.reason ?? "Unavailable";
  const dims = src.width && src.height ? ` · ${src.width}×${src.height} px` : "";
  return `${src.label}${dims}`;
}
