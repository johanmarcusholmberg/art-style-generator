/**
 * useDurableGeneration — foundation hook for the server-owned
 * generation path.
 *
 * IMPORTANT (Turn A): this hook is intentionally NOT wired into any
 * live UI in this turn. It ships with the persistence, hydration, and
 * realtime primitives ready to consume, but it does not create jobs or
 * open subscriptions unless a caller explicitly invokes `start()` or
 * passes `autoHydrate: true`. Turn B replaces the in-memory generation
 * flow with this hook.
 *
 * Contract:
 *  - Persistence: writes the pending idempotency key to localStorage
 *    BEFORE the `create_generation_job` RPC is called. If the network
 *    fails between the write and the RPC, the next mount can reuse the
 *    same key to recover the same server job (or discover none exists
 *    yet and safely retry).
 *  - Hydration: on `hydrate()`, resolves the stored jobId + pending
 *    idem key against the server, then applies `decideHydration` to
 *    decide whether to resubscribe or clear.
 *  - Realtime: subscribes to per-job item updates; merges with
 *    `mergeItemRealtime` so stale/out-of-order events cannot demote
 *    live state.
 *  - Stale suppression: terminal items older than
 *    RECENT_ADOPT_WINDOW_MS are exposed via `staleTerminal` (for a
 *    "resume?" affordance) but never auto-adopted into `previewUrl`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  currentJobKey,
  decideHydration,
  mergeItemRealtime,
  pendingIdemKey,
  pickPreviewImageUrl,
  type DurableItemRow,
  type JobStatus,
} from "@/lib/durable-generation-core";

export interface UseDurableGenerationOptions {
  styleKey: string;
  /** Turn B toggles this on. Off in Turn A means the hook is inert. */
  autoHydrate?: boolean;
}

export interface StartArgs {
  prompt: string;
  aspectRatio: string;
  backgroundStyle: "white" | "cream";
  generationMode: "standard" | "print-ready";
  printFormatId?: string | null;
  qualityMode?: "web" | "quality";
  targetPpi?: number | null;
  targetWidthPx?: number | null;
  targetHeightPx?: number | null;
  providerLabel?: string | null;
}

export interface UseDurableGenerationResult {
  jobId: string | null;
  jobStatus: JobStatus | null;
  items: DurableItemRow[];
  previewUrl: string | null;
  staleTerminal: boolean;
  isStarting: boolean;
  hydrate: () => Promise<void>;
  start: (args: StartArgs) => Promise<string>;
  clear: () => void;
}

