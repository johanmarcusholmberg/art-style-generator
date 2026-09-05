/**
 * Typed upscale diagnostics — one shape carried through the sync route,
 * the async job route and the webhook, so a failure can always be
 * explained (and copied to the clipboard) instead of vanishing.
 *
 * The server merges these fields into `upscale_jobs.pipeline` WITHOUT
 * overwriting existing keys, so diagnostics survive every transition.
 */

import type { UpscalerId } from "@/lib/upscalers";
import type { PreflightCode } from "@/lib/upscale-preflight";

export interface UpscaleDiagnostics {
  /** Poster format the source was corrected to (if any). */
  posterFormatId?: string | null;
  /** Actual pixels of the bytes we sent (post ratio-correction). */
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  sourceMegapixels?: number | null;
  sourceWasCorrectedMaster?: boolean;
  /** Engine requested / resolved. */
  requestedUpscalerId?: UpscalerId | "auto" | null;
  resolvedUpscalerId?: UpscalerId | null;
  autoSelected?: boolean;
  /** Scale actually requested (may be decimal). */
  requestedScale?: number | null;
  /** Expected output at that scale. */
  expectedWidth?: number | null;
  expectedHeight?: number | null;
  /** Preflight outcome. */
  preflightCode?: PreflightCode | null;
  preflightReason?: string | null;
  envelopePixels?: number | null;
  /** Execution. */
  route?: "sync_direct" | "async_job" | null;
  jobId?: string | null;
  providerError?: string | null;
  stage?: string | null;
  at?: string;
}

/** Merge diagnostics without dropping previously recorded fields. */
export function mergeDiagnostics(
  existing: UpscaleDiagnostics | null | undefined,
  next: UpscaleDiagnostics,
): UpscaleDiagnostics {
  return { ...(existing ?? {}), ...next };
}

/** Human/dev readable block for the "Copy diagnostic" button. */
export function formatDiagnostics(d: UpscaleDiagnostics): string {
  const lines: string[] = ["Upscale diagnostic"];
  const push = (label: string, v: unknown) => {
    if (v === undefined || v === null || v === "") return;
    lines.push(`${label}: ${String(v)}`);
  };
  push("When", d.at ?? new Date().toISOString());
  push("Poster format", d.posterFormatId);
  push(
    "Source",
    d.sourceWidth && d.sourceHeight
      ? `${d.sourceWidth}×${d.sourceHeight}${
          d.sourceMegapixels ? ` (${d.sourceMegapixels} MP)` : ""
        }`
      : null,
  );
  push("Corrected master", d.sourceWasCorrectedMaster);
  push("Requested engine", d.requestedUpscalerId);
  push("Resolved engine", d.resolvedUpscalerId);
  push("Auto selected", d.autoSelected);
  push("Requested scale", d.requestedScale);
  push(
    "Expected output",
    d.expectedWidth && d.expectedHeight
      ? `${d.expectedWidth}×${d.expectedHeight}`
      : null,
  );
  push("Input envelope (px)", d.envelopePixels);
  push("Preflight", d.preflightCode);
  push("Preflight reason", d.preflightReason);
  push("Route", d.route);
  push("Job id", d.jobId);
  push("Stage", d.stage);
  push("Provider error", d.providerError);
  return lines.join("\n");
}
