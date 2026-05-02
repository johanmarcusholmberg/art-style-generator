/**
 * Password reset / first-time password set page.
 * Linked from "Forgot password" emails. The Supabase recovery link puts
 * a session in the URL hash, which the client picks up automatically.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRecovery, setHasRecovery] = useState<boolean | null>(null);

  useEffect(() => {
    // Detect recovery session from hash or current session
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setHasRecovery(true);
      return;
    }
    // If user already has a session (e.g. clicked invite link), allow setting password
    void supabase.auth.getSession().then(({ data }) => {
      setHasRecovery(!!data.session);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pwd !== pwd2) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({
      password: pwd,
      data: { force_password_change: false },
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    toast.success("Password updated.");
    navigate("/", { replace: true });
  };

  if (hasRecovery === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasRecovery) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-display text-xl font-semibold mb-2">
            Reset link expired
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Please request a new password reset link from the login page.
          </p>
          <Button onClick={() => navigate("/login")}>Back to login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-center mb-6">
          Set a new password
        </h1>
        <form
          onSubmit={submit}
          className="bg-card border border-border rounded-md p-6 space-y-4"
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="pwd">New password</Label>
            <Input
              id="pwd"
              type="password"
              required
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pwd2">Confirm password</Label>
            <Input
              id="pwd2"
              type="password"
              required
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
