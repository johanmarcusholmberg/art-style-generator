/**
 * /admin/users — admin dashboard for user management.
 *
 * Lists all users, supports search/filter, create/edit/disable/delete and
 * password reset. The protected admin row hides demote + delete.
 *
 * All privileged operations route through the admin-users edge function.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserCog,
  KeyRound,
  Power,
  PowerOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface AdminUserRow {
  id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  status: "active" | "disabled" | "pending";
  provider: "password" | "google" | "mixed";
  is_protected: boolean;
  created_at: string;
  last_login_at: string | null;
  notes: string | null;
  roles: string[];
}

interface AuditEntry {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  performed_by: string | null;
  target_user_id: string | null;
}

export default function AdminUsers() {
  const { access, signOut } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUserRow | null>(null);

  const callerProfileId = access.kind === "active" ? access.profile.id : null;

  const reload = async () => {
    setLoading(true);
    const [{ data: userRows }, { data: audit }] = await Promise.all([
      supabase
        .from("admin_user_overview")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setUsers((userRows as AdminUserRow[] | null) ?? []);
    setAuditEntries((audit as AuditEntry[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q) {
        const hay = `${u.email} ${u.username ?? ""} ${u.display_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (roleFilter !== "all") {
        const role = u.roles.includes("admin") ? "admin" : "user";
        if (role !== roleFilter) return false;
      }
      return true;
    });
  }, [users, search, statusFilter, roleFilter]);

  const callApi = async (action: string, payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action, ...payload },
    });
    if (error || data?.error) {
      throw new Error(data?.error || error?.message || "Request failed");
    }
    return data;
  };

  const toggleStatus = async (u: AdminUserRow) => {
    const next = u.status === "active" ? "disabled" : "active";
    try {
      await callApi("update_user", { profile_id: u.id, status: next });
      toast.success(next === "active" ? "User enabled." : "User disabled.");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const sendReset = async (u: AdminUserRow) => {
    try {
      await callApi("send_password_reset", {
        profile_id: u.id,
        redirect_url: `${window.location.origin}/reset-password`,
      });
      toast.success("Password reset email sent.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const deleteUser = async () => {
    if (!confirmDelete) return;
    try {
      await callApi("delete_user", { profile_id: confirmDelete.id });
      toast.success("User deleted.");
      setConfirmDelete(null);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Studio
            </Link>
            <span className="text-muted-foreground">·</span>
            <h1 className="font-display text-lg font-semibold">User management</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-2 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, username, name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-2" /> New user
          </Button>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-md overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No users match your filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const role = u.roles.includes("admin") ? "admin" : "user";
                  const isSelf = u.id === callerProfileId;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {u.display_name ?? "—"}
                          {u.is_protected && (
                            <Badge variant="outline" className="text-[10px]">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Protected admin
                            </Badge>
                          )}
                          {isSelf && (
                            <Badge variant="secondary" className="text-[10px]">
                              You
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.username ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={role === "admin" ? "default" : "secondary"}>
                          {role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            u.status === "active"
                              ? "default"
                              : u.status === "disabled"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {u.provider}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {u.last_login_at ? formatDate(u.last_login_at) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Edit"
                            onClick={() => setEditing(u)}
                          >
                            <UserCog className="h-4 w-4" />
                          </Button>
                          {(u.provider === "password" || u.provider === "mixed") && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Send password reset"
                              onClick={() => sendReset(u)}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          )}
                          {!u.is_protected && !isSelf && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={u.status === "active" ? "Disable" : "Enable"}
                              onClick={() => toggleStatus(u)}
                            >
                              {u.status === "active" ? (
                                <PowerOff className="h-4 w-4" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {!u.is_protected && !isSelf && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Delete"
                              onClick={() => setConfirmDelete(u)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Audit log */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-display text-sm font-semibold">Recent admin actions</h2>
          </div>
          <div className="bg-card border border-border rounded-md divide-y divide-border">
            {auditEntries.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No actions yet.
              </div>
            ) : (
              auditEntries.map((e) => (
                <div
                  key={e.id}
                  className="px-4 py-2 text-xs flex items-center justify-between gap-4"
                >
                  <div className="font-mono text-muted-foreground">
                    {formatDate(e.created_at)}
                  </div>
                  <div className="flex-1 truncate">
                    <span className="font-medium">{e.action}</span>
                    {e.metadata?.email ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — {String(e.metadata.email)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <CreateUserDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={reload}
      />
      <EditUserDialog
        user={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={reload}
        callerProfileId={callerProfileId}
      />
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {confirmDelete?.email} from the system,
              including their authentication record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

// ── Dialogs ────────────────────────────────────────────────────────────────

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void | Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [status, setStatus] = useState<"active" | "pending">("active");
  const [credMode, setCredMode] = useState<"invite" | "temp_password">("invite");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setUsername("");
    setDisplayName("");
    setRole("user");
    setStatus("active");
    setCredMode("invite");
    setNotes("");
    setTempPassword(null);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "create_user",
          email: email.trim(),
          username: username.trim() || null,
          display_name: displayName.trim() || null,
          role,
          status,
          credential_mode: credMode,
          notes: notes.trim() || null,
          redirect_url: `${window.location.origin}/reset-password`,
        },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed");
      }
      if (data.temp_password) {
        setTempPassword(data.temp_password);
      } else {
        toast.success("User invited. They'll receive an email shortly.");
        onOpenChange(false);
        reset();
      }
      await onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>
            Add a person to the approved-user allowlist.
          </DialogDescription>
        </DialogHeader>

        {tempPassword ? (
          <div className="space-y-3">
            <div className="text-sm">
              User created. Share this temporary password securely — it will not
              be shown again.
            </div>
            <div className="font-mono text-sm bg-muted border border-border rounded p-3 break-all">
              {tempPassword}
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(tempPassword);
                  toast.success("Copied.");
                }}
                variant="outline"
              >
                Copy
              </Button>
              <Button onClick={() => { onOpenChange(false); reset(); }}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Email" required>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </Field>
              <Field label="Username">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field label="Display name" className="sm:col-span-2">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </Field>
              <Field label="Role">
                <Select value={role} onValueChange={(v) => setRole(v as "admin" | "user")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={status} onValueChange={(v) => setStatus(v as "active" | "pending")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Credentials" className="sm:col-span-2">
                <Select
                  value={credMode}
                  onValueChange={(v) => setCredMode(v as "invite" | "temp_password")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invite">Send invite / reset link</SelectItem>
                    <SelectItem value="temp_password">Generate temp password (shown once)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Notes" className="sm:col-span-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </Field>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting || !email}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create user"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  onOpenChange,
  onSaved,
  callerProfileId,
}: {
  user: AdminUserRow | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void | Promise<void>;
  callerProfileId: string | null;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [status, setStatus] = useState<"active" | "disabled" | "pending">("active");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username ?? "");
      setDisplayName(user.display_name ?? "");
      setRole(user.roles.includes("admin") ? "admin" : "user");
      setStatus(user.status);
      setNotes(user.notes ?? "");
    }
  }, [user]);

  if (!user) return null;

  const isSelf = user.id === callerProfileId;
  const protectedRoleLock = user.is_protected;
  const protectedStatusLock = user.is_protected;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "update_user",
          profile_id: user.id,
          username: username.trim() || null,
          display_name: displayName.trim() || null,
          role,
          status,
          notes: notes.trim() || null,
        },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed");
      }
      toast.success("User updated.");
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Display name">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select
                value={role}
                onValueChange={(v) => setRole(v as "admin" | "user")}
                disabled={protectedRoleLock}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              {protectedRoleLock && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Protected admin role is locked.
                </p>
              )}
            </Field>
            <Field label="Status">
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as typeof status)}
                disabled={protectedStatusLock}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              {protectedStatusLock && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Protected admin cannot be disabled.
                </p>
              )}
              {isSelf && !protectedStatusLock && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Be careful — this is your own account.
                </p>
              )}
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
