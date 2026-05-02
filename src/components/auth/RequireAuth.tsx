/**
 * Route guards. Render only after the auth state is resolved so protected
 * content never flashes.
 *
 *   <RequireAuth>            — any active approved user
 *   <RequireAuth adminOnly>  — admins only
 */
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export default function RequireAuth({ children, adminOnly = false }: Props) {
  const { access } = useAuth();
  const location = useLocation();

  if (access.kind === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (access.kind === "anonymous") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (access.kind === "no_profile") {
    return <Navigate to="/login?reason=not_approved" replace />;
  }

  if (access.kind === "disabled") {
    return <Navigate to="/login?reason=disabled" replace />;
  }

  if (adminOnly && access.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
