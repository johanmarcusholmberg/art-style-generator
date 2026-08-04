/**
 * Turn 4B — exact master download.
 *
 * "Download master" must hand over the persisted object byte-for-byte:
 *   - no canvas re-encode
 *   - no bleed
 *   - no format conversion
 *   - no resizing
 *
 * Print Export stays a separate, centralized pipeline (`print-export.ts` /
 * `raw-download.ts`) — this module never touches it.
 */
import type { CanonicalActionSource } from "./source-resolver";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/tiff": "tiff",
};

/** Extension implied by the stored object path, when recognisable. */
export function extensionFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const m = path.split("?")[0].split("#")[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  return m ? m[1].toLowerCase() : null;
}

export function resolveMasterExtension(
  source: Pick<CanonicalActionSource, "path">,
  contentType?: string | null,
): string {
  const fromPath = extensionFromPath(source.path);
  if (fromPath) return fromPath === "jpeg" ? "jpg" : fromPath;
  const mime = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[mime] ?? "png";
}

/** Strip an existing extension so we never produce `name.png.png`. */
export function sanitizeMasterFilename(baseName: string): string {
  return (
    baseName
      .replace(/\.[a-zA-Z0-9]{2,5}$/, "")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "artwork"
  );
}

export function buildMasterFilename(
  baseName: string,
  source: Pick<CanonicalActionSource, "path">,
  contentType?: string | null,
): string {
  return `${sanitizeMasterFilename(baseName)}.${resolveMasterExtension(source, contentType)}`;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface MasterDownloadResult {
  filename: string;
  bytes: number;
  contentType: string;
  blob: Blob;
}

/**
 * Fetch the exact persisted bytes for a resolved canonical source.
 * Throws with an actionable message when the source is not downloadable.
 */
export async function fetchCanonicalMaster(
  source: CanonicalActionSource,
  baseName: string,
): Promise<MasterDownloadResult> {
  if (!source.ok || !source.url) {
    throw new Error(source.reason ?? "No persisted master available for download.");
  }
  if (source.kind === "session_preview") {
    throw new Error("Save this image to the gallery before downloading the master.");
  }

  const res = await fetch(source.url);
  if (!res.ok) {
    throw new Error(`Could not read the stored master (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error("The stored master is empty — repair the asset before exporting.");
  }
  const contentType = blob.type || res.headers.get("content-type") || "application/octet-stream";
  return {
    filename: buildMasterFilename(baseName, source, contentType),
    bytes: blob.size,
    contentType,
    blob,
  };
}

/** Fetch + save the exact persisted master. */
export async function downloadCanonicalMaster(
  source: CanonicalActionSource,
  baseName: string,
): Promise<MasterDownloadResult> {
  const result = await fetchCanonicalMaster(source, baseName);
  triggerBlobDownload(result.blob, result.filename);
  return result;
}
