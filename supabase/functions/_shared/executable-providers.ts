/**
 * Deno mirror of `src/lib/generation-executable-providers.ts`.
 *
 * Enforcement point for the durable worker: any claim whose resolved
 * request asks for a provider outside `DURABLY_EXECUTABLE_PROVIDERS`
 * must be failed terminally with a clear error. Never substitute — the
 * client is expected to have validated executability before creating
 * the job. Server-side rejection is a last-line defense.
 */

export type ExecutableProviderId = "gemini" | "sdxl";

export const DURABLY_EXECUTABLE_PROVIDERS: readonly ExecutableProviderId[] = ["gemini", "sdxl"];

const EXEC_SET = new Set<string>(DURABLY_EXECUTABLE_PROVIDERS);

export function isDurablyExecutable(provider: string | null | undefined): provider is ExecutableProviderId {
  return !!provider && EXEC_SET.has(provider);
}

/**
 * Returns null when the preference is safe to run durably. Otherwise
 * returns a terminal error message the worker should surface via
 * `fail_generation_item` with `p_terminal = true`.
 */
export function reasonToRejectDurable(pref: string | null | undefined): string | null {
  if (!pref || pref === "auto") return null;
  if (isDurablyExecutable(pref)) return null;
  if (pref === "openai") {
    return "OpenAI is not available for background generation. Select Gemini, SDXL, or Auto.";
  }
  return `Provider "${pref}" is not available for background generation.`;
}
