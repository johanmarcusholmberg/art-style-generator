// GitHub push-target preflight + CI status check.
// Confirms that {owner, repo, branch, expected_sha} is what the GitHub
// connector actually sees, before polling workflow runs.
//
// Uses the Lovable connector gateway so GITHUB_API_KEY never reaches the
// browser. All fields returned are safe to show in a diagnostic panel.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://connector-gateway.lovable.dev/github";

interface CheckBody {
  owner?: string;
  repo?: string;
  branch?: string;
  expected_sha?: string;
}

async function gh(path: string): Promise<{ status: number; body: unknown; text: string }> {
  const lovable = Deno.env.get("LOVABLE_API_KEY");
  const gh = Deno.env.get("GITHUB_API_KEY");
  if (!lovable || !gh) {
    return { status: 500, body: { error: "gateway credentials missing" }, text: "" };
  }
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": gh,
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let payload: CheckBody = {};
  try { payload = await req.json(); } catch { /* empty body ok */ }

  const owner = (payload.owner ?? "").trim();
  const repo = (payload.repo ?? "").trim();
  const branch = (payload.branch ?? "").trim();
  const expected = (payload.expected_sha ?? "").trim().toLowerCase();

  const result: Record<string, unknown> = {
    input: { owner, repo, branch, expected_sha: expected || null },
    checks: {} as Record<string, unknown>,
  };

  if (!owner || !repo) {
    result.checks = { input: { ok: false, detail: "owner and repo are required" } };
    return new Response(JSON.stringify(result), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1) Repo reachable
  const repoRes = await gh(`/repos/${owner}/${repo}`);
  const repoOk = repoRes.status === 200;
  const repoBody = (repoRes.body ?? {}) as Record<string, unknown>;
  (result.checks as Record<string, unknown>).repo = {
    ok: repoOk,
    status: repoRes.status,
    full_name: repoBody.full_name ?? null,
    default_branch: repoBody.default_branch ?? null,
    private: repoBody.private ?? null,
    detail: repoOk ? "reachable" : (repoRes.text.slice(0, 300) || "not reachable"),
  };
  if (!repoOk) {
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const effectiveBranch = branch || String(repoBody.default_branch ?? "main");
  (result.checks as Record<string, unknown>).effective_branch = effectiveBranch;

  // 2) Branch exists + its HEAD SHA
  const branchRes = await gh(`/repos/${owner}/${repo}/branches/${encodeURIComponent(effectiveBranch)}`);
  const branchOk = branchRes.status === 200;
  const branchBody = (branchRes.body ?? {}) as Record<string, unknown>;
  const commit = (branchBody.commit ?? {}) as Record<string, unknown>;
  const headSha = typeof commit.sha === "string" ? commit.sha.toLowerCase() : null;
  (result.checks as Record<string, unknown>).branch = {
    ok: branchOk,
    status: branchRes.status,
    head_sha: headSha,
    detail: branchOk ? "exists" : (branchRes.text.slice(0, 300) || "missing"),
  };

  // 3) Expected SHA matches HEAD (or at least exists in repo)
  if (expected) {
    const matchesHead = headSha ? headSha.startsWith(expected) || expected.startsWith(headSha) : false;
    let existsInRepo = matchesHead;
    let commitStatus = matchesHead ? 200 : 0;
    if (!matchesHead) {
      const commitRes = await gh(`/repos/${owner}/${repo}/commits/${expected}`);
      existsInRepo = commitRes.status === 200;
      commitStatus = commitRes.status;
    }
    (result.checks as Record<string, unknown>).expected_sha = {
      ok: matchesHead,
      matches_head: matchesHead,
      exists_in_repo: existsInRepo,
      status: commitStatus,
      detail: matchesHead
        ? "expected commit is HEAD of branch"
        : existsInRepo
          ? "commit exists but is NOT HEAD of the branch (push may not have landed yet)"
          : "commit not found in repository",
    };
  }

  // 4) Workflow runs for the SHA we care about (HEAD if no expected given)
  const shaForRuns = expected || headSha;
  if (shaForRuns) {
    const runsRes = await gh(
      `/repos/${owner}/${repo}/actions/runs?head_sha=${shaForRuns}&per_page=10`,
    );
    const runsBody = (runsRes.body ?? {}) as Record<string, unknown>;
    const runs = Array.isArray(runsBody.workflow_runs) ? runsBody.workflow_runs : [];
    (result.checks as Record<string, unknown>).workflow_runs = {
      ok: runsRes.status === 200,
      status: runsRes.status,
      sha: shaForRuns,
      count: runs.length,
      runs: runs.slice(0, 10).map((r) => {
        const rec = r as Record<string, unknown>;
        return {
          id: rec.id,
          name: rec.name,
          event: rec.event,
          status: rec.status,
          conclusion: rec.conclusion,
          html_url: rec.html_url,
          run_started_at: rec.run_started_at,
          head_branch: rec.head_branch,
        };
      }),
    };
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
