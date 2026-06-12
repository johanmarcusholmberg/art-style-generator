/**
 * Prompt History — small persistence layer for reusable prompts.
 *
 * Scope: per-creator (profile-scoped) library of prompts that the user
 * has actually generated with. Used by the Prompt History panel near
 * the generator prompt input.
 *
 * Notes:
 *  - Save is best-effort: callers MUST swallow errors so generation
 *    never breaks because the history write failed.
 *  - Dedup is handled at the DB layer via the
 *    (profile_id, mode, prompt) unique index, with an UPDATE-on-conflict
 *    code path in `savePromptHistory` to bump usage_count + last_used_at.
 *  - The table is not yet in the generated Supabase types — payloads
 *    are cast through `never` like other recent additions
 *    (cf. style-lab curation helpers).
 */
import { supabase } from "@/integrations/supabase/client";

export interface PromptHistoryEntry {
  id: string;
  prompt: string;
  mode: string;
  provider: string | null;
  model: string | null;
  source_image_id: string | null;
  generation_job_id: string | null;
  is_favorite: boolean;
  usage_count: number;
  created_at: string;
  last_used_at: string;
}

export interface SavePromptHistoryInput {
  prompt: string;
  mode: string;
  provider?: string | null;
  model?: string | null;
  sourceImageId?: string | null;
  generationJobId?: string | null;
}

async function currentProfileId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/**
 * Persist a prompt to the user's history. Dedupes on (profile_id, mode, prompt):
 * if a matching row exists we bump `usage_count` and `last_used_at` instead of
 * inserting a duplicate.
 *
 * Never throws — returns `null` on any failure so callers can `await` without
 * a try/catch around generation flows.
 */
export async function savePromptHistory(
  input: SavePromptHistoryInput,
): Promise<PromptHistoryEntry | null> {
  const prompt = input.prompt?.trim();
  const mode = input.mode?.trim();
  if (!prompt || !mode) return null;

  try {
    const profileId = await currentProfileId();
    if (!profileId) return null;

    // Look up existing dedupe row first; if present, bump usage.
    const { data: existing } = await supabase
      .from("prompt_history")
      .select("*")
      .eq("profile_id", profileId)
      .eq("mode", mode)
      .eq("prompt", prompt)
      .maybeSingle();

    if (existing) {
      const row = existing as unknown as PromptHistoryEntry;
      const { data: updated, error: updErr } = await supabase
        .from("prompt_history")
        .update({
          usage_count: row.usage_count + 1,
          last_used_at: new Date().toISOString(),
          // Refresh latest provider/model/source ids if newer info available.
          provider: input.provider ?? row.provider,
          model: input.model ?? row.model,
          source_image_id: input.sourceImageId ?? row.source_image_id,
          generation_job_id: input.generationJobId ?? row.generation_job_id,
        } as never)
        .eq("id", row.id)
        .select("*")
        .maybeSingle();
      if (updErr) return row;
      return (updated as unknown as PromptHistoryEntry) ?? row;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("prompt_history")
      .insert({
        profile_id: profileId,
        prompt,
        mode,
        provider: input.provider ?? null,
        model: input.model ?? null,
        source_image_id: input.sourceImageId ?? null,
        generation_job_id: input.generationJobId ?? null,
      } as never)
      .select("*")
      .maybeSingle();
    if (insErr) return null;
    return (inserted as unknown as PromptHistoryEntry) ?? null;
  } catch {
    return null;
  }
}

export interface FetchPromptHistoryOptions {
  /** Case-insensitive substring filter on prompt text. */
  search?: string;
  /** Restrict to a specific mode/style. */
  mode?: string;
  /** Max rows to return. Defaults to 50. */
  limit?: number;
  /** Only return favorites. */
  favoritesOnly?: boolean;
}

/**
 * Fetch recent prompt history rows for the signed-in creator. Sorted by
 * `last_used_at DESC`. Returns `[]` on any failure.
 */
export async function fetchPromptHistory(
  opts: FetchPromptHistoryOptions = {},
): Promise<PromptHistoryEntry[]> {
  try {
    let query = supabase
      .from("prompt_history")
      .select("*")
      .order("last_used_at", { ascending: false })
      .limit(opts.limit ?? 50);

    if (opts.mode) query = query.eq("mode", opts.mode);
    if (opts.favoritesOnly) query = query.eq("is_favorite", true);
    if (opts.search && opts.search.trim()) {
      // ilike for case-insensitive substring search.
      query = query.ilike("prompt", `%${opts.search.trim()}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as unknown as PromptHistoryEntry[];
  } catch {
    return [];
  }
}

export async function togglePromptHistoryFavorite(
  id: string,
  value: boolean,
): Promise<void> {
  await supabase
    .from("prompt_history")
    .update({ is_favorite: value } as never)
    .eq("id", id);
}

export async function deletePromptHistory(id: string): Promise<void> {
  await supabase.from("prompt_history").delete().eq("id", id);
}
