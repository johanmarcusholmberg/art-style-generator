import { useState } from "react";
import {
  Loader2, CheckCircle2, XCircle, Clock, Ban, RefreshCw, Trash2,
  ChevronDown, ChevronUp, Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useBatchJobs, useJobItems, type JobRow } from "@/hooks/use-batch-jobs";
import { cancelJob, retryFailedItems, deleteJob } from "@/lib/batch-jobs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STATUS_ICONS: Record<string, React.ReactNode> = {
  queued: <Clock className="h-4 w-4 text-muted-foreground" />,
  processing: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  completed: <CheckCircle2 className="h-4 w-4 text-primary" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  cancelled: <Ban className="h-4 w-4 text-muted-foreground" />,
  generating: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
};

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  generating: "Generating",
};

function JobCard({ job }: { job: JobRow }) {
  const [expanded, setExpanded] = useState(false);
  const { items, loading: itemsLoading } = useJobItems(expanded ? job.id : null);

  const progress =
    job.total_images > 0
      ? Math.round(((job.completed_images + job.failed_images) / job.total_images) * 100)
      : 0;

  const isActive = job.status === "queued" || job.status === "processing";

  const handleCancel = async () => {
    try {
      await cancelJob(job.id);
      toast.success("Job cancelled");
    } catch {
      toast.error("Failed to cancel job");
    }
  };

  const handleRetry = async () => {
    try {
      await retryFailedItems(job.id);
      toast.success("Retrying failed images");
    } catch {
      toast.error("Failed to retry");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteJob(job.id);
      toast.success("Job deleted");
    } catch {
      toast.error("Failed to delete job");
    }
  };

  return (
    <div className="border border-border rounded-sm bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {STATUS_ICONS[job.status]}
            <Badge variant="outline" className="font-display text-xs">
              {job.job_type === "style-grid" ? "Style Grid" : job.job_type === "matrix" ? "Matrix" : "Batch"}
            </Badge>
            <Badge variant="secondary" className="font-display text-xs">
              {STATUS_LABELS[job.status] || job.status}
            </Badge>
          </div>
          <p className="font-display text-sm text-foreground truncate">{job.prompt}</p>
          <p className="font-display text-xs text-muted-foreground">
            {new Date(job.created_at).toLocaleString()} · {job.total_images} images · {job.speed_mode}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="h-8 w-8 p-0 flex-shrink-0"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <p className="font-display text-xs text-muted-foreground">
            {job.completed_images} of {job.total_images} completed
            {job.failed_images > 0 && ` · ${job.failed_images} failed`}
          </p>
        </div>
      )}

      {!isActive && (
        <p className="font-display text-xs text-muted-foreground">
          ✓ {job.completed_images} completed
          {job.failed_images > 0 && ` · ✗ ${job.failed_images} failed`}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {isActive && (
          <Button variant="outline" size="sm" onClick={handleCancel} className="font-display text-xs">
            <Ban className="mr-1 h-3 w-3" /> Cancel
          </Button>
        )}
        {job.failed_images > 0 && job.status !== "processing" && (
          <Button variant="outline" size="sm" onClick={handleRetry} className="font-display text-xs">
            <RefreshCw className="mr-1 h-3 w-3" /> Retry Failed
          </Button>
        )}
        {!isActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="font-display text-xs text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
        )}
      </div>

      {/* Expanded items */}
      {expanded && (
        <div className="border-t border-border pt-3 space-y-2">
          {itemsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-display text-xs">Loading items…</span>
            </div>
          ) : items.length === 0 ? (
            <p className="font-display text-xs text-muted-foreground">No items found</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {items.map((item) => (
                <div key={item.id} className="border border-border rounded-sm overflow-hidden bg-background">
                  {item.status === "completed" && item.storage_path ? (
                    <img
                      src={
                        supabase.storage
                          .from("generated-images")
                          .getPublicUrl(item.storage_path).data.publicUrl
                      }
                      alt={item.prompt_variant}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center bg-muted">
                      {item.status === "generating" ? (
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      ) : item.status === "failed" ? (
                        <XCircle className="h-6 w-6 text-destructive" />
                      ) : item.status === "queued" ? (
                        <Clock className="h-6 w-6 text-muted-foreground" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  <div className="p-1.5">
                    <p className="font-display text-[10px] text-muted-foreground truncate">
                      {item.style && <span className="font-bold">{item.style} · </span>}
                      {item.prompt_variant.length > 30
                        ? item.prompt_variant.slice(0, 30) + "…"
                        : item.prompt_variant}
                    </p>
                    {item.error_message && (
                      <p className="font-display text-[10px] text-destructive truncate">
                        {item.error_message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function JobsManager() {
  const { jobs, loading } = useBatchJobs();

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="font-display text-sm">Loading jobs…</span>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="font-display text-sm text-muted-foreground">
          No generation jobs yet. Start a batch generation to see jobs here.
        </p>
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "processing");
  const completedJobs = jobs.filter((j) => j.status !== "queued" && j.status !== "processing");

  return (
    <div className="space-y-4">
      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Active Jobs ({activeJobs.length})
          </h3>
          {activeJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {completedJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-sm font-bold text-foreground">
            Completed Jobs ({completedJobs.length})
          </h3>
          {completedJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
