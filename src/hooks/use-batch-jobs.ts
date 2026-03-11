import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface JobRow {
  id: string;
  prompt: string;
  mode: string;
  batch_size: number;
  total_images: number;
  completed_images: number;
  failed_images: number;
  status: string;
  aspect_ratio: string;
  print_size: string | null;
  hd_enhance: boolean;
  white_frame: boolean;
  background_style: string;
  speed_mode: string;
  job_type: string;
  style_grid_styles: string[] | null;
  matrix_variables: Record<string, string[]> | null;
  created_at: string;
  updated_at: string;
}

export interface JobItemRow {
  id: string;
  job_id: string;
  prompt_variant: string;
  style: string | null;
  seed: number | null;
  status: string;
  image_url: string | null;
  storage_path: string | null;
  gallery_image_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export function useBatchJobs() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from("generation_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setJobs(data as unknown as JobRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchJobs();

    // Subscribe to realtime updates on generation_jobs
    const channel = supabase
      .channel("batch-jobs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generation_jobs" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setJobs((prev) => [payload.new as unknown as JobRow, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setJobs((prev) =>
              prev.map((j) => (j.id === (payload.new as any).id ? (payload.new as unknown as JobRow) : j))
            );
          } else if (payload.eventType === "DELETE") {
            setJobs((prev) => prev.filter((j) => j.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchJobs]);

  return { jobs, loading, refetch: fetchJobs };
}

export function useJobItems(jobId: string | null) {
  const [items, setItems] = useState<JobItemRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setItems([]);
      return;
    }

    setLoading(true);
    supabase
      .from("generation_job_items")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at")
      .then(({ data }) => {
        if (data) setItems(data as unknown as JobItemRow[]);
        setLoading(false);
      });

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`job-items-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "generation_job_items",
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setItems((prev) => [...prev, payload.new as unknown as JobItemRow]);
          } else if (payload.eventType === "UPDATE") {
            setItems((prev) =>
              prev.map((it) =>
                it.id === (payload.new as any).id ? (payload.new as unknown as JobItemRow) : it
              )
            );
          } else if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((it) => it.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { items, loading };
}
