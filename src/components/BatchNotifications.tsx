import { useEffect, useRef } from "react";
import { useBatchJobs } from "@/hooks/use-batch-jobs";
import { toast } from "sonner";

/**
 * Global component that shows toast notifications when batch jobs
 * start, complete, or fail. Mount once in App.tsx.
 */
export default function BatchNotifications() {
  const { jobs } = useBatchJobs();
  const prevStatuses = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    for (const job of jobs) {
      const prev = prevStatuses.current.get(job.id);
      if (!prev) {
        // First time seeing this job — only notify if it just started
        if (job.status === "processing") {
          toast.info(`🎨 Generating ${job.total_images} images…`, {
            description: job.prompt.length > 60 ? job.prompt.slice(0, 60) + "…" : job.prompt,
            duration: 4000,
          });
        }
      } else if (prev !== job.status) {
        // Status changed
        if (job.status === "completed") {
          toast.success(`✓ Batch complete: ${job.completed_images} images generated`, {
            description: job.prompt.length > 60 ? job.prompt.slice(0, 60) + "…" : job.prompt,
            duration: 6000,
          });
        } else if (job.status === "failed") {
          toast.error(`✗ Batch failed: ${job.failed_images} of ${job.total_images} failed`, {
            description: job.prompt.length > 60 ? job.prompt.slice(0, 60) + "…" : job.prompt,
            duration: 6000,
          });
        } else if (job.status === "cancelled") {
          toast.info(`Job cancelled`, { duration: 3000 });
        }
      }
      prevStatuses.current.set(job.id, job.status);
    }
  }, [jobs]);

  return null;
}
