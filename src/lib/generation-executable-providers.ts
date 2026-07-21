/**
 * generation-executable-providers — the single source of truth for
 * which providers the durable server worker can actually execute today.
 *
 * Stage 3A / Turn 1. This lives in the client so UI can guard BEFORE
 * creating a durable job. A byte-for-byte mirror lives at
 * `supabase/functions/_shared/executable-providers.ts` so the server
 * can enforce the same rule when claiming an item.
 *
 * OpenAI is intentionally NOT in this list. Its adapter runs in the
 * browser today. Attempting to select it for a durable workflow (main
 * generator, matching collection, batch) must fail with a clear error
 * up front — never by silently swapping providers server-side.
 */

import type { GeneratorPreference } from "@/lib/generators";
import type { ExecutableProviderId, ProviderPreferenceV2 } from "@/lib/generation-contract-v2";

/** Providers the durable worker (`generate-single` edge function) executes. */
export const DURABLY_EXECUTABLE_PROVIDERS: readonly ExecutableProviderId[] = ["gemini", "sdxl"] as const;

const EXEC_SET = new Set<string>(DURABLY_EXECUTABLE_PROVIDERS);

export function isDurablyExecutable(provider: string | null | undefined): provider is ExecutableProviderId {
  return !!provider && EXEC_SET.has(provider);
}

export interface ExecutabilityCheck {
  ok: boolean;
  /** Present when `ok` is false. Localizable, user-facing. */
  reason?: string;
  /** Present when `ok` is false. Suggested alternative preference. */
  suggestion?: GeneratorPreference;
}

/**
 * Returns whether a provider preference is safe to submit to the
 * durable worker. `auto` is always safe (the resolver picks an
 * executable provider). Manual selections must map to an executable
 * provider — OpenAI in particular is rejected.
 */
export function checkDurableExecutability(pref: ProviderPreferenceV2): ExecutabilityCheck {
  if (pref === "auto") return { ok: true };
  if (isDurablyExecutable(pref)) return { ok: true };
  if (pref === "openai") {
    return {
      ok: false,
      reason:
        "OpenAI can't run as a background job yet — it only runs in the browser. Pick Gemini or SDXL, or use Auto.",
      suggestion: "gemini",
    };
  }
  return {
    ok: false,
    reason: `Provider "${pref}" is not available for background generation.`,
    suggestion: "auto",
  };
}
