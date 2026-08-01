/**
 * Turn 4A — read-only asset integrity scanner.
 *
 * Pure and non-destructive by construction: it takes already-loaded snapshots
 * and returns structured findings. It performs no writes and no deletions.
 */
import { assetIssue, type AssetIssue } from "./errors";
import {
  hasValidDimensions,
  isUsableAsset,
  type AssetGraph,
  type AssetRecord,
} from "./model";
import { validateCropBox, validateLineage } from "./promotion";
import {
  normalizeStorageObjectReference,
  redactStorageReference,
} from "./storage-reference";
import { assetOperationKey, type AssetOperationIdentity } from "./idempotency";

export type IntegrityFinding = AssetIssue;

export interface IntegrityScanInput {
  graphs: AssetGraph[];
  /** Object identities (`bucket/path`) discovered in storage, when listable. */
  storageObjects?: string[];
  /** Operation identity per asset, for duplicate detection. */
  identityOf?: (a: AssetRecord) => AssetOperationIdentity | null;
}

export interface IntegrityScanResult {
  findings: IntegrityFinding[];
  scannedAssets: number;
  scannedGraphs: number;
  errorCount: number;
  warningCount: number;
}

export function scanAssetIntegrity(input: IntegrityScanInput): IntegrityScanResult {
  const findings: IntegrityFinding[] = [];
  let scannedAssets = 0;
  const referenced = new Set<string>();

  for (const graph of input.graphs) {
    for (const a of graph.assets) {
      scannedAssets += 1;
      const identity = a.path ? `${a.bucket ?? "generated-images"}/${a.path}` : null;
      if (identity && isUsableAsset(a)) referenced.add(identity);

      // row without storage object
      if (a.storageObjectExists === false) {
        findings.push(
          assetIssue("ASSET_STORAGE_OBJECT_MISSING", "error", {
            assetId: a.id,
            bucket: a.bucket,
            path: a.path,
            suggestedAction: "Relink to a verified object or re-render.",
          }),
        );
      }

      // persisted URL hygiene
      if (a.url) {
        const ref = normalizeStorageObjectReference(a.url, a.bucket ?? "generated-images");
        const shared = {
          assetId: a.id,
          bucket: a.bucket,
          path: redactStorageReference(a.url).slice(0, 200),
        };
        if (ref.isDisplayTransformation) {
          findings.push(
            assetIssue("ASSET_TRANSIENT_URL_REJECTED", "error", {
              ...shared,
              message: "A Supabase render/image display URL is persisted as an asset source.",
              suggestedAction: "Clear the URL and restore the canonical storage path.",
            }),
          );
        } else if (ref.isLocal) {
          findings.push(
            assetIssue("ASSET_TRANSIENT_URL_REJECTED", "error", {
              ...shared,
              message: "A local blob:/data: URL is persisted as an asset source.",
            }),
          );
        } else if (ref.isSigned) {
          findings.push(
            assetIssue("ASSET_TRANSIENT_URL_REJECTED", "error", {
              ...shared,
              message: "An expiring signed URL is persisted as asset identity.",
            }),
          );
        } else if (ref.kind === "external") {
          findings.push(
            assetIssue("ASSET_TRANSIENT_URL_REJECTED", "warning", {
              ...shared,
              message: "An external provider URL is persisted after the persistence stage.",
            }),
          );
        } else if (ref.kind === "malformed") {
          findings.push(assetIssue("ASSET_STORAGE_PATH_INVALID", "error", shared));
        }
      }

      // dimensions
      if (
        (a.isCanonical || a.role === "canonical_master" || a.role === "upscaled_master") &&
        !hasValidDimensions(a)
      ) {
        findings.push(assetIssue("ASSET_DIMENSIONS_INVALID", "error", { assetId: a.id }));
      }

      // archived/deleted but still canonical
      if (a.isCanonical && !isUsableAsset(a)) {
        findings.push(assetIssue("ASSET_ARCHIVED_CANONICAL", "error", { assetId: a.id }));
      }

      // format derivative specifics
      if (a.role === "format_derivative") {
        if (!a.targetFormat) {
          findings.push(assetIssue("ASSET_FORMAT_TARGET_MISSING", "error", { assetId: a.id }));
        }
        if (!validateCropBox(a)) {
          findings.push(assetIssue("ASSET_CROP_BOX_INVALID", "error", { assetId: a.id }));
        }
      }
    }

    // lineage (missing parent, cycles, cross-root, multiple canonical)
    findings.push(...validateLineage(graph).issues);

    // duplicate operation identity
    if (input.identityOf) {
      const seen = new Map<string, string>();
      for (const a of graph.assets) {
        if (a.deletedAt) continue;
        const op = input.identityOf(a);
        if (!op) continue;
        const key = assetOperationKey(op);
        const prev = seen.get(key);
        if (prev) {
          findings.push(
            assetIssue("ASSET_DUPLICATE_OPERATION", "warning", {
              assetId: a.id,
              relatedAssetIds: [prev],
              suggestedAction: "Archive the duplicate row for this operation.",
            }),
          );
        } else {
          seen.set(key, a.id);
        }
      }
    }

    // shared storage object across rows where sharing was not intended
    const byIdentity = new Map<string, string[]>();
    for (const a of graph.assets) {
      if (!a.path || !isUsableAsset(a)) continue;
      const id = `${a.bucket ?? "generated-images"}/${a.path}`;
      byIdentity.set(id, [...(byIdentity.get(id) ?? []), a.id]);
    }
    for (const [id, ids] of byIdentity) {
      if (ids.length > 1) {
        const [bucket, ...rest] = id.split("/");
        findings.push(
          assetIssue("ASSET_DUPLICATE_OPERATION", "warning", {
            assetId: ids[0],
            relatedAssetIds: ids.slice(1),
            bucket,
            path: rest.join("/"),
            message: "Several rows reference the same storage object.",
            suggestedAction: "Confirm sharing was intended before any cleanup.",
          }),
        );
      }
    }
  }

  // storage object with no database reference (only when a listing was given)
  for (const obj of input.storageObjects ?? []) {
    if (!referenced.has(obj)) {
      const [bucket, ...rest] = obj.split("/");
      findings.push(
        assetIssue("ASSET_STORAGE_CLEANUP_FAILED", "warning", {
          bucket,
          path: rest.join("/"),
          message: "Storage object has no live database reference.",
          suggestedAction: "Verify before any cleanup — never delete on filename similarity.",
        }),
      );
    }
  }

  // Several validators can surface the same defect; report each defect once.
  const deduped: IntegrityFinding[] = [];
  const seenFindings = new Set<string>();
  for (const f of findings) {
    // Keyed by asset when known, otherwise by object — the same defect on the
    // same asset must not be reported twice by two different validators.
    const key = f.assetId
      ? `${f.code}|asset:${f.assetId}`
      : `${f.code}|obj:${f.bucket ?? "-"}/${f.path ?? "-"}`;
    if (seenFindings.has(key)) continue;
    seenFindings.add(key);
    deduped.push(f);
  }

  return {
    findings: deduped,
    scannedAssets,
    scannedGraphs: input.graphs.length,
    errorCount: deduped.filter((f) => f.severity === "error").length,
    warningCount: deduped.filter((f) => f.severity === "warning").length,
  };
}
