// Admin user management — privileged operations.
//
// All actions in this function require the caller to be an authenticated,
// active admin (verified server-side). The service-role client is used ONLY
// after that check passes. Never expose this key to the frontend.
//
// Supported actions (POST { action, ... }):
//   - create_user      : create a profile + optional auth user (temp pwd or invite)
//   - update_user      : rename / change role / change status
//   - delete_user      : remove profile + auth user (blocked for protected admin)
//   - send_password_reset : email a reset link to the target user
//   - resend_invite    : re-issue an invite/reset link
//
// All successful actions are written to the audit_log table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const PROTECTED_EMAIL = "johanmarcusholmberg@gmail.com";

type Role = "admin" | "user";
type Status = "active" | "disabled" | "pending";

interface CreateUserBody {
  action: "create_user";
  email: string;
  username?: string | null;
  display_name?: string | null;
  role: Role;
  status: Status;
  notes?: string | null;
  /** "invite" sends a password-set link via email. "temp_password" generates and returns a one-shot password. */
  credential_mode: "invite" | "temp_password";
  redirect_url?: string;
}

interface UpdateUserBody {
  action: "update_user";
  profile_id: string;
  username?: string | null;
  display_name?: string | null;
  role?: Role;
  status?: Status;
  notes?: string | null;
}

interface DeleteUserBody {
  action: "delete_user";
  profile_id: string;
}

interface ResetPasswordBody {
  action: "send_password_reset";
  profile_id: string;
  redirect_url?: string;
}

interface ResendInviteBody {
  action: "resend_invite";
  profile_id: string;
  redirect_url?: string;
}

type RequestBody =
  | CreateUserBody
  | UpdateUserBody
  | DeleteUserBody
  | ResetPasswordBody
  | ResendInviteBody;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateTempPassword(): string {
  // 14-char base64url, ~84 bits of entropy. Shown once, never stored.
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, 14);
}

async function audit(
  admin: ReturnType<typeof createClient>,
  action: string,
  performedBy: string | null,
  targetUserId: string | null,
  metadata: Record<string, unknown> = {},
) {
  await admin.from("audit_log").insert({
    action,
    target_user_id: targetUserId,
    performed_by: performedBy,
    metadata,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  // Resolve calling user via anon client + the user's JWT.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }
  const callerAuthId = userRes.user.id;

  // Service-role admin client (bypasses RLS — only used after admin check).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the caller is an active admin.
  const { data: callerProfile, error: cpErr } = await admin
    .from("profiles")
    .select("id, status, email, is_protected")
    .eq("auth_user_id", callerAuthId)
    .maybeSingle();

  if (cpErr) {
    console.error("admin-users caller lookup failed", cpErr);
    return jsonResponse({ error: "Authorization check failed" }, 500);
  }
  if (!callerProfile || callerProfile.status !== "active") {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  const { data: callerRole, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerProfile.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleErr || !callerRole) {
    return jsonResponse({ error: "Admin role required" }, 403);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  try {
    switch (body.action) {
      case "create_user":
        return await handleCreate(admin, callerProfile.id, body);
      case "update_user":
        return await handleUpdate(admin, callerProfile.id, body);
      case "delete_user":
        return await handleDelete(admin, callerProfile.id, body);
      case "send_password_reset":
        return await handleResetPassword(admin, callerProfile.id, body);
      case "resend_invite":
        return await handleResendInvite(admin, callerProfile.id, body);
      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("admin-users error", e);
    return jsonResponse({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});

// ── Handlers ──────────────────────────────────────────────────────────────

async function handleCreate(
  admin: ReturnType<typeof createClient>,
  callerProfileId: string,
  body: CreateUserBody,
) {
  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: "Invalid email" }, 400);
  }

  // Refuse to overwrite the protected email
  if (email === PROTECTED_EMAIL) {
    return jsonResponse({ error: "This email is reserved." }, 400);
  }

  // Check for an existing profile or auth user with this email.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return jsonResponse({ error: "A user with this email already exists." }, 409);
  }

  // Insert profile first.
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .insert({
      email,
      username: body.username || null,
      display_name: body.display_name || null,
      status: body.status,
      provider: "password",
      notes: body.notes || null,
      created_by: callerProfileId,
    })
    .select("id")
    .single();
  if (profErr || !profile) {
    return jsonResponse({ error: profErr?.message || "Failed to create profile" }, 500);
  }

  // Grant role
  await admin.from("user_roles").insert({ user_id: profile.id, role: body.role });

  // Now create or invite the auth user
  let tempPassword: string | null = null;

  if (body.credential_mode === "temp_password") {
    tempPassword = generateTempPassword();
    const { data: created, error: aerr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        force_password_change: true,
        display_name: body.display_name || null,
      },
    });
    if (aerr) {
      // rollback
      await admin.from("profiles").delete().eq("id", profile.id);
      return jsonResponse({ error: `Failed to create auth user: ${aerr.message}` }, 500);
    }
    // Link the auth user immediately (the trigger will also link, but be explicit)
    await admin
      .from("profiles")
      .update({ auth_user_id: created.user!.id })
      .eq("id", profile.id);
  } else {
    // invite mode — email a magic-link/reset that lets them set a password
    const redirectTo = body.redirect_url || undefined;
    const { error: ierr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { display_name: body.display_name || null },
    });
    if (ierr) {
      // Some Supabase configs disallow invites when SMTP isn't set; fall back to creating an
      // unconfirmed user and sending a password-recovery email.
      const { data: created, error: aerr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (aerr || !created.user) {
        await admin.from("profiles").delete().eq("id", profile.id);
        return jsonResponse(
          { error: `Failed to invite user: ${ierr.message}` },
          500,
        );
      }
      await admin
        .from("profiles")
        .update({ auth_user_id: created.user.id })
        .eq("id", profile.id);

      await admin.auth.resetPasswordForEmail(email, { redirectTo });
    }
  }

  await audit(admin, "user_created", callerProfileId, profile.id, {
    email,
    role: body.role,
    status: body.status,
    credential_mode: body.credential_mode,
  });

  return jsonResponse({
    profile_id: profile.id,
    temp_password: tempPassword, // null in invite mode
  });
}

async function handleUpdate(
  admin: ReturnType<typeof createClient>,
  callerProfileId: string,
  body: UpdateUserBody,
) {
  const { data: target, error: tErr } = await admin
    .from("profiles")
    .select("id, email, is_protected, status")
    .eq("id", body.profile_id)
    .maybeSingle();
  if (tErr || !target) {
    return jsonResponse({ error: "Target user not found" }, 404);
  }

  // Protected admin: cannot be demoted, cannot be disabled
  if (target.is_protected) {
    if (body.role && body.role !== "admin") {
      return jsonResponse({ error: "Cannot demote the protected admin." }, 400);
    }
    if (body.status && body.status !== "active") {
      return jsonResponse({ error: "Cannot disable the protected admin." }, 400);
    }
  }

  // Self-protection: prevent disabling/demoting yourself if you're the only admin
  if (target.id === callerProfileId) {
    if (body.role && body.role !== "admin") {
      const { count } = await admin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return jsonResponse(
          { error: "You are the only admin. Promote someone else first." },
          400,
        );
      }
    }
    if (body.status && body.status !== "active") {
      const { count } = await admin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return jsonResponse(
          { error: "You are the only admin. Cannot disable yourself." },
          400,
        );
      }
    }
  }

  const profilePatch: Record<string, unknown> = {};
  if (body.username !== undefined) profilePatch.username = body.username || null;
  if (body.display_name !== undefined)
    profilePatch.display_name = body.display_name || null;
  if (body.status !== undefined) profilePatch.status = body.status;
  if (body.notes !== undefined) profilePatch.notes = body.notes || null;

  if (Object.keys(profilePatch).length > 0) {
    const { error: pErr } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", body.profile_id);
    if (pErr) return jsonResponse({ error: pErr.message }, 500);
  }

  if (body.role) {
    // Replace role rows for this user with the single chosen role.
    await admin.from("user_roles").delete().eq("user_id", body.profile_id);
    await admin.from("user_roles").insert({ user_id: body.profile_id, role: body.role });
  }

  await audit(admin, "user_updated", callerProfileId, body.profile_id, {
    patch: profilePatch,
    role: body.role ?? null,
  });

  return jsonResponse({ ok: true });
}

