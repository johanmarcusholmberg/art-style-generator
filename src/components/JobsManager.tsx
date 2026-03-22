import { useState, memo } from "react";
import {
  Loader2, CheckCircle2, XCircle, Clock, Ban, RefreshCw, Trash2,
  ChevronDown, ChevronUp, Image as ImageIcon, Zap, Sparkles,
  Layers, Grid3X3, Combine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useBatchJobs, useJobItems, type JobRow } from "@/hooks/use-batch-jobs";
import { cancelJob, retryFailedItems, deleteJob } from "@/lib/batch-jobs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STATUS_BADGE_CLASSES: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  processing: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-primary/10 text-primary border-primary/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground",
};

const JOB_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string }> = {
  batch: { icon: <Layers className="h-3 w-3" />, label: "Batch" },
  "style-grid": { icon: <Grid3X3 className="h-3 w-3" />, label: "Style Grid" },
  matrix: { icon: <Combine className="h-3 w-3" />, label: "Matrix" },
};

const ITEM_STATUS_ICONS: Record<string, React.ReactNode> = {
  queued: <Clock className="h-5 w-5 text-muted-foreground" />,
  generating: <Loader2 className="h-5 w-5 animate-spin text-primary" />,
  completed: <CheckCircle2 className="h-5 w-5 text-primary" />,
  failed: <XCircle className="h-5 w-5 text-destructive" />,
  cancelled: <Ban className="h-5 w-5 text-muted-foreground" />,
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const JobCard = memo(function JobCard({ job }: { job: JobRow }) {
  const [expanded, setExpanded] = useState(false);
  const { items, loading: itemsLoading } = useJobItems(expanded ? job.id : null);

  const progress =
    job.total_images > 0
      ? Math.round(((job.completed_images + job.failed_images) / job.total_images) * 100)
      : 0;

  const isActive = job.status === "queued" || job.status === "processing";
  const typeConfig = JOB_TYPE_CONFIG[job.job_type] || JOB_TYPE_CONFIG.batch;

  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelling(true);
    try {
      await cancelJob(job.id);
      toast.success("Job cancelled");
    } catch {
      toast.error("Failed to cancel job");
    } finally {
      setCancelling(false);
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await retryFailedItems(job.id);
      toast.success("Retrying failed images");
    } catch {
      toast.error("Failed to retry");
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteJob(job.id);
      toast.success("Job deleted");
    } catch {
      toast.error("Failed to delete job");
    }
  };

  return (
    <div className="border border-border rounded-sm bg-card overflow-hidden">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Status row */}
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <Badge variant="outline" className="font-display text-[10px] gap-1 px-1.5 py-0">
                {typeConfig.icon} {typeConfig.label}
              </Badge>
              <Badge
                variant="outline"
                className={`font-display text-[10px] px-1.5 py-0 border ${STATUS_BADGE_CLASSES[job.status] || ""}`}
              >
                {isActive && <Loader2 className="h-2.5 w-2.5 animate-spin mr-0.5" />}
                {job.status === "completed" && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                {job.status === "failed" && <XCircle className="h-2.5 w-2.5 mr-0.5" />}
                {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
              </Badge>
              <Badge variant="outline" className="font-display text-[10px] px-1.5 py-0 gap-0.5">
                {job.speed_mode === "fast" ? <Zap className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
                {job.speed_mode === "fast" ? "Fast" : "Quality"}
              </Badge>
            </div>

            {/* Prompt */}
            <p className="font-display text-sm text-foreground truncate leading-snug">
              {job.prompt}
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1 text-muted-foreground">
              <span className="font-display text-[11px]">{formatTimeAgo(job.created_at)}</span>
              <span className="text-border">·</span>
              <span className="font-display text-[11px]">
                {job.completed_images}/{job.total_images} images
              </span>
              {job.failed_images > 0 && (
                <>
                  <span className="text-border">·</span>
                  <span className="font-display text-[11px] text-destructive">
                    {job.failed_images} failed
                  </span>
                </>
              )}
              {job.print_size && (
                <>
                  <span className="text-border">·</span>
                  <span className="font-display text-[11px]">{job.print_size}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Progress bar for active jobs */}
        {isActive && (
          <div className="mt-3">
            <Progress value={progress} className="h-1.5" />
            <p className="font-display text-[10px] text-muted-foreground mt-1">
              {job.completed_images} of {job.total_images} completed
              {job.failed_images > 0 && ` · ${job.failed_images} failed`}
              {job.speed_mode === "quality" && " · Quality mode may take longer"}
            </p>
          </div>
        )}
      </div>

      {/* Actions bar */}
      {(isActive || job.failed_images > 0 || !isActive) && (
        <div className="flex items-center gap-2 px-4 pb-3">
          {isActive && (
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling} className="font-display text-xs h-7">
              {cancelling ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Ban className="mr-1 h-3 w-3" />} Cancel
            </Button>
          )}
          {job.failed_images > 0 && !isActive && (
            <Button variant="outline" size="sm" onClick={handleRetry} className="font-display text-xs h-7">
              <RefreshCw className="mr-1 h-3 w-3" /> Retry {job.failed_images} Failed
            </Button>
          )}
          {!isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="font-display text-xs h-7 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          )}
        </div>
      )}

      {/* Expanded items grid */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-2">
          {/* Style grid info */}
          {job.job_type === "style-grid" && job.style_grid_styles && (
            <div className="flex flex-wrap gap-1 mb-2">
              {job.style_grid_styles.map((s) => (
                <Badge key={s} variant="secondary" className="font-display text-[10px]">{s}</Badge>
              ))}
            </div>
          )}

          {itemsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-display text-xs">Loading items…</span>
            </div>
          ) : items.length === 0 ? (
            <p className="font-display text-xs text-muted-foreground text-center py-4">No items found</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {items.map((item) => (
                <div key={item.id} className="border border-border rounded-sm overflow-hidden bg-background group">
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
                    <div className="w-full aspect-square flex flex-col items-center justify-center bg-muted gap-1">
                      {ITEM_STATUS_ICONS[item.status] || <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                      <span className="font-display text-[9px] text-muted-foreground capitalize">
                        {item.status}
                      </span>
                    </div>
                  )}
                  <div className="p-1.5">
                    <p className="font-display text-[10px] text-muted-foreground truncate">
                      {item.style && (
                        <span className="font-bold text-foreground">{item.style} · </span>
                      )}
                      {item.prompt_variant.length > 40
                        ? item.prompt_variant.slice(0, 40) + "…"
                        : item.prompt_variant}
                    </p>
                    {item.error_message && (
                      <p className="font-display text-[10px] text-destructive truncate mt-0.5">
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
});

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
      <div className="py-12 text-center space-y-2">
        <Layers className="h-8 w-8 text-muted-foreground/50 mx-auto" />
        <p className="font-display text-sm text-muted-foreground">
          No generation jobs yet
        </p>
        <p className="font-display text-xs text-muted-foreground/70">
          Start a batch generation to see jobs here
        </p>
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "processing");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const completedJobs = jobs.filter((j) => j.status === "completed" || j.status === "cancelled");

  return (
    <div className="space-y-6">
      {activeJobs.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-xs font-bold text-primary tracking-widest uppercase flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Active ({activeJobs.length})
          </h3>
          {activeJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </section>
      )}

      {failedJobs.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-xs font-bold text-destructive tracking-widest uppercase flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5" />
            Failed ({failedJobs.length})
          </h3>
          {failedJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </section>
      )}

      {completedJobs.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-xs font-bold text-muted-foreground tracking-widest uppercase">
            History ({completedJobs.length})
          </h3>
          {completedJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </section>
      )}
    </div>
  );
}
