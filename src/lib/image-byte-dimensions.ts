/**
 * Pure, dependency-free image header decoder.
 *
 * Measures the REAL encoded pixel dimensions of an image from its bytes.
 * This is the single source of truth for "actual" image dimensions —
 * provider-reported width/height are diagnostics only.
 *
 * A byte-identical mirror lives at
 * `supabase/functions/_shared/image-dimensions.ts` for the Deno runtime.
 * Keep both in sync — `image-byte-dimensions.test.ts` asserts parity.
 *
 * Supported: PNG, JPEG, WebP (VP8/VP8L/VP8X), GIF.
 */

export interface DecodedImageDimensions {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp" | "gif";
}

function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
}
function u32le(b: Uint8Array, o: number): number {
  return b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + ((b[o + 3] << 24) >>> 0);
}
function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) + b[o + 1];
}
function ascii(b: Uint8Array, o: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[o + i]);
  return s;
}

/**
 * Decode width/height from image bytes. Returns `null` when the format is
 * unsupported or the header is truncated/corrupt.
 */
export function decodeImageDimensions(
  bytes: Uint8Array,
): DecodedImageDimensions | null {
  if (!bytes || bytes.length < 16) return null;

  // ── PNG ───────────────────────────────────────────────────────────────
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return null;
    const width = u32be(bytes, 16);
    const height = u32be(bytes, 20);
    return width > 0 && height > 0 ? { width, height, format: "png" } : null;
  }

  // ── GIF ───────────────────────────────────────────────────────────────
  if (ascii(bytes, 0, 3) === "GIF") {
    const width = bytes[6] + (bytes[7] << 8);
    const height = bytes[8] + (bytes[9] << 8);
    return width > 0 && height > 0 ? { width, height, format: "gif" } : null;
  }

  // ── WebP ──────────────────────────────────────────────────────────────
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X" && bytes.length >= 30) {
      const width = 1 + (bytes[24] + (bytes[25] << 8) + (bytes[26] << 16));
      const height = 1 + (bytes[27] + (bytes[28] << 8) + (bytes[29] << 16));
      return width > 0 && height > 0 ? { width, height, format: "webp" } : null;
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      const width = (bytes[26] + (bytes[27] << 8)) & 0x3fff;
      const height = (bytes[28] + (bytes[29] << 8)) & 0x3fff;
      return width > 0 && height > 0 ? { width, height, format: "webp" } : null;
    }
    if (chunk === "VP8L" && bytes.length >= 25) {
      const bits = u32le(bytes, 21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return width > 0 && height > 0 ? { width, height, format: "webp" } : null;
    }
    return null;
  }

  // ── JPEG ──────────────────────────────────────────────────────────────
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let o = 2;
    while (o + 9 < bytes.length) {
      if (bytes[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = bytes[o + 1];
      // Standalone markers without a length payload.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break; // EOI / start of scan
      const len = u16be(bytes, o + 2);
      if (len < 2) return null;
      // SOF0..SOF15 except DHT(c4), JPGA(c8), DAC(cc)
      const isSOF =
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        if (o + 9 >= bytes.length) return null;
        const height = u16be(bytes, o + 5);
        const width = u16be(bytes, o + 7);
        return width > 0 && height > 0 ? { width, height, format: "jpeg" } : null;
      }
      o += 2 + len;
    }
    return null;
  }

  return null;
}

/**
 * Positive-integer guard used by the metadata completeness invariant.
 */
export function isValidPixelDimension(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && Number.isInteger(v);
}
