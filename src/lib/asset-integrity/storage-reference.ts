/**
 * Turn 4A — one shared normalizer for Supabase Storage object identity.
 *
 * Everything in the asset lifecycle (resolver, promotion gate, lineage
 * validator, deletion planner, integrity scanner) must agree on what "the
 * same stored object" means. Comparing full URLs is unsafe: the same object
 * can appear as a public URL, a signed URL, a render/display URL, or a bare
 * bucket-relative path, with arbitrary cache-busting query parameters.
 *
 * Hard rules (frozen from Turn 3A):
 *   - `/storage/v1/render/image/...` is DISPLAY-ONLY. It never denotes a
 *     stored object identity and must never be persisted.
 *   - Signed URLs expire; the token is never part of identity and is never
 *     logged.
 *   - `blob:` / `data:` / provider-temporary URLs are not stored objects.
 */

export type StorageReferenceKind =
  | "object_public"
  | "object_signed"
  | "render_display"
  | "storage_path"
  | "external"
  | "local"
  | "malformed"
  | "empty";

export interface StorageObjectReference {
  kind: StorageReferenceKind;
  /** Bucket name when resolvable. */
  bucket: string | null;
  /** Decoded, bucket-relative object path when resolvable. */
  path: string | null;
  /** `bucket/path` — the stable identity key. Null when not a stored object. */
  identity: string | null;
  /** True when this reference denotes a durable stored object. */
  isStoredObject: boolean;
  /** True for render/image transformations (display-only). */
  isDisplayTransformation: boolean;
  /** True for blob:/data:/objecturl: */
  isLocal: boolean;
  /** True when the original input carried an expiring signature. */
  isSigned: boolean;
  /** Why the value was classified as malformed / external. */
  reason?: string;
}

const OBJECT_PUBLIC = "/storage/v1/object/public/";
const OBJECT_SIGN = "/storage/v1/object/sign/";
const OBJECT_AUTH = "/storage/v1/object/";
const RENDER_PUBLIC = "/storage/v1/render/image/public/";
const RENDER_SIGN = "/storage/v1/render/image/sign/";
const RENDER_AUTH = "/storage/v1/render/image/";

/**
 * Accepted Supabase Storage endpoint hosts. Any other host — even one whose
 * path mimics `/storage/v1/object/public/...` — is external, never identity.
 */
const SUPABASE_HOST_SUFFIXES = [".supabase.co", ".supabase.in", ".supabase.net"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "host.docker.internal"]);

export function isAcceptedStorageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  if (host === "supabase.co" || host === "supabase.in") return false;
  return SUPABASE_HOST_SUFFIXES.some((s) => host.endsWith(s));
}


function empty(reason?: string): StorageObjectReference {
  return {
    kind: "empty",
    bucket: null,
    path: null,
    identity: null,
    isStoredObject: false,
    isDisplayTransformation: false,
    isLocal: false,
    isSigned: false,
    reason,
  };
}

function malformed(reason: string): StorageObjectReference {
  return { ...empty(), kind: "malformed", reason };
}

/**
 * Validate + decode a bucket-relative object path.
 * Rejects traversal, absolute paths, empty segments and control characters.
 */
export function normalizeObjectPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;
  // Strip a leading slash but reject protocol-relative / absolute weirdness.
  if (value.startsWith("//")) return null;
  if (value.startsWith("/")) value = value.slice(1);

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || /[\u0000-\u001f]/.test(decoded)) return null;

  const segments = decoded.split("/");
  if (segments.length === 0) return null;
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return null;
  }
  return segments.join("/");
}

function fromPrefix(
  value: string,
  prefix: string,
  kind: StorageReferenceKind,
  opts: { signed?: boolean; display?: boolean } = {},
): StorageObjectReference {
  const idx = value.indexOf(prefix);
  const rest = value.slice(idx + prefix.length);
  // Query params / fragments never participate in object identity.
  const withoutQuery = rest.split("#")[0].split("?")[0];
  const slash = withoutQuery.indexOf("/");
  if (slash <= 0) return malformed("missing bucket or object path");
  const bucket = decodeURIComponent(withoutQuery.slice(0, slash));
  const path = normalizeObjectPath(withoutQuery.slice(slash + 1));
  if (!bucket || !path) return malformed("invalid bucket or object path");
  const display = !!opts.display;
  return {
    kind,
    bucket,
    path,
    identity: display ? null : `${bucket}/${path}`,
    isStoredObject: !display,
    isDisplayTransformation: display,
    isLocal: false,
    isSigned: !!opts.signed,
  };
}

