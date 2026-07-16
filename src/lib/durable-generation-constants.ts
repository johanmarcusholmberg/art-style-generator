/**
 * Constants for the durable (server-owned) generation path.
 *
 * These live in their own module so tests, hooks, and any future
 * server-side utilities can share the exact same values without pulling
 * in React or Supabase.
 */

/**
 * When a page (re)hydrates a durable generation job, any item whose
 * terminal event happened MORE than this many ms ago is considered
 * "stale" — we should NOT auto-adopt it into the live preview slot.
 *
 * This exists to prevent a user who returns to a tab hours after a
 * previous generation from having that old image silently re-appear in
 * the current session. Items completed within the window ARE adopted so
 * a quick tab-switch still shows the freshly-finished result.
 *
 * 2 minutes strikes a balance between "just switched tabs" and
 * "closed laptop, came back tomorrow".
 */
export const RECENT_ADOPT_WINDOW_MS = 2 * 60 * 1000;

/**
 * Prefix used for per-style pending-idempotency-key entries in
 * localStorage. A key is written BEFORE the network POST so that a
 * page reload mid-flight can still recover the created job.
 *
 * Key shape: `${PENDING_IDEMPOTENCY_KEY_PREFIX}${styleKey}`
 */
export const PENDING_IDEMPOTENCY_KEY_PREFIX = "durable-gen-pending-idem-";

/**
 * Prefix for per-style current-job pointers written AFTER the server
 * confirms the job id. Used by hydration to re-subscribe to realtime
 * updates for the last known job when the user returns.
 */
export const CURRENT_JOB_KEY_PREFIX = "durable-gen-current-job-";
