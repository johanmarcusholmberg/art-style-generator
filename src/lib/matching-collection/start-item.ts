/**
 * start-item — minimal helper for the "Start" action on a genuinely
 * queued collection candidate. Distinct from the failed-item Retry flow.
 *
 * Rules:
 *   - Only queued items may be started.
 *   - Invocation failure leaves the item queued and surfaces the error.
 *   - Failed items must go through `generate-single-item-retry`, not this.
 */

export interface StartCandidate {
  itemId: string;
  itemStatus: string;
}

export function canStartCandidate(m: StartCandidate): boolean {
  return m.itemStatus === "queued";
}

export type StartInvoker = (
  itemId: string,
) => Promise<{ error: { message: string } | null }>;

export async function startQueuedItem(
  m: StartCandidate,
  invoke: StartInvoker,
): Promise<void> {
  if (!canStartCandidate(m)) {
    throw new Error(`Cannot start: item is ${m.itemStatus}`);
  }
  const { error } = await invoke(m.itemId);
  if (error) throw new Error(error.message);
}