/**
 * Classify any value that could refer to an image: URL, bucket-relative path,
 * local preview, or provider-temporary URL.
 *
 * @param value        the URL or path
 * @param defaultBucket bucket assumed for bare relative paths
 */
export function normalizeStorageObjectReference(
  value: string | null | undefined,
  defaultBucket = "generated-images",
): StorageObjectReference {
  if (value == null) return empty("null value");
  const raw = String(value).trim();
  if (!raw) return empty("empty value");

  if (/^(blob:|data:|objecturl:)/i.test(raw)) {
    return { ...empty(), kind: "local", isLocal: true, reason: "local preview url" };
  }

  const isUrl = /^https?:\/\//i.test(raw);

  if (isUrl) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return malformed("unparseable url");
    }
    const external = (reason: string): StorageObjectReference => ({
      ...empty(),
      kind: "external",
      reason,
    });
    if (!isAcceptedStorageHost(parsed.hostname)) {
      return external("host is not an accepted Supabase storage endpoint");
    }
    // Identity is derived from the pathname only — never substring matching,
    // so query strings and fragments can never fabricate a storage prefix.
    const pathname = parsed.pathname;
    if (pathname.startsWith(RENDER_PUBLIC)) {
      return fromPrefix(pathname, RENDER_PUBLIC, "render_display", { display: true });
    }
    if (pathname.startsWith(RENDER_SIGN)) {
      return fromPrefix(pathname, RENDER_SIGN, "render_display", { display: true, signed: true });
    }
    if (pathname.startsWith(OBJECT_PUBLIC)) {
      return fromPrefix(pathname, OBJECT_PUBLIC, "object_public");
    }
    if (pathname.startsWith(OBJECT_SIGN)) {
      return fromPrefix(pathname, OBJECT_SIGN, "object_signed", { signed: true });
    }
    if (pathname.startsWith(RENDER_AUTH)) {
      return fromPrefix(pathname, RENDER_AUTH, "render_display", { display: true });
    }
    if (pathname.startsWith(OBJECT_AUTH)) {
      return fromPrefix(pathname, OBJECT_AUTH, "object_signed", { signed: true });
    }
    return external("external or provider-temporary url");
  }


  // Bare, bucket-relative storage path.
  const path = normalizeObjectPath(raw.split("#")[0].split("?")[0]);
  if (!path) return malformed("unsafe or malformed storage path");
  return {
    kind: "storage_path",
    bucket: defaultBucket,
    path,
    identity: `${defaultBucket}/${path}`,
    isStoredObject: true,
    isDisplayTransformation: false,
    isLocal: false,
    isSigned: false,
  };
}

/** True when two references point at the same stored object. */
export function sameStorageObject(
  a: string | null | undefined,
  b: string | null | undefined,
  defaultBucket = "generated-images",
): boolean {
  const ra = normalizeStorageObjectReference(a, defaultBucket);
  const rb = normalizeStorageObjectReference(b, defaultBucket);
  return !!ra.identity && ra.identity === rb.identity;
}

/**
 * True when a value must never be written into a persisted
 * URL / storage-path column.
 */
export function isTransientAssetReference(value: string | null | undefined): boolean {
  const ref = normalizeStorageObjectReference(value);
  return (
    ref.isLocal ||
    ref.isDisplayTransformation ||
    ref.isSigned ||
    ref.kind === "external" ||
    ref.kind === "malformed"
  );
}

const TOKEN_PARAMS =
  /([?&](?:token|signature|sig|x-amz-signature|x-amz-credential|x-amz-security-token|jwt|apikey|api_key|access_token|refresh_token)=)[^&#]*/gi;


/** Redact signed tokens / credentials before logging any reference. */
export function redactStorageReference(value: string | null | undefined): string {
  if (!value) return "";
  const raw = String(value);
  if (/^data:/i.test(raw)) return "data:[redacted]";
  return raw.replace(TOKEN_PARAMS, "$1[redacted]");
}
