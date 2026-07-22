/**
 * collection-fingerprint — canonical deterministic identity hash for a
 * matching-collection submission (initial create or add-more).
 *
 * A fingerprint's ONLY job in this single-user tool is to prevent the
 * operator from accidentally submitting the same logical request twice
 * (double-click, network retry, form re-submit). It is NOT a
 * cross-user coordination token.
 *
 * Design rules:
 *   - Pure: same input → same fingerprint, always. No timestamps, no
 *     UUIDs, no `Math.random`.
 *   - Order-sensitive on subjects: subject order controls generated
 *     item position, so a reorder MUST produce a different fingerprint.
 *   - Whitespace / case tolerant on subjects (matches parseSubjects).
 *   - Stable canonical JSON serialization (sorted keys) before hashing.
 *   - Uses SHA-256 via SubtleCrypto when available; falls back to a
 *     deterministic FNV-1a 128-bit style hash so tests never require a
 *     web-crypto polyfill. Both paths are fully deterministic.
 */

import { GENERATION_REQUEST_VERSION } from "@/lib/generation-contract-v2";
import { ART_DIRECTION_VERSION, type ConsistencyStrength } from "./types";

export interface FingerprintInput {
  /** Existing collection id for add-more, or a stable creation namespace
   * ("create") for initial creation. Never a timestamp. */
  scope: string;
  subjects: string[];
  anchor: {
    imageId: string | null;
    imageUrl: string | null;
    widthPx: number | null;
    heightPx: number | null;
  };
  artDirectionVersion: number;
  consistencyStrength: ConsistencyStrength;
  posterFormatId: string | null;
  aspectRatio: string;
  backgroundStyle: string;
  resolvedProvider: string;
  resolvedModel: string;
  /** Optional; defaults to the current GenerationRequestV2 version. */
  contractVersion?: number;
}

/** Same subject-normalization semantics as `parseSubjects` (but pure). */
export function normalizeSubjectsForFingerprint(subjects: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of subjects) {
    if (typeof raw !== "string") continue;
    const collapsed = raw.replace(/\s+/g, " ").trim();
    if (!collapsed) continue;
    const key = collapsed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(collapsed);
  }
  return out;
}

/** Canonical JSON: object keys sorted recursively. Arrays keep order. */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

/** Deterministic 128-bit FNV-1a fallback hash (returns 32 hex chars). */
function fnv1a128(input: string): string {
  // Split into two 64-bit FNV-1a streams with different seeds to widen the
  // output without pulling in a crypto dep. Fully deterministic.
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  let a = 0xcbf29ce484222325n;
  let b = 0x84222325cbf29ce4n;
  const primeA = 0x100000001b3n;
  const primeB = 0x1b3100000001n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes) {
    a = ((a ^ BigInt(byte)) * primeA) & mask;
    b = ((b ^ BigInt(byte ^ 0x5a)) * primeB) & mask;
  }
  const hex = (n: bigint) => n.toString(16).padStart(16, "0");
  return `${hex(a)}${hex(b)}`;
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (!subtle) return fnv1a128(input);
  const bytes = new TextEncoder().encode(input);
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build the canonical payload string. Exposed for tests. */
export function buildFingerprintPayload(input: FingerprintInput): string {
  const normalized = {
    v: input.contractVersion ?? GENERATION_REQUEST_VERSION,
    scope: input.scope,
    subjects: normalizeSubjectsForFingerprint(input.subjects),
    anchor: {
      imageId: input.anchor.imageId ?? null,
      imageUrl: input.anchor.imageUrl ?? null,
      widthPx: input.anchor.widthPx ?? null,
      heightPx: input.anchor.heightPx ?? null,
    },
    ad: input.artDirectionVersion ?? ART_DIRECTION_VERSION,
    cs: input.consistencyStrength,
    pf: input.posterFormatId ?? null,
    ar: input.aspectRatio,
    bg: input.backgroundStyle,
    rp: input.resolvedProvider,
    rm: input.resolvedModel,
  };
  return canonicalStringify(normalized);
}

/** Deterministic hex fingerprint. */
export async function computeCollectionFingerprint(input: FingerprintInput): Promise<string> {
  return sha256Hex(buildFingerprintPayload(input));
}

/** Synchronous fallback for environments without SubtleCrypto. */
export function computeCollectionFingerprintSync(input: FingerprintInput): string {
  return fnv1a128(buildFingerprintPayload(input));
}
