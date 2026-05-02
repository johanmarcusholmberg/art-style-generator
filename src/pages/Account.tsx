/**
 * /account — view & edit profile basics.
 *
 * Users can edit their display name. Email, role, status and provider are
 * read-only here (admin-only via the admin area). Password-login users can
 * trigger a reset email for themselves.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function Account() {
  const { access, refresh, signOut } = useAuth();

  if (access.kind !== "active") {
    return null; // RequireAuth handles loading/anon
  }

  const profile = access.profile;
  const role = access.role;

  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    toast.success("Profile saved.");
    void refresh();
  };

  const sendReset = async () => {
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reset link sent to your email.");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to studio
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="font-display text-2xl font-semibold mb-6">Account</h1>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="bg-card border border-border rounded-md p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnly label="Email" value={profile.email} />
            <ReadOnly label="Username" value={profile.username ?? "—"} />
            <ReadOnly
              label="Login method"
              value={
                profile.provider === "google"
                  ? "Google"
                  : profile.provider === "mixed"
                    ? "Google + Password"
                    : "Email & Password"
              }
            />
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Role</div>
              <div className="flex items-center gap-2">
                <Badge variant={role === "admin" ? "default" : "secondary"}>
                  {role}
                </Badge>
                {profile.is_protected && (
                  <Badge variant="outline" className="text-[10px]">
                    Protected admin
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How your name appears in the studio"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>

          {(profile.provider === "password" || profile.provider === "mixed") && (
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Password</div>
                  <div className="text-xs text-muted-foreground">
                    Send yourself a password reset link.
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendReset}
                  disabled={resetting}
                >
                  {resetting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Send reset link"
                  )}
                </Button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
