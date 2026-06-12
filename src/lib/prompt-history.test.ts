/**
 * Focused tests for the Prompt History library:
 *  - savePromptHistory inserts new rows
 *  - savePromptHistory dedupes on (profile_id, mode, prompt) by bumping
 *    usage_count + last_used_at instead of inserting
 *  - savePromptHistory never throws (returns null on failure)
 *  - fetchPromptHistory respects search / mode / favoritesOnly filters
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = {
  id: string;
  profile_id: string;
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
};

const state: {
  rows: Row[];
  authUserId: string | null;
  profileForAuth: string | null;
  failProfileLookup: boolean;
} = {
  rows: [],
  authUserId: "auth-1",
  profileForAuth: "profile-1",
  failProfileLookup: false,
};

vi.mock("@/integrations/supabase/client", () => {
  const profilesQuery = () => {
    const filters: Record<string, unknown> = {};
    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => { filters[col] = val; return api; },
      maybeSingle: async () => {
        if (state.failProfileLookup) return { data: null, error: { message: "no" } };
        if (filters.auth_user_id === state.authUserId && state.profileForAuth) {
          return { data: { id: state.profileForAuth }, error: null };
        }
        return { data: null, error: null };
      },
    };
    return api;
  };

  const promptHistoryQuery = () => {
    const filters: Array<{ op: string; col?: string; val?: unknown; pattern?: string }> = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;
    let pendingUpdate: Partial<Row> | null = null;
    let pendingInsert: Partial<Row> | null = null;
    let mode: "select" | "update" | "insert" | "delete" = "select";
    let updateTargetId: string | null = null;

    const matches = (r: Row): boolean => {
      for (const f of filters) {
        if (f.op === "eq" && r[f.col as keyof Row] !== f.val) return false;
        if (f.op === "ilike") {
          const pat = (f.pattern ?? "").replace(/%/g, "").toLowerCase();
          if (!r.prompt.toLowerCase().includes(pat)) return false;
        }
      }
      return true;
    };

    const api: any = {
      select: () => api,
      insert: (payload: Partial<Row>) => { mode = "insert"; pendingInsert = payload; return api; },
      update: (payload: Partial<Row>) => { mode = "update"; pendingUpdate = payload; return api; },
      delete: () => { mode = "delete"; return api; },
      eq: (col: string, val: unknown) => {
        filters.push({ op: "eq", col, val });
        if (mode === "update" || mode === "delete") {
          if (col === "id") updateTargetId = val as string;
        }
        return api;
      },
      ilike: (col: string, pattern: string) => {
        filters.push({ op: "ilike", col, pattern });
        return api;
      },
      order: (col: string, opts: any) => { orderCol = col; orderAsc = !!opts?.ascending; return api; },
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: async () => {
        if (mode === "insert" && pendingInsert) {
          const row: Row = {
            id: `row-${state.rows.length + 1}`,
            profile_id: pendingInsert.profile_id!,
            prompt: pendingInsert.prompt!,
            mode: pendingInsert.mode!,
            provider: pendingInsert.provider ?? null,
            model: pendingInsert.model ?? null,
            source_image_id: pendingInsert.source_image_id ?? null,
            generation_job_id: pendingInsert.generation_job_id ?? null,
            is_favorite: false,
            usage_count: 1,
            created_at: new Date().toISOString(),
            last_used_at: new Date().toISOString(),
          };
          state.rows.push(row);
          return { data: row, error: null };
        }
        if (mode === "update" && pendingUpdate && updateTargetId) {
          const idx = state.rows.findIndex((r) => r.id === updateTargetId);
          if (idx >= 0) {
            state.rows[idx] = { ...state.rows[idx], ...pendingUpdate } as Row;
            return { data: state.rows[idx], error: null };
          }
          return { data: null, error: null };
        }
        // select maybeSingle
        const found = state.rows.find(matches);
        return { data: found ?? null, error: null };
      },
      then: (resolve: any) => {
        // Terminal for array selects / delete chains without maybeSingle().
        if (mode === "delete") {
          const before = state.rows.length;
          state.rows = state.rows.filter((r) => !matches(r));
          return resolve({ data: null, error: null, count: before - state.rows.length });
        }
        let rows = state.rows.filter(matches);
        if (orderCol) {
          rows = [...rows].sort((a, b) => {
            const av = (a as any)[orderCol!];
            const bv = (b as any)[orderCol!];
            return orderAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
          });
        }
        if (limitN != null) rows = rows.slice(0, limitN);
        return resolve({ data: rows, error: null });
      },
    };
    return api;
  };

  return {
    supabase: {
      auth: {
        getUser: async () => ({
          data: state.authUserId ? { user: { id: state.authUserId } } : { user: null },
        }),
      },
      from: (table: string) => {
        if (table === "profiles") return profilesQuery();
        if (table === "prompt_history") return promptHistoryQuery();
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
});

import {
  savePromptHistory,
  fetchPromptHistory,
} from "./prompt-history";

beforeEach(() => {
  state.rows = [];
  state.authUserId = "auth-1";
  state.profileForAuth = "profile-1";
  state.failProfileLookup = false;
});

describe("prompt-history · save", () => {
  it("inserts a new row for a fresh prompt+mode", async () => {
    const row = await savePromptHistory({
      prompt: "  vintage poster of a citrus grove  ",
      mode: "vintage",
      provider: "lovable",
      model: "google/gemini-2.5-flash-image",
    });
    expect(row).not.toBeNull();
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].prompt).toBe("vintage poster of a citrus grove");
    expect(state.rows[0].mode).toBe("vintage");
    expect(state.rows[0].usage_count).toBe(1);
    expect(state.rows[0].provider).toBe("lovable");
  });

  it("dedupes identical prompt+mode and bumps usage_count", async () => {
    await savePromptHistory({ prompt: "abstract orange", mode: "popart" });
    await savePromptHistory({ prompt: "abstract orange", mode: "popart" });
    await savePromptHistory({ prompt: "abstract orange", mode: "popart" });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].usage_count).toBe(3);
  });

  it("treats different modes as distinct entries", async () => {
    await savePromptHistory({ prompt: "tiger", mode: "popart" });
    await savePromptHistory({ prompt: "tiger", mode: "japanese" });
    expect(state.rows).toHaveLength(2);
  });

  it("returns null and never throws when prompt or mode is blank", async () => {
    expect(await savePromptHistory({ prompt: "", mode: "x" })).toBeNull();
    expect(await savePromptHistory({ prompt: "ok", mode: "" })).toBeNull();
    expect(state.rows).toHaveLength(0);
  });

  it("returns null when there's no profile (unauthenticated)", async () => {
    state.authUserId = null;
    const row = await savePromptHistory({ prompt: "x", mode: "y" });
    expect(row).toBeNull();
    expect(state.rows).toHaveLength(0);
  });
});

describe("prompt-history · fetch", () => {
  beforeEach(async () => {
    await savePromptHistory({ prompt: "sunset over kyoto", mode: "japanese" });
    await savePromptHistory({ prompt: "neon street tiger", mode: "popart" });
    await savePromptHistory({ prompt: "sunset desert dunes", mode: "minimalism" });
    // mark one favorite
    state.rows[1].is_favorite = true;
  });

  it("returns recent rows (sorted by last_used_at desc)", async () => {
    const rows = await fetchPromptHistory({ limit: 10 });
    expect(rows.length).toBeGreaterThan(0);
    // Most-recently-inserted should appear first since last_used_at is monotonic.
    expect(rows[0].prompt).toBe("sunset desert dunes");
  });

  it("filters by mode", async () => {
    const rows = await fetchPromptHistory({ mode: "popart" });
    expect(rows).toHaveLength(1);
    expect(rows[0].prompt).toBe("neon street tiger");
  });

  it("filters by case-insensitive search substring", async () => {
    const rows = await fetchPromptHistory({ search: "SUNSET" });
    expect(rows.map((r) => r.prompt).sort()).toEqual([
      "sunset desert dunes",
      "sunset over kyoto",
    ]);
  });

  it("filters by favoritesOnly", async () => {
    const rows = await fetchPromptHistory({ favoritesOnly: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].is_favorite).toBe(true);
  });
});
