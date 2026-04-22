/**
 * Local-only quality feedback for generated images.
 *
 * Stored in `localStorage` under a single namespaced key. Keeps things
 * lightweight and avoids any DB schema work — the goal here is purely to
 * record signal that future routing tuning can use.
 *
 * Shape: { [imageKey: string]: { rating: "up" | "down"; ts: number } }
 *
 * `imageKey` is a stable hash of (executionRoute + provider + prompt slice +
 * styleKey) so re-generations with the same inputs collapse to one entry.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "lovable.image-feedback.v1";

type Rating = "up" | "down" | null;

interface FeedbackRecord {
  rating: Exclude<Rating, null>;
  ts: number;
}

function buildKey(
  prompt: string,
  styleKey: string,
  provider?: string | null,
  route?: string | null,
): string {
  const promptSlice = (prompt || "").trim().slice(0, 80).toLowerCase();
  return `${styleKey}::${provider ?? "?"}::${route ?? "?"}::${promptSlice}`;
}

function readStore(): Record<string, FeedbackRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, FeedbackRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota — drop silently */
  }
}

export interface UseImageFeedbackInput {
  prompt: string;
  styleKey: string;
  provider?: string | null;
  route?: string | null;
}

export function useImageFeedback(input: UseImageFeedbackInput) {
  const key = buildKey(input.prompt, input.styleKey, input.provider, input.route);
  const [rating, setRating] = useState<Rating>(null);

  useEffect(() => {
    const store = readStore();
    setRating(store[key]?.rating ?? null);
  }, [key]);

  const setFeedback = useCallback(
    (next: Exclude<Rating, null>) => {
      const store = readStore();
      // Toggle off when re-clicking the same option
      if (store[key]?.rating === next) {
        delete store[key];
        writeStore(store);
        setRating(null);
        return;
      }
      store[key] = { rating: next, ts: Date.now() };
      writeStore(store);
      setRating(next);
    },
    [key],
  );

  return { rating, setFeedback };
}