function readLS(key: string): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    /* quota — ignore */
  }
}
function delLS(key: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function useDurableGeneration(
  opts: UseDurableGenerationOptions,
): UseDurableGenerationResult {
  const { styleKey, autoHydrate = false } = opts;
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [items, setItems] = useState<DurableItemRow[]>([]);
  const [staleTerminal, setStaleTerminal] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const detach = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const attach = useCallback(
    (jid: string) => {
      detach();
      const ch = supabase
        .channel(`durable-gen-${jid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "generation_job_items",
            filter: `job_id=eq.${jid}`,
          },
          (payload) => {
            const next = payload.new as unknown as DurableItemRow | undefined;
            if (!next) return;
            setItems((cur) => mergeItemRealtime(cur, next));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "generation_jobs",
            filter: `id=eq.${jid}`,
          },
          (payload) => {
            const next = payload.new as unknown as { status: JobStatus } | undefined;
            if (next?.status) setJobStatus(next.status);
          },
        )
        .subscribe();
      channelRef.current = ch;
    },
    [detach],
  );

  const hydrate = useCallback(async () => {
    const storedJobId = readLS(currentJobKey(styleKey));
    if (!storedJobId) {
      delLS(pendingIdemKey(styleKey));
      return;
    }
    // Fetch job + items snapshot.
    const [{ data: job }, { data: rows }] = await Promise.all([
      supabase.from("generation_jobs").select("id,status").eq("id", storedJobId).maybeSingle(),
      supabase
        .from("generation_job_items")
        .select(
          "id,job_id,status,image_url,enforced_image_url,raw_image_url,ratio_enforcement_status,storage_path,completed_at,updated_at,position",
        )
        .eq("job_id", storedJobId)
        .order("position", { ascending: true }),
    ]);

    if (!job) {
      // Job was purged — reset local pointers.
      delLS(currentJobKey(styleKey));
      delLS(pendingIdemKey(styleKey));
      return;
    }

    const itemRows = (rows ?? []) as unknown as DurableItemRow[];
    const first = itemRows[0];
    const firstCompletedAt = first?.completed_at ? Date.parse(first.completed_at) : null;
    const decision = decideHydration({
      now: Date.now(),
      storedJobId,
      jobStatus: job.status as JobStatus,
      firstItemCompletedAt: firstCompletedAt,
    });

    setJobId(storedJobId);
    setJobStatus(job.status as JobStatus);
    setItems(itemRows);
    setStaleTerminal(!decision.adoptPreview && (job.status === "completed" || job.status === "failed"));

    if (decision.clearPendingIdem) delLS(pendingIdemKey(styleKey));
    if (decision.resubscribe) attach(storedJobId);
  }, [styleKey, attach]);

  const start = useCallback(
    async (args: StartArgs) => {
      setIsStarting(true);
      try {
        // 1. Reserve an idempotency key BEFORE any network call so a
        //    crash between here and the RPC still recovers cleanly.
        const existingPending = readLS(pendingIdemKey(styleKey));
        const idem =
          existingPending ??
          (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
        writeLS(pendingIdemKey(styleKey), idem);

        const itemPayload = [
          {
            prompt: args.prompt,
            styleKey,
            providerLabel: args.providerLabel ?? null,
            aspectRatio: args.aspectRatio,
            backgroundStyle: args.backgroundStyle,
            generationMode: args.generationMode,
            printSize: null,
            qualityMode: args.qualityMode ?? "quality",
            targetPpi: args.targetPpi ?? null,
            targetWidthPx: args.targetWidthPx ?? null,
            targetHeightPx: args.targetHeightPx ?? null,
            mode: styleKey,
            printFormatId: args.printFormatId ?? null,
          },
        ];

        const { data, error } = await supabase.rpc("create_generation_job", {
          p_idempotency_key: idem,
          p_job_type: "single",
          p_style_key: styleKey,
          p_generation_mode: args.generationMode,
          p_context_key: null,
          p_prompt: args.prompt,
          p_aspect_ratio: args.aspectRatio,
          p_background_style: args.backgroundStyle,
          p_items: itemPayload as unknown as never,
        });
        if (error || !data) throw new Error(error?.message ?? "Failed to create job");
        const created = Array.isArray(data)
          ? (data[0] as { job_id: string; item_ids: string[] })
          : (data as { job_id: string; item_ids: string[] });
        const jid = created.job_id;
        const firstItemId = created.item_ids?.[0];

        writeLS(currentJobKey(styleKey), jid);
        setJobId(jid);
        setJobStatus("queued");
        setItems([]);
        setStaleTerminal(false);
        attach(jid);

        // Fire the durable worker per item; do not await — realtime will
        // update UI. `generate-single` expects `itemId` (not `jobId`).
        if (firstItemId) {
          supabase.functions
            .invoke("generate-single", { body: { itemId: firstItemId } })
            .catch((err) => console.error("[useDurableGeneration] generate-single dispatch:", err));
        }

        return jid;
      } finally {
        setIsStarting(false);
      }
    },
    [styleKey, attach],
  );

  const clear = useCallback(() => {
    detach();
    delLS(currentJobKey(styleKey));
    delLS(pendingIdemKey(styleKey));
    setJobId(null);
    setJobStatus(null);
    setItems([]);
    setStaleTerminal(false);
  }, [styleKey, detach]);

  useEffect(() => {
    if (autoHydrate) void hydrate();
    return () => detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHydrate, styleKey]);

  return {
    jobId,
    jobStatus,
    items,
    previewUrl: pickPreviewImageUrl(items),
    staleTerminal,
    isStarting,
    hydrate,
    start,
    clear,
  };
}
