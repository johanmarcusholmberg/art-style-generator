/**
 * createReloadCoordinator — debounced, non-overlapping reload scheduler
 * used by the collection page to coalesce realtime events from multiple
 * tables into a single load.
 *
 * Guarantees:
 *   - Multiple `request()` calls within `delayMs` produce one load.
 *   - A `request()` arriving while a load is running schedules exactly
 *     one trailing load once the current one settles.
 *   - Errors thrown by `load` are swallowed so future reloads still fire.
 *   - `dispose()` cancels any pending timer and prevents future work.
 */
export interface ReloadCoordinatorOpts {
  load: () => Promise<void>;
  delayMs: number;
}

export interface ReloadCoordinator {
  request(): void;
  dispose(): void;
}

export function createReloadCoordinator(
  opts: ReloadCoordinatorOpts,
): ReloadCoordinator {
  const { load, delayMs } = opts;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let trailing = false;
  let disposed = false;

  const run = async () => {
    if (disposed) return;
    if (running) {
      trailing = true;
      return;
    }
    running = true;
    try {
      await load();
    } catch (err) {
      // Never permanently block future reloads; report and continue.
      console.error("[reload-coordinator] load failed:", err);
    } finally {
      running = false;
      if (trailing && !disposed) {
        trailing = false;
        void run();
      }
    }
  };

  return {
    request() {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    },
    dispose() {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
