import { useEffect, useRef } from "react";
import { useBatchJobs } from "@/hooks/use-batch-jobs";
import { toast } from "sonner";

/**
 * Global component that shows toast notifications for batch job lifecycle.
 * Mount once in App.tsx.
 *
 * Notifications:
 * - Job started (processing)
 * - 50% milestone (for jobs with 4+ images)
 * - Job completed
 * - Job failed
 * - Job cancelled
 *
 * Anti-spam: each event fires at most once per job.
 */
export default function BatchNotifications() {
  const { jobs } = useBatchJobs();
  const prevStatuses = useRef<Map<string, string>>(new Map());
  const milestonesHit = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const job of jobs) {
      const prev = prevStatuses.current.get(job.id);
      const truncPrompt = job.prompt.length > 50 ? job.prompt.slice(0, 50) + "…" : job.prompt;

      if (!prev) {
        // First time seeing this job
        if (job.status === "processing") {
          toast.info(`Generating ${job.total_images} images…`, {
            description: truncPrompt,
            duration: 3000,
          });
        }
      } else if (prev !== job.status) {
        // Status changed
        if (job.status === "processing" && prev === "queued") {
          toast.info(`Generating ${job.total_images} images…`, {
            description: truncPrompt,
            duration: 3000,
          });
        } else if (job.status === "completed") {
          toast.success(`✓ ${job.completed_images} images generated`, {
            description: truncPrompt,
            duration: 5000,
          });
        } else if (job.status === "failed") {
          toast.error(`${job.failed_images} of ${job.total_images} failed`, {
            description: truncPrompt,
            duration: 5000,
          });
        } else if (job.status === "cancelled") {
          toast.info("Job cancelled", { duration: 3000 });
        }
      }

      // 50% milestone for larger jobs (4+ images)
      if (
        (job.status === "processing") &&
        job.total_images >= 4 &&
        !milestonesHit.current.has(job.id)
      ) {
        const done = job.completed_images + job.failed_images;
        if (done >= Math.floor(job.total_images / 2)) {
          milestonesHit.current.add(job.id);
          toast.info(`Halfway: ${job.completed_images}/${job.total_images} done`, {
            duration: 3000,
          });
        }
      }

      prevStatuses.current.set(job.id, job.status);
    }
  }, [jobs]);

  return null;
}
