/**
 * /review — thin entry point into the existing admin review queue.
 *
 * Intentionally reuses `AdminAssets` instead of forking a parallel review UI.
 * A query-param (`?status=needs_review`) preselects the queue filter so this
 * route doesn't carry its own data model or duplicate components.
 */
import { Navigate } from "react-router-dom";

export default function Review() {
  return <Navigate to="/admin/assets?status=needs_review" replace />;
}
