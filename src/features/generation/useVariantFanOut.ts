/**
 * useVariantFanOut — generate N variants in parallel through the
 * existing generation router. No router/provider/prompt changes.
 *
 * Each "tile" holds independent state so per-tile retries and discards
 * never affect siblings. Failures inside one tile do not throw out of
 * `start()` — they are captured into that tile's error.
 *
 * Callers pass an explicit array of requests (typically one per selected
 * generator) so the fan-out can span multiple providers in a single run.
 */
import { useCallback, useRef, useState } from "react";
import { generateImage } from "@/lib/generation-router";
import { supportsDeterministicSeedReplay } from "@/lib/provider-print-sizing";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";

export type VariantStatus = "idle" | "loading" | "done" | "error";

export interface VariantTile {
  id: number;
  status: VariantStatus;
  /** Optional provider label — shown even before the response returns. */
  providerLabel?: string;
  response?: NormalizedGenerationResponse;
  error?: string;
}

/** Outcome of a `keepAtPrintResolution` attempt. */
export interface KeepAtPrintResolutionResult {
  response: NormalizedGenerationResponse;
  regenerated: boolean;
  reason?: "no-replay-support" | "no-modelid" | "tile-not-done";
}

/** One request in a fan-out batch. */
export interface VariantRequest {
  request: NormalizedGenerationRequest;
  providerLabel?: string;
}

export interface UseVariantFanOutResult {
  tiles: VariantTile[];
  isRunning: boolean;
  start: (reqs: VariantRequest[]) => Promise<void>;
  retryOne: (id: number) => Promise<void>;
  discard: (id: number) => void;
  discardAll: () => void;
  keepAtPrintResolution: (id: number) => Promise<KeepAtPrintResolutionResult | null>;
}

export function useVariantFanOut(): UseVariantFanOutResult {
  const [tiles, setTiles] = useState<VariantTile[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  // Per-tile request memory so retry can re-run just that provider.
  const reqsRef = useRef<Map<number, NormalizedGenerationRequest>>(new Map());

  const runOne = useCallback(async (id: number, req: NormalizedGenerationRequest) => {
    setTiles((cur) =>
      cur.map((t) =>
        t.id === id ? { ...t, status: "loading", error: undefined, response: undefined } : t,
      ),
    );
    try {
      const { response } = await generateImage(req);
      setTiles((cur) =>
        cur.map((t) => (t.id === id ? { ...t, status: "done", response } : t)),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTiles((cur) =>
        cur.map((t) => (t.id === id ? { ...t, status: "error", error: msg } : t)),
      );
    }
  }, []);

  const start = useCallback(
    async (reqs: VariantRequest[]) => {
      if (reqs.length === 0) return;
      reqsRef.current = new Map();
      const initial: VariantTile[] = reqs.map((r, i) => {
        const previewReq: NormalizedGenerationRequest = {
          ...r.request,
          sizeIntent: "preview",
        };
        reqsRef.current.set(i, previewReq);
        return {
          id: i,
          status: "loading" as const,
          providerLabel: r.providerLabel,
        };
      });
      setIsRunning(true);
      setTiles(initial);
      try {
        await Promise.allSettled(
          initial.map((t) => runOne(t.id, reqsRef.current.get(t.id)!)),
        );
      } finally {
        setIsRunning(false);
      }
    },
    [runOne],
  );

  const retryOne = useCallback(
    async (id: number) => {
      const req = reqsRef.current.get(id);
      if (!req) return;
      await runOne(id, req);
    },
    [runOne],
  );

  const discard = useCallback((id: number) => {
    setTiles((cur) =>
      cur.map((t) =>
        t.id === id
          ? { id, status: "idle" as const, providerLabel: t.providerLabel }
          : t,
      ),
    );
  }, []);

  const discardAll = useCallback(() => {
    reqsRef.current = new Map();
    setTiles([]);
  }, []);

  const keepAtPrintResolution = useCallback(
    async (id: number): Promise<KeepAtPrintResolutionResult | null> => {
      const tile = tiles.find((t) => t.id === id);
      if (!tile || tile.status !== "done" || !tile.response) {
        return null;
      }
      const baseReq = reqsRef.current.get(id);
      const modelId =
        tile.response.resolvedModelId ??
        tile.response.requestedModelId ??
        baseReq?.modelId;

      if (!baseReq) {
        return { response: tile.response, regenerated: false, reason: "tile-not-done" };
      }
      if (!modelId) {
        return { response: tile.response, regenerated: false, reason: "no-modelid" };
      }
      if (!supportsDeterministicSeedReplay(modelId)) {
        return {
          response: tile.response,
          regenerated: false,
          reason: "no-replay-support",
        };
      }

      const replayReq: NormalizedGenerationRequest = {
        ...baseReq,
        sizeIntent: "print",
      };
      const { response } = await generateImage(replayReq);
      return { response, regenerated: true };
    },
    [tiles],
  );

  return {
    tiles,
    isRunning,
    start,
    retryOne,
    discard,
    discardAll,
    keepAtPrintResolution,
  };
}