async function handleDelete(
  admin: ReturnType<typeof createClient>,
  callerProfileId: string,
  body: DeleteUserBody,
) {
  const { data: target, error: tErr } = await admin
    .from("profiles")
    .select("id, email, is_protected, auth_user_id")
    .eq("id", body.profile_id)
    .maybeSingle();
  if (tErr || !target) return jsonResponse({ error: "Target user not found" }, 404);

  if (target.is_protected) {
    return jsonResponse({ error: "The protected admin cannot be deleted." }, 400);
  }
  if (target.id === callerProfileId) {
    return jsonResponse({ error: "You cannot delete your own account." }, 400);
  }

  // If deleting an admin, ensure at least one other admin remains.
  const { data: targetIsAdmin } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", target.id)
    .eq("role", "admin")
    .maybeSingle();
  if (targetIsAdmin) {
    const { count } = await admin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return jsonResponse(
        { error: "Cannot delete the last remaining admin." },
        400,
      );
    }
  }

  // Delete auth user first (cascades nothing for profiles since FK is SET NULL).
  if (target.auth_user_id) {
    const { error: aerr } = await admin.auth.admin.deleteUser(target.auth_user_id);
    if (aerr) {
      console.warn("auth user delete failed", aerr.message);
    }
  }

  const { error: dErr } = await admin.from("profiles").delete().eq("id", target.id);
  if (dErr) return jsonResponse({ error: dErr.message }, 500);

  await audit(admin, "user_deleted", callerProfileId, null, {
    email: target.email,
    deleted_profile_id: target.id,
  });

  return jsonResponse({ ok: true });
}

async function handleResetPassword(
  admin: ReturnType<typeof createClient>,
  callerProfileId: string,
  body: ResetPasswordBody,
) {
  const { data: target } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", body.profile_id)
    .maybeSingle();
  if (!target) return jsonResponse({ error: "Target user not found" }, 404);

  const { error } = await admin.auth.resetPasswordForEmail(target.email, {
    redirectTo: body.redirect_url,
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  await audit(admin, "password_reset_sent", callerProfileId, target.id, {
    email: target.email,
  });

  return jsonResponse({ ok: true });
}

async function handleResendInvite(
  admin: ReturnType<typeof createClient>,
  callerProfileId: string,
  body: ResendInviteBody,
) {
  const { data: target } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", body.profile_id)
    .maybeSingle();
  if (!target) return jsonResponse({ error: "Target user not found" }, 404);

  const { error } = await admin.auth.admin.inviteUserByEmail(target.email, {
    redirectTo: body.redirect_url,
  });
  if (error) {
    // fallback
    const { error: rerr } = await admin.auth.resetPasswordForEmail(target.email, {
      redirectTo: body.redirect_url,
    });
    if (rerr) return jsonResponse({ error: rerr.message }, 500);
  }

  await audit(admin, "invite_resent", callerProfileId, target.id, { email: target.email });
  return jsonResponse({ ok: true });
}
